# Sweep mode — one question, a known list, N items

Read this when the work is **per-item evaluation of a list someone already has**:
enrich 430 companies with funding facts, check 200 packages for a licence, classify
600 rows by what their site says. The answer is not a report — it is a record per
item, in a shape the caller's code ingests.

Research mode (`SKILL.md` §1–§7) is the other shape: N *different* questions, findings
files, one decision report. Do not run a sweep through it — a worker capped at 4
searches cannot cover 72 items, and a decision report is not what the caller needs.

**Not a sweep**: fewer than ~15 items (do them yourself), or items that each need a
different question (that is research mode, or it is not one job).

## §S1 What the caller must supply

A sweep is generic machinery. The domain lives entirely in what the caller hands over,
and you do not invent any of it:

| | |
|---|---|
| `items` | the list, as objects. Each carries whatever the sweeper needs to identify and disambiguate the item — name plus known context. Keep them small; they are inlined into prompts |
| `item_key` | the field that identifies an item. Every record carries it back unchanged. This is what the coverage gate counts |
| `task` | **the one question**, asked of every item, verbatim. Written for someone who sees nothing else |
| `record_contract` | the exact output shape plus the rules that make a record acceptable — required fields, what gets refused at ingest, how "found nothing" is expressed. Paste the caller's own words; do not paraphrase a validation rule |
| `forbidden_domains` | rate-limited or policy-blocked hosts. Absolute, injected into every prompt |
| per-item budget | `searches_per_item` (≤4), `fetches_per_item` (≤5) |

If the caller has a skill of its own (`riotloc-research` is the worked example), that
skill *is* the contract — lift `task`, `record_contract` and the source policy out of
it rather than writing your own.

Missing the record contract is a scope gate, not a detail: guess it and every record
is refused at ingest, which costs the whole wave.

## §S2 Plan and approval

Same discipline as research mode — show it, wait for approval (or run under a
pre-authorized envelope), and print the plan either way:

- item count, `items_per_agent`, resulting agent count / run budget
- model tier and why
- total search ceiling (`items × searches_per_item`)
- what the caller does with the records afterwards

Defaults, calibrated on a real 430-item sweep:

- **`items_per_agent` 25**, hard cap 40. Observed: 79 items/agent on Sonnet burned
  200–320k tokens per agent. 25 lands near 100k and keeps a crash cheap.
- **`max_agents` 12**, hard cap 24. Over that, split into waves — the session-wide
  circuit breaker (`CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`) counts agents, not
  concurrency and not tokens, so it will not save you.
- **`model: sonnet`.** Haiku only when no judgment is involved (exact string on a
  page, does this URL resolve). Opus is refused by the script. Evidence for Sonnet:
  the 395-item resumed run produced 277 facts with **zero** refused by the caller's
  validation gate.
- **`flush_every` 5**, hard cap 10.

## §S3 Execute

Read `sweep.workflow.js` from this skill's base directory and invoke the Workflow tool
with it as `script`, plus:

```json
args = {
  "outdir": "<absolute dir for record chunks>",
  "slug": "<slug>", "wave": <N>, "today": "<YYYY-MM-DD>",
  "items": [ { ... }, ... ],
  "item_key": "name",
  "task": "<the one question, verbatim>",
  "record_contract": "<the caller's record shape and rules, verbatim>",
  "items_per_agent": 25, "max_agents": 12, "model": "sonnet",
  "flush_every": 5, "searches_per_item": 3, "fetches_per_item": 4,
  "forbidden_domains": ["example.com"],
  "reference_file": "<optional absolute path the sweeper should Read first>",
  "extra_rules": "<optional caller rules, verbatim>"
}
```

The script throws on every budget violation. Records land in
`<outdir>/<slug>-w<N>-s<slice>-c<chunk>.jsonl`.

**Fallback when the Workflow tool is unavailable**: slice the list yourself and spawn
ONE parallel batch of `subagent_type: kai-research:kai-research-sweeper` calls with
`model` from the plan and the same prompt shape the script builds. Count = the
approved slice count, nothing more.

**A shared rate-limited resource stays outside the sweep.** If some lookup must be
paced (one client against a store API, a scraper), run it as a single process on the
main thread — before the wave, or alongside it — and put its hosts in
`forbidden_domains`. Never let N agents negotiate politeness among themselves.

## §S4 Coverage gate — the step that makes a sweep resumable

Never re-run a sweep over the whole list. After each wave, count which `item_key`s
have a record on disk:

- items with a record → done, never bought again (including honest empties — that is
  what `nothing_found` is for)
- items without one → the next wave's list, and only that

Agents die. Sessions hit limits. In the run this mode was built from, four of five
slices lost everything because they held their records until the end; the fifth wrote
incrementally and kept 35 of 79. Flushing bounds the loss; the coverage gate makes
what survived permanent.

Read the returned `flagged` and `notable` arrays and act on them — an item flagged for
instruction-like page content is for a human to look at, and a `notable` usually means
the list's premise is wrong for that item.

Stop when coverage is complete or the run budget is reached. Report the gap either way;
a sweep that quietly covered 380 of 430 reads downstream as 430.

## §S5 Hand off

The sweep's product is the records, not a report. Hand them to whatever the caller
named — an `--ingest` command, a merge script — and print:

- items in / records written / items still uncovered
- what the ingest accepted and refused (run it; read its output)
- agents per wave, tokens or est. cost, chunk files written

Do not summarize the records for the user in place of running the ingest, and do not
write a decision report off a sweep unless the user asked for one. If they did, that
is a separate step in research mode's §6 shape, sourced from the records.
