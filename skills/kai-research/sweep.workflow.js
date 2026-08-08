export const meta = {
  name: 'kai-research-sweep',
  description: 'One enumerative sweep wave: same question over a known list, sliced across capped sweeper agents; caller-schema records to disk, tiny schema-capped returns',
  phases: [{ title: 'Sweep' }],
}

const A = typeof args === 'string' ? JSON.parse(args) : (args ?? {})

// Hard limits. Raising these is a code change with a reason, never a runtime argument.
const MAX_ITEMS_PER_AGENT = 40   // ~150k tokens/agent at 4 lookups per item
const MAX_AGENTS_HARD = 24
const MAX_FLUSH_EVERY = 10       // buffer bigger than this and a crash costs real work
const MAX_SEARCHES_PER_ITEM = 4
const MAX_FETCHES_PER_ITEM = 5
const ALLOWED_MODELS = ['haiku', 'sonnet']  // opus sweeps are a budget bomb: use a smaller list instead

if (!Array.isArray(A.items) || A.items.length === 0) throw new Error('args.items is empty (the list to sweep)')
if (!A.outdir) throw new Error('args.outdir missing (absolute dir for record chunks)')
if (!A.slug) throw new Error('args.slug missing')
if (!A.today) throw new Error('args.today missing (YYYY-MM-DD; scripts cannot read the clock)')
if (!A.task) throw new Error('args.task missing (the ONE question asked of every item)')
if (!A.record_contract) throw new Error('args.record_contract missing (verbatim record shape the caller ingests)')
if (!A.item_key) throw new Error('args.item_key missing (field that identifies an item, for the coverage gate)')

const wave = A.wave ?? 1
const model = A.model ?? 'sonnet'
const perAgent = A.items_per_agent ?? 25
const maxAgents = A.max_agents ?? 12
const flushEvery = A.flush_every ?? 5
const searches = A.searches_per_item ?? 3
const fetches = A.fetches_per_item ?? 4
const forbidden = A.forbidden_domains ?? []

if (!ALLOWED_MODELS.includes(model)) throw new Error(`bad model "${model}" (haiku|sonnet only — opus is not a sweep tier)`)
if (!Number.isInteger(perAgent) || perAgent < 1 || perAgent > MAX_ITEMS_PER_AGENT)
  throw new Error(`items_per_agent must be 1..${MAX_ITEMS_PER_AGENT}, got ${perAgent}`)
if (!Number.isInteger(flushEvery) || flushEvery < 1 || flushEvery > MAX_FLUSH_EVERY)
  throw new Error(`flush_every must be 1..${MAX_FLUSH_EVERY}, got ${flushEvery}`)
if (searches > MAX_SEARCHES_PER_ITEM) throw new Error(`searches_per_item capped at ${MAX_SEARCHES_PER_ITEM}, got ${searches}`)
if (fetches > MAX_FETCHES_PER_ITEM) throw new Error(`fetches_per_item capped at ${MAX_FETCHES_PER_ITEM}, got ${fetches}`)
if (maxAgents > MAX_AGENTS_HARD) throw new Error(`max_agents hard cap is ${MAX_AGENTS_HARD}, got ${maxAgents}`)
if (!Array.isArray(forbidden)) throw new Error('forbidden_domains must be an array')

const slices = []
for (let i = 0; i < A.items.length; i += perAgent) slices.push(A.items.slice(i, i + perAgent))

if (slices.length > maxAgents)
  throw new Error(
    `${A.items.length} items / ${perAgent} per agent = ${slices.length} agents, over the run budget of ${maxAgents}. ` +
    `Raise max_agents explicitly (hard cap ${MAX_AGENTS_HARD}) or split the list into waves — do not raise items_per_agent past ${MAX_ITEMS_PER_AGENT}.`
  )

const RET = {
  type: 'object',
  additionalProperties: false,
  required: ['slice', 'items_assigned', 'items_written', 'files', 'found', 'empty', 'status'],
  properties: {
    slice: { type: 'integer' },
    items_assigned: { type: 'integer' },
    items_written: { type: 'integer' },
    files: { type: 'array', items: { type: 'string' }, maxItems: 40 },
    found: { type: 'integer' },
    empty: { type: 'integer' },
    status: { enum: ['ok', 'partial', 'failed'] },
    flagged: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['item', 'why'],
        properties: { item: { type: 'string' }, why: { type: 'string', maxLength: 200 } },
      },
    },
    notable: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 3 },
  },
}

const pad = (n) => String(n).padStart(2, '0')

log(
  `sweep wave ${wave}: ${A.items.length} items / ${perAgent} per agent = ${slices.length} ${model} agents · ` +
  `flush every ${flushEvery} · <=${searches}s/${fetches}f per item (<=${A.items.length * searches} searches total) -> ${A.outdir}`
)
if (forbidden.length) log(`forbidden domains: ${forbidden.join(', ')}`)

const results = await pipeline(slices, (slice, _orig, i) => {
  const prefix = `${A.outdir}/${A.slug}-w${wave}-s${pad(i)}`
  const prompt = [
    `## Your question, asked once per item\n${A.task}`,
    `## Record contract — emit exactly this shape, one JSON object per line\n${A.record_contract}`,
    `## Your slice: ${slice.length} items, in order\n` +
      `Each item is identified by its \`${A.item_key}\` field; every record you write must carry it back unchanged.\n` +
      '```json\n' + JSON.stringify(slice, null, 1) + '\n```',
    `## Output\n` +
      `Chunk files: \`${prefix}-c01.jsonl\`, \`${prefix}-c02.jsonl\`, … in order.\n` +
      `Flush the buffer to the next chunk file every ${flushEvery} items and again at the end of the slice.\n` +
      `Write chunk k before researching the items of chunk k+1.`,
    `## Budget\n` +
      `Per item: at most ${searches} WebSearch and ${fetches} WebFetch calls. Per-item, not pooled.\n` +
      `Access date for source stamps: ${A.today}`,
    forbidden.length
      ? `## ABSOLUTE: never search, fetch, or open these domains\n${forbidden.map((d) => `- ${d}`).join('\n')}\n` +
        `They are rate-limited and served by one shared process elsewhere in this run.`
      : '',
    A.reference_file ? `## Reference (Read it before starting)\n${A.reference_file}` : '',
    A.extra_rules ? `## Caller rules\n${A.extra_rules}` : '',
    `Return slice number ${i}.`,
  ].filter(Boolean).join('\n\n')

  return agent(prompt, {
    agentType: 'kai-research:kai-research-sweeper',
    model,
    effort: 'low',
    schema: RET,
    phase: 'Sweep',
    label: `sweep:${A.slug}-s${pad(i)}`,
  })
})

const ok = results.filter(Boolean)
const written = ok.reduce((s, r) => s + (r.items_written ?? 0), 0)
const lost = slices.length - ok.length
if (lost) log(`WARNING: ${lost} of ${slices.length} slices returned nothing — their last chunk files may still be on disk`)
log(`sweep wave ${wave} done: ${written}/${A.items.length} items written by ${ok.length}/${slices.length} agents`)

return {
  wave,
  items_in: A.items.length,
  items_written: written,
  slices_returned: ok.length,
  slices_total: slices.length,
  results: ok,
}
