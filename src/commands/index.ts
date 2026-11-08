import type { Command } from '../cli.js';
import { cmdClaim, cmdRelease, cmdStatus } from './tasks.js';

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

Identity: --as <agent>, else $LANES_AGENT, else git config user.name.
`;

export const COMMANDS: Record<string, Command> = {
  claim: cmdClaim,
  status: cmdStatus,
  release: cmdRelease,
};
