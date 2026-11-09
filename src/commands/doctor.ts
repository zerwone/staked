import * as fs from 'node:fs';
import * as path from 'node:path';
import { Args, bool } from '../lib/args.js';
import { boardState, readBoard } from '../lib/board.js';
import { Ctx, findRepo, Repo } from '../lib/context.js';
import { readFrontmatter } from '../lib/frontmatter.js';
import { gitPath, statusCount } from '../lib/git.js';
import { globsOverlap } from '../lib/glob.js';
import { isExpiredLock, listLocks } from '../lib/locks.js';
import { isExpired, questionState, readQuestionEvents } from '../lib/questions.js';
import { CONTEXT_LIMIT, listSpecs, planGen, VENDOR_FILES, VIEW_FILES, verifyGenerated } from '../lib/render.js';
import { loadRoles, Roles } from '../lib/roles.js';
import { StakedError, readText } from '../lib/util.js';

export type Severity = 'error' | 'warn';

export interface Finding {
  check: string;
  weakness: number; // the numbered weakness in docs/ORIGIN.md this detects
  severity: Severity;
  file?: string;
  message: string;
}

const TASK_IN_HEADING = /^#{1,6}\s+(.*)$/;
const ID_RE = /\b([A-Z][A-Z0-9]{0,11}-\d+[A-Za-z0-9]*)\b/;
const AUTHORITY_RE = /\bauthority\b|latest owner instruction|\bcurrent (boss|roles?|lanes?)\b|\bwho is boss\b/i;
const PRECEDENCE_RE = /where older sections say otherwise|this (file|section) wins|supersedes (the )?(above|previous|older)/i;
const DECISION_HEADING_RE = /\bowner decision/i;

function headings(text: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let fence = false;
  text.split(/\r?\n/).forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence) return;
    const m = TASK_IN_HEADING.exec(l);
    if (m) out.push({ line: i + 1, text: m[1].trim() });
  });
  return out;
}

/** Markdown files that carry protocol state: agents/*.md plus root context files. Not inbox/reports/archive. */
function protocolFiles(agentsDir: string, root: string | null): string[] {
  const files: string[] = [];
  const add = (abs: string) => {
    try {
      if (fs.statSync(abs).isFile()) files.push(abs);
    } catch {
      /* missing */
    }
  };
  try {
    for (const f of fs.readdirSync(agentsDir)) if (f.toLowerCase().endsWith('.md')) add(path.join(agentsDir, f));
  } catch {
    /* no agents dir */
  }
  if (root) for (const f of ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursor/rules/staked.mdc']) add(path.join(root, f));
  return files.sort();
}

export function scanMarkdown(agentsDir: string, root: string | null, rel: (abs: string) => string): Finding[] {
  const out: Finding[] = [];
  for (const abs of protocolFiles(agentsDir, root)) {
    const text = readText(abs) ?? '';
    const file = rel(abs);
    const generated = verifyGenerated(text) !== 'not-generated';
    if (generated) continue; // staked output is checked by hash instead
    const hs = headings(text);

    // W1: stacked authority sections
    const auth = hs.filter((h) => AUTHORITY_RE.test(h.text));
    if (auth.length > 1) {
      out.push({
        check: 'stacked-authority',
        weakness: 1,
        severity: 'error',
        file,
        message: `${auth.length} authority sections stacked (lines ${auth.map((h) => h.line).join(', ')}); keep one source in agents/roles.yml`,
      });
    }
    const prec = text.split(/\r?\n/).findIndex((l) => PRECEDENCE_RE.test(l));
    if (prec >= 0) {
      out.push({ check: 'precedence-by-date', weakness: 1, severity: 'warn', file, message: `line ${prec + 1} resolves authority by precedence ("…${PRECEDENCE_RE.exec(text)?.[0]}…")` });
    }

    // W3: duplicate task ids in headings
    const seen = new Map<string, number[]>();
    for (const h of hs) {
      const m = ID_RE.exec(h.text);
      if (!m) continue;
      const id = m[1];
      if (!seen.has(id)) seen.set(id, []);
      seen.get(id)!.push(h.line);
    }
    const dups = [...seen.entries()].filter(([, lines]) => lines.length > 1);
    if (dups.length) {
      const total = [...seen.values()].reduce((n, l) => n + l.length, 0);
      const list = dups
        .slice(0, 12)
        .map(([id, lines]) => `${id} x${lines.length} (lines ${lines.join(',')})`)
        .join('; ');
      out.push({
        check: 'duplicate-task-ids',
        weakness: 3,
        severity: 'error',
        file,
        message: `${dups.length} duplicated id(s) across ${total} headed entries: ${list}${dups.length > 12 ? `; …${dups.length - 12} more` : ''}`,
      });
    }

    // W9: owner decisions outside DECISIONS.md
    if (path.basename(abs).toUpperCase() !== 'DECISIONS.MD') {
      const dec = hs.filter((h) => DECISION_HEADING_RE.test(h.text));
      if (dec.length) {
        out.push({ check: 'decisions-scattered', weakness: 9, severity: 'warn', file, message: `${dec.length} "owner decision" section(s) outside agents/DECISIONS.md (lines ${dec.map((h) => h.line).join(', ')})` });
      }
    }
  }
  return out;
}

function laneOverlaps(roles: Roles): Finding[] {
  const out: Finding[] = [];
  const agents = Object.values(roles.agents).filter((a) => a.status !== 'retired');
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      for (const g1 of agents[i].lane) {
        for (const g2 of agents[j].lane) {
          if (globsOverlap(g1, g2)) {
            out.push({ check: 'lane-overlap', weakness: 2, severity: 'error', file: 'agents/roles.yml', message: `${agents[i].name} "${g1}" overlaps ${agents[j].name} "${g2}"` });
          }
        }
      }
    }
  }
  return out;
}

export function doctor(repo: Repo, now: Date, opts: { agentsDir?: string } = {}): { findings: Finding[]; notes: string[] } {
  const findings: Finding[] = [];
  const notes: string[] = [];
  const agentsDir = opts.agentsDir ?? repo.agents;
  const legacyOnly = !!opts.agentsDir;
  const rel = (abs: string) => path.relative(legacyOnly ? path.dirname(agentsDir) : repo.root, abs).split(path.sep).join('/');

  findings.push(...scanMarkdown(agentsDir, legacyOnly ? null : repo.root, rel));

  let roles: Roles | null = null;
  if (fs.existsSync(path.join(agentsDir, 'roles.yml')) && !legacyOnly) {
    try {
      roles = loadRoles(repo);
    } catch (e: any) {
      findings.push({ check: 'roles-invalid', weakness: 1, severity: 'error', file: 'agents/roles.yml', message: e.message });
    }
  } else {
    notes.push('no agents/roles.yml: legacy layout, only markdown checks ran. `staked init` creates one.');
  }
  if (!roles || legacyOnly) return { findings, notes };

  findings.push(...laneOverlaps(roles));

  // W5: generated files: hand edits, staleness, size
  const plans = new Map(planGen(repo).map((p) => [p.file, p.content]));
  for (const f of [...VENDOR_FILES, ...VIEW_FILES]) {
    const text = readText(repo.p(f));
    if (text === null) {
      if (plans.has(f)) findings.push({ check: 'generated-missing', weakness: 5, severity: 'warn', file: f, message: 'not generated yet (run `staked gen`)' });
      continue;
    }
    const st = verifyGenerated(text);
    if (st === 'edited') findings.push({ check: 'generated-hand-edited', weakness: 5, severity: 'error', file: f, message: 'generated file was edited by hand (hash mismatch); move the change into roles.yml/DECISIONS.md and run `staked gen`' });
    else if (st === 'not-generated' && plans.has(f) && text.trim() !== '') findings.push({ check: 'generated-hand-written', weakness: 1, severity: 'warn', file: f, message: 'hand-written file where lanes generates one; agents may read two authorities' });
    else if (st === 'ok' && plans.has(f) && plans.get(f) !== text.replace(/\r\n/g, '\n')) findings.push({ check: 'generated-stale', weakness: 5, severity: 'warn', file: f, message: 'out of date with roles.yml / board (run `staked gen`)' });
    if (!f.startsWith('agents/') && Buffer.byteLength(text) >= CONTEXT_LIMIT) {
      findings.push({ check: 'context-size', weakness: 5, severity: 'warn', file: f, message: `${Buffer.byteLength(text)} bytes; target is under 6 KB` });
    }
  }

  // board integrity
  const { events, errors } = readBoard(repo);
  for (const e of errors) findings.push({ check: 'board-bad-line', weakness: 3, severity: 'error', file: 'agents/board.jsonl', message: `line ${e.line} is not JSON` });
  const state = boardState(events);
  const doingBy = new Map<string, string[]>();
  for (const t of state.values()) {
    if (t.status !== 'DOING' || !t.holder) continue;
    if (!doingBy.has(t.holder)) doingBy.set(t.holder, []);
    doingBy.get(t.holder)!.push(t.task);
  }
  for (const [agent, tasks] of doingBy) {
    if (tasks.length > 1) findings.push({ check: 'multiple-doing', weakness: 8, severity: 'error', file: 'agents/board.jsonl', message: `${agent} is DOING ${tasks.length} tasks: ${tasks.join(', ')} (one task at a time)` });
  }
  for (const t of state.values()) {
    if (!t.holder || !(t.status === 'DOING' || t.status === 'REVIEW')) continue;
    const a = roles.agents[t.holder];
    if (!a) findings.push({ check: 'holder-unknown', weakness: 8, severity: 'warn', file: 'agents/board.jsonl', message: `${t.task} ${t.status} by ${t.holder}, who is not in roles.yml` });
    else if (a.status !== 'active') findings.push({ check: 'holder-idle', weakness: 8, severity: 'warn', file: 'agents/board.jsonl', message: `${t.task} ${t.status} by ${t.holder}, who is ${a.status}; hand it over (staked handover)` });
  }

  // W8: expired locks
  for (const l of listLocks(repo)) {
    if (isExpiredLock(l, now)) findings.push({ check: 'expired-lock', weakness: 8, severity: 'warn', file: `agents/locks/${l.name}.lock`, message: `${l.kind} lock by ${l.agent} expired ${l.expires}; release or reclaim it` });
  }

  // W4: questions
  const qe = readQuestionEvents(repo);
  for (const e of qe.errors) findings.push({ check: 'questions-bad-line', weakness: 4, severity: 'error', file: 'agents/questions.jsonl', message: `line ${e.line} is not JSON` });
  for (const q of questionState(qe.rows).values()) {
    if (q.duplicates) findings.push({ check: 'duplicate-question-ids', weakness: 3, severity: 'error', file: 'agents/questions.jsonl', message: `${q.id} was created ${q.duplicates + 1} times with different text (parallel branches); renumber one` });
    if (isExpired(q, now)) {
      findings.push({ check: 'question-expired', weakness: 4, severity: 'warn', file: 'agents/questions.jsonl', message: `${q.id} expired ${q.expires} unanswered${q.default ? `; default applies: ${q.default}` : ' and has no default'}` });
    }
  }

  // W7: reports without flags
  const reportsDir = path.join(repo.agents, 'reports');
  let reports: string[] = [];
  try {
    reports = fs.readdirSync(reportsDir).filter((f) => f.endsWith('.md'));
  } catch {
    /* none */
  }
  const noFlags = reports.filter((f) => {
    const fm = readFrontmatter(readText(path.join(reportsDir, f)) ?? '');
    return !fm.data || !Array.isArray(fm.data.flags);
  });
  if (noFlags.length) {
    findings.push({ check: 'report-without-flags', weakness: 7, severity: 'warn', file: 'agents/reports/', message: `${noFlags.length} report(s) without a flags list: ${noFlags.slice(0, 5).join(', ')}${noFlags.length > 5 ? ', …' : ''}` });
  }

  // W6: specs without status
  const noStatus = listSpecs(repo).filter((s) => !s.status);
  if (noStatus.length) {
    findings.push({ check: 'spec-without-status', weakness: 6, severity: 'warn', file: 'agents/inbox/', message: `${noStatus.length} spec(s) without status: frontmatter: ${noStatus.slice(0, 5).map((s) => s.file).join(', ')}${noStatus.length > 5 ? ', …' : ''}` });
  }

  // W2: enforcement present?
  if (repo.isGit) {
    const hook = gitPath(repo.root, 'hooks/pre-commit');
    if (!hook || !/# (staked|lanes) pre-commit hook/.test(readText(hook) ?? '')) {
      findings.push({ check: 'hook-missing', weakness: 2, severity: 'warn', message: 'pre-commit hook not installed: lanes are enforced by trust (run `staked hook install`)' });
    }
    // W10: uncommitted pile-up
    const n = statusCount(repo.root);
    if (n > 100) findings.push({ check: 'uncommitted-changes', weakness: 10, severity: 'warn', message: `${n} uncommitted changes; commit or stash before refactoring the protocol` });
  }
  return { findings, notes };
}

export function cmdDoctor(ctx: Ctx, args: Args): number {
  const target = args._[0];
  let repo: Repo;
  let agentsDir: string | undefined;
  if (target) {
    const abs = path.resolve(ctx.cwd, target);
    if (!fs.existsSync(abs)) throw new StakedError(`no such directory: ${target}`);
    if (fs.existsSync(path.join(abs, 'agents', 'roles.yml'))) repo = new Repo(abs, fs.existsSync(path.join(abs, '.git')));
    else if (fs.existsSync(path.join(abs, 'roles.yml')) && path.basename(abs) === 'agents') repo = new Repo(path.dirname(abs), fs.existsSync(path.join(abs, '..', '.git')));
    else {
      // a legacy agents/ folder (or a repo whose agents/ has no roles.yml): markdown checks only
      const dir = fs.existsSync(path.join(abs, 'agents')) ? path.join(abs, 'agents') : abs;
      repo = new Repo(path.dirname(dir), false);
      agentsDir = dir;
    }
  } else {
    try {
      repo = findRepo(ctx);
    } catch {
      repo = findRepo(ctx, true);
      agentsDir = repo.agents;
    }
  }
  const { findings, notes } = doctor(repo, ctx.now(), { agentsDir });
  const errors = findings.filter((f) => f.severity === 'error').length;
  if (bool(args, 'json')) {
    ctx.out(JSON.stringify({ findings, notes, errors, warnings: findings.length - errors }, null, 2));
    return errors ? 1 : 0;
  }
  for (const n of notes) ctx.out(`note: ${n}`);
  if (!findings.length) {
    ctx.out('staked doctor: no problems found');
    return 0;
  }
  for (const f of findings) ctx.out(`${f.severity === 'error' ? 'ERROR' : 'warn '} [W${f.weakness} ${f.check}]${f.file ? ` ${f.file}:` : ''} ${f.message}`);
  ctx.out(`\n${errors} error(s), ${findings.length - errors} warning(s). W<n> = weakness n in docs/ORIGIN.md.`);
  return errors ? 1 : 0;
}
