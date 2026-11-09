import * as fs from 'node:fs';
import * as path from 'node:path';
import { gitTop, mainWorktree, userName } from './git.js';
import { StakedError } from './util.js';

export interface Ctx {
  cwd: string;
  env: Record<string, string | undefined>;
  now: () => Date;
  out: (s: string) => void;
  err: (s: string) => void;
}

export function defaultCtx(): Ctx {
  return {
    cwd: process.cwd(),
    env: process.env,
    now: () => (process.env.STAKED_NOW ? new Date(process.env.STAKED_NOW) : new Date()),
    out: (s) => process.stdout.write(s.endsWith('\n') ? s : s + '\n'),
    err: (s) => process.stderr.write(s.endsWith('\n') ? s : s + '\n'),
  };
}

export class Repo {
  constructor(public root: string, public isGit: boolean) {}

  get agents() {
    return path.join(this.root, 'agents');
  }
  p(...parts: string[]) {
    return path.join(this.root, ...parts);
  }
  get rolesFile() {
    return path.join(this.agents, 'roles.yml');
  }
  get boardFile() {
    return path.join(this.agents, 'board.jsonl');
  }
  get questionsFile() {
    return path.join(this.agents, 'questions.jsonl');
  }
  /** Locks live in the MAIN worktree so every linked worktree sees the same mutex. */
  get locksDir() {
    const main = this.isGit ? mainWorktree(this.root) : null;
    const base = main && fs.existsSync(path.join(main, 'agents')) ? main : this.root;
    return path.join(base, 'agents', 'locks');
  }
  rel(abs: string) {
    return path.relative(this.root, abs).split(path.sep).join('/');
  }
}

function findUp(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'agents', 'roles.yml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Locate the repo that has agents/roles.yml. `forInit` falls back to the git top or cwd. */
export function findRepo(ctx: Ctx, forInit = false): Repo {
  const top = gitTop(ctx.cwd);
  const found = findUp(ctx.cwd);
  if (found) return new Repo(found, top !== null);
  if (forInit) return new Repo(top ?? path.resolve(ctx.cwd), top !== null);
  throw new StakedError('no agents/roles.yml found here or above. Run `staked init` first.');
}

/** Who is acting: --as, then STAKED_AGENT, then git config user.name. */
export function resolveIdentity(ctx: Ctx, repo: Repo, as?: string | boolean): string | null {
  if (typeof as === 'string' && as) return as;
  if (ctx.env.STAKED_AGENT) return ctx.env.STAKED_AGENT;
  if (ctx.env.LANES_AGENT) return ctx.env.LANES_AGENT; // pre-rename name
  if (repo.isGit) return userName(repo.root);
  return null;
}
