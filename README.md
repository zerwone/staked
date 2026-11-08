# lanes

**Roles, lanes and a decision ledger for multi-agent repos.** Git-native. No daemon. Works with any coding agent that can read a file.

> Status: pre-alpha. The protocol has run for 24 days on a real 1,600-commit project across Claude Code, Codex and Cursor. The CLI is being extracted from it now. See `docs/ORIGIN.md` for the audit and `docs/LANES-BUILD.md` for the build spec.

## The problem

You run two or more coding agents on one repo. You are often away. Every agent reads the whole shared state every turn, roles get redefined by stacking "latest instruction" sections, lanes are enforced by trust, and when you come back you read 100 KB of markdown to find the three decisions that actually needed you.

## What lanes does

| Command | Job |
| --- | --- |
| `lanes init` | Scaffold `agents/` and `roles.yml`; generate per-agent `CLAUDE.md` / `AGENTS.md` / `.cursor/rules` under 6 KB each |
| `lanes claim` / `release` / `lock` | Lock files with agent id and TTL; refused if held |
| `lanes check` | Pre-commit hook: fails a commit that touches paths outside the committing agent's lane, or a REVIEW without a valid report |
| `lanes board` | `board.jsonl` in, short open-tasks view out |
| `lanes ask` / `answer` / `questions open` | Structured NEEDS-OWNER ledger with status, blocking, default and expiry. Phone-sized |
| `lanes handover` | Rewrite `roles.yml` once, log it, regenerate every agent's context |
| `lanes report check` | Validate report frontmatter against the real git diff |
| `lanes doctor` | Find stacked authority, duplicate task ids, hand-edited generated files, expired locks |

## What lanes is not

Not agent-to-agent messaging (agent-bus, vendor subagents). Not orchestration (CrewAI, AutoGen, LangGraph). Not transcript import (crossby, continues). Not claim verification against diffs (groundtruth). lanes is the layer those tools do not have: who may do what, who decided what, and whether the files agree.

## Data model

```
agents/
  roles.yml          single source of truth for roles, lanes, status
  board.jsonl        append-only task events; latest per task wins
  questions.jsonl    append-only owner-decision ledger
  DECISIONS.md       numbered owner decisions, hand-written, append-only
  HISTORY.md         one line per handover, generated
  locks/             claim and resource locks with TTL
  inbox/<agent>/     specs with frontmatter
  reports/           reports with frontmatter
  specs/             shared interface contracts
```

## License

MIT
