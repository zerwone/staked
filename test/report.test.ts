import { describe, expect, it } from 'vitest';
import { fixtureRepo, lanes, write } from './helpers.js';
import { validateReport } from '../src/lib/report.js';
import { parseRoles } from '../src/lib/roles.js';
import { ROLES } from './helpers.js';

const GOOD = `---
task: T-1
agent: cursor
flags: []
tests_run:
  - npm test
native_boot: false
files_changed: ["server/api.ts"]
---
Flags on: none.
`;

describe('report frontmatter validation', () => {
  const roles = parseRoles(ROLES);

  it('accepts a complete report', () => {
    const r = validateReport(GOOD, { file: 'agents/reports/T-1-cursor.md', roles, actual: ['server/api.ts'] });
    expect(r.errors).toEqual([]);
    expect(r.data).toMatchObject({ task: 'T-1', agent: 'cursor', flags: [], tests_run: ['npm test'], native_boot: false, files_changed: ['server/api.ts'] });
  });

  it('lists every missing or mistyped field', () => {
    const r = validateReport('---\ntask: T-1\nagent: cursor\nflags: none\nnative_boot: maybe\ntests_run: []\n---\n', { roles });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(expect.arrayContaining(['missing field: files_changed', 'flags must be a list (use [] for none)', 'native_boot must be true or false', expect.stringMatching(/tests_run is empty/)]));
  });

  it('refuses no frontmatter and broken yaml', () => {
    expect(validateReport('# hi\n').errors[0]).toMatch(/missing frontmatter/);
    expect(validateReport('---\na: [x\n---\n').errors[0]).toMatch(/does not parse/);
  });

  it('checks file name, agent in roles, can_boot_client and diff', () => {
    const r = validateReport(GOOD.replace('native_boot: false', 'native_boot: true').replace('agent: cursor', 'agent: claude-code'), {
      file: 'agents/reports/T-1-cursor.md',
      roles,
      actual: ['server/other.ts'],
    });
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'file name should be T-1-claude-code.md (got T-1-cursor.md)',
        'native_boot: true but claude-code has can_boot_client: false in roles.yml',
        'files_changed lists paths that did not change: server/api.ts',
      ]),
    );
  });

  it('normalises Windows paths in files_changed', () => {
    const r = validateReport(GOOD.replace('"server/api.ts"', '"server\\\\api.ts"'), { actual: ['server/api.ts'] });
    expect(r.ok, r.errors.join()).toBe(true);
  });
});

describe('lanes report check', () => {
  it('validates a file standalone against git', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    write(dir, 'agents/reports/T-1-cursor.md', GOOD);
    let r = lanes(dir, ['report', 'check', 'agents/reports/T-1-cursor.md']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/did not change: server\/api.ts/);
    write(dir, 'server/api.ts', 'x');
    r = lanes(dir, ['report', 'check', 'agents/reports/T-1-cursor.md']);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/ok \(T-1, cursor, 1 file\(s\), flags: none\)/);
    expect(lanes(dir, ['report', 'check', 'agents/reports/T-1-cursor.md', '--json']).out).toContain('"ok": true');
  });

  it('--no-git skips the diff comparison; missing file is an error', () => {
    const dir = fixtureRepo();
    write(dir, 'agents/reports/T-1-cursor.md', GOOD);
    expect(lanes(dir, ['report', 'check', 'agents/reports/T-1-cursor.md', '--no-git']).code).toBe(0);
    expect(lanes(dir, ['report', 'check', 'nope.md']).err).toMatch(/cannot read/);
  });
});
