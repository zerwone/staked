import { describe, expect, it } from 'vitest';
import { fixtureRepo, lanes, sh, write } from './helpers.js';

/**
 * Replay: history from the origin repo had commits touching server/** and
 * supabase/** together, which the lane table forbids. Rebuild three such
 * commits and prove `lanes check --commit` refuses every one of them, for
 * either lane owner.
 */
describe('replay of historical cross-lane commits', () => {
  it('fails all three', () => {
    const dir = fixtureRepo();
    sh(dir, ['add', '-A']);
    sh(dir, ['commit', '-qm', 'lanes scaffold', '--no-verify']);
    const revs: string[] = [];
    const changes = [
      ['server/login.ts', 'supabase/migrations/001_users.sql'],
      ['server/world/zone.ts', 'supabase/functions/auth/index.ts'],
      ['server/net/packet.ts', 'supabase/seed.sql', 'deploy/compose.yml'],
    ];
    changes.forEach((files, i) => {
      for (const f of files) write(dir, f, `change ${i}\n`);
      sh(dir, ['add', '-A']);
      // one shared author, as in the origin repo: git alone cannot tell agents apart
      sh(dir, ['-c', 'user.name=dev', 'commit', '-qm', `historical change ${i + 1}`, '--no-verify']);
      revs.push(sh(dir, ['rev-parse', 'HEAD']).trim());
    });
    // give both agents a claimed task so only the lane rule is under test
    lanes(dir, ['claim', 'T-1', '--as', 'cursor']);
    lanes(dir, ['claim', 'T-2', '--as', 'claude-code']);
    for (const rev of revs) {
      for (const agent of ['cursor', 'claude-code']) {
        const r = lanes(dir, ['check', '--commit', rev, '--as', agent]);
        expect(r.code, `${rev} as ${agent}`).toBe(1);
        expect(r.err).toMatch(/outside .*'s lane/);
      }
      // with the shared author name and no --as, the committer is not an agent: refused too
      expect(lanes(dir, ['check', '--commit', rev]).err).toMatch(/"dev" is not an agent/);
    }
  });
});
