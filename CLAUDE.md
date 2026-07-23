# kai-research — tiered deep-research plugin

Claude Code plugin: decision-oriented research pipeline that keeps the expensive main-thread model for planning/synthesis and pushes evidence collection to capped cheap subagents with file-based handoff. Design rationale and usage: `README.md`.

## Invariant layers (what enforces what)

| Property | Enforced by | Never by |
|---|---|---|
| Model tier per agent | agent frontmatter `model:` + per-call `model` in the workflow | prompt instructions to an orchestrator (verified no-op) |
| Agent count | `fanout.workflow.js` (throws over budget) + approved wave plans | any model's runtime judgment |
| Return size | workflow `schema` (tldr ≤1000 chars) | politeness |
| No nesting | `tools` allowlist without Agent + `disallowedTools: Agent` | — |
| Search/fetch counts | agent prompt caps + `maxTurns` backstop | (no harness knob exists) |
| Runaway circuit breaker | optional `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` in user settings env | — |

`CLAUDE_CODE_SUBAGENT_MODEL` must stay **unset** — it is resolution priority #1 and would flatten all tiers.

## Layout

```
kai-research/
├── .claude-plugin/
│   ├── plugin.json              # manifest (name: kai-research)
│   └── marketplace.json         # self-listing marketplace (name: kai-research)
├── agents/
│   ├── kai-research-worker.md   # haiku retrieval tier: 1 question → findings file + tiny JSON
│   └── kai-research-analyst.md  # sonnet judgment tier (opus per-call ≤2/run); may read sibling findings
├── skills/kai-research/
│   ├── SKILL.md                 # /kai-research protocol: scope → wave plan → approve → fan out → gap review → synthesis
│   └── fanout.workflow.js       # canonical wave script (deterministic fan-out, schema-capped returns)
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

- Findings: `.research/<slug>/` in the working repo (git-ignore it), or a caller-specified directory.
- Report: written by the main thread wherever the caller keeps research notes.

## Rules

- Wave plans and any budget raise go through the user (or a pre-authorized envelope stated at kickoff): propose → approve → execute.
- Typical run ≈ $3–6 (waves of 6–8 haiku workers + 1–3 sonnet analysts + main-thread synthesis). An enumerative sweep with a raised budget is announced with its own estimate.
- Don't combine with judgment-based orchestration skills — "pick cheap models by prompt" is a verified no-op; budgets here are code-enforced.
