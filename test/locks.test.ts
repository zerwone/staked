import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { fixtureRepo, lanes, read, sh, write } from './helpers.js';
import { acquire } from '../src/lib/locks.js';
import { Repo } from '../src/lib/context.js';

describe('lock / unlock', () => {
  it('locks a resource with TTL and refuses others while held', () => {
    const dir = fixtureRepo();
    const now = '2026-11-08T12:00:00Z';
    let r = lanes(dir, ['lock', 'sandbox', '--as', 'cursor', '--ttl', '2h', '--note', 'native boot'], { now });
    expect(r.code, r.err).toBe(0);
    expect(JSON.parse(read(dir, 'agents/locks/sandbox.lock'))).toMatchObject({ agent: 'cursor', kind: 'resource', expires: '2026-11-08T14:00:00Z', note: 'native boot' });
    r = lanes(dir, ['lock', 'sandbox', '--as', 'claude-code'], { now: '2026-11-08T13:00:00Z' });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/held by cursor until 2026-11-08T14:00:00Z \(native boot\)/);
    r = lanes(dir, ['lock'], { now: '2026-11-08T13:00:00Z' });
    expect(r.out).toMatch(/sandbox\s+resource\s+cursor/);
  });

  it('an expired lock can be taken over, with a note', () => {
    const dir = fixtureRepo();
    lanes(dir, ['lock', 'sandbox', '--as', 'cursor', '--ttl', '1h'], { now: '2026-11-08T12:00:00Z' });
    const r = lanes(dir, ['lock', 'sandbox', '--as', 'claude-code'], { now: '2026-11-08T14:00:00Z' });
    expect(r.code, r.err).toBe(0);
    expect(r.err).toMatch(/had expired/);
    expect(JSON.parse(read(dir, 'agents/locks/sandbox.lock')).agent).toBe('claude-code');
  });

  it('only resources in roles.yml can be locked', () => {
    const dir = fixtureRepo();
    expect(lanes(dir, ['lock', 'gpu', '--as', 'cursor']).err).toMatch(/not a resource/);
  });

  it('unlock: holder yes, others no, boss/owner with --force', () => {
    const dir = fixtureRepo();
    lanes(dir, ['lock', 'sandbox', '--as', 'cursor']);
    write(dir, 'agents/roles.yml', read(dir, 'agents/roles.yml').replace('status: paused', 'status: active'));
    expect(lanes(dir, ['unlock', 'sandbox', '--as', 'codex-2']).err).toMatch(/held by cursor/);
    expect(lanes(dir, ['unlock', 'sandbox', '--as', 'mohamad']).err).toMatch(/--force/);
    expect(lanes(dir, ['unlock', 'sandbox', '--as', 'mohamad', '--force']).code).toBe(0);
    expect(fs.existsSync(path.join(dir, 'agents/locks/sandbox.lock'))).toBe(false);
    lanes(dir, ['lock', 'sandbox', '--as', 'cursor']);
    expect(lanes(dir, ['unlock', 'sandbox', '--as', 'cursor']).code).toBe(0);
  });

  it('task locks are released with release, not unlock', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    expect(lanes(dir, ['unlock', 'T-1', '--as', 'cursor']).err).toMatch(/use `lanes release T-1`/);
  });

  it('exactly one of many concurrent acquirers wins', () => {
    const dir = fixtureRepo();
    const repo = new Repo(dir, true);
    const now = new Date('2026-11-08T12:00:00Z');
    const results = ['a', 'b', 'c', 'd', 'e'].map((who) => acquire(repo, 'sandbox', 'resource', who, 3600_000, now));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('linked git worktrees share one locks directory', () => {
    const dir = fixtureRepo();
    sh(dir, ['add', '-A']);
    sh(dir, ['commit', '-qm', 'init', '--no-verify']);
    const wt = path.join(dir, '..', path.basename(dir) + '-wt');
    execFileSync('git', ['worktree', 'add', '-q', wt], { cwd: dir });
    expect(lanes(wt, ['lock', 'sandbox', '--as', 'cursor']).code).toBe(0);
    expect(fs.existsSync(path.join(dir, 'agents/locks/sandbox.lock'))).toBe(true);
    expect(lanes(dir, ['lock', 'sandbox', '--as', 'claude-code']).err).toMatch(/held by cursor/);
  });
});
