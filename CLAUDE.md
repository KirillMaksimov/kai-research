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
