import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureRepo, lanes, read, write } from './helpers.js';

const ev = (ts: string, task: string, status: string) => JSON.stringify({ ts, task, agent: 'cursor', status, note: '', flags: [] });
const exists = (dir: string, rel: string) => fs.existsSync(path.join(dir, rel));

describe('prune', () => {
  it('archives closed specs and reports of tasks DONE more than 14 days ago', () => {
    const dir = fixtureRepo();
    write(dir, 'agents/board.jsonl', [ev('2026-10-01T00:00:00Z', 'T-1', 'DONE'), ev('2026-11-05T00:00:00Z', 'T-2', 'DONE'), ev('2026-10-01T00:00:00Z', 'T-3', 'REVIEW'), ev('2026-10-01T00:00:00Z', 'T-1-2', 'DOING')].join('\n') + '\n');
    write(dir, 'agents/inbox/cursor/T-1.md', '---\ntask: T-1\nstatus: closed\n---\n');
    write(dir, 'agents/inbox/cursor/T-3.md', '---\ntask: T-3\nstatus: open\n---\n');
    write(dir, 'agents/reports/T-1-cursor.md', 'r');
    write(dir, 'agents/reports/T-1-cursor/log.txt', 'evidence');
    write(dir, 'agents/reports/T-1-2-cursor.md', 'r');
    write(dir, 'agents/reports/T-2-cursor.md', 'r');
    write(dir, 'agents/reports/T-3-cursor.md', 'r');

    const dry = lanes(dir, ['prune', '--dry-run'], { now: '2026-11-08T00:00:00Z' });
    expect(dry.out).toContain('would move agents/inbox/cursor/T-1.md -> agents/archive/inbox/cursor/T-1.md');
    expect(exists(dir, 'agents/inbox/cursor/T-1.md')).toBe(true);

    const r = lanes(dir, ['prune'], { now: '2026-11-08T00:00:00Z' });
    expect(r.code, r.err).toBe(0);
    expect(exists(dir, 'agents/archive/inbox/cursor/T-1.md')).toBe(true);
    expect(exists(dir, 'agents/archive/reports/T-1-cursor.md')).toBe(true);
    expect(read(dir, 'agents/archive/reports/T-1-cursor/log.txt')).toBe('evidence');
    for (const keep of ['agents/inbox/cursor/T-3.md', 'agents/reports/T-1-2-cursor.md', 'agents/reports/T-2-cursor.md', 'agents/reports/T-3-cursor.md']) {
      expect(exists(dir, keep), keep).toBe(true);
    }
    expect(lanes(dir, ['prune'], { now: '2026-11-08T00:00:00Z' }).out).toContain('nothing to prune');
  });

  it('--days changes the window', () => {
    const dir = fixtureRepo();
    write(dir, 'agents/board.jsonl', ev('2026-11-05T00:00:00Z', 'T-2', 'DONE') + '\n');
    write(dir, 'agents/reports/T-2-cursor.md', 'r');
    lanes(dir, ['prune', '--days', '1'], { now: '2026-11-08T00:00:00Z' });
    expect(exists(dir, 'agents/archive/reports/T-2-cursor.md')).toBe(true);
  });
});
