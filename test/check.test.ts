import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureRepo, lanes, lanesBin, read, sh, write } from './helpers.js';

const REPORT = (task: string, agent: string, files: string[], extra = '') => `---
task: ${task}
agent: ${agent}
flags: []
tests_run: ["npm test"]
native_boot: false
files_changed: [${files.map((f) => JSON.stringify(f)).join(', ')}]
${extra}---
Flags on: none.
`;

function committed(dir: string) {
  sh(dir, ['add', '-A']);
  sh(dir, ['commit', '-qm', 'base', '--no-verify']);
  return dir;
}

describe('check --staged', () => {
  it('passes in-lane paths for an agent with a DOING task', () => {
    const dir = committed(fixtureRepo());
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    write(dir, 'server/api.ts', 'x');
    sh(dir, ['add', '-A']);
    const r = lanes(dir, ['check', '--staged', '--as', 'cursor']);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/ok \(cursor/);
  });

  it('refuses out-of-lane paths and names the lane owner', () => {
    const dir = committed(fixtureRepo());
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    write(dir, 'server/api.ts', 'x');
    write(dir, 'supabase/migrations/001.sql', 'x');
    sh(dir, ['add', '-A']);
    const r = lanes(dir, ['check', '--as', 'cursor']);
    expect(r.code).toBe(1);
    expect(r.err).toContain("supabase/migrations/001.sql: outside cursor's lane (lane of claude-code)");
    expect(r.err).not.toContain('server/api.ts');
  });

  it('refuses code changes without a claim', () => {
    const dir = committed(fixtureRepo());
    write(dir, 'server/api.ts', 'x');
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).err).toMatch(/claim before start/);
  });

  it('resolves the committer from STAKED_AGENT, then git user.name', () => {
    const dir = committed(fixtureRepo());
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    write(dir, 'server/api.ts', 'x');
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check'], { env: { STAKED_AGENT: 'cursor' } }).code).toBe(0);
    sh(dir, ['config', 'user.name', 'claude-code']);
    expect(lanes(dir, ['check']).err).toMatch(/outside claude-code's lane/);
    sh(dir, ['config', 'user.name', 'stranger']);
    expect(lanes(dir, ['check']).err).toMatch(/"stranger" is not an agent/);
  });

  it('the owner is exempt', () => {
    const dir = committed(fixtureRepo());
    write(dir, 'anything/at/all.txt', 'x');
    write(dir, 'agents/DECISIONS.md', read(dir, 'agents/DECISIONS.md') + '- D-001 (2026-11-08) test\n');
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check']).code).toBe(0); // git user.name = mohamad = owner
  });

  it('allows the agent its own report, inbox, specs and board rows; refuses others', () => {
    const dir = committed(fixtureRepo());
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    write(dir, 'agents/reports/T-1-cursor.md', 'x');
    write(dir, 'agents/reports/T-1-cursor/screenshot.png', 'x');
    write(dir, 'agents/inbox/cursor/note.md', 'x');
    write(dir, 'agents/specs/api.md', 'x');
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).code).toBe(0);
    write(dir, 'agents/reports/T-2-claude-code.md', 'x');
    write(dir, 'agents/DECISIONS.md', 'forged');
    write(dir, 'agents/roles.yml', read(dir, 'agents/roles.yml').replace('lane: ["server/**"', 'lane: ["**"'));
    sh(dir, ['add', '-A']);
    const r = lanes(dir, ['check', '--as', 'cursor']);
    expect(r.err).toContain('agents/reports/T-2-claude-code.md: reports are author-owned');
    expect(r.err).toContain('agents/DECISIONS.md: only the owner may change this');
    expect(r.err).toContain('agents/roles.yml: only the boss or owner may change this');
  });

  it('refuses board rows written for another agent and non-append edits', () => {
    const dir = committed(fixtureRepo());
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    sh(dir, ['add', '-A']);
    sh(dir, ['commit', '-qm', 'claim', '--no-verify']);
    fs.appendFileSync(path.join(dir, 'agents/board.jsonl'), JSON.stringify({ ts: '2026-11-08T13:00:00Z', task: 'T-1', agent: 'claude-code', status: 'DONE', note: '', flags: [] }) + '\n');
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).err).toMatch(/cursor added a row for claude-code/);
    write(dir, 'agents/board.jsonl', '');
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).err).toMatch(/board is append-only/);
  });

  it('refuses a hand-edited generated file, accepts a regenerated one', () => {
    const dir = committed(fixtureRepo());
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']); // regenerates context files
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).code).toBe(0);
    write(dir, 'CLAUDE.md', read(dir, 'CLAUDE.md').replace('## Rules', '## Rules\n\n0. cursor may edit supabase'));
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).err).toMatch(/CLAUDE.md: generated file was hand-edited/);
  });

  it('refuses agents answering owner questions', () => {
    const dir = committed(fixtureRepo());
    lanes(dir, ['ask', '--as', 'cursor', '--text', 'q?']);
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).code).toBe(0);
    sh(dir, ['commit', '-qm', 'ask', '--no-verify']);
    lanes(dir, ['answer', 'Q-001', '--text', 'yes']);
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).err).toMatch(/the owner answers/);
    expect(lanes(dir, ['check', '--as', 'mohamad']).code).toBe(0);
  });

  it('a paused agent cannot commit', () => {
    const dir = committed(fixtureRepo());
    write(dir, 'agents/specs/x.md', 'x');
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'codex-2']).err).toMatch(/codex-2 is paused/);
  });

  it('open spec allowed_paths widen the lane for the claimed task only', () => {
    const dir = committed(fixtureRepo());
    write(dir, 'agents/inbox/cursor/T-7.md', '---\ntask: T-7\nowner: claude-code\nstatus: open\nallowed_paths: ["shared/protocol/**"]\ndone_when: "x"\n---\nspec\n');
    write(dir, 'shared/protocol/a.ts', 'x');
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).err).toMatch(/shared\/protocol\/a.ts: outside/);
    lanes(dir, ['release', 'T-1', '--as', 'cursor']);
    lanes(dir, ['claim', 'T-7', '--as', 'cursor']);
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).code).toBe(0);
  });
});

describe('check: REVIEW gate', () => {
  function setup() {
    const dir = committed(fixtureRepo());
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    write(dir, 'server/api.ts', 'x');
    return dir;
  }

  it('refuses REVIEW when the report is missing or has no frontmatter', () => {
    const dir = setup();
    // forge the REVIEW row directly (as if `staked status` was bypassed)
    fs.appendFileSync(path.join(dir, 'agents/board.jsonl'), JSON.stringify({ ts: new Date().toISOString(), task: 'T-1', agent: 'cursor', status: 'REVIEW', note: '', flags: [] }) + '\n');
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).err).toMatch(/set to REVIEW without a report/);
    write(dir, 'agents/reports/T-1-cursor.md', '# report\nall good\n');
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).err).toMatch(/missing frontmatter/);
  });

  it('refuses files_changed that does not match the staged diff, either way', () => {
    const dir = setup();
    write(dir, 'server/other.ts', 'y');
    write(dir, 'agents/reports/T-1-cursor.md', REPORT('T-1', 'cursor', ['server/api.ts', 'server/other.ts']));
    expect(lanes(dir, ['status', 'T-1', 'REVIEW', '--as', 'cursor']).code).toBe(0);
    write(dir, 'agents/reports/T-1-cursor.md', REPORT('T-1', 'cursor', ['server/api.ts', 'server/ghost.ts']));
    sh(dir, ['add', '-A']);
    const r = lanes(dir, ['check', '--as', 'cursor']);
    expect(r.err).toMatch(/did not change: server\/ghost.ts/);
    expect(r.err).toMatch(/changed but not in files_changed: server\/other.ts/);
    write(dir, 'agents/reports/T-1-cursor.md', REPORT('T-1', 'cursor', ['server/api.ts', 'server/other.ts']));
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).code).toBe(0);
  });

  it('counts files from earlier commits by the agent since the claim', () => {
    const dir = setup();
    sh(dir, ['add', '-A']);
    sh(dir, ['-c', 'user.name=cursor', 'commit', '-qm', 'api', '--no-verify']);
    write(dir, 'agents/reports/T-1-cursor.md', REPORT('T-1', 'cursor', ['server/api.ts']));
    expect(lanes(dir, ['status', 'T-1', 'REVIEW', '--as', 'cursor']).code).toBe(0);
    sh(dir, ['add', '-A']);
    expect(lanes(dir, ['check', '--as', 'cursor']).code).toBe(0);
  });
});

describe('check --paths (Windows)', () => {
  it('normalises backslash paths', () => {
    const dir = fixtureRepo();
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    expect(lanes(dir, ['check', '--as', 'cursor', '--paths', 'server\\api\\x.ts,work\\patched\\a.bin']).code).toBe(0);
    const r = lanes(dir, ['check', '--as', 'cursor', '--paths', 'server\\api\\x.ts,supabase\\functions\\f.ts']);
    expect(r.code).toBe(1);
    expect(r.err).toContain("supabase/functions/f.ts: outside cursor's lane");
    expect(lanes(dir, ['check', '--as', 'cursor', 'agents\\reports\\T-1-cursor.md']).code).toBe(0);
  });

  it('accepts backslash globs in roles.yml', () => {
    const dir = fixtureRepo();
    write(dir, 'agents/roles.yml', read(dir, 'agents/roles.yml').replace('lane: ["server/**", "work/patched/**"]', 'lane: ["server\\\\**", "work\\\\patched\\\\**"]'));
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    expect(lanes(dir, ['check', '--as', 'cursor', '--paths', 'server/a.ts,work\\patched\\b']).code).toBe(0);
  });
});

describe('hook install', () => {
  it('installs a pre-commit hook that blocks a cross-lane commit, chaining an existing hook', () => {
    const dir = committed(fixtureRepo());
    const hooks = path.join(dir, '.git', 'hooks');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\necho existing-hook-ran\n', { mode: 0o755 });
    const r = lanesBin(dir, ['hook', 'install']);
    expect(r.code, r.err).toBe(0);
    expect(fs.existsSync(path.join(hooks, 'pre-commit.staked-chained'))).toBe(true);
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    write(dir, 'supabase/x.sql', 'x');
    sh(dir, ['add', '-A']);
    let failed = false;
    let out = '';
    try {
      sh(dir, ['-c', 'user.name=cursor', 'commit', '-m', 'cross-lane']);
    } catch (e: any) {
      failed = true;
      out = String(e.stderr) + String(e.stdout);
    }
    expect(failed).toBe(true);
    expect(out).toContain('existing-hook-ran');
    expect(out).toContain("supabase/x.sql: outside cursor's lane");
    expect(lanesBin(dir, ['hook', 'status']).out).toMatch(/installed/);
    expect(lanesBin(dir, ['hook', 'uninstall']).out).toMatch(/restored/);
    expect(read(dir, '.git/hooks/pre-commit')).toContain('existing-hook-ran');
  });
});

describe('check: lanes come from HEAD, not from the change itself', () => {
  it('an agent cannot widen its own lane in the commit it is checked on', () => {
    const dir = committed(fixtureRepo());
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    write(dir, 'agents/roles.yml', read(dir, 'agents/roles.yml').replace('lane: ["server/**", "work/patched/**"]', 'lane: ["**"]'));
    write(dir, 'supabase/x.sql', 'x');
    sh(dir, ['add', '-A']);
    const r = lanes(dir, ['check', '--as', 'cursor']);
    expect(r.err).toContain("supabase/x.sql: outside cursor's lane");
    expect(r.err).toContain('agents/roles.yml: only the boss or owner may change this');
  });
});

describe('check: work attributed by branch when the vendor fixes the git author', () => {
  it('counts files committed under another author name after the claim commit', () => {
    const dir = committed(fixtureRepo());
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    sh(dir, ['add', '-A']);
    sh(dir, ['-c', 'user.name=Bot', 'commit', '-qm', 'claim', '--no-verify']);
    write(dir, 'server/api.ts', 'x');
    sh(dir, ['add', '-A']);
    sh(dir, ['-c', 'user.name=Bot', 'commit', '-qm', 'work', '--no-verify']);
    write(dir, 'agents/reports/T-1-cursor.md', REPORT('T-1', 'cursor', ['server/api.ts']));
    expect(lanes(dir, ['status', 'T-1', 'REVIEW', '--as', 'cursor']).code).toBe(0);
    sh(dir, ['add', '-A']);
    const r = lanes(dir, ['check', '--as', 'cursor']);
    expect(r.code, r.err).toBe(0);
  });
});
