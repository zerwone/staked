import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class LanesError extends Error {
  constructor(message: string, public code = 1) {
    super(message);
  }
}

export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

const DUR_RE = /^(\d+(?:\.\d+)?)\s*(m|min|h|d|w)$/i;

/** Parse "30m", "8h", "2d", "1w" into milliseconds. */
export function parseDuration(s: string): number {
  const m = DUR_RE.exec(s.trim());
  if (!m) throw new LanesError(`bad duration "${s}" (use e.g. 30m, 8h, 2d, 1w)`);
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === 'm' || unit === 'min' ? 60_000 : unit === 'h' ? 3_600_000 : unit === 'd' ? 86_400_000 : 604_800_000;
  return Math.round(n * mult);
}

/** Accept a duration ("2d") relative to now, or an ISO date/time. Returns ISO date (YYYY-MM-DD) for whole-day input. */
export function parseExpiry(s: string, now: Date): string {
  if (DUR_RE.test(s.trim())) return new Date(now.getTime() + parseDuration(s)).toISOString().slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new LanesError(`bad expiry "${s}" (use a duration like 2d or a date like 2026-11-10)`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : d.toISOString();
}

/** End of the expiry: a bare date expires at the end of that UTC day. */
export function expiryTime(expires: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(expires)) return new Date(expires + 'T23:59:59.999Z').getTime();
  return new Date(expires).getTime();
}

export function isoNow(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e: any) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/** Write only if content changed. Returns true if written. */
export function writeIfChanged(file: string, content: string): boolean {
  const cur = readText(file);
  if (cur === content) return false;
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
  return true;
}

export function appendLine(file: string, obj: unknown) {
  ensureDir(path.dirname(file));
  const cur = readText(file);
  const sep = cur && !cur.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(file, sep + JSON.stringify(obj) + '\n');
}

export function readJsonl<T>(file: string): { rows: T[]; errors: { line: number; text: string }[] } {
  const text = readText(file);
  const rows: T[] = [];
  const errors: { line: number; text: string }[] = [];
  if (!text) return { rows, errors };
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === '') return;
    try {
      rows.push(JSON.parse(line));
    } catch {
      errors.push({ line: i + 1, text: line });
    }
  });
  return { rows, errors };
}

export function splitList(s: string | undefined | boolean): string[] {
  if (typeof s !== 'string') return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function truncate(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length <= n ? one : one.slice(0, Math.max(0, n - 1)) + '…';
}

export function listFiles(dir: string, filter: (rel: string) => boolean = () => true, base = dir): string[] {
  let out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      out = out.concat(listFiles(full, filter, base));
    } else {
      const rel = path.relative(base, full).split(path.sep).join('/');
      if (filter(rel)) out.push(rel);
    }
  }
  return out.sort();
}

export const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export function assertTaskId(t: string | undefined): string {
  if (!t || !TASK_ID_RE.test(t)) throw new LanesError(`bad task id "${t ?? ''}" (letters, digits, . _ -)`);
  return t;
}
