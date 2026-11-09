import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { gitInit, lanesBin, read, tmpDir, write } from './helpers.js';

/** git as a given agent; returns {ok, out} instead of throwing */
function commitAs(dir: string, who: string, msg: string) {
  try {
    const out = execFileSync('git', ['-c', `user.name=${who}`, 'commit', '-m', msg], { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, out };
  } catch (e: any) {
    return { ok: false, out: String(e.stdout) + String(e.stderr) };
  }
}
const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

describe('end to end: two agents on a web app', () => {
  it('init → gen → claims → cross-lane commit refused → bad report refused → fix → REVIEW → handover → small context', () => {
    const dir = tmpDir('lanes-e2e-');
    gitInit(dir, 'alex');
    const as = (agent: string) => ({ STAKED_AGENT: agent });

    // 1. init + gen + hook
    let r = lanesBin(dir, ['init', '--agents', 'claude-code,cursor', '--owner', 'alex']);
    expect(r.code, r.err).toBe(0);
    write(
      dir,
      'agents/roles.yml',
      read(dir, 'agents/roles.yml')
        .replace(/claude-code:\n    status: active\n    lane: \[\]/, 'claude-code:\n    status: active\n    lane: ["api/**", "db/**"]')
        .replace(/cursor:\n    status: active\n    lane: \[\]/, 'cursor:\n    status: active\n    lane: ["web/**"]'),
    );
    r = lanesBin(dir, ['gen']);
    expect(r.code, r.err).toBe(0);
    expect(read(dir, 'CLAUDE.md')).toContain('`api/**`, `db/**`');
    expect(read(dir, '.cursor/rules/staked.mdc')).toContain('`web/**`');
    expect(lanesBin(dir, ['hook', 'install']).code).toBe(0);
    git(dir, 'add', '-A');
    let c = commitAs(dir, 'alex', 'scaffold lanes'); // the owner
    expect(c.ok, c.out).toBe(true);

    // 2. two agents claim (each commits its own claim row)
    expect(lanesBin(dir, ['claim', 'T-1', '--note', 'orders api'], as('claude-code')).code).toBe(0);
    git(dir, 'add', '-A');
    c = commitAs(dir, 'claude-code', 'claim T-1');
    expect(c.ok, c.out).toBe(true);
    expect(lanesBin(dir, ['claim', 'T-2', '--note', 'orders page'], as('cursor')).code).toBe(0);
    expect(lanesBin(dir, ['claim', 'T-1'], as('cursor')).err).toMatch(/T-1 is DOING for claude-code/);

    // 3. cursor's commit reaches into the api lane: the hook refuses it
    write(dir, 'web/orders.tsx', 'export const Orders = () => null;\n');
    write(dir, 'api/orders.ts', 'export const handler = () => 1;\n');
    git(dir, 'add', '-A');
    c = commitAs(dir, 'cursor', 'orders page + api tweak');
    expect(c.ok).toBe(false);
    expect(c.out).toContain("api/orders.ts: outside cursor's lane (lane of claude-code)");
    // drop the out-of-lane file and commit again
    git(dir, 'rm', '-q', '--cached', 'api/orders.ts');
    fs.rmSync(path.join(dir, 'api/orders.ts'));
    c = commitAs(dir, 'cursor', 'orders page');
    expect(c.ok, c.out).toBe(true);

    // 4. a report without frontmatter is refused for REVIEW
    write(dir, 'agents/reports/T-2-cursor.md', '# T-2\nOrders page done, all tests pass.\n');
    r = lanesBin(dir, ['status', 'T-2', 'REVIEW'], as('cursor'));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/missing frontmatter/);

    // 5. fix the report: REVIEW is allowed and the commit passes the hook
    write(
      dir,
      'agents/reports/T-2-cursor.md',
      '---\ntask: T-2\nagent: cursor\nflags: []\ntests_run: ["npm test"]\nnative_boot: false\nfiles_changed: ["web/orders.tsx"]\n---\nFlags on: none.\n',
    );
    r = lanesBin(dir, ['status', 'T-2', 'REVIEW'], as('cursor'));
    expect(r.code, r.err).toBe(0);
    git(dir, 'add', '-A');
    c = commitAs(dir, 'cursor', 'T-2 to review');
    expect(c.ok, c.out).toBe(true);
    expect(lanesBin(dir, ['status', 'T-2', 'DONE'], as('cursor')).err).toMatch(/nobody approves their own work/);

    // 6. the owner hands claude-code's lanes and boss role to cursor
    expect(lanesBin(dir, ['handover', 'claude-code', 'cursor'], as('alex')).err).toMatch(/claude-code is DOING T-1/);
    r = lanesBin(dir, ['handover', 'claude-code', 'cursor', '--force-release'], as('alex'));
    expect(r.code, r.err).toBe(0);
    expect(read(dir, 'agents/HISTORY.md')).toMatch(/claude-code → cursor: lanes api\/\*\*, db\/\*\*; boss; paused T-1 \(by alex\)/);
    git(dir, 'add', '-A');
    c = commitAs(dir, 'alex', 'handover');
    expect(c.ok, c.out).toBe(true);

    // 7. gen output: every context file under 6 KB, and doctor is clean of errors
    r = lanesBin(dir, ['gen']);
    expect(r.code).toBe(0);
    for (const f of ['CLAUDE.md', 'AGENTS.md', '.cursor/rules/staked.mdc']) {
      const size = Buffer.byteLength(read(dir, f));
      expect(size, f).toBeLessThan(6000);
    }
    expect(read(dir, '.cursor/rules/staked.mdc')).toContain('You are the **boss**');
    const d = lanesBin(dir, ['doctor', '--json']);
    expect(JSON.parse(d.out).errors, d.out).toBe(0);
    // the board view is short and current
    expect(lanesBin(dir, ['board']).out).toMatch(/T-1\s+PAUSED\s+claude-code[\s\S]*T-2\s+REVIEW\s+cursor/);
  });
});
