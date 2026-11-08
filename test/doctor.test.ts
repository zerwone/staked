import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureRepo, lanes, read, sh, tmpDir, write } from './helpers.js';

const LEGACY = path.join(__dirname, 'fixtures', 'legacy-agents');

function json(dir: string, argv: string[] = [], now?: string) {
  const r = lanes(dir, ['doctor', ...argv, '--json'], { now });
  return { ...JSON.parse(r.out), code: r.code };
}
const checks = (j: any) => j.findings.map((f: any) => f.check);

describe('doctor on a legacy agents/ folder (no roles.yml)', () => {
  it('reports the stacked authority sections and duplicate task ids it actually has', () => {
    const copy = path.join(tmpDir(), 'agents');
    fs.cpSync(LEGACY, copy, { recursive: true });
    const j = json(path.dirname(copy), [copy]);
    expect(j.code).toBe(1);
    const stacked = j.findings.find((f: any) => f.check === 'stacked-authority');
    expect(stacked).toMatchObject({ file: 'agents/PROTOCOL.md', weakness: 1, severity: 'error' });
    expect(stacked.message).toMatch(/^3 authority sections stacked \(lines 3, 14, 22\)/);
    const dup = j.findings.find((f: any) => f.check === 'duplicate-task-ids');
    expect(dup.file).toBe('agents/BOARD.md');
    expect(dup.message).toMatch(/^2 duplicated id\(s\) across 6 headed entries: T-070 x3 \(lines 3,9,19\); T-072 x2/);
    expect(dup.message).not.toContain('T-999');
    expect(checks(j)).toContain('precedence-by-date');
    expect(j.findings.find((f: any) => f.check === 'decisions-scattered').file).toBe('agents/QUESTIONS.md');
    expect(j.notes[0]).toMatch(/legacy layout/);
  });

  it('prints a readable report', () => {
    const r = lanes(tmpDir(), ['doctor', LEGACY]);
    expect(r.out).toMatch(/ERROR \[W1 stacked-authority\] .*PROTOCOL.md: 3 authority sections/);
    expect(r.out).toMatch(/ERROR \[W3 duplicate-task-ids\]/);
    expect(r.out).toMatch(/\d+ error\(s\), \d+ warning\(s\)/);
  });
});

describe('doctor on a lanes repo', () => {
  it('a fresh, consistent repo has only the missing-hook warning', () => {
    const dir = fixtureRepo();
    const j = json(dir);
    expect(checks(j)).toEqual(['hook-missing']);
    expect(j.code).toBe(0);
    lanes(dir, ['hook', 'install']);
  });

  it('finds hand edits, staleness, overlaps, >1 DOING, expired locks and questions, reports without flags, idle holders', () => {
    const dir = fixtureRepo();
    write(dir, 'CLAUDE.md', read(dir, 'CLAUDE.md') + '\n## Latest owner instruction\ncursor is boss now\n');
    write(dir, 'agents/roles.yml', read(dir, 'agents/roles.yml').replace('lane: []', 'lane: ["server/api/**"]'));
    const ev = (task: string, agent: string, status: string) => JSON.stringify({ ts: '2026-11-08T10:00:00Z', task, agent, status, note: '', flags: [] });
    // two DOING rows for cursor: what a union merge of two branches produces
    fs.appendFileSync(path.join(dir, 'agents/board.jsonl'), [ev('T-1', 'cursor', 'DOING'), ev('T-2', 'cursor', 'DOING'), ev('T-3', 'codex-2', 'DOING')].join('\n') + '\n');
    write(dir, 'agents/locks/sandbox.lock', JSON.stringify({ name: 'sandbox', kind: 'resource', agent: 'cursor', acquired: '2026-11-01T00:00:00Z', expires: '2026-11-01T02:00:00Z' }));
    fs.appendFileSync(path.join(dir, 'agents/questions.jsonl'), JSON.stringify({ ts: '2026-11-01T00:00:00Z', id: 'Q-001', agent: 'cursor', text: 'x', blocking: [], default: 'keep', expires: '2026-11-03', status: 'open', answer: null }) + '\n');
    write(dir, 'agents/reports/T-0-cursor.md', 'prose only\n');
    write(dir, 'agents/inbox/cursor/T-9.md', 'no frontmatter\n');
    const j = json(dir, [], '2026-11-08T12:00:00Z');
    expect(j.code).toBe(1);
    const c = checks(j);
    for (const want of ['generated-hand-edited', 'generated-stale', 'lane-overlap', 'multiple-doing', 'holder-idle', 'expired-lock', 'question-expired', 'report-without-flags', 'spec-without-status', 'hook-missing']) {
      expect(c, want).toContain(want);
    }
    expect(j.findings.find((f: any) => f.check === 'lane-overlap').message).toBe('cursor "server/**" overlaps codex-2 "server/api/**"');
    expect(j.findings.find((f: any) => f.check === 'multiple-doing').message).toMatch(/cursor is DOING 2 tasks: T-1, T-2/);
    expect(j.findings.find((f: any) => f.check === 'question-expired').message).toMatch(/default applies: keep/);
  });

  it('finds duplicate question ids from parallel branches', () => {
    const dir = fixtureRepo();
    const q = (agent: string, text: string) => JSON.stringify({ ts: '2026-11-01T00:00:00Z', id: 'Q-001', agent, text, blocking: [], default: null, expires: null, status: 'open', answer: null });
    fs.appendFileSync(path.join(dir, 'agents/questions.jsonl'), q('cursor', 'a') + '\n' + q('claude-code', 'b') + '\n');
    expect(checks(json(dir))).toContain('duplicate-question-ids');
  });

  it('warns on a hand-written CLAUDE.md that competes with lanes', () => {
    const dir = fixtureRepo();
    write(dir, 'CLAUDE.md', '# notes\n## Current authority\nx\n## Current authority (new)\ny\n');
    const c = checks(json(dir));
    expect(c).toContain('generated-hand-written');
    expect(c).toContain('stacked-authority');
  });

  it('flags many uncommitted changes', () => {
    const dir = fixtureRepo();
    for (let i = 0; i < 105; i++) write(dir, `src/f${i}.txt`, 'x');
    expect(checks(json(dir))).toContain('uncommitted-changes');
    sh(dir, ['add', '-A']);
  });
});
