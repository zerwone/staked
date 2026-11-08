import { LanesError } from './util.js';

export interface Args {
  _: string[];
  flags: Record<string, string | boolean>;
}

const BOOLEAN = new Set([
  'json',
  'all',
  'force',
  'staged',
  'dry-run',
  'force-release',
  'use-default',
  'help',
  'keep-boss',
  'quiet',
  'no-git',
  'version',
]);

export function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a === '-h') {
      out.flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (eq > 0) {
        out.flags[key] = a.slice(eq + 1);
      } else if (BOOLEAN.has(key)) {
        out.flags[key] = true;
      } else {
        const v = argv[i + 1];
        if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new LanesError(`--${key} needs a value`);
        out.flags[key] = v;
        i++;
      }
      continue;
    }
    out._.push(a);
  }
  return out;
}

export function str(args: Args, key: string): string | undefined {
  const v = args.flags[key];
  if (v === undefined || v === false) return undefined;
  if (v === true) throw new LanesError(`--${key} needs a value`);
  return v;
}

export function bool(args: Args, key: string): boolean {
  const v = args.flags[key];
  return v === true || v === 'true';
}

export function need(v: string | undefined, what: string): string {
  if (!v) throw new LanesError(`missing ${what}`);
  return v;
}
