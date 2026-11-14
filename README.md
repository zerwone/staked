<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/reveal-on-dark.gif">
    <img src="docs/brand/logo-on-light.png" alt="staked" height="96">
  </picture>
</p>
<p align="center"><b>Give each coding agent its own part of the repo.</b></p>
<p align="center">Each agent gets its own lane. You get one short list of what needs you.<br>Plain files in your repo. No server, no account.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@zerwone/staked"><img alt="npm version" src="https://img.shields.io/npm/v/@zerwone/staked?label=npm&color=2457D6"></a>
  <a href="https://github.com/zerwone/staked/actions/workflows/test.yml"><img alt="tests" src="https://github.com/zerwone/staked/actions/workflows/test.yml/badge.svg"></a>
  <img alt="node" src="https://img.shields.io/node/v/@zerwone/staked?color=2457D6">
  <img alt="platforms" src="https://img.shields.io/badge/platform-windows%20%7C%20macOS%20%7C%20linux-2457D6">
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/npm/l/@zerwone/staked?color=2457D6"></a>
</p>
<p align="center">
  <a href="https://zerwone.github.io/staked/">Website</a> ·
  <a href="https://www.npmjs.com/package/@zerwone/staked">npm</a> ·
  <a href="https://github.com/zerwone/staked/releases">Releases</a> ·
  <a href="docs/REFERENCE.md">Reference</a>
</p>

**staked is a free, open-source command-line tool for running several AI coding agents (Claude Code, Codex, Cursor, Gemini CLI) on one Git repository.** You assign each agent the paths it owns in one file. staked writes each agent's instruction file, checks staged files before every commit, and keeps one short list of decisions waiting for you.

<p align="center"><img src="docs/brand/demo.gif" alt="staked demo" width="720"></p>
<p align="center"><sub>Recorded from a real run.</sub></p>

---

## How it works

```
agents/roles.yml              ← you write this once: who owns which paths
   │
   ├─ staked gen ─► CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/rules
   │                each agent reads its lane, its tasks and the rules
   │
   ├─ agent commits ─► pre-commit hook (staked check)
   │                    ├─ files in its own lane  → commit goes through
   │                    └─ a file in another lane → refused, names the owner
   │
   └─ agent needs a decision ─► staked ask … --default …   (keeps working on the default)
                                  │
       you ◄── staked questions open ◄┘    answer it, or let the default stand
```

1. **Lanes.** `agents/roles.yml` says which paths each agent owns, for example Claude Code gets `src/**`, Codex gets `web/**`.
2. **Instructions.** staked writes the files each agent already reads (`CLAUDE.md` for Claude Code, `AGENTS.md` for Codex, and so on) with its lane, its open tasks and the team rules. About 2.6 KB per agent.
3. **A check on every commit.** A git hook looks at the staged files. A commit that touches another agent's lane is refused before it exists.
4. **One list for you.** When an agent needs your call, it files a question with a safe default and keeps going. You read the open questions in one place.

## Requirements

- **Node.js 20 or newer** ([nodejs.org](https://nodejs.org))
- **A Git repository** your agents work in
- **Any agent that reads files in the repo:** Claude Code, Codex, Cursor, Gemini CLI

## Install

In your project:

```sh
npm i -D @zerwone/staked
```

Package: [npmjs.com/package/@zerwone/staked](https://www.npmjs.com/package/@zerwone/staked)

> Always run it as `npx @zerwone/staked …`. A bare `npx staked` could run someone else's package with the same short name.

## Use it

**1. Set up lanes**, from the repo root. Join several paths for one agent with `+`:

```sh
npx @zerwone/staked init --owner yourname --agents claude-code=src/**+test/**,codex=web/**
```

This writes `agents/roles.yml`, the agents' instruction files, and installs the pre-commit hook. The roles file it writes:

```yaml
owner: yourname
boss: claude-code
agents:
  claude-code:
    status: active
    lane: ["src/**", "test/**"]
    reviews: ["codex"]
  codex:
    status: active
    lane: ["web/**"]
    reviews: ["claude-code"]
```

**2. Commit the setup as yourself**, before any agent commits:

```sh
git add agents CLAUDE.md AGENTS.md .gitattributes .gitignore
git commit -m "add staked"
```

**3. Give each agent its own worktree and identity.** Worktrees keep agents from overwriting each other's files while they work; the identity tells staked whose lane applies.

```sh
git worktree add ../myapp-codex
cd ../myapp-codex
git config user.name codex
```

(Or set `STAKED_AGENT=codex` for that agent's terminal.)

**4. Start the agents as usual** (`claude`, `codex`, Cursor, Gemini CLI) in their worktrees. Each reads its instruction file and knows its lane, the rules and how to use staked.

**5. Hand out work.** Tell an agent its task in its chat; it claims the task before starting, and commits are refused until it has:

```sh
npx @zerwone/staked claim T-001 --as codex
```

**6. Check in, from anywhere:**

```sh
npx @zerwone/staked questions open      # what needs you, most urgent first
npx @zerwone/staked answer Q-001 --text "separate tab"   # or --use-default
npx @zerwone/staked board               # who is doing what
```

**7. Change things later.** Edit `agents/roles.yml` and run `npx @zerwone/staked gen`, or move a lane in one command: `npx @zerwone/staked handover codex claude-code`. To remove the hook: `npx @zerwone/staked hook uninstall`.

## What you'll see

An agent tries to commit a file outside its lane:

```
staked check: refused for codex
  - src/api/orders.ts: outside codex's lane (lane of claude-code)
```

An agent needs a decision from you. It asks, picks a safe default, and keeps working. From your phone:

```
$ npx @zerwone/staked questions open
Q-001 · blocks 1: T-012 · codex · 0m · exp 11-09
  Same page or separate tab for order history? → default: same page
```

Answer it, or let the default stand.

## Commands

You:

| Command | What it does |
| --- | --- |
| `init --agents a=src/**,b=web/**` | First run: lanes, instruction files, pre-commit hook |
| `questions open` | What needs you, most urgent first |
| `answer Q-001 --text ".."` / `--use-default` | Answer a question |
| `board` | Who is doing what right now |
| `gen` | Regenerate instruction files after editing `roles.yml` |
| `handover <from> <to>` | Move a lane or the boss role |
| `doctor` | Finds the common ways a multi-agent setup goes wrong |
| `hook install` / `uninstall` | The pre-commit check |

Agents (their instruction file tells them how): `claim`, `status`, `ask`, `lock` / `unlock`, `release`, `report check`. Prefix every command with `npx @zerwone/staked`. Full list and file formats: [docs/REFERENCE.md](docs/REFERENCE.md)

## What it is not

- **Not a sandbox.** It refuses the commit, not the edit. An agent can still change any file, and `git commit --no-verify` skips the hook; reviews will see that.
- **Not a server or an AI.** Plain files in your repo, a CLI and a git hook. No account, no network calls.

## Troubleshooting

**`staked check: refused` for files the agent didn't touch, right after `init`**
The setup files aren't committed yet. Commit them as yourself first (step 2).

**`codex has no DOING task: claim before start`**
The agent must claim a task before committing: `npx @zerwone/staked claim T-001 --as codex`.

**The hook says the wrong agent**
staked takes the identity from `--as`, then `STAKED_AGENT`, then `git config user.name` in that worktree. Check which one is set.

**Something else feels off**
`npx @zerwone/staked doctor` lists what's wrong and where. Still stuck? [Open an issue](https://github.com/zerwone/staked/issues).

## Why it exists

staked comes from a real project: 4 agents (Claude Code, Codex, Cursor), 24 days, about 1,600 commits, coordinated with hand-written markdown. It worked, but the files didn't scale:

| | by hand | with staked |
| --- | --- | --- |
| coordination files each agent was pointed at | ~300 KB | 2.6 KB generated per agent (measured on this repo) |
| finding what needs you | 256 KB of board and questions | one short list |
| commits that touched two agents' lanes at once | 29, none flagged | the hook refuses this kind of commit (tested on sample commits, not yet replayed on the original 29) |

The full audit: [docs/ORIGIN.md](docs/ORIGIN.md)

## FAQ

**How do I run multiple coding agents on the same repo without conflicts?**
Two layers. Git worktrees give each agent its own working copy, so they don't overwrite each other's files while they work. staked decides who may change which paths and checks it before each commit, so work stays in its lane when it comes back together. Use both.

**What's the difference between staked and git worktrees?**
Worktrees separate where agents work. staked separates what they may change, writes their instructions, and collects their questions. Worktrees alone don't stop two agents from editing the same module on different branches.

**How is it different from CODEOWNERS?**
CODEOWNERS requests reviewers on a pull request after the change exists. staked checks each agent's commit locally, before it exists, and also gives each agent its own instructions and a place to ask you questions.

**Does it work with Claude Code, Codex, Cursor and Gemini CLI?**
Yes. It generates `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/staked.mdc` and `GEMINI.md`, the files those agents already read. Any agent that reads files in the repo can follow it.

**Can it stop an agent from editing a file?**
No. It refuses the commit, not the edit. It is a workflow check, not a sandbox, and `git commit --no-verify` skips it.

**Does staked call an AI model or need a server?**
No. It is plain files in your repo, a CLI and a Git hook. No account, no network calls.

## Works with

Any agent that reads a file in the repo: **Claude Code**, **Codex**, **Cursor**, **Gemini CLI**. Windows, macOS, Linux; the test suite runs on all three on every change.

---

Built by Mohamad Aljadaan at **ZerwOne**.

MIT · [Contributing](docs/DEVELOPMENT.md) · [Report a bug](https://github.com/zerwone/staked/issues) · Sister project: [**pocket**](https://github.com/zerwone/pocket), moves your agent to your next key when its model hits a usage limit
