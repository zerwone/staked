import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureRepo, gitInit, lanes, read, tmpDir, write } from './helpers.js';
import { parseRoles } from '../src/lib/roles.js';
import { verifyGenerated } from '../src/lib/render.js';

describe('staked init', () => {
  it('scaffolds agents/, roles.yml, gitattributes and generated files', () => {
    const dir = tmpDir();
    gitInit(dir, 'mohamad');
    const r = lanes(dir, ['init', '--agents', 'claude-code,cursor']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/installed .*pre-commit/);
    expect(r.out).toMatch(/give claude-code, cursor a lane/i);
    expect(r.out).toContain('npx @zerwone/staked claim T-001 --as claude-code');
    expect(r.out).not.toMatch(/npx lanes /);
    for (const f of ['agents/roles.yml', 'agents/board.jsonl', 'agents/questions.jsonl', 'agents/DECISIONS.md', 'agents/inbox/cursor/.gitkeep', 'agents/reports/.gitkeep', 'agents/specs/.gitkeep', 'agents/archive/.gitkeep']) {
      expect(fs.existsSync(path.join(dir, f)), f).toBe(true);
    }
    const roles = parseRoles(read(dir, 'agents/roles.yml'));
    expect(roles.owner).toBe('mohamad');
    expect(roles.boss).toBe('claude-code');
    expect(Object.keys(roles.agents)).toEqual(['claude-code', 'cursor']);
    expect(roles.agents.cursor.reviews).toEqual(['claude-code']);
    expect(roles.rules).toHaveLength(5);
    const ga = read(dir, '.gitattributes');
    expect(ga).toContain('agents/board.jsonl merge=union');
    expect(ga).toContain('agents/questions.jsonl merge=union');
    expect(read(dir, '.gitignore')).toContain('agents/locks/');
    expect(fs.existsSync(path.join(dir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.cursor/rules/staked.mdc'))).toBe(true);
  });

  it('is idempotent and keeps an existing roles.yml', () => {
    const dir = fixtureRepo();
    const before = read(dir, 'agents/roles.yml');
    const r = lanes(dir, ['init']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('agents/roles.yml (kept)');
    expect(read(dir, 'agents/roles.yml')).toBe(before);
    expect(read(dir, '.gitattributes').match(/board\.jsonl merge=union/g)).toHaveLength(1);
  });

  it('works outside git', () => {
    const dir = tmpDir();
    expect(lanes(dir, ['init']).code).toBe(0);
    expect(parseRoles(read(dir, 'agents/roles.yml')).owner).toBe('owner');
  });

  it('takes lanes inline and skips the hook with --no-hook', () => {
    const dir = tmpDir();
    gitInit(dir, 'mohamad');
    const r = lanes(dir, ['init', '--agents', 'claude-code=src/**+test/**,codex=web/**', '--no-hook']);
    expect(r.code).toBe(0);
    const roles = fs.readFileSync(path.join(dir, 'agents', 'roles.yml'), 'utf8');
    expect(roles).toContain('lane: ["src/**", "test/**"]');
    expect(roles).toContain('lane: ["web/**"]');
    expect(r.out).not.toMatch(/installed .*pre-commit/);
    expect(r.out).not.toMatch(/a lane in agents\/roles.yml/);
  });
});
