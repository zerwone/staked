---
task: LANES-BUILD
agent: claude-code
flags: []
tests_run:
  - "npm test (tsc build + vitest run): 16 files, 100 tests, all passed"
  - "npm pack, then npx --package ./lanes-0.1.0.tgz lanes init && lanes gen in a fresh git repo"
  - "lanes check --commit <sha> --as claude-code on every commit of this task: all ok"
  - "lanes doctor on this repo: 0 errors"
native_boot: false
files_changed:
  - ".gitignore"
  - "AGENTS.md"
  - "CLAUDE.md"
  - "README.md"
  - "agents/BOARD.md"
  - "agents/HISTORY.md"
  - "agents/board.jsonl"
  - "agents/inbox/claude-code/LANES-BUILD.md"
  - "examples/two-agents/.cursor/rules/lanes.mdc"
  - "examples/two-agents/.gitattributes"
  - "examples/two-agents/.gitignore"
  - "examples/two-agents/AGENTS.md"
  - "examples/two-agents/CLAUDE.md"
  - "examples/two-agents/README.md"
  - "examples/two-agents/agents/BOARD.md"
  - "examples/two-agents/agents/DECISIONS.md"
  - "examples/two-agents/agents/HISTORY.md"
  - "examples/two-agents/agents/archive/.gitkeep"
  - "examples/two-agents/agents/board.jsonl"
  - "examples/two-agents/agents/inbox/claude-code/.gitkeep"
  - "examples/two-agents/agents/inbox/claude-code/T-001.md"
  - "examples/two-agents/agents/inbox/cursor/.gitkeep"
  - "examples/two-agents/agents/inbox/cursor/T-002.md"
  - "examples/two-agents/agents/questions.jsonl"
  - "examples/two-agents/agents/reports/.gitkeep"
  - "examples/two-agents/agents/reports/T-002-cursor.md"
  - "examples/two-agents/agents/roles.yml"
  - "examples/two-agents/agents/specs/.gitkeep"
  - "examples/two-agents/agents/specs/orders-api.md"
  - "examples/two-agents/web/orders.tsx"
  - "package-lock.json"
  - "package.json"
  - "src/cli.ts"
  - "src/commands/board.ts"
  - "src/commands/check.ts"
  - "src/commands/doctor.ts"
  - "src/commands/gen.ts"
  - "src/commands/handover.ts"
  - "src/commands/index.ts"
  - "src/commands/init.ts"
  - "src/commands/locks.ts"
  - "src/commands/prune.ts"
  - "src/commands/questions.ts"
  - "src/commands/report.ts"
  - "src/commands/tasks.ts"
  - "src/lib/args.ts"
  - "src/lib/board.ts"
  - "src/lib/check.ts"
  - "src/lib/context.ts"
  - "src/lib/frontmatter.ts"
  - "src/lib/git.ts"
  - "src/lib/glob.ts"
  - "src/lib/locks.ts"
  - "src/lib/questions.ts"
  - "src/lib/render.ts"
  - "src/lib/report.ts"
  - "src/lib/roles.ts"
  - "src/lib/util.ts"
  - "src/lib/yaml.ts"
  - "src/main.ts"
  - "test/board.test.ts"
  - "test/check.test.ts"
  - "test/doctor.test.ts"
  - "test/e2e.test.ts"
  - "test/example.test.ts"
  - "test/fixtures/legacy-agents/BOARD.md"
  - "test/fixtures/legacy-agents/PROTOCOL.md"
  - "test/fixtures/legacy-agents/QUESTIONS.md"
  - "test/gen.test.ts"
  - "test/glob.test.ts"
  - "test/handover.test.ts"
  - "test/helpers.ts"
  - "test/init.test.ts"
  - "test/locks.test.ts"
  - "test/prune.test.ts"
  - "test/questions.test.ts"
  - "test/replay.test.ts"
  - "test/report.test.ts"
  - "test/tasks.test.ts"
  - "test/yaml.test.ts"
  - "tsconfig.json"
  - "vitest.config.ts"
  - "agents/reports/LANES-BUILD-claude-code.md"
---
# LANES-BUILD report (claude-code)

Flags on: none.

Status: built and tested. BOARD row LANES-BUILD set to REVIEW. Nothing pushed except the
designated branch `claude/cool-bohr-lf1wjp`. Nothing published to npm.

## What was built

`lanes`: a zero-runtime-dependency Node 20+ / TypeScript CLI (`bin: lanes` -> `dist/main.js`).
All 11 commands from the spec, each in its own `lanes: <cmd>` commit, each with tests first:

| # | Command | Commit |
|---|---|---|
| 1 | `init` | ee7a84e |
| 2 | `gen` | f8c46a2 |
| 3 | `claim` / `status` / `release` | d6172b4 |
| 4 | `lock` / `unlock` | 4ffe652 |
| 5 | `board` | 46f62da |
| 6 | `ask` / `answer` / `questions` | 7a757b4 |
| 7 | `check` / `hook install` | af1af44 |
| 8 | `handover` | 8a59868 |
| 9 | `report check` | e37951d |
| 10 | `prune` | c0e43df |
| 11 | `doctor` | 91d33ef |

Then: e2e test (386b179), CRLF fix (373a59f), `examples/two-agents` (0afff72), README (fac0048),
branch-based work attribution (3a3026c), and this report.

Everything is in-house: YAML subset parser, minimatch-style globs, frontmatter, O_EXCL lock files.
`package.json` has no `dependencies`. Dev deps are typescript, vitest and @types/node.

## Evidence

`npm test` (build + vitest), run at the end:

```
 ✓ test/tasks.test.ts (16 tests) 831ms
 ✓ test/locks.test.ts (7 tests) 407ms
 ✓ test/e2e.test.ts (1 test) 1722ms
 ✓ test/replay.test.ts (1 test) 335ms
 ✓ test/questions.test.ts (7 tests) 285ms
 ✓ test/check.test.ts (19 tests) 2518ms
 ✓ test/gen.test.ts (8 tests) 271ms
 ✓ test/doctor.test.ts (7 tests) 283ms
 ✓ test/handover.test.ts (5 tests) 257ms
 ✓ test/board.test.ts (5 tests) 206ms
 ✓ test/report.test.ts (7 tests) 157ms
 ✓ test/prune.test.ts (2 tests) 102ms
 ✓ test/init.test.ts (3 tests) 93ms
 ✓ test/example.test.ts (2 tests) 52ms
 ✓ test/glob.test.ts (5 tests) 5ms
 ✓ test/yaml.test.ts (5 tests) 9ms
 Test Files  16 passed (16)
      Tests  100 passed (100)
   Duration  4.30s (transform 535ms, setup 0ms, collect 1.91s, tests 7.53s, environment 2ms, prepare 1.05s)
```

Required tests, where they are:

- Unit tests per command: `test/<command>.test.ts`.
- End-to-end (`test/e2e.test.ts`, through the built binary and a real git pre-commit hook):
  init -> gen -> two agents claim -> cross-lane commit refused by the hook -> report with no
  frontmatter refused -> fixed -> REVIEW committed -> handover -> gen output under 6 KB -> doctor 0 errors.
- Replay (`test/replay.test.ts`): a fixture repo with 3 commits that each touch `server/**` and
  `supabase/**` (one also `deploy/**`). `lanes check --commit` fails all 3: as cursor, as claude-code,
  and as the shared author name.
- Windows paths (`test/check.test.ts` "check --paths (Windows)", `test/glob.test.ts`,
  `test/report.test.ts`): backslashes in staged paths, in lane globs and in `files_changed`.
  CRLF checkouts of generated files are covered in `test/gen.test.ts`.

Done-when checks:

- `npm test` passes: yes, 100/100.
- `npx lanes init && npx lanes gen` on a fresh temp repo, from the packed tarball: exit 0, context files under 6 KB (sizes below).
- The e2e test proves a cross-lane commit is refused: yes. Hook output: `api/orders.ts: outside cursor's lane (lane of claude-code)`.
- `lanes doctor` against a copy of the origin repo's `agents/`: **not run, because no copy exists in this environment** (see Blocked).
  Instead, a fixture with the same described shape is copied and checked (`test/fixtures/legacy-agents/`: 3 stacked
  "Current authority" sections, a board with re-posted task headers, an "Owner decision" section inside
  QUESTIONS.md). doctor reports `3 authority sections stacked (lines 3, 14, 22)`
  and `2 duplicated id(s) across 6 headed entries: T-070 x3, T-072 x2`, and it ignores ids inside code fences.
  It runs without a `roles.yml`, so it can be pointed straight at the real folder: `npx lanes doctor <path-to>/agents`.

### Measured sizes of generated context files (bytes; target < 6000)

| Where | CLAUDE.md | AGENTS.md | .cursor/rules/lanes.mdc |
|---|---|---|---|
| fresh `npx lanes init && npx lanes gen` (defaults claude-code, codex) | 2207 | 2043 | not generated (no cursor agent) |
| spec's example roles.yml (claude-code, cursor, codex-2 paused, sandbox) | 2378 | 2180 | 2313 |
| `examples/two-agents` (1 DOING, 1 REVIEW, 1 open question, 2 specs) | 2430 | 2120 | 2496 |
| this repo after `lanes gen` | 2380 | 2226 | not generated |
| stress test: 300 board tasks, 80 questions (asserted in `test/gen.test.ts`) | < 6000 | < 6000 | < 6000 |

`agents/BOARD.md` and `agents/HISTORY.md` are generated too (428 and 184 bytes here). The renderer
tightens its list caps step by step until each file fits under 6000 bytes.

## Decisions made without owner

Where the spec left a choice, each decision takes the option closest to the protocol as the spec and `docs/ORIGIN.md` describe it.

1. **Where the BOARD is.** No origin repo exists in this environment, so "the CD BOARD" is this repo's
   own `agents/board.jsonl`. I claimed there first (271aa8e). This report is at
   `agents/reports/LANES-BUILD-claude-code.md` in this repo, not on a `D:\` path.
2. **Spec location.** The task said `agents/inbox/claude-code/LANES-BUILD.md`, but the file was at
   `agents/inbox/LANES-BUILD.md`. I moved it to the stated path and added spec frontmatter
   (`task, owner, status: open, allowed_paths, done_when`). The body is unchanged.
3. **Lane vs spec paths.** roles.yml gives claude-code `src/ test/ docs/` and codex `examples/**`.
   The spec explicitly assigns `examples/two-agents/`, `README.md`, `package.json` etc. to this task.
   I turned that into a feature: `check` widens an agent's lane by the `allowed_paths` of an open spec in its
   own inbox, **only while it holds that task**. That is why every commit of this task passes `lanes check --commit
   <sha> --as claude-code`. The same commits fail as `codex`.
4. **Handover log source.** HISTORY.md must be regenerable, so handovers are stored as
   `{"kind":"handover",...}` rows in `board.jsonl` (no new file). Board views ignore those rows.
5. **Which generated file each agent reads.** By name prefix: `claude*` -> CLAUDE.md, `cursor*` ->
   `.cursor/rules/lanes.mdc`, `gemini*` -> GEMINI.md, everything else (codex, unknown) -> AGENTS.md.
   Each agent can override this with `context: [...]` in roles.yml. A file is generated only if some non-retired
   agent reads it (AGENTS.md always). Vendor files that lanes generated earlier and no agent reads any more are removed.
6. **Hand-written files.** `gen` refuses to overwrite a non-generated CLAUDE.md etc. unless given `--force`.
   Empty files are replaced. Hand edits are detected by a content hash in a second marker line.
7. **Locks shared across worktrees.** `agents/locks/` resolves to the *main* worktree's folder
   (via `git rev-parse --git-common-dir`), so linked worktrees share one mutex. Locks are git-ignored.
8. **Expired locks.** The spec says a lock is refused if held *and not expired*, so an expired resource lock is
   taken over with a printed note. An expired *task* lock does not free the task: the board still says
   DOING, and `claim` refuses until it is released. This matches ORIGIN's "TTL expiry needs an explicit release or
   owner override". `doctor` lists expired locks. The resource TTL default is 8h, the same as for tasks.
9. **Open vs closed.** Open = TODO DOING BLOCKED REVIEW PAUSED; closed = DONE STOPPED. `board --all` shows both.
10. **Review rules in `status`.** REVIEW needs a valid report by the holder. DONE needs three things: the task is in REVIEW,
    the actor is not the one who set REVIEW, and the actor reviews that author in roles.yml (or is the boss).
    The owner can set anything. A reviewer can send work back with BLOCKED, and the holder keeps the task.
    BLOCKED/TODO/PAUSED/DONE/STOPPED drop the task lock; DOING and REVIEW keep it.
11. **Claim before start is enforced.** `check` refuses code paths when the committer has no DOING/REVIEW task.
12. **Rules for `agents/` paths in `check`.** An agent may write `agents/reports/*-<agent>.md` (and
    `*-<agent>/` evidence folders), `agents/inbox/<agent>/**` and `agents/specs/**`, and may append its own
    rows to the two jsonl files. The boss may also write `agents/inbox/**`, `agents/roles.yml` and
    `agents/archive/**`. `agents/DECISIONS.md` is owner-only. The owner is exempt from all lane rules.
    Anyone may commit generated files, as long as their hash verifies.
13. **Lanes come from HEAD.** `check` reads roles.yml from `HEAD` (or from `<rev>^` with `--commit`).
    Without this, an agent could widen its own lane in the same commit. A test found this, and it is fixed in af1af44.
14. **`files_changed` matching.** It must match the real change in both directions. Every listed path must
    have changed, counting the working tree, staged files, commits by the agent since the claim, and **everything on the branch
    since the commit that recorded the claim**. Every staged code path must be listed. The branch rule
    (3a3026c) exists because this environment commits as `Claude`, not `claude-code`. Without it, agents whose vendor fixes the git
    identity would fail the gate on honest reports.
15. **Report fields.** All six are required. `tests_run` and `files_changed` must be non-empty (use
    `"none: <reason>"` for docs-only work). `native_boot: true` is refused for an agent with
    `can_boot_client: false`. The file name must be `<task>-<agent>.md`.
16. **Only the owner answers questions.** An identity that resolves to an agent is refused. Any other
    identity (the owner's real git name, a phone shell) is treated as the owner. The asker may `--withdraw`.
    Expired questions stay open and show `[default applies]` in `questions open`; nothing is written automatically.
17. **Hook fallback.** The hook tries `./node_modules/.bin/lanes`, then the CLI path recorded at install,
    then `lanes` on PATH. It **never** runs `npx lanes`: the npm name `lanes` belongs to an unrelated package
    (v1.1.0), and a hook must not download and run a stranger's code.
18. **YAML subset.** The parser is hand-written: block maps and lists, flow lists, quoted/plain scalars, `|`/`>`.
    `handover` rewrites roles.yml with a fixed header comment. Inline comments in roles.yml are not preserved,
    but fields are: a round-trip check refuses to write if anything would be lost.
19. **Glob semantics.** `*` and `**` match dotfiles. A pattern with no glob characters owns its subtree, and
    a trailing `/` means `/**`. Matching is case-sensitive, and backslashes are normalised on both sides.
20. **Prune window.** Closed specs move right away. Reports move once their task has been DONE for more than
    `--days` (default 14), and their evidence folders move with them.
21. **doctor scope.** Markdown checks scan `agents/*.md` and the root context files, not
    inbox/reports/archive (the origin repo has thousands of those). Beyond the 8 listed checks, doctor also
    reports precedence-by-date wording, owner decisions outside DECISIONS.md, duplicate question ids,
    specs without status, tasks held by paused or unknown agents, a missing hook, and more than 100
    uncommitted changes. Each finding is tagged with its ORIGIN weakness number.

## Blocked / not verified

- **Windows run.** The spec says "test on Windows (this machine) first". This environment is Linux, and no
  Windows machine is available. Unit tests cover the Windows handling (backslash paths and globs,
  CRLF checkouts, `/C:/` URL paths in the hook), but `npm test` has **not** been run on Windows. Owner: please run `npm test` there.
- **doctor on the real origin `agents/` folder.** That folder is not here. doctor was proven on a fixture of the same shape (above).
- **npm name.** `lanes` is taken on npm by an unrelated package (v1.1.0), so publishing under that name will fail.
  It needs a scoped name (e.g. `@<you>/lanes`) or another name. That is an owner decision, so I did not change package.json.
- **Origin repo paths.** The spec's `D:\Storage\...` write paths do not exist here, so everything was built in this repo.
- The `init` commit (ee7a84e) has one fixture test that needs `gen`, which lands in the next commit.
  Every later commit is green.

## Notes for review

- `src/`, `README.md`, `examples/` and the packed tarball contain no `ZerwOne`, `Sentrail`, `NetEase` or origin-project names.
  `docs/LANES-BUILD.md` and the inbox spec are owner-written and not in the npm package; they still name the origin paths.
- The lanes hook is not installed in this repo, and `doctor` warns about it. Installing it is the owner's choice per clone:
  `npx lanes hook install`.
