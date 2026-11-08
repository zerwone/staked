import * as fs from 'node:fs';
import { Args, bool, str } from '../lib/args.js';
import { Ctx, findRepo } from '../lib/context.js';
import { userName } from '../lib/git.js';
import { DEFAULT_RULES, Roles, serializeRoles } from '../lib/roles.js';
import { ensureDir, LanesError, NAME_RE, readText, splitList } from '../lib/util.js';
import { regen } from '../lib/render.js';

const UNION_LINES = ['agents/board.jsonl merge=union', 'agents/questions.jsonl merge=union'];

const DECISIONS = `# Decisions

Owner decisions only. Append-only, numbered, dated. Everything else cites the number (D-001).
Hand-written by the owner; lanes never generates or edits this file.

`;

export function cmdInit(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx, true);
  const force = bool(args, 'force');
  const agents = splitList(str(args, 'agents'));
  const names = agents.length ? agents : ['claude-code', 'codex'];
  for (const n of names) if (!NAME_RE.test(n)) throw new LanesError(`bad agent name "${n}"`);
  const owner = str(args, 'owner') ?? (repo.isGit ? userName(repo.root) : null) ?? 'owner';
  const ownerName = names.includes(owner) ? 'owner' : owner;

  const created: string[] = [];
  const keep: string[] = [];
  const touch = (rel: string, content: string, overwrite = false) => {
    const abs = repo.p(rel);
    if (fs.existsSync(abs) && !overwrite) {
      keep.push(rel);
      return;
    }
    ensureDir(repo.p(rel, '..'));
    fs.writeFileSync(abs, content);
    created.push(rel);
  };

  if (fs.existsSync(repo.rolesFile) && !force) {
    keep.push('agents/roles.yml');
  } else {
    const roles: Roles = {
      owner: ownerName,
      boss: names[0],
      agents: Object.fromEntries(
        names.map((n, i) => [
          n,
          { name: n, status: 'active', lane: [], reviews: names.length > 1 ? [names[(i + 1) % names.length]] : [], extra: {} },
        ]),
      ),
      rules: [...DEFAULT_RULES],
      resources: [],
      extra: {},
    };
    touch('agents/roles.yml', serializeRoles(roles), true);
  }
  touch('agents/board.jsonl', '');
  touch('agents/questions.jsonl', '');
  touch('agents/DECISIONS.md', DECISIONS);
  for (const d of ['reports', 'specs', 'archive']) touch(`agents/${d}/.gitkeep`, '');
  for (const n of names) touch(`agents/inbox/${n}/.gitkeep`, '');
  ensureDir(repo.p('agents', 'locks'));

  // .gitattributes: union-merge the two append-only logs so parallel branches never conflict
  const ga = readText(repo.p('.gitattributes')) ?? '';
  const missing = UNION_LINES.filter((l) => !ga.split(/\r?\n/).some((x) => x.trim() === l));
  if (missing.length) {
    fs.writeFileSync(repo.p('.gitattributes'), ga + (ga && !ga.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n');
    created.push('.gitattributes (merge=union for board.jsonl, questions.jsonl)');
  }
  const gi = readText(repo.p('.gitignore')) ?? '';
  if (!gi.split(/\r?\n/).some((x) => x.trim() === 'agents/locks/' || x.trim() === 'agents/locks/*.lock')) {
    fs.writeFileSync(repo.p('.gitignore'), gi + (gi && !gi.endsWith('\n') ? '\n' : '') + 'agents/locks/\n');
    created.push('.gitignore (agents/locks/)');
  }

  const warn = regen(repo);
  ctx.out(`lanes: initialised ${repo.root}`);
  for (const c of created) ctx.out(`  + ${c}`);
  for (const k of keep) ctx.out(`  = ${k} (kept)`);
  if (warn) ctx.err(warn);
  ctx.out(
    [
      '',
      'Next steps:',
      `  1. Edit agents/roles.yml: give each agent a lane (path globs it may write), e.g. lane: ["src/**"].`,
      '  2. npx lanes gen            # regenerate CLAUDE.md / AGENTS.md / .cursor/rules / GEMINI.md',
      '  3. npx lanes hook install   # pre-commit gate: refuses out-of-lane commits',
      `  4. In each agent's worktree: git config user.name <agent>   (or export LANES_AGENT=<agent>)`,
      `  5. npx lanes claim T-001 --as ${names[0]}`,
    ].join('\n'),
  );
  return 0;
}
