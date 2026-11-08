import type { Command } from '../cli.js';

export const HELP = `lanes: roles, lanes and a decision ledger for multi-agent repos

Usage: lanes <command> [options]

  init [--agents a,b] [--owner name]     scaffold agents/ and roles.yml
  gen [--force] [--dry-run]              regenerate CLAUDE.md, AGENTS.md, .cursor/rules/lanes.mdc,
                                         GEMINI.md, agents/BOARD.md, agents/HISTORY.md

Identity: --as <agent>, else $LANES_AGENT, else git config user.name.
`;

export const COMMANDS: Record<string, Command> = {};
