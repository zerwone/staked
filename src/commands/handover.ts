import { Args, bool, str } from '../lib/args.js';
import { appendEvent, boardState, doingTasks, readBoard } from '../lib/board.js';
import { Ctx, findRepo, resolveIdentity } from '../lib/context.js';
import { normalizePath } from '../lib/glob.js';
import { release } from '../lib/locks.js';
import { runGen } from '../lib/render.js';
import { getAgent, isPrivileged, loadRoles, saveRoles } from '../lib/roles.js';
import { isoNow, LanesError, splitList } from '../lib/util.js';

export function cmdHandover(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const roles = loadRoles(repo);
  const [from, to] = args._;
  if (!from || !to) throw new LanesError('usage: lanes handover <from> <to> [--lanes all|none|glob,glob] [--keep-boss] [--force-release]');
  if (from === to) throw new LanesError('from and to are the same agent');
  const a = getAgent(roles, from);
  const b = getAgent(roles, to);
  if (b.status !== 'active') throw new LanesError(`${to} is ${b.status}; activate it in roles.yml first`);
  const who = resolveIdentity(ctx, repo, str(args, 'as')) ?? roles.owner;
  if (who in roles.agents && !isPrivileged(roles, who) && who !== from) {
    throw new LanesError(`${who} cannot hand over ${from}'s work; the boss (${roles.boss}), the owner or ${from} can`);
  }

  const spec = str(args, 'lanes') ?? 'all';
  let moving: string[];
  if (spec === 'all') moving = [...a.lane];
  else if (spec === 'none') moving = [];
  else {
    moving = splitList(spec);
    const have = new Set(a.lane.map(normalizePath));
    const unknown = moving.filter((g) => !have.has(normalizePath(g)));
    if (unknown.length) throw new LanesError(`${from} does not own: ${unknown.join(', ')} (lane: ${a.lane.join(', ') || 'none'})`);
  }
  const boss = roles.boss === from && !bool(args, 'keep-boss');
  if (!moving.length && !boss) throw new LanesError(`nothing to hand over: ${from} has no lanes${spec !== 'all' ? ' selected' : ''} and is not boss`);

  const state = boardState(readBoard(repo).events);
  const doing = doingTasks(state, from);
  const now = ctx.now();
  const released: string[] = [];
  if (doing.length) {
    if (!bool(args, 'force-release')) {
      throw new LanesError(`${from} is DOING ${doing.map((t) => t.task).join(', ')}; finish or release it, or pass --force-release to mark it PAUSED`);
    }
    for (const t of doing) {
      appendEvent(repo, { ts: isoNow(now), task: t.task, agent: from, status: 'PAUSED', note: `handover to ${to} by ${who}`, flags: [] });
      release(repo, t.task);
      released.push(t.task);
    }
  }

  const movingSet = new Set(moving.map(normalizePath));
  a.lane = a.lane.filter((g) => !movingSet.has(normalizePath(g)));
  for (const g of moving) if (!b.lane.some((x) => normalizePath(x) === normalizePath(g))) b.lane.push(g);
  if (boss) roles.boss = to;
  saveRoles(repo, roles);
  appendEvent(repo, { ts: isoNow(now), kind: 'handover', from, to, lanes: moving, boss, by: who, ...(released.length ? { released } : {}) });
  const g = runGen(repo);
  ctx.out(`handover ${from} → ${to}: ${[moving.length ? `lanes ${moving.join(', ')}` : '', boss ? 'boss' : ''].filter(Boolean).join('; ')}`);
  if (released.length) ctx.out(`paused: ${released.join(', ')}`);
  ctx.out(`regenerated ${g.written.length} file(s)`);
  if (g.refused.length) ctx.err(`gen skipped hand-written files: ${g.refused.join(', ')}`);
  return 0;
}
