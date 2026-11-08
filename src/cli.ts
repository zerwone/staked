import { readFileSync } from 'node:fs';
import { parseArgs, Args } from './lib/args.js';
import { Ctx, defaultCtx } from './lib/context.js';
import { LanesError } from './lib/util.js';
import { cmdInit } from './commands/init.js';
import { cmdGen } from './commands/gen.js';
import { COMMANDS, HELP } from './commands/index.js';

export type Command = (ctx: Ctx, args: Args) => number;

export function run(argv: string[], ctx: Ctx = defaultCtx()): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e: any) {
    ctx.err(`lanes: ${e.message}`);
    return 2;
  }
  const [cmd, ...rest] = args._;
  if (args.flags.version || cmd === 'version' || cmd === '-v') {
    ctx.out(version());
    return 0;
  }
  if (!cmd || cmd === 'help' || (args.flags.help && !cmd)) {
    ctx.out(HELP);
    return 0;
  }
  const table: Record<string, Command> = { init: cmdInit, gen: cmdGen, ...COMMANDS };
  const fn = table[cmd];
  if (!fn) {
    ctx.err(`lanes: unknown command "${cmd}". Run \`lanes help\`.`);
    return 2;
  }
  if (args.flags.help) {
    ctx.out(HELP);
    return 0;
  }
  try {
    return fn(ctx, { _: rest, flags: args.flags });
  } catch (e: any) {
    if (e instanceof LanesError) {
      ctx.err(`lanes ${cmd}: ${e.message}`);
      return e.code;
    }
    ctx.err(`lanes ${cmd}: internal error: ${e?.stack ?? e}`);
    return 70;
  }
}

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}
