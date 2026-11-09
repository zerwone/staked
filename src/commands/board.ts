import { Args, bool, str } from '../lib/args.js';
import { readBoard, boardState, sortedTasks, parseStatus } from '../lib/board.js';
import { Ctx, findRepo } from '../lib/context.js';
import { isExpiredLock, listLocks } from '../lib/locks.js';
import { truncate } from '../lib/util.js';
import { loadModel, renderBoard } from '../lib/render.js';

export function cmdBoard(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const { events, errors } = readBoard(repo);
  const state = boardState(events);
  let tasks = sortedTasks(state, bool(args, 'all'));
  const agent = str(args, 'agent');
  if (agent) tasks = tasks.filter((t) => t.agent === agent || t.holder === agent);
  const only = str(args, 'status');
  if (only) {
    const s = parseStatus(only);
    tasks = tasks.filter((t) => t.status === s);
  }
  if (bool(args, 'md')) {
    ctx.out(renderBoard({ ...loadModel(repo), state }).split('\n').slice(2).join('\n'));
    return 0;
  }
  const now = ctx.now();
  const locks = listLocks(repo).filter((l) => l.kind === 'resource');
  if (bool(args, 'json')) {
    ctx.out(
      JSON.stringify(
        {
          tasks: tasks.map(({ history, ...t }) => t),
          locks: locks.map((l) => ({ ...l, expired: isExpiredLock(l, now) })),
          errors,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  if (!tasks.length) ctx.out(bool(args, 'all') ? 'board is empty' : 'no open tasks');
  const w = Math.min(14, Math.max(4, ...tasks.map((t) => t.task.length)));
  const aw = Math.min(14, Math.max(5, ...tasks.map((t) => t.agent.length)));
  for (const t of tasks) {
    const when = t.ts.slice(0, 16).replace('T', ' ');
    ctx.out(`${t.task.padEnd(w)}  ${t.status.padEnd(7)}  ${t.agent.padEnd(aw)}  ${when}  ${truncate(t.note, 60)}`.trimEnd());
  }
  if (locks.length) {
    ctx.out('');
    for (const l of locks) ctx.out(`lock ${l.name}: ${l.agent} until ${l.expires.slice(0, 16).replace('T', ' ')}${isExpiredLock(l, now) ? ' EXPIRED' : ''}`);
  }
  for (const e of errors) ctx.err(`warning: agents/board.jsonl line ${e.line} is not JSON; ignored`);
  return 0;
}
