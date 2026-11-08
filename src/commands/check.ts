import * as fs from 'node:fs';
import * as path from 'node:path';
import { Args, bool, str } from '../lib/args.js';
import { boardState, readBoard } from '../lib/board.js';
import { checkChange, CheckInput } from '../lib/check.js';
import { Ctx, findRepo, Repo, resolveIdentity } from '../lib/context.js';
import {
  commitAddedLines,
  commitAuthor,
  commitPaths,
  contentAt,
  git,
  gitPath,
  taskCommittedPaths,
  stagedAddedLines,
  stagedContent,
  stagedPaths,
  stagedRemovedLines,
} from '../lib/git.js';
import { normalizePath } from '../lib/glob.js';
import { listSpecs } from '../lib/render.js';
import { loadRoles, parseRoles } from '../lib/roles.js';
import { LanesError, readText, splitList } from '../lib/util.js';

export function cmdCheck(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const rev = str(args, 'commit');
  // Judge a change by the rules that were in force before it: roles.yml from HEAD
  // (or the parent of --commit), so a commit cannot widen its own lane.
  const roles = trustedRoles(repo, rev);
  const given = str(args, 'paths');
  let agent = resolveIdentity(ctx, repo, str(args, 'as'));
  if (rev && !str(args, 'as')) agent = commitAuthor(repo.root, rev) || agent;
  if (!agent) throw new LanesError('who is committing? pass --as <agent>, set LANES_AGENT, or git config user.name <agent>');
  const state = boardState(readBoard(repo).events);

  let input: CheckInput;
  const base = { roles, agent, state, specs: listSpecs(repo) };
  if (given !== undefined || args._.length) {
    // explicit paths (CI, scripts, tests): read from the working tree
    const paths = [...splitList(given), ...args._].map(normalizePath);
    input = {
      ...base,
      paths,
      read: (rel) => readText(path.join(repo.root, rel)),
      boardAdded: [],
      boardRemoved: [],
      questionsAdded: [],
      questionsRemoved: [],
      actualFor: () => paths,
    };
  } else if (rev) {
    if (!repo.isGit) throw new LanesError('--commit needs a git repository');
    const paths = commitPaths(repo.root, rev);
    input = {
      ...base,
      paths,
      read: (rel) => contentAt(repo.root, rev, rel),
      boardAdded: commitAddedLines(repo.root, rev, 'agents/board.jsonl'),
      boardRemoved: [],
      questionsAdded: commitAddedLines(repo.root, rev, 'agents/questions.jsonl'),
      questionsRemoved: [],
      actualFor: (task, a) => union(paths, sinceClaim(repo, state, task, a)),
    };
  } else {
    if (!repo.isGit) throw new LanesError('check --staged needs a git repository');
    const paths = stagedPaths(repo.root);
    input = {
      ...base,
      paths,
      read: (rel) => stagedContent(repo.root, rel),
      boardAdded: stagedAddedLines(repo.root, 'agents/board.jsonl'),
      boardRemoved: stagedRemovedLines(repo.root, 'agents/board.jsonl'),
      questionsAdded: stagedAddedLines(repo.root, 'agents/questions.jsonl'),
      questionsRemoved: stagedRemovedLines(repo.root, 'agents/questions.jsonl'),
      actualFor: (task, a) => union(paths, sinceClaim(repo, state, task, a)),
    };
  }

  const res = checkChange(input);
  if (bool(args, 'json')) {
    ctx.out(JSON.stringify({ agent, ...res }, null, 2));
    return res.ok ? 0 : 1;
  }
  if (res.ok) {
    if (!bool(args, 'quiet')) ctx.out(`lanes check: ok (${agent}, ${input.paths.length} path${input.paths.length === 1 ? '' : 's'})`);
    return 0;
  }
  ctx.err(`lanes check: refused for ${agent}${rev ? ` at ${rev}` : ''}`);
  for (const e of res.errors) ctx.err(`  - ${e}`);
  ctx.err('Fix the change, or ask the owner. (git commit --no-verify bypasses this hook; reviews will see it.)');
  return 1;
}

function trustedRoles(repo: Repo, rev: string | undefined) {
  if (repo.isGit) {
    const base = rev ? `${rev}^` : 'HEAD';
    const text = contentAt(repo.root, base, 'agents/roles.yml');
    if (text !== null) return parseRoles(text);
  }
  return loadRoles(repo);
}

function union(a: string[], b: string[]) {
  return [...new Set([...a, ...b])];
}

function sinceClaim(repo: Repo, state: ReturnType<typeof boardState>, task: string, agent: string): string[] {
  const t = state.get(task);
  const since = t?.claimedAt ?? t?.history[0]?.ts;
  return since ? taskCommittedPaths(repo.root, task, agent, since) : [];
}

// ---------------- hook ----------------

const HOOK_TAG = '# lanes pre-commit hook';

function hookScript(): string {
  const cli = fileURLToPathSafe(new URL('../main.js', import.meta.url));
  const node = process.execPath.replace(/\\/g, '/');
  const cliPosix = cli.replace(/\\/g, '/');
  return `#!/bin/sh
${HOOK_TAG}. Installed by \`lanes hook install\`; remove with \`lanes hook uninstall\`.
hook_dir=$(dirname "$0")
if [ -x "$hook_dir/pre-commit.lanes-chained" ]; then
  "$hook_dir/pre-commit.lanes-chained" "$@" || exit $?
fi
if [ -x ./node_modules/.bin/lanes ]; then
  exec ./node_modules/.bin/lanes check --staged
fi
if [ -f "${cliPosix}" ]; then
  if [ -x "${node}" ]; then exec "${node}" "${cliPosix}" check --staged; fi
  exec node "${cliPosix}" check --staged
fi
if command -v lanes >/dev/null 2>&1; then
  exec lanes check --staged
fi
echo "lanes pre-commit: lanes CLI not found. Install it (npm i -D lanes) or rerun 'lanes hook install'." >&2
exit 1
`;
}

function fileURLToPathSafe(u: URL): string {
  let p = decodeURIComponent(u.pathname);
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1); // Windows: /C:/x -> C:/x
  return p;
}

export function cmdHook(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  if (!repo.isGit) throw new LanesError('hook needs a git repository');
  const sub = args._[0];
  const hooksDir = gitPath(repo.root, 'hooks');
  if (!hooksDir) throw new LanesError('cannot find the git hooks directory');
  const hook = path.join(hooksDir, 'pre-commit');
  const chained = path.join(hooksDir, 'pre-commit.lanes-chained');
  const cur = readText(hook);
  if (sub === 'install') {
    fs.mkdirSync(hooksDir, { recursive: true });
    if (cur !== null && !cur.includes(HOOK_TAG)) {
      if (fs.existsSync(chained)) throw new LanesError(`both ${hook} and ${chained} exist; merge them by hand first`);
      fs.renameSync(hook, chained);
      fs.chmodSync(chained, 0o755);
      ctx.out(`kept your existing pre-commit hook: it now runs first, from ${path.basename(chained)}`);
    }
    fs.writeFileSync(hook, hookScript());
    fs.chmodSync(hook, 0o755);
    ctx.out(`installed ${hook}`);
    const hp = git(repo.root, ['config', 'core.hooksPath'], { allowFail: true });
    if (hp?.trim()) ctx.out(`(core.hooksPath is ${hp.trim()})`);
    return 0;
  }
  if (sub === 'uninstall') {
    if (cur === null || !cur.includes(HOOK_TAG)) {
      ctx.out('no lanes hook installed');
      return 0;
    }
    fs.rmSync(hook);
    if (fs.existsSync(chained)) {
      fs.renameSync(chained, hook);
      ctx.out('removed the lanes hook and restored your previous pre-commit hook');
    } else ctx.out('removed the lanes hook');
    return 0;
  }
  if (sub === 'status' || sub === undefined) {
    ctx.out(cur?.includes(HOOK_TAG) ? `installed: ${hook}` : 'not installed (run `lanes hook install`)');
    return 0;
  }
  throw new LanesError('usage: lanes hook install|uninstall|status');
}
