import * as fs from 'node:fs';
import * as path from 'node:path';
import { Args, bool } from '../lib/args.js';
import { boardState, readBoard } from '../lib/board.js';
import { Ctx, findRepo } from '../lib/context.js';
import { normalizePath } from '../lib/glob.js';
import { validateReport } from '../lib/report.js';
import { loadRoles } from '../lib/roles.js';
import { LanesError } from '../lib/util.js';
import { actualTaskPaths } from './tasks.js';

export function cmdReport(ctx: Ctx, args: Args): number {
  const [sub, file] = args._;
  if (sub !== 'check' || !file) throw new LanesError('usage: lanes report check <path> [--no-git] [--json]');
  const repo = findRepo(ctx);
  const roles = loadRoles(repo);
  const abs = path.resolve(ctx.cwd, file);
  let text: string;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    throw new LanesError(`cannot read ${file}`);
  }
  const rel = normalizePath(path.relative(repo.root, abs));
  const first = validateReport(text, { file: rel, roles });
  let res = first;
  if (first.data?.task && first.data.agent && repo.isGit && !bool(args, 'no-git')) {
    const t = boardState(readBoard(repo).events).get(first.data.task);
    const actual = actualTaskPaths(repo, first.data.agent, t);
    res = validateReport(text, { file: rel, roles, actual });
  }
  if (bool(args, 'json')) {
    ctx.out(JSON.stringify({ file: rel, ...res }, null, 2));
    return res.ok ? 0 : 1;
  }
  if (res.ok) {
    ctx.out(`${rel}: ok (${res.data?.task}, ${res.data?.agent}, ${res.data?.files_changed?.length} file(s), flags: ${res.data?.flags?.join(', ') || 'none'})`);
    return 0;
  }
  ctx.err(`${rel}: invalid`);
  for (const e of res.errors) ctx.err(`  - ${e}`);
  return 1;
}
