import { Args, bool, str } from '../lib/args.js';
import { Ctx, findRepo } from '../lib/context.js';
import { acquire, DEFAULT_TTL, isExpiredLock, listLocks, readLock, release } from '../lib/locks.js';
import { getAgent, isOwner, isPrivileged, loadRoles } from '../lib/roles.js';
import { LanesError, NAME_RE, parseDuration } from '../lib/util.js';
import { requireIdentity } from './tasks.js';

const DEFAULT_RESOURCE_TTL = DEFAULT_TTL;

export function cmdLock(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const roles = loadRoles(repo);
  const name = args._[0];
  if (!name) {
    // no argument: list locks
    const now = ctx.now();
    const locks = listLocks(repo);
    if (bool(args, 'json')) ctx.out(JSON.stringify(locks.map((l) => ({ ...l, expired: isExpiredLock(l, now) })), null, 2));
    else if (!locks.length) ctx.out('no locks held');
    else for (const l of locks) ctx.out(`${l.name.padEnd(16)} ${l.kind.padEnd(8)} ${l.agent.padEnd(14)} until ${l.expires}${isExpiredLock(l, now) ? '  EXPIRED' : ''}`);
    return 0;
  }
  if (!NAME_RE.test(name)) throw new LanesError(`bad resource name "${name}"`);
  if (!roles.resources.includes(name)) {
    throw new LanesError(`"${name}" is not a resource in roles.yml (resources: ${roles.resources.join(', ') || 'none'}). Tasks are locked by \`lanes claim\`.`);
  }
  const who = requireIdentity(ctx, repo, args);
  if (!isOwner(roles, who)) {
    const a = getAgent(roles, who);
    if (a.status !== 'active') throw new LanesError(`${who} is ${a.status} and cannot take locks`);
  }
  const now = ctx.now();
  const got = acquire(repo, name, 'resource', who, parseDuration(str(args, 'ttl') ?? DEFAULT_RESOURCE_TTL), now, str(args, 'note'));
  if (!got.ok) throw new LanesError(`${name} is held by ${got.held.agent} until ${got.held.expires}${got.held.note ? ` (${got.held.note})` : ''}`);
  if (got.tookOver) ctx.err(`note: ${name} lock of ${got.tookOver.agent} had expired at ${got.tookOver.expires}; taken over`);
  ctx.out(`${name} locked by ${who} until ${got.lock.expires}${got.refreshed ? ' (refreshed)' : ''}`);
  return 0;
}

export function cmdUnlock(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const roles = loadRoles(repo);
  const name = args._[0];
  if (!name || !NAME_RE.test(name)) throw new LanesError('usage: lanes unlock <resource> --as <agent>');
  const held = readLock(repo, name);
  if (!held) throw new LanesError(`${name} is not locked`);
  if (held.kind === 'task') throw new LanesError(`${name} is a task lock; use \`lanes release ${name}\``);
  const who = requireIdentity(ctx, repo, args);
  const now = ctx.now();
  if (held.agent !== who && !isExpiredLock(held, now)) {
    if (!isPrivileged(roles, who) || !bool(args, 'force')) {
      throw new LanesError(`${name} is held by ${held.agent} until ${held.expires}${isPrivileged(roles, who) ? '; pass --force to override as ' + who : ''}`);
    }
  }
  release(repo, name);
  ctx.out(`${name} unlocked${held.agent !== who ? ` (was ${held.agent})` : ''}`);
  return 0;
}
