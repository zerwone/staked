import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { run } from '../src/cli.js';
import type { Ctx } from '../src/lib/context.js';

export const CLI = path.resolve(__dirname, '..', 'dist', 'main.js');

export function tmpDir(prefix = 'lanes-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function gitInit(dir: string, user = 'tester') {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', user], { cwd: dir });
  execFileSync('git', ['config', 'user.email', `${user}@example.invalid`], { cwd: dir });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
}

export function sh(dir: string, args: string[], env: Record<string, string> = {}) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
}

export interface Result {
  code: number;
  out: string;
  err: string;
}

/** Run lanes in-process. */
export function lanes(cwd: string, argv: string[], opts: { env?: Record<string, string | undefined>; now?: string } = {}): Result {
  let out = '';
  let err = '';
  const env: Record<string, string | undefined> = { ...process.env, LANES_AGENT: undefined, ...opts.env };
  const ctx: Ctx = {
    cwd,
    env,
    now: () => new Date(opts.now ?? env.LANES_NOW ?? Date.now()),
    out: (s) => (out += s.endsWith('\n') ? s : s + '\n'),
    err: (s) => (err += s.endsWith('\n') ? s : s + '\n'),
  };
  const code = run(argv, ctx);
  return { code, out, err };
}

/** Run the built CLI as a child process (what users and hooks do). */
export function lanesBin(cwd: string, argv: string[], env: Record<string, string> = {}): Result {
  const r = spawnSync(process.execPath, [CLI, ...argv], { cwd, encoding: 'utf8', env: { ...process.env, LANES_AGENT: '', ...env } });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

export function write(dir: string, rel: string, content: string) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

export function read(dir: string, rel: string) {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

export const ROLES = `owner: mohamad
boss: claude-code
agents:
  claude-code:
    status: active          # active | paused | retired
    lane: ["supabase/**", "deploy/**", "tools/launcher/**"]
    reviews: ["cursor"]
    can_boot_client: false
  cursor:
    status: active
    lane: ["server/**", "work/patched/**"]
    reviews: ["claude-code"]
    can_boot_client: true
  codex-2:
    status: paused
    lane: []
rules:
  - claim before start, one task at a time
  - never edit another lane's files
  - shared interfaces change in agents/specs first
  - nobody approves their own work
  - no deploy, push or migration without owner go
resources: ["sandbox"]       # lockable named resources
`;

/** A git repo with lanes initialised and the spec's example roles.yml. */
export function fixtureRepo(): string {
  const dir = tmpDir();
  gitInit(dir, 'mohamad');
  const r = lanes(dir, ['init', '--agents', 'claude-code,cursor,codex-2', '--owner', 'mohamad']);
  if (r.code !== 0) throw new Error('init failed: ' + r.err);
  write(dir, 'agents/roles.yml', ROLES);
  const g = lanes(dir, ['gen']);
  if (g.code !== 0) throw new Error('gen failed: ' + g.err + g.out);
  return dir;
}
