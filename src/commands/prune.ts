import * as fs from 'node:fs';
import * as path from 'node:path';
import { Args, bool, str } from '../lib/args.js';
import { boardState, readBoard } from '../lib/board.js';
import { Ctx, findRepo } from '../lib/context.js';
import { listSpecs, regen } from '../lib/render.js';
import { ensureDir, LanesError } from '../lib/util.js';
import { loadRoles } from '../lib/roles.js';

const DAY = 86_400_000;

export function cmdPrune(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const days = Number(str(args, 'days') ?? 14);
  if (!Number.isFinite(days) || days < 0) throw new LanesError('--days must be a number >= 0');
  const dry = bool(args, 'dry-run');
  const now = ctx.now().getTime();
  const state = boardState(readBoard(repo).events);
  const moves: [string, string][] = [];

  for (const s of listSpecs(repo)) {
    if (s.status === 'closed') moves.push([s.file, s.file.replace(/^agents\//, 'agents/archive/')]);
  }

  const reportsDir = path.join(repo.agents, 'reports');
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(reportsDir);
  } catch {
    /* no reports */
  }
  const done = [...state.values()].filter((t) => t.status === 'DONE' && now - new Date(t.ts).getTime() > days * DAY);
  const names = new Set([...Object.keys(loadRoles(repo).agents), ...[...state.values()].flatMap((t) => t.history.map((e) => e.agent))]);
  for (const t of done) {
    for (const e of entries) {
      const base = e.replace(/\.md$/, '');
      if (base === t.task || [...names].some((n) => base === `${t.task}-${n}`)) moves.push([`agents/reports/${e}`, `agents/archive/reports/${e}`]);
    }
  }

  for (const [from, to] of moves) {
    ctx.out(`${dry ? 'would move' : 'moved'} ${from} -> ${to}`);
    if (dry) continue;
    const dest = repo.p(to);
    if (fs.existsSync(dest)) throw new LanesError(`${to} already exists; not overwriting`);
    ensureDir(path.dirname(dest));
    fs.renameSync(repo.p(from), dest);
  }
  if (!moves.length) ctx.out('nothing to prune');
  if (!dry && moves.length) {
    const w = regen(repo);
    if (w) ctx.err(w);
    ctx.out(`${moves.length} item(s) archived. Stage with: git add -A agents/`);
  }
  return 0;
}
