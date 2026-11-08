import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Repo } from './context.js';
import { ensureDir, isoNow, LanesError } from './util.js';

export interface Lock {
  name: string;
  kind: 'task' | 'resource';
  agent: string;
  acquired: string;
  expires: string;
  note?: string;
}

export const DEFAULT_TTL = '8h';

export function lockFile(repo: Repo, name: string) {
  return path.join(repo.locksDir, `${name}.lock`);
}

export function readLock(repo: Repo, name: string): Lock | null {
  try {
    return JSON.parse(fs.readFileSync(lockFile(repo, name), 'utf8'));
  } catch (e: any) {
    if (e.code === 'ENOENT') return null;
    // unreadable lock: treat as held by unknown until removed by hand
    return { name, kind: 'resource', agent: '?', acquired: '', expires: '9999-12-31T00:00:00Z', note: 'unreadable lock file' };
  }
}

export function listLocks(repo: Repo): Lock[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(repo.locksDir).filter((f) => f.endsWith('.lock'));
  } catch {
    return [];
  }
  return names
    .map((f) => readLock(repo, f.slice(0, -5)))
    .filter((l): l is Lock => !!l)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function isExpiredLock(l: Lock, now: Date) {
  return new Date(l.expires).getTime() <= now.getTime();
}

export type AcquireResult = { ok: true; lock: Lock; tookOver?: Lock; refreshed?: boolean } | { ok: false; held: Lock };

/**
 * Atomically acquire a lock. Uses O_EXCL create so two agents racing in the same
 * second cannot both win. An expired lock is moved aside with rename (only one
 * racer can rename it) and then re-created.
 */
export function acquire(repo: Repo, name: string, kind: Lock['kind'], agent: string, ttlMs: number, now: Date, note?: string): AcquireResult {
  ensureDir(repo.locksDir);
  const file = lockFile(repo, name);
  const lock: Lock = { name, kind, agent, acquired: isoNow(now), expires: isoNow(new Date(now.getTime() + ttlMs)), ...(note ? { note } : {}) };
  const body = JSON.stringify(lock, null, 2) + '\n';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(file, body, { flag: 'wx' });
      return { ok: true, lock };
    } catch (e: any) {
      if (e.code !== 'EEXIST') throw e;
    }
    const held = readLock(repo, name);
    if (!held) continue; // released between our attempts
    if (held.kind !== kind) throw new LanesError(`lock name "${name}" is already used by a ${held.kind} lock`);
    if (held.agent === agent && !isExpiredLock(held, now)) {
      fs.writeFileSync(file, body);
      return { ok: true, lock, refreshed: true };
    }
    if (!isExpiredLock(held, now)) return { ok: false, held };
    const aside = `${file}.stale-${randomBytes(4).toString('hex')}`;
    try {
      fs.renameSync(file, aside);
    } catch (e: any) {
      if (e.code === 'ENOENT') continue;
      throw e;
    }
    fs.rmSync(aside, { force: true });
    try {
      fs.writeFileSync(file, body, { flag: 'wx' });
      return { ok: true, lock, tookOver: held };
    } catch (e: any) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  const held = readLock(repo, name);
  if (held) return { ok: false, held };
  throw new LanesError(`could not acquire lock "${name}"`);
}

export function release(repo: Repo, name: string): Lock | null {
  const held = readLock(repo, name);
  if (held) fs.rmSync(lockFile(repo, name), { force: true });
  return held;
}
