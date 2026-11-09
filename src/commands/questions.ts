import { Args, bool, str } from '../lib/args.js';
import { boardState, CLOSED, readBoard } from '../lib/board.js';
import { Ctx, findRepo, resolveIdentity } from '../lib/context.js';
import { appendQuestion, isExpired, liveBlocking, nextQuestionId, Question, questionState, rankOpen, readQuestionEvents } from '../lib/questions.js';
import { regen } from '../lib/render.js';
import { getAgent, isOwner, loadRoles } from '../lib/roles.js';
import { assertTaskId, isoNow, StakedError, parseExpiry, splitList, truncate } from '../lib/util.js';
import { requireIdentity } from './tasks.js';

export function cmdAsk(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const roles = loadRoles(repo);
  const who = requireIdentity(ctx, repo, args);
  if (!isOwner(roles, who)) getAgent(roles, who);
  const text = str(args, 'text') ?? args._.join(' ');
  if (!text.trim()) throw new StakedError('usage: staked ask --as <agent> --text "..." [--blocking T-1,T-2] [--default ..] [--expires 2d]');
  const blocking = splitList(str(args, 'blocking')).map(assertTaskId);
  const now = ctx.now();
  const expires = str(args, 'expires');
  const { rows } = readQuestionEvents(repo);
  const id = nextQuestionId(rows);
  appendQuestion(repo, {
    ts: isoNow(now),
    id,
    agent: who,
    text: text.trim(),
    blocking,
    default: str(args, 'default') ?? null,
    expires: expires ? parseExpiry(expires, now) : null,
    status: 'open',
    answer: null,
  });
  ctx.out(id);
  const w = regen(repo);
  if (w) ctx.err(w);
  return 0;
}

export function cmdAnswer(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const roles = loadRoles(repo);
  const id = args._[0];
  if (!id) throw new StakedError('usage: staked answer Q-031 --text "..." | --use-default | --withdraw');
  // Only the owner answers. An identity that resolves to an agent is refused;
  // anything else (the owner's own git name, a phone shell) acts as the owner.
  const ident = resolveIdentity(ctx, repo, str(args, 'as'));
  const withdraw = bool(args, 'withdraw');
  const q = questionState(readQuestionEvents(repo).rows).get(id);
  if (!q) throw new StakedError(`no question ${id}`);
  if (ident && ident in roles.agents && !(withdraw && ident === q.agent)) {
    throw new StakedError(`${ident} is an agent; only the owner (${roles.owner}) answers questions`);
  }
  if (q.status !== 'open') throw new StakedError(`${id} is already ${q.status}${q.answer ? `: ${q.answer}` : ''}`);
  let answer = str(args, 'text') ?? (args._.slice(1).join(' ') || null);
  if (bool(args, 'use-default')) {
    if (!q.default) throw new StakedError(`${id} has no default`);
    answer = q.default;
  }
  if (!withdraw && !answer) throw new StakedError('give --text "...", --use-default, or --withdraw');
  const { asked, duplicates, ...base } = q;
  appendQuestion(repo, {
    ...base,
    ts: isoNow(ctx.now()),
    status: withdraw ? 'withdrawn' : 'answered',
    answer: withdraw ? null : answer,
    by: withdraw && ident ? ident : roles.owner,
  });
  ctx.out(`${id} ${withdraw ? 'withdrawn' : 'answered'}`);
  const w = regen(repo);
  if (w) ctx.err(w);
  return 0;
}

function age(fromIso: string, now: Date): string {
  const ms = now.getTime() - new Date(fromIso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(0, Math.floor(ms / 60_000))}m`;
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Two lines per question, sized for a phone. */
export function phoneLines(q: Question, closed: Set<string>, now: Date): string[] {
  const live = liveBlocking(q, closed);
  const head = [q.id, live.length ? `blocks ${live.length}: ${truncate(live.join(','), 24)}` : 'blocks none', q.agent, age(q.asked, now)];
  if (q.expires) head.push(isExpired(q, now) ? 'EXPIRED' : `exp ${q.expires.slice(5, 10)}`);
  const def = q.default ? ` → default: ${q.default}` : '';
  const prefix = isExpired(q, now) && q.default ? '[default applies] ' : '';
  return [head.join(' · '), '  ' + truncate(prefix + q.text + def, 110)];
}

export function cmdQuestions(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const { rows, errors } = readQuestionEvents(repo);
  const all = [...questionState(rows).values()];
  const state = boardState(readBoard(repo).events);
  const closed = new Set([...state.values()].filter((t) => CLOSED.includes(t.status)).map((t) => t.task));
  const now = ctx.now();
  const which = args._[0] ?? 'open';
  let list: Question[];
  if (which === 'open') list = rankOpen(all, closed);
  else if (which === 'all') list = all.sort((a, b) => (a.asked < b.asked ? 1 : -1));
  else if (/^Q-\d+$/.test(which)) {
    const q = all.find((x) => x.id === which);
    if (!q) throw new StakedError(`no question ${which}`);
    ctx.out(JSON.stringify(q, null, 2));
    return 0;
  } else throw new StakedError('usage: staked questions [open|all|Q-031] [--json] [--agent a]');
  const agent = str(args, 'agent');
  if (agent) list = list.filter((q) => q.agent === agent);
  if (bool(args, 'json')) {
    ctx.out(JSON.stringify(list.map((q) => ({ ...q, expired: isExpired(q, now), live_blocking: liveBlocking(q, closed) })), null, 2));
    return 0;
  }
  if (!list.length) ctx.out(which === 'open' ? 'no open questions' : 'no questions');
  for (const q of list) {
    if (which === 'open') ctx.out(phoneLines(q, closed, now).join('\n'));
    else ctx.out(`${q.id} · ${q.status} · ${q.agent} · ${truncate(q.text, 70)}${q.answer ? ` → ${truncate(q.answer, 40)}` : ''}`);
  }
  for (const e of errors) ctx.err(`warning: agents/questions.jsonl line ${e.line} is not JSON; ignored`);
  return 0;
}

