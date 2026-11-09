import { describe, expect, it } from 'vitest';
import { fixtureRepo, lanes, read, write } from './helpers.js';

function events(dir: string) {
  return read(dir, 'agents/questions.jsonl').trim().split('\n').map((l) => JSON.parse(l));
}

describe('ask / answer / questions', () => {
  it('ask appends a structured entry with the next id', () => {
    const dir = fixtureRepo();
    const r = lanes(dir, ['ask', '--as', 'codex-2', '--text', 'Keep flags off for the beta?', '--blocking', 'T-101', '--default', 'keep flags off', '--expires', '2d'], { now: '2026-11-08T12:00:00Z' });
    expect(r.code, r.err).toBe(0);
    expect(r.out.trim()).toBe('Q-001');
    expect(events(dir)[0]).toEqual({ ts: '2026-11-08T12:00:00Z', id: 'Q-001', agent: 'codex-2', text: 'Keep flags off for the beta?', blocking: ['T-101'], default: 'keep flags off', expires: '2026-11-10', status: 'open', answer: null });
    expect(lanes(dir, ['ask', '--as', 'cursor', '--text', 'second']).out.trim()).toBe('Q-002');
  });

  it('continues numbering from an existing ledger (Q-031 → Q-032)', () => {
    const dir = fixtureRepo();
    write(dir, 'agents/questions.jsonl', JSON.stringify({ ts: '2026-11-01T00:00:00Z', id: 'Q-031', agent: 'cursor', text: 'x', blocking: [], default: null, expires: null, status: 'open', answer: null }) + '\n');
    expect(lanes(dir, ['ask', '--as', 'cursor', '--text', 'y']).out.trim()).toBe('Q-032');
  });

  it('answer appends an answered event; only the owner may answer', () => {
    const dir = fixtureRepo();
    lanes(dir, ['ask', '--as', 'cursor', '--text', 'ship it?', '--default', 'no']);
    expect(lanes(dir, ['answer', 'Q-001', '--text', 'yes', '--as', 'claude-code']).err).toMatch(/only the owner/);
    const r = lanes(dir, ['answer', 'Q-001', '--text', 'yes, after review']);
    expect(r.code, r.err).toBe(0);
    const evs = events(dir);
    expect(evs).toHaveLength(2);
    expect(evs[1]).toMatchObject({ id: 'Q-001', status: 'answered', answer: 'yes, after review', by: 'mohamad', agent: 'cursor', text: 'ship it?' });
    expect(evs[1].asked).toBeUndefined();
    expect(lanes(dir, ['answer', 'Q-001', '--text', 'again']).err).toMatch(/already answered/);
    expect(lanes(dir, ['questions', 'open']).out.trim()).toBe('no open questions');
  });

  it('--use-default and --withdraw', () => {
    const dir = fixtureRepo();
    lanes(dir, ['ask', '--as', 'cursor', '--text', 'a', '--default', 'keep']);
    lanes(dir, ['ask', '--as', 'cursor', '--text', 'b']);
    lanes(dir, ['answer', 'Q-001', '--use-default']);
    expect(events(dir)[2]).toMatchObject({ id: 'Q-001', answer: 'keep' });
    expect(lanes(dir, ['answer', 'Q-002', '--withdraw', '--as', 'cursor']).code).toBe(0);
    expect(lanes(dir, ['questions', 'Q-002']).out).toContain('"status": "withdrawn"');
  });

  it('questions open ranks by live blocking count, then oldest, 2 lines each', () => {
    const dir = fixtureRepo();
    const q = (id: string, ts: string, blocking: string[], extra: object = {}) => JSON.stringify({ ts, id, agent: 'cursor', text: `question ${id} ` + 'long text '.repeat(30), blocking, default: 'do nothing', expires: null, status: 'open', answer: null, ...extra });
    write(dir, 'agents/questions.jsonl', [
      q('Q-001', '2026-11-01T00:00:00Z', ['T-1']),
      q('Q-002', '2026-11-02T00:00:00Z', ['T-1', 'T-2', 'T-3']),
      q('Q-003', '2026-11-03T00:00:00Z', []),
      q('Q-004', '2026-10-30T00:00:00Z', ['T-1']),
      q('Q-005', '2026-11-04T00:00:00Z', ['T-9', 'T-8'], { expires: '2026-11-05' }),
      q('Q-006', '2026-11-04T00:00:00Z', ['T-1'], { status: 'answered', answer: 'ok' }),
    ].join('\n') + '\n');
    // T-9 and T-8 are DONE, so Q-005 blocks nothing live
    write(dir, 'agents/board.jsonl', ['T-9', 'T-8'].map((t) => JSON.stringify({ ts: '2026-11-04T00:00:00Z', task: t, agent: 'cursor', status: 'DONE', note: '', flags: [] })).join('\n') + '\n');
    const r = lanes(dir, ['questions', 'open'], { now: '2026-11-08T12:00:00Z' });
    const lines = r.out.trimEnd().split('\n');
    expect(lines).toHaveLength(10); // 5 open questions x 2 lines
    const order = lines.filter((_, i) => i % 2 === 0).map((l) => l.split(' · ')[0]);
    expect(order).toEqual(['Q-002', 'Q-004', 'Q-001', 'Q-003', 'Q-005']);
    expect(lines[0]).toBe('Q-002 · blocks 3: T-1,T-2,T-3 · cursor · 6d');
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(112);
    expect(lines[9]).toContain('[default applies]');
    expect(lines[8]).toContain('EXPIRED');
  });

  it('flags duplicate ids from parallel branches but keeps the first', () => {
    const dir = fixtureRepo();
    const q = (agent: string, text: string) => JSON.stringify({ ts: '2026-11-01T00:00:00Z', id: 'Q-001', agent, text, blocking: [], default: null, expires: null, status: 'open', answer: null });
    write(dir, 'agents/questions.jsonl', q('cursor', 'a') + '\n' + q('claude-code', 'b') + '\n');
    const j = JSON.parse(lanes(dir, ['questions', 'open', '--json']).out);
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({ text: 'a', duplicates: 1 });
  });

  it('open questions appear in the asking agent context file', () => {
    const dir = fixtureRepo();
    lanes(dir, ['ask', '--as', 'cursor', '--text', 'which port for the api?', '--blocking', 'T-5']);
    expect(read(dir, '.cursor/rules/staked.mdc')).toContain('Q-001 (cursor; blocks T-5) which port for the api?');
    expect(read(dir, 'CLAUDE.md')).not.toContain('which port');
  });
});
