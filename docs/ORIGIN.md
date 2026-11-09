# Origin: the audit lanes is extracted from

> The owner's audit (2026-11-08) of a real multi-agent repo: a private side project run by 4 coding agents (Claude Code, Codex, Cursor) for 24 days, ~1,600 commits, with a hand-maintained version of this protocol. Numbers are measured from that repo's files. Project names and local paths are removed.

2026-11-08

## What exists today

The origin repo runs a file-based multi-agent system across Claude Code, Codex and Cursor with no daemon, no framework and no shared chat. It has coordinated four agents for 24 days (since 2026-10-15) and produced 1,641 commits. That is the asset. Everything below is measured from the files, not from memory.

| Component | Where | Size today | Job |
| --- | --- | --- | --- |
| Roles and authority | `agents/PROTOCOL.md` | 20 KB, 166 lines, 3 stacked authority sections | Who is BOSS, who builds, who reviews |
| Lanes | `PROTOCOL.md` table + `CLAUDE.md` | 4 writers, path globs per agent | Who may write which paths |
| Status board | `agents/BOARD.md` | 144 KB, 793 lines, 87 task headers | Claim, status, one-line evidence per task |
| Decision ledger | `agents/QUESTIONS.md` | 112 KB, 917 lines, 99 entries | Overnight decisions and NEEDS OWNER items |
| Specs and queues | `agents/inbox/<agent>/` | 1,544 files across 8 inboxes | Boss writes specs; workers read |
| Evidence | `agents/reports/` | 635 files, 13 MB | Author-owned reports, screenshots, logs |
| Shared contracts | `agents/specs/` | 32 files | Interfaces changed before code |
| Mutex | `agents/SANDBOX_LOCK.md` | 1 line | One shared test machine, one agent at a time |
| Parallel work | a sibling worktrees folder | 25 worktrees, 52 registered | One worktree per task |
| Rule hierarchy | `CLAUDE.md` → `@AGENTS.md` → `@PROTOCOL.md` | 24 KB AGENTS.md | What every agent loads on start |

Rules that already work and should survive into any tool: claim before start; one task at a time; never edit another lane's files; shared interfaces change in `specs/` first; cross-reviews, nobody approves own work; every report opens with `Flags on: ...`; no deploy, push or migration without owner go; three-failure stop rule; all agent talk goes through files, no other channel.

Board state right now: 12 REVIEW, 5 DOING, 5 BLOCKED, 5 DONE, 2 TODO, 1 WAITING, 1 STOPPED, 1 PAUSED, 1 MERGED. 12 REVIEW items waiting on one owner is the first signal of the bottleneck described next.

## Weaknesses found, each with a fix

Ten problems, all visible in the files. Ranked by how much they cost the owner today.

| # | Weakness | Evidence | Cost | Fix |
| --- | --- | --- | --- | --- |
| 1 | Authority is append-only. Roles are redefined by stacking new "Current authority" sections on top of old ones instead of replacing them. | 3 authority sections in PROTOCOL.md; CLAUDE.md says "where older sections say otherwise, this file wins"; AGENTS.md has 7 "latest owner instruction" headings (lines 183–239) | Agents must resolve precedence by reading dates. Wrong-boss behavior, stale lanes, wasted turns. | One `roles.yml` as the single source. `handover` command rewrites it and appends a one-line entry to a `HISTORY.md`. Generated CLAUDE.md/AGENTS.md never hand-edited. |
| 2 | Lanes are enforced by trust, not by code. | 29 commits since 10-14 touch `server/**` and `supabase/**` or `deploy/**` together, which the lane table forbids. All 1,641 commits carry one author name, so git cannot tell which agent committed. | Cross-lane edits land silently. Reviews cannot see who broke the rule. | Pre-commit hook: `lanes check` reads `roles.yml`, fails on out-of-lane paths. Each agent commits with its own `user.name` (`codex-2`, `cursor`) via per-worktree git config. |
| 3 | BOARD is a 144 KB flat markdown file with duplicate task ids. | 87 task headers, 12 duplicated ids (same task re-posted as its status changed). Agents re-read the whole file each turn. | Every agent pays \~36k tokens per read. Stale duplicates get picked up as current. | `board.jsonl`, one line per event, append-only. `board` renders a short markdown view (open tasks only) that agents actually load. Dedup by id, latest wins. |
| 4 | Owner is the bottleneck and the ledger does not prioritise. | 12 tasks in REVIEW; QUESTIONS.md has 99 entries, 18 marked NEEDS OWNER, prose only, newest at top, no state. | The owner reads 112 KB on a phone to find what needs you. Decisions age for days. | `questions` command: structured entries with `status`, `blocking`, `default_if_no_answer`, `expires`. `questions open` prints only unresolved, ranked by what they block. Phone-sized. |
| 5 | Every agent loads everything. | CLAUDE.md imports AGENTS.md (24 KB) and PROTOCOL.md (20 KB), plus BOARD (144 KB) and QUESTIONS (112 KB) when referenced: \~300 KB, \~75k tokens, before a task starts. | Slower first turn, higher cost, context compaction fires early (one Codex session shows 3 `compacted` records). | Per-agent context pack: generated `CLAUDE.md` holds only that agent's role, lane, open tasks, open questions it owns, and the 5 rules. Target under 6 KB. |
| 6 | Inboxes are write-only archives. | 1,544 inbox files, 635 reports; no index, no done flag, no retention. `inbox/codex/` is kept as "historical" beside `inbox/codex-1/`. | Agents grep history as if it were current. Disk and token waste. | Spec files carry a `status:` frontmatter. `inbox prune` moves closed specs to `archive/`. Index generated, not written. |
| 7 | Evidence is prose, not checkable. | "Flags on: none" is a convention in a sentence. Reports are free text. Rule says "never mark native acceptance from unit tests" but nothing checks it. | A report can claim a pass nobody can verify. This is the "done vs actually done" gap. | Report frontmatter: `flags: []`, `tests_run:`, `native_boot: true/false`, `files_changed:`. `report check` validates against the git diff and refuses a REVIEW claim without it. |
| 8 | No machine-readable claim lock. | Claims are a BOARD line with a timestamp. Two agents can claim the same task in the same minute. SANDBOX\_LOCK is a single line edited by hand. | Race on the only Sandbox machine; duplicate work. | `claim` and `lock` write a lock file with agent id and TTL; refused if held. TTL expiry needs an explicit `release` or owner override. |
| 9 | Owner decisions live in four places. | Decisions appear in PROTOCOL.md, AGENTS.md ("Owner decision" sections), QUESTIONS.md and inbox/boss specs. | Agents miss or contradict a decision. | One `DECISIONS.md`, append-only, dated, numbered (D-001). Everything else references the number. |
| 10 | 821 uncommitted changes on `t072-house`; `a stale clone` is a stale copy with its own AGENTS.md diverging from the origin repo. | `git status` count; a stale clone AGENTS.md dated 10-25 vs origin 10-23 | Any extraction or refactor risks losing work; two protocol versions exist. | Commit or stash on the origin repo first. Delete or archive a stale clone after diffing its `docs/` into the origin repo. Do this before building the tool. |

## Performance

The system is slow and expensive for one reason: every agent reads the whole shared state every turn, and the shared state only grows. Fixing that cuts token spend roughly 10× per task start and makes the owner's review loop phone-sized.

| Measure | Today | After | How |
| --- | --- | --- | --- |
| Context loaded per agent start | \~300 KB (\~75k tokens): AGENTS + PROTOCOL + BOARD + QUESTIONS | Under 8 KB (\~2k tokens) | Generated per-agent `CLAUDE.md` with only that agent's role, lane, open tasks, open questions, and the 5 hard rules |
| Time for owner to find what needs them | Read 112 KB QUESTIONS + 144 KB BOARD | One `questions open` output, \~20 lines | Structured entries with status and blocking; ranked view |
| Stale-state errors | Duplicates and stacked authority resolved by reading dates | Zero: one source per fact | `roles.yml`, `board.jsonl`, `DECISIONS.md`, latest-wins rendering |
| Lane violations caught | 0 of 29 | 29 of 29, before commit | Pre-commit `lanes check` |
| Review wait | 12 tasks in REVIEW on one human | Fewer, shorter | Reports carry machine-checkable frontmatter; cross-agent review gates REVIEW; owner only sees items that passed |
| Context compaction mid-task | 3 `compacted` events in one codex session | Rare | Smaller start context leaves room for the actual work |
| Idle agents (out of credits) blocking lanes | codex-1/2 paused 10-17 to \~10-22, lane released by hand | Automatic | `roles.yml` has `status: paused`; `lanes` treats paused owners' lanes as claimable with a recorded handover |

Two rules keep it fast afterwards: agents never open BOARD.md or QUESTIONS.md raw, they call the CLI view; and the CLI never writes prose it cannot regenerate from `board.jsonl`, `roles.yml` and the spec frontmatter.

## The open-source project

Working name: **lanes**. A vendor-neutral, file-based coordination layer for teams of coding agents (Claude Code, Codex, Cursor, Gemini CLI, and any agent that can read a repo), run by one human owner who is often away. No daemon, no server, no framework lock-in: a CLI plus a folder convention, which is exactly what has worked for 24 days in the origin repo.

One-line pitch: *roles, lanes and a decision ledger for multi-agent repos. Git-native. Works with any agent that can read a file.*

What ships:

1. `lanes init` scaffolds `agents/` and `roles.yml`, and generates per-agent `CLAUDE.md` / `AGENTS.md` / `.cursor/rules` from it.
2. `lanes claim <task>` / `lanes release` / `lanes lock <resource>`: lock files with agent id and TTL; refused if held.
3. `lanes check` (pre-commit hook): fails a commit that touches paths outside the committing agent's lane, or a REVIEW claim without a valid report.
4. `lanes board`: `board.jsonl` events in, short markdown view out; agents read the view, never the log.
5. `lanes questions`: structured NEEDS OWNER entries with status, blocking, default, expiry; `questions open` is the phone view.
6. `lanes handover <from> <to>`: rewrites `roles.yml`, appends `HISTORY.md`, regenerates every agent's context file.
7. `lanes report check`: validates report frontmatter (`flags`, `tests_run`, `native_boot`, `files_changed`) against the actual git diff.

What stays out, on purpose: agent-to-agent messaging (agent-bus and the vendors already do it), orchestration and scheduling (CrewAI, AutoGen, LangGraph), transcript import (crossby, continues), claim verification against diffs (groundtruth), and any hosted service. `lanes` is the layer those tools do not have: who may do what, who decided what, and whether the files agree.

Why it can win: it is extracted from a real 1,641-commit project, not a demo. The readme is the origin story. The protocol is already vendor-neutral. The install is one command and a hook. And it fixes the ten weaknesses above for everyone running two or more agents on one repo, which is quickly becoming most serious users.

License MIT. Published under a personal account as a community tool.

## Final plan

Five phases, about six weeks of part-time work, each with a gate you cannot skip. the origin repo is the first user at every step, so the tool is proven on a live project before anyone else sees it. Total budget: 3 hours a day, 4 days a week. If a phase runs more than 50% over, stop and ship what passes its gate.

1. **Phase 0: Stabilise the origin repo (2 days, Nov 8 to 10).** Commit or stash the 821 changes on `t072-house`. Diff `the stale clone's docs` into the origin repo, then archive a stale clone. Collapse the three authority sections into one hand-written `roles.yml` and one `DECISIONS.md` (D-001 onward) by copying the current state, not rewriting history. Gate: origin-repo agents run one full task cycle reading only the new files, with zero authority questions.
2. **Phase 1: Core CLI (1 week, Nov 11 to 17).** Node or Python, single binary, zero runtime deps. `init`, `claim`, `release`, `lock`, `board`, `handover`, generated per-agent context files. Replace BOARD.md with `board.jsonl` plus rendered view in the origin repo. Gate: a week of origin-repo work on the CLI with no hand edits to BOARD or CLAUDE.md, and per-agent start context under 8 KB measured.
3. **Phase 2: Enforcement (1 week, Nov 18 to 24).** Pre-commit `check` for lanes, per-agent git identity in each worktree, `report check` with frontmatter validated against the diff, `questions` with status, blocking, default and expiry. Gate: the 29 historical cross-lane commits all fail `check` when replayed; one real origin-repo report is rejected and corrected by the tool.
4. **Phase 3: Public release (1 week, Nov 25 to Dec 1).** Readme written from the origin story with the ten weaknesses and the before/after numbers. `npx lanes init` demo on an empty repo with two agents. Hooks for Claude Code and Codex, rules file for Cursor. Post to r/ClaudeAI, the Codex and Cursor forums, HN Show, and your LinkedIn and X . Gate: 25 stars or 3 outside users who ran `init`, within 10 days.
5. **Phase 4: Second user and roadmap (2 weeks, Dec 2 to 15).** Adopt `lanes` in a second production repo as the second real project. Fix what breaks. Only then consider role-aware escalation (an assumption outside an agent's lane blocks and asks the owner) and a `lanes` report gate that runs a security scanner as a report gate. Gate: the second repo runs on it for two weeks with no regressions and no dropped customer work.

Hard stop rule: this is a side project. If any week it takes time from paying work, it pauses at the current gate. The gates exist so pausing costs nothing.
