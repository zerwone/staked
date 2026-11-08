import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lanes, tmpDir } from './helpers.js';

const EXAMPLE = path.join(__dirname, '..', 'examples', 'two-agents');

describe('examples/two-agents', () => {
  function copy() {
    const dir = path.join(tmpDir(), 'two-agents');
    fs.cpSync(EXAMPLE, dir, { recursive: true });
    return dir;
  }

  it('generated files are current (gen writes nothing) and under 6 KB', () => {
    const dir = copy();
    const r = lanes(dir, ['gen']);
    expect(r.code, r.err).toBe(0);
    expect(r.out).not.toMatch(/^wrote/m);
    for (const f of ['CLAUDE.md', 'AGENTS.md', '.cursor/rules/lanes.mdc']) {
      expect(fs.statSync(path.join(dir, f)).size).toBeLessThan(6000);
    }
  });

  it('behaves as its README says', () => {
    const dir = copy();
    expect(lanes(dir, ['board']).out).toMatch(/T-002\s+REVIEW\s+cursor[\s\S]*T-001\s+DOING\s+claude-code/);
    expect(lanes(dir, ['questions', 'open']).out).toMatch(/Q-001 · blocks 1: T-002/);
    expect(lanes(dir, ['check', '--as', 'cursor', '--paths', 'web/orders.tsx,api/orders.ts']).err).toContain("api/orders.ts: outside cursor's lane (lane of claude-code)");
    expect(lanes(dir, ['status', 'T-002', 'DONE', '--as', 'cursor']).err).toMatch(/nobody approves their own work/);
    expect(lanes(dir, ['status', 'T-002', 'DONE', '--as', 'claude-code']).code).toBe(0);
    const d = JSON.parse(lanes(dir, ['doctor', '--json'], { now: '2026-11-08T12:00:00Z' }).out);
    expect(d.errors).toBe(0);
  });
});
