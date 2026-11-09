import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureRepo, lanes, read, write } from './helpers.js';

const REPORT = (task: string, agent: string, files: string[]) => `---
task: ${task}
agent: ${agent}
flags: []
tests_run: ["npm test"]
native_boot: false
files_changed: [${files.map((f) => JSON.stringify(f)).join(', ')}]
---
Flags on: none.
`;

function lastEvent(dir: string) {
  const lines = read(dir, 'agents/board.jsonl').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

describe('claim', () => {
  it('appends a DOING event, writes a lock with TTL and regenerates the board', () => {
    const dir = fixtureRepo();
    const r = lanes(dir, ['claim', 'T-101', '--as', 'cursor', '--note', 'start api'], { now: '2026-11-08T12:00:00Z' });
    expect(r.code, r.err).toBe(0);
    expect(lastEvent(dir)).toMatchObject({ ts: '2026-11-08T12:00:00Z', task: 'T-101', agent: 'cursor', status: 'DOING', note: 'start api', flags: [] });
    const lock = JSON.parse(read(dir, 'agents/locks/T-101.lock'));
    expect(lock).toMatchObject({ name: 'T-101', kind: 'task', agent: 'cursor', expires: '2026-11-08T20:00:00Z' });
    expect(read(dir, 'agents/BOARD.md')).toContain('| T-101 | DOING | cursor |');
    expect(read(dir, '.cursor/rules/staked.mdc')).toContain('T-101 DOING');
  });

  it('refuses a task held by another agent', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-101', '--as', 'cursor']);
    const r = lanes(dir, ['claim', 'T-101', '--as', 'claude-code']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/T-101 is DOING for cursor/);
  });

  it('refuses a second DOING task for the same agent', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-101', '--as', 'cursor']);
    const r = lanes(dir, ['claim', 'T-102', '--as', 'cursor']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/one task at a time/);
  });

  it('refuses a paused agent and an unknown agent', () => {
    const dir = fixtureRepo();
    expect(lanes(dir, ['claim', 'T-1', '--as', 'codex-2']).err).toMatch(/paused/);
    expect(lanes(dir, ['claim', 'T-1', '--as', 'nobody']).err).toMatch(/unknown agent/);
  });

  it('resolves identity from STAKED_AGENT, then git user.name', () => {
    const dir = fixtureRepo();
    expect(lanes(dir, ['claim', 'T-1'], { env: { STAKED_AGENT: 'cursor' } }).code).toBe(0);
    expect(lastEvent(dir).agent).toBe('cursor');
    // git user.name in the fixture is the owner, who is not an agent
    expect(lanes(dir, ['claim', 'T-2']).err).toMatch(/unknown agent "mohamad"/);
  });

  it('re-claiming your own task refreshes the lock without a new event', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-1', '--as', 'cursor'], { now: '2026-11-08T12:00:00Z' });
    const n = read(dir, 'agents/board.jsonl').trim().split('\n').length;
    const r = lanes(dir, ['claim', 'T-1', '--as', 'cursor'], { now: '2026-11-08T13:00:00Z' });
    expect(r.out).toMatch(/already yours/);
    expect(read(dir, 'agents/board.jsonl').trim().split('\n').length).toBe(n);
    expect(JSON.parse(read(dir, 'agents/locks/T-1.lock')).expires).toBe('2026-11-08T21:00:00Z');
  });

  it('a racing claim loses on the lock file even if the board has not caught up', () => {
    const dir = fixtureRepo();
    // simulate another worktree that already took the lock but whose board line is not merged yet
    write(dir, 'agents/locks/T-9.lock', JSON.stringify({ name: 'T-9', kind: 'task', agent: 'claude-code', acquired: '2026-11-08T12:00:00Z', expires: '2099-01-01T00:00:00Z' }));
    const r = lanes(dir, ['claim', 'T-9', '--as', 'cursor']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/locked by claude-code/);
  });

  it('rejects bad task ids', () => {
    const dir = fixtureRepo();
    expect(lanes(dir, ['claim', '../x', '--as', 'cursor']).err).toMatch(/bad task id/);
  });
});

describe('status', () => {
  it('REVIEW needs a valid report; DONE needs a different reviewer', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    let r = lanes(dir, ['status', 'T-1', 'REVIEW', '--as', 'cursor', '--no-git']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/REVIEW needs a report: agents\/reports\/T-1-cursor\.md/);
    write(dir, 'agents/reports/T-1-cursor.md', 'no frontmatter here\n');
    r = lanes(dir, ['status', 'T-1', 'REVIEW', '--as', 'cursor', '--no-git']);
    expect(r.err).toMatch(/missing frontmatter/);
    write(dir, 'agents/reports/T-1-cursor.md', REPORT('T-1', 'cursor', ['server/a.ts']));
    r = lanes(dir, ['status', 'T-1', 'REVIEW', '--as', 'cursor', '--no-git']);
    expect(r.code, r.err).toBe(0);
    r = lanes(dir, ['status', 'T-1', 'DONE', '--as', 'cursor']);
    expect(r.err).toMatch(/nobody approves their own work/);
    r = lanes(dir, ['status', 'T-1', 'DONE', '--as', 'claude-code']);
    expect(r.code, r.err).toBe(0);
    expect(lastEvent(dir)).toMatchObject({ task: 'T-1', status: 'DONE', agent: 'claude-code' });
    expect(fs.existsSync(path.join(dir, 'agents/locks/T-1.lock'))).toBe(false);
    expect(read(dir, 'agents/BOARD.md')).not.toContain('| T-1 |');
  });

  it('REVIEW checks files_changed against the real diff', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    write(dir, 'server/a.ts', 'x');
    write(dir, 'agents/reports/T-1-cursor.md', REPORT('T-1', 'cursor', ['server/a.ts', 'server/ghost.ts']));
    const r = lanes(dir, ['status', 'T-1', 'REVIEW', '--as', 'cursor']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/did not change: server\/ghost\.ts/);
    write(dir, 'agents/reports/T-1-cursor.md', REPORT('T-1', 'cursor', ['server/a.ts']));
    expect(lanes(dir, ['status', 'T-1', 'REVIEW', '--as', 'cursor']).code).toBe(0);
  });

  it('DONE requires REVIEW first unless the owner sets it', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    expect(lanes(dir, ['status', 'T-1', 'DONE', '--as', 'claude-code']).err).toMatch(/must be in REVIEW/);
    expect(lanes(dir, ['status', 'T-1', 'DONE', '--as', 'mohamad']).code).toBe(0);
  });

  it('a reviewer can send work back with BLOCKED; the holder keeps the task', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    write(dir, 'agents/reports/T-1-cursor.md', REPORT('T-1', 'cursor', ['server/a.ts']));
    lanes(dir, ['status', 'T-1', 'REVIEW', '--as', 'cursor', '--no-git']);
    const r = lanes(dir, ['status', 'T-1', 'BLOCKED', '--as', 'claude-code']);
    expect(r.code, r.err).toBe(0);
    expect(lastEvent(dir).note).toMatch(/changes requested by claude-code/);
    // the holder can pick it up again
    expect(lanes(dir, ['claim', 'T-1', '--as', 'cursor']).code).toBe(0);
  });

  it('others cannot move a task they do not hold', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    expect(lanes(dir, ['status', 'T-1', 'PAUSED', '--as', 'codex-2']).err).toMatch(/belongs to cursor/);
    expect(lanes(dir, ['status', 'T-1', 'PAUSED', '--as', 'claude-code']).code).toBe(0); // boss
  });

  it('rejects unknown statuses', () => {
    const dir = fixtureRepo();
    expect(lanes(dir, ['status', 'T-1', 'MERGED', '--as', 'cursor']).err).toMatch(/bad status/);
  });
});

describe('release', () => {
  it('returns the task to TODO and drops the lock so others can claim', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    expect(lanes(dir, ['release', 'T-1', '--as', 'claude-code', '--note', 'x']).code).toBe(0); // boss may release
    expect(lastEvent(dir)).toMatchObject({ status: 'TODO' });
    expect(fs.existsSync(path.join(dir, 'agents/locks/T-1.lock'))).toBe(false);
    expect(lanes(dir, ['claim', 'T-1', '--as', 'claude-code']).code).toBe(0);
  });

  it('refuses a non-holder who is not boss or owner', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    write(dir, 'agents/roles.yml', read(dir, 'agents/roles.yml').replace('status: paused', 'status: active'));
    expect(lanes(dir, ['release', 'T-1', '--as', 'codex-2']).err).toMatch(/held by cursor/);
  });
});
