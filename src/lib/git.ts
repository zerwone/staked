import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { normalizePath } from './glob.js';

export function git(cwd: string, args: string[], opts: { allowFail?: boolean; input?: string } = {}): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      input: opts.input,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    if (opts.allowFail) return null;
    throw e;
  }
}

export function gitTop(cwd: string): string | null {
  const out = git(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true });
  return out ? path.resolve(out.trim()) : null;
}

/** Root of the main worktree (shared by every linked worktree). */
export function mainWorktree(cwd: string): string | null {
  const out = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'], { allowFail: true });
  if (!out) return null;
  const common = path.resolve(out.trim());
  if (path.basename(common) === '.git') return path.dirname(common);
  return null; // bare repo or unusual layout: caller falls back to the local root
}

export function gitPath(cwd: string, p: string): string | null {
  const out = git(cwd, ['rev-parse', '--path-format=absolute', '--git-path', p], { allowFail: true });
  return out ? path.resolve(out.trim()) : null;
}

export function userName(cwd: string): string | null {
  const out = git(cwd, ['config', 'user.name'], { allowFail: true });
  const v = out?.trim();
  return v ? v : null;
}

function splitZ(out: string | null): string[] {
  if (!out) return [];
  return out
    .split('\0')
    .filter(Boolean)
    .map(normalizePath);
}

export function stagedPaths(cwd: string): string[] {
  return splitZ(git(cwd, ['diff', '--cached', '--name-only', '-z', '--no-renames'], { allowFail: true }));
}

export function workingChanges(cwd: string): string[] {
  const unstaged = splitZ(git(cwd, ['diff', '--name-only', '-z', '--no-renames'], { allowFail: true }));
  const untracked = splitZ(git(cwd, ['ls-files', '--others', '--exclude-standard', '-z'], { allowFail: true }));
  return [...new Set([...stagedPaths(cwd), ...unstaged, ...untracked])];
}

export function commitPaths(cwd: string, rev: string): string[] {
  return splitZ(git(cwd, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--no-renames', '--root', rev]));
}

export function commitAuthor(cwd: string, rev: string): string {
  return (git(cwd, ['log', '-1', '--format=%an', rev]) ?? '').trim();
}

/** Paths changed by commits authored by `author` since `sinceIso`. */
export function pathsCommittedBy(cwd: string, author: string, sinceIso: string): string[] {
  const out = git(cwd, ['log', `--since=${sinceIso}`, '--format=@@%an', '--name-only', '--no-renames'], { allowFail: true });
  if (!out) return [];
  const paths = new Set<string>();
  let current: string | null = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('@@')) current = line.slice(2);
    else if (line.trim() && current === author) paths.add(normalizePath(line.trim()));
  }
  return [...paths];
}

/** Content of a path as staged in the index, or null. */
export function stagedContent(cwd: string, p: string): string | null {
  return git(cwd, ['show', `:${p}`], { allowFail: true });
}

export function contentAt(cwd: string, rev: string, p: string): string | null {
  return git(cwd, ['show', `${rev}:${p}`], { allowFail: true });
}

/** Lines added to a file in the staged diff. */
export function stagedAddedLines(cwd: string, p: string): string[] {
  const out = git(cwd, ['diff', '--cached', '-U0', '--no-color', '--', p], { allowFail: true });
  return addedLines(out);
}

export function commitAddedLines(cwd: string, rev: string, p: string): string[] {
  const out = git(cwd, ['show', '-U0', '--no-color', '--format=', rev, '--', p], { allowFail: true });
  return addedLines(out);
}

export function stagedRemovedLines(cwd: string, p: string): string[] {
  const out = git(cwd, ['diff', '--cached', '-U0', '--no-color', '--', p], { allowFail: true });
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .filter((l) => l.startsWith('-') && !l.startsWith('---'))
    .map((l) => l.slice(1))
    .filter((l) => l.trim() !== '');
}

function addedLines(out: string | null): string[] {
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .filter((l) => l.trim() !== '');
}

export function statusCount(cwd: string): number {
  const out = git(cwd, ['status', '--porcelain', '--untracked-files=all'], { allowFail: true });
  if (!out) return 0;
  return out.split(/\r?\n/).filter(Boolean).length;
}
