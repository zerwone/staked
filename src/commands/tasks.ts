import * as path from 'node:path';
import { Args, bool, str } from '../lib/args.js';
import { appendEvent, boardState, doingTasks, parseStatus, readBoard, Status, TaskState } from '../lib/board.js';
import { Ctx, findRepo, Repo, resolveIdentity } from '../lib/context.js';
import { taskCommittedPaths, workingChanges } from '../lib/git.js';
import { acquire, DEFAULT_TTL, readLock, release } from '../lib/locks.js';
import { regen } from '../lib/render.js';
import { reportPath, validateReport } from '../lib/report.js';
import { getAgent, isOwner, isPrivileged, loadRoles, Roles } from '../lib/roles.js';
import { assertTaskId, isoNow, LanesError, parseDuration, readText, splitList } from '../lib/util.js';

export function requireIdentity(ctx: Ctx, repo: Repo, args: Args): string {
  const who = resolveIdentity(ctx, repo, str(args, 'as'));
  if (!who) throw new LanesError('who are you? pass --as <agent>, set LANES_AGENT, or git config user.name <agent>');
  return who;
}

function requireActor(roles: Roles, who: string) {
  if (isOwner(roles, who)) return;
  getAgent(roles, who);
}

function say(ctx: Ctx, repo: Repo, msg: string) {
  ctx.out(msg);
  const w = regen(repo);
  if (w) ctx.err(w);
}

export function cmdClaim(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const task = assertTaskId(args._[0]);
  const who = requireIdentity(ctx, repo, args);
  return claim(ctx, repo, task, who, args);
}

function claim(ctx: Ctx, repo: Repo, task: string, who: string, args: Args): number {
  const roles = loadRoles(repo);
  const agent = getAgent(roles, who);
  if (agent.status !== 'active') throw new LanesError(`${who} is ${agent.status} in roles.yml and cannot claim work`);
  const state = boardState(readBoard(repo).events);
  const t = state.get(task);
  if (t && (t.status === 'DOING' || t.status === 'REVIEW') && t.holder && t.holder !== who) {
    throw new LanesError(`${task} is ${t.status} for ${t.holder} (since ${t.ts}). Ask them, or the owner, to release it.`);
  }
  if (t && (t.status === 'DONE' || t.status === 'STOPPED')) {
    throw new LanesError(`${task} is ${t.status}. Reopen it first: lanes status ${task} TODO --as ${who}`);
  }
  const other = doingTasks(state, who).filter((x) => x.task !== task);
  if (other.length) throw new LanesError(`one task at a time: ${who} is already DOING ${other.map((x) => x.task).join(', ')}`);
  const now = ctx.now();
  const ttl = parseDuration(str(args, 'ttl') ?? DEFAULT_TTL);
  const got = acquire(repo, task, 'task', who, ttl, now);
  if (!got.ok) throw new LanesError(`${task} is locked by ${got.held.agent} until ${got.held.expires}`);
  if (got.tookOver) ctx.err(`note: took over expired lock on ${task} from ${got.tookOver.agent} (expired ${got.tookOver.expires})`);
  if (t && t.status === 'DOING' && t.holder === who) {
    ctx.out(`${task} is already yours (DOING); lock refreshed until ${got.lock.expires}`);
    return 0;
  }
  appendEvent(repo, { ts: isoNow(now), task, agent: who, status: 'DOING', note: str(args, 'note') ?? '', flags: splitList(str(args, 'flags')) });
  say(ctx, repo, `${task} DOING by ${who} (lock until ${got.lock.expires})`);
  return 0;
}

/** Paths that really changed for a task: working tree + commits by the agent since the claim. */
export function actualTaskPaths(repo: Repo, agent: string, t: TaskState | undefined): string[] {
  const set = new Set(workingChanges(repo.root));
  if (t?.claimedAt) for (const p of taskCommittedPaths(repo.root, t.task, agent, t.claimedAt)) set.add(p);
  return [...set];
}

export function cmdStatus(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const task = assertTaskId(args._[0]);
  const status = parseStatus(args._[1]);
  const who = requireIdentity(ctx, repo, args);
  if (status === 'DOING') return claim(ctx, repo, task, who, args);
  const roles = loadRoles(repo);
  requireActor(roles, who);
  const state = boardState(readBoard(repo).events);
  const t = state.get(task);
  const owner = isOwner(roles, who);
  const priv = isPrivileged(roles, who);
  const holder = t?.holder ?? null;

  if (status === 'DONE') {
    if (!owner) {
      if (!t || t.status !== 'REVIEW') throw new LanesError(`${task} must be in REVIEW before DONE (it is ${t?.status ?? 'unknown'})`);
      if (t.reviewBy === who) throw new LanesError(`nobody approves their own work: ${who} put ${task} into REVIEW`);
      const me = getAgent(roles, who);
      if (t.reviewBy && !me.reviews.includes(t.reviewBy) && who !== roles.boss) {
        throw new LanesError(`${who} does not review ${t.reviewBy} (roles.yml reviews: ${me.reviews.join(', ') || 'none'})`);
      }
    }
  } else if (status === 'BLOCKED' && t?.status === 'REVIEW' && holder !== who) {
    // reviewer sends work back; the holder keeps the task
  } else if (holder && holder !== who && !priv) {
    throw new LanesError(`${task} belongs to ${holder}; only they, the boss or the owner can set ${status}`);
  }

  if (status === 'REVIEW') {
    if (!owner && holder && holder !== who) throw new LanesError(`${task} is held by ${holder}; they set REVIEW`);
    const rel = reportPath(task, who);
    const text = readText(path.join(repo.root, rel));
    if (text === null) throw new LanesError(`REVIEW needs a report: ${rel} (frontmatter: task, agent, flags, tests_run, native_boot, files_changed)`);
    const actual = repo.isGit && !bool(args, 'no-git') ? actualTaskPaths(repo, who, t) : undefined;
    const res = validateReport(text, { file: rel, roles, actual, expectTask: task, expectAgent: who });
    if (!res.ok) throw new LanesError(`report ${rel} is not valid:\n  - ${res.errors.join('\n  - ')}`);
  }

  const now = ctx.now();
  let note = str(args, 'note') ?? '';
  if (status === 'BLOCKED' && t?.status === 'REVIEW' && holder !== who && !note) note = `review: changes requested by ${who}`;
  appendEvent(repo, { ts: isoNow(now), task, agent: who, status, note, flags: splitList(str(args, 'flags')) });
  if (!keepsLock(status)) {
    const l = readLock(repo, task);
    if (l) release(repo, task);
  }
  say(ctx, repo, `${task} ${status} by ${who}`);
  return 0;
}

function keepsLock(s: Status) {
  return s === 'DOING' || s === 'REVIEW';
}

export function cmdRelease(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const task = assertTaskId(args._[0]);
  const who = requireIdentity(ctx, repo, args);
  const roles = loadRoles(repo);
  requireActor(roles, who);
  const t = boardState(readBoard(repo).events).get(task);
  const lock = readLock(repo, task);
  const holder = t?.holder ?? lock?.agent ?? null;
  if (!t && !lock) throw new LanesError(`${task} is not on the board`);
  if (holder && holder !== who && !isPrivileged(roles, who)) throw new LanesError(`${task} is held by ${holder}; only they, the boss or the owner can release it`);
  if (lock) release(repo, task);
  if (t && t.holder) {
    const note = str(args, 'note') ?? (holder === who ? 'released' : `released by ${who} (was ${holder})`);
    appendEvent(repo, { ts: isoNow(ctx.now()), task, agent: who, status: 'TODO', note, flags: [] });
  }
  say(ctx, repo, `${task} released${holder && holder !== who ? ` (was ${holder})` : ''}`);
  return 0;
}
