# kai-research

Token-tiered deep-research pipeline for Claude Code: the expensive model plans and judges; capped cheap subagents do the searching.

## What it is

A Claude Code plugin (`/kai-research`) for decision-oriented research that keeps retrieval out of the expensive model's context. The main thread only plans waves, reviews gaps, and synthesizes the report — it never calls WebSearch/WebFetch. Everything else goes to two capped subagent tiers, neither able to spawn further agents (`disallowedTools: Agent`):

- **`kai-research-worker`** — Haiku retrieval tier, `maxTurns 16`. One narrow question (what exists, what docs say, prior art); ≤4 WebSearch / ≤6 WebFetch; writes a findings file.
- **`kai-research-analyst`** — Sonnet judgment tier (Opus per call for design-shaped sub-questions, ≤2/wave), `maxTurns 24`. Comparison/credibility/tradeoff questions; may read sibling findings; ≤5 WebSearch / ≤8 WebFetch.

Both follow one **findings-file contract**: frontmatter (`question`, `tier`, `model`, `status`, `date`, `sources`) plus fixed sections — TL;DR, Findings (claim, source, date, confidence H/M/L), Contradictions, Sources table, Dead ends; the analyst adds `## Assessment`. Replies back to the main thread are schema-capped JSON (`tldr` ≤1000 chars, ≤5 contradictions, ≤3 hooks) — raw pages never leave disk.

Built after a postmortem: one judgment-orchestrated run spawned 102 subagents and burned ~33M tokens. This plugin swaps "pick cheap models by judgment" for code-enforced budgets.

## How it works

```mermaid
flowchart TD
    U[Brief] --> G0[Scope gate]
    G0 --> WP[Wave plan]
    WP --> AP{Approve?}
    AP -->|yes| FO[fanout.workflow.js]
    FO --> W1[worker: haiku]
    FO --> W2[worker: haiku]
    FO --> AN[analyst: sonnet/opus]
    W1 --> FF[(findings + JSON)]
    W2 --> FF
    AN --> FF
    FF --> GR{Gap review}
    GR -->|gaps| WP
    GR -->|dry / budget| SY[Synthesis]
    SY --> RP[Decision report]
```

Protocol (`SKILL.md`): scope gate → wave plan → approval → fan-out → gap review (next wave, or stop when a wave yields under ~2 new findings) → optional verify wave (Haiku refuters re-check load-bearing claims) → synthesis (problem/criteria, landscape, options table, contradictions, recommendation, design sketch, next probes, sources) → wrap-up with run stats.

The report cites **primary sources by number** — `[1](url)` inline on load-bearing claims, plus a `## Sources` list at the bottom (`[1 - title](url) — pub date — accessed date`), deduplicated by URL across findings files. Findings files are git-ignored working copies, so they are never the citation target; a per-file evidence map stays in the report as an audit trail only.

Fan-out is a deterministic script, not a prompt: `fanout.workflow.js` checks wave size (≤12), tier/model enum, and the Opus quota (≤2) before any agent runs, then dispatches the wave as one parallel batch under a fixed return schema.

## Why tiers-as-config

Model tier is configuration, not persuasion — pinned in each agent's frontmatter and the per-call `model` argument, never by prompt instructions to an orchestrator (a verified no-op).

| Role | Model | USD/MTok in / out* |
|---|---|---|
| Main thread | session model | 10 / 50 |
| worker | haiku | 1 / 5 |
| analyst | sonnet | 3 / 15 |
| analyst (opus calls) | opus | 5 / 25 |

*Snapshot rates (2026-07), illustrative, not live pricing.

Research is retrieval-heavy — most tokens go to searches and fetches, not judgment. Routing that bulk through a tier 3–10× cheaper per token, handed off as files rather than conversation, is where the savings compound.

## Install

The repo is its own plugin marketplace:

```
git clone <repo-url> kai-research
claude plugin marketplace add ./kai-research
claude plugin install kai-research@kai-research
```

(Once the repo is on GitHub, `claude plugin marketplace add <owner>/kai-research` works directly.)

Install at **user** scope — the pipeline is meant to run from any repo. Leave `CLAUDE_CODE_SUBAGENT_MODEL` unset: it overrides every model pin here.

## Usage

```
/kai-research <a decision to inform, with known constraints>
```

Not for single-fact lookups (answer those directly) and not a general orchestrator. If the brief is underspecified, the skill asks up to 3 scoping questions first; otherwise it proposes a wave plan (questions, tiers/models, agent count, cost estimate) and waits for approval — unless you pre-authorize a budget envelope. Each wave writes findings to `<outdir>/<wave><NN>-<slug>.md` and returns a tiny JSON summary; the main thread then plans another wave or synthesizes. Output: a decision report plus printed run stats (waves, agents per tier, findings count, estimated cost).

## Configuration & limits

- Wave size: ≤8 by convention, **hard cap 12** (script-enforced).
- Run budget: `max_agents` default **16**; raised to 40–50 only for enumerative sweeps.
- Opus sub-questions: **≤2 per wave** — checked in the protocol and the script.
- Worker: ≤4 WebSearch / ≤6 WebFetch, `maxTurns 16`; tools = WebSearch + WebFetch + Write.
- Analyst: ≤5 WebSearch / ≤8 WebFetch, `maxTurns 24`; adds Read/Grep/Glob.
- Return JSON: `tldr` ≤1000 chars, ≤5 contradictions, ≤3 hooks — schema-enforced.
- No harness knob caps search/fetch counts directly; prompt budgets + `maxTurns` back them.
- Recommended: set `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` in your user settings as a session-wide circuit breaker.

## Status

`0.1.2` (`plugin.json`). Early-stage, single author. Born from one very expensive postmortem, validated on real research runs since; agent prompts, workflow schema, and findings format may still change.

## License

MIT — see [LICENSE](LICENSE).
