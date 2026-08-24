# kai-research — tiered deep-research plugin

Claude Code plugin: decision-oriented research pipeline that keeps the expensive main-thread model for planning/synthesis and pushes evidence collection to capped cheap subagents with file-based handoff. Design rationale and usage: `README.md`.

## Invariant layers (what enforces what)

| Property | Enforced by | Never by |
|---|---|---|
| Model tier per agent | agent frontmatter `model:` + per-call `model` in the workflow | prompt instructions to an orchestrator (verified no-op) |
| Agent count | `fanout.workflow.js` / `sweep.workflow.js` (throw over budget) + approved plans | any model's runtime judgment |
| Return size | workflow `schema` (tldr ≤1000 chars; sweep returns are counts + file paths, no prose) | politeness |
| No nesting | `tools` allowlist without Agent + `disallowedTools: Agent` | — |
| Search/fetch counts | agent prompt caps + `maxTurns` backstop | (no harness knob exists) |
| Crash loss bounded | sweep `flush_every` (≤10) + the §S4 coverage gate | an agent's promise to save its work |
| Runaway circuit breaker | optional `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` in user settings env | — (it counts agents, not tokens) |
| Criteria bound to data | `serves` required on every planned question (`fanout.workflow.js` throws) + the §6 criteria ledger, written before the recommendation | "rationale tied to criteria" as prose — it passes while the ranking runs on the brightest column |
| Absence claims surfaced | `absence` **required** in the fanout return schema + the mandatory §5 existence probe | an agent's own wording in its TL;DR |
| Discarded data audited | the dropped list on disk + audit counts in the §7 run stats, printed even when clean (§5a) | the totals looking plausible |

**The truthfulness layer (0.3.0)** comes from one 25-agent run (2026-08-06) in which all four defects produced output a reader could not tell from a checked one: a recommendation ranked on view counts, a metric unrelated to the decision; two false claims of absence already stated to the user as facts; fabricated Spotify/Apple identifiers under correct show names; and an unaudited classifier that dropped 15 of 40 channels wrongly, moving one segment's total by an order of magnitude. Each fix is shaped to leave a visible artefact — a required schema field, a file on disk, a line printed even when nothing is wrong — because the prose version of every one of these rules already existed and was formally satisfied at the moment it failed. Do not soften them back into advice.

Never spawn `general-purpose` for research fan-out: its tools are `*`, so it inherits Agent and can fan out again underneath you. Observed 2026-08-08: two of six such agents spawned six sub-agents each — 36 researchers on one budget, session limit blown, four of five slices lost.

`CLAUDE_CODE_SUBAGENT_MODEL` must stay **unset** — it is resolution priority #1 and would flatten all tiers.

## Layout

```
kai-research/
├── .claude-plugin/
│   ├── plugin.json              # manifest (name: kai-research)
│   └── marketplace.json         # self-listing marketplace (name: kai-research)
├── agents/
│   ├── kai-research-worker.md   # haiku retrieval tier: 1 question → findings file + tiny JSON
│   ├── kai-research-analyst.md  # sonnet judgment tier (opus per-call ≤2/run); may read sibling findings
│   └── kai-research-sweeper.md  # sonnet sweep tier: same question over a slice of a list → caller-schema JSONL chunks
├── skills/kai-research/
│   ├── SKILL.md                 # mode selector + research protocol: scope → wave plan → approve → fan out → gap review → synthesis
│   ├── sweep.md                 # sweep protocol: caller contract → plan → fan out → coverage gate → hand off to ingest
│   ├── fanout.workflow.js       # research wave script (deterministic fan-out, schema-capped returns)
│   └── sweep.workflow.js        # sweep wave script (≤40 items/agent, ≤24 agents, haiku|sonnet only, forced flush)
├── CLAUDE.md · README.md · LICENSE
```

## Registration

One-time (the repo is its own marketplace):

```
claude plugin marketplace add <path-to-clone-or-github-slug>
claude plugin install kai-research@kai-research
```

Enable at **user** level (not project) — the pipeline must work from any repo. Installed plugins are cached copies (`~/.claude/plugins/cache`), never edit them: edit here, bump `version` in plugin.json, then `/plugin update kai-research` (Desktop: restart).

## Outputs

- Research mode — findings: `.research/<slug>/` in the working repo (git-ignore it), or a caller-specified directory. Report: written by the main thread wherever the caller keeps research notes.
- Sweep mode — record chunks: `<outdir>/<slug>-w<N>-s<slice>-c<chunk>.jsonl` in the caller's shape. The deliverable is what the caller's ingest accepts, not a report.

## Callers

A domain skill owns the record contract (what a fact is, which sources are allowed, what gets refused) and calls sweep mode for the fan-out it does not own. Worked example: `riotloc-research` in the riotloc/outreach-system repo — stage-2 lead enrichment, `research.py --queue` → sweep → `research.py --ingest`. Keep the split: domain rules there, budgets here.

## Rules

- Wave plans and any budget raise go through the user (or a pre-authorized envelope stated at kickoff): propose → approve → execute.
- Typical research run ≈ $3–6 (waves of 6–8 haiku workers + 1–3 sonnet analysts + main-thread synthesis). A sweep is priced per item — announce items × per-item budget × agents before running it.
- Don't combine with judgment-based orchestration skills — "pick cheap models by prompt" is a verified no-op; budgets here are code-enforced.

## Abbreviations in design & research output

Any design or research deliverable — a note written in this repo **or** the same content sent to the user as a chat message — opens with a legend of its short codes, above the body, in the language of the text (`CODE — expansion`, one per line). Covers coined indices (`D1`, `W11`), domain acronyms (`FN`, `SP`) and anything not spelled out at its first use; leaves out the universally known (API, JSON, git). An edit that introduces a new code extends the legend in the same edit. Prefer a speaking name over a coined index — the legend is a fallback, not a licence. The same duty for terms rather than codes: a term, anglicism or coined name gets its expansion in parentheses at its first use, after which it may be used bare.
