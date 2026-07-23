export const meta = {
  name: 'kai-research-fanout',
  description: 'One research wave: fan out tiered worker/analyst subagents; findings to disk, tiny schema-capped summaries back',
  phases: [{ title: 'Research' }],
}

const A = typeof args === 'string' ? JSON.parse(args) : (args ?? {})

const MAX_Q_PER_WAVE = 12
const ALLOWED_MODELS = ['haiku', 'sonnet', 'opus']
const ALLOWED_TIERS = ['worker', 'analyst']

if (!Array.isArray(A.questions) || A.questions.length === 0) throw new Error('args.questions is empty')
if (!A.outdir) throw new Error('args.outdir missing (absolute findings dir)')
if (!A.today) throw new Error('args.today missing (YYYY-MM-DD; scripts cannot read the clock)')
const maxAgents = A.max_agents ?? 16
const wave = A.wave ?? 1

if (A.questions.length > MAX_Q_PER_WAVE) throw new Error(`wave cap ${MAX_Q_PER_WAVE} exceeded: ${A.questions.length} questions`)
if (A.questions.length > maxAgents) throw new Error(`run agent budget ${maxAgents} exceeded by this wave: ${A.questions.length}`)
for (const q of A.questions) {
  if (!q.slug || !q.question) throw new Error(`question missing slug or text: ${JSON.stringify(q).slice(0, 120)}`)
  if (!ALLOWED_TIERS.includes(q.tier)) throw new Error(`bad tier "${q.tier}" on ${q.slug}`)
  if (!ALLOWED_MODELS.includes(q.model)) throw new Error(`bad model "${q.model}" on ${q.slug} (haiku|sonnet|opus only)`)
}
const opusCount = A.questions.filter((q) => q.model === 'opus').length
if (opusCount > 2) throw new Error(`opus-tier questions capped at 2 per wave, got ${opusCount}`)

const RET = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'status', 'tldr', 'n_claims', 'contradictions', 'notable'],
  properties: {
    file: { type: 'string' },
    status: { enum: ['ok', 'partial', 'failed'] },
    tldr: { type: 'string', maxLength: 1000 },
    n_claims: { type: 'integer' },
    contradictions: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 5 },
    notable: { type: 'array', items: { type: 'string', maxLength: 150 }, maxItems: 3 },
  },
}

const pad = (n) => String(n).padStart(2, '0')

log(`wave ${wave}: ${A.questions.length} agents (${opusCount} opus) -> ${A.outdir}`)

const results = await pipeline(A.questions, (q, _orig, i) => {
  const file = `${A.outdir}/${wave}${pad(i + 1)}-${q.slug}.md`
  const prompt = [
    `Research question: ${q.question}`,
    q.done_means ? `Done means: ${q.done_means}` : '',
    `Write your findings file to exactly this path: ${file}`,
    `Access date for source stamps: ${A.today}`,
    q.tier === 'analyst' ? `Sibling findings directory (Read/Grep allowed): ${A.outdir}` : '',
  ].filter(Boolean).join('\n')
  return agent(prompt, {
    agentType: q.tier === 'analyst' ? 'kai-research:kai-research-analyst' : 'kai-research:kai-research-worker',
    model: q.model,
    effort: q.tier === 'analyst' ? 'medium' : 'low',
    schema: RET,
    phase: 'Research',
    label: `${q.tier}:${q.slug}`,
  })
})

const ok = results.filter(Boolean)
log(`wave ${wave} done: ${ok.length}/${A.questions.length} returned`)
return { wave, results: ok }
