import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureRepo, lanes, read } from './helpers.js';
import { parseRoles } from '../src/lib/roles.js';

describe('handover', () => {
  it('moves all lanes and the boss role, logs HISTORY and regenerates', () => {
    const dir = fixtureRepo();
    const r = lanes(dir, ['handover', 'claude-code', 'cursor'], { now: '2026-11-08T15:00:00Z' });
    expect(r.code, r.err).toBe(0);
    const roles = parseRoles(read(dir, 'agents/roles.yml'));
    expect(roles.boss).toBe('cursor');
    expect(roles.agents['claude-code'].lane).toEqual([]);
    expect(roles.agents.cursor.lane).toEqual(['server/**', 'work/patched/**', 'supabase/**', 'deploy/**', 'tools/launcher/**']);
    // untouched fields survive the rewrite
    expect(roles.agents.cursor.extra.can_boot_client).toBe(true);
    expect(roles.resources).toEqual(['sandbox']);
    expect(roles.rules).toHaveLength(5);
    expect(read(dir, 'agents/HISTORY.md')).toContain('- 2026-11-08 15:00Z claude-code → cursor: lanes supabase/**, deploy/**, tools/launcher/**; boss (by mohamad)');
    expect(read(dir, '.cursor/rules/lanes.mdc')).toContain('You are the **boss**');
    expect(read(dir, '.cursor/rules/lanes.mdc')).toContain('`supabase/**`');
    expect(read(dir, 'CLAUDE.md')).not.toContain('You are the **boss**');
    // there is exactly one authority: roles.yml says cursor, every file agrees
    expect(read(dir, 'CLAUDE.md')).toContain('Boss: **cursor**');
  });

  it('moves selected lanes only, and --keep-boss', () => {
    const dir = fixtureRepo();
    expect(lanes(dir, ['handover', 'claude-code', 'cursor', '--lanes', 'deploy/**', '--keep-boss']).code).toBe(0);
    const roles = parseRoles(read(dir, 'agents/roles.yml'));
    expect(roles.boss).toBe('claude-code');
    expect(roles.agents['claude-code'].lane).toEqual(['supabase/**', 'tools/launcher/**']);
    expect(roles.agents.cursor.lane).toContain('deploy/**');
    expect(lanes(dir, ['handover', 'claude-code', 'cursor', '--lanes', 'nope/**']).err).toMatch(/does not own: nope/);
  });

  it('refuses when from holds a DOING task unless --force-release (which pauses it)', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-5', '--as', 'claude-code']);
    expect(lanes(dir, ['handover', 'claude-code', 'cursor']).err).toMatch(/claude-code is DOING T-5/);
    const r = lanes(dir, ['handover', 'claude-code', 'cursor', '--force-release']);
    expect(r.code, r.err).toBe(0);
    const evs = read(dir, 'agents/board.jsonl').trim().split('\n').map((l) => JSON.parse(l));
    expect(evs.find((e) => e.task === 'T-5' && e.status === 'PAUSED').note).toMatch(/handover to cursor/);
    expect(evs[evs.length - 1]).toMatchObject({ kind: 'handover', released: ['T-5'] });
    expect(fs.existsSync(path.join(dir, 'agents/locks/T-5.lock'))).toBe(false);
    expect(read(dir, 'agents/HISTORY.md')).toContain('paused T-5');
    // handover rows never show up as tasks
    expect(lanes(dir, ['board', '--all']).out.trim().split('\n')).toHaveLength(1);
  });

  it('refuses a paused target and agents acting for others', () => {
    const dir = fixtureRepo();
    expect(lanes(dir, ['handover', 'cursor', 'codex-2']).err).toMatch(/codex-2 is paused/);
    expect(lanes(dir, ['handover', 'claude-code', 'cursor', '--as', 'cursor']).err).toMatch(/cannot hand over/);
  });

  it("lanes can be handed between active agents", () => {
    const dir = fixtureRepo();
    lanes(dir, ['handover', 'cursor', 'claude-code', '--lanes', 'work/patched/**']);
    expect(parseRoles(read(dir, 'agents/roles.yml')).agents['claude-code'].lane).toContain('work/patched/**');
  });
});
