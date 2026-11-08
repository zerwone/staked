import type { Command } from '../cli.js';
import { cmdClaim, cmdRelease, cmdStatus } from './tasks.js';
import { cmdLock, cmdUnlock } from './locks.js';
import { cmdBoard } from './board.js';
import { cmdAnswer, cmdAsk, cmdQuestions } from './questions.js';
import { cmdCheck, cmdHook } from './check.js';

export const HELP = `lanes: roles, lanes and a decision ledger for multi-agent repos

Usage: lanes <command> [options]

  init [--agents a,b] [--owner name]     scaffold agents/ and roles.yml
  gen [--force] [--dry-run]              regenerate CLAUDE.md, AGENTS.md, .cursor/rules/lanes.mdc,
                                         GEMINI.md, agents/BOARD.md, agents/HISTORY.md
  claim <task> --as <agent> [--note ..] [--ttl 8h]
                                         start a task: refused if another agent holds it, if you
                                         already have a DOING task, or if you are paused
  status <task> <STATUS> --as <agent> [--note ..] [--flags a,b]
                                         TODO DOING BLOCKED REVIEW DONE PAUSED STOPPED.
                                         REVIEW needs a valid report; DONE needs someone else
  release <task> [--as <agent>]          give a task back (TODO) and drop its lock
  lock [<resource> --as <agent> [--ttl 8h] [--note ..]]
                                         take a named resource from roles.yml (no args: list locks)
  unlock <resource> --as <agent> [--force]
  board [--all] [--json] [--md] [--agent a] [--status S]
                                         open tasks, newest first, one row per task
  ask --as <agent> --text ".." [--blocking T-1,T-2] [--default ..] [--expires 2d]
                                         add a question for the owner (prints its id)
  answer Q-031 (--text ".." | --use-default | --withdraw)
                                         owner answers; the asker may withdraw
  questions [open|all|Q-031] [--json]    open: unresolved, most-blocking first, 2 lines each
  check [--as <agent>] [--staged] [--commit <rev>] [--paths a,b] [--json]
                                         pre-commit gate: out-of-lane paths, foreign board rows,
                                         hand-edited generated files, REVIEW without a valid report
  hook install|uninstall|status          pre-commit hook running \`lanes check --staged\`
                                         (an existing hook is kept and chained first)

Identity: --as <agent>, else $LANES_AGENT, else git config user.name.
`;

export const COMMANDS: Record<string, Command> = {
  claim: cmdClaim,
  status: cmdStatus,
  release: cmdRelease,
  lock: cmdLock,
  unlock: cmdUnlock,
  board: cmdBoard,
  ask: cmdAsk,
  answer: cmdAnswer,
  questions: cmdQuestions,
  check: cmdCheck,
  hook: cmdHook,
};
