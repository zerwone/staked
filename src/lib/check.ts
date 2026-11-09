import { TaskEvent, TaskState } from './board.js';
import { readFrontmatter } from './frontmatter.js';
import { matchAny, normalizePath } from './glob.js';
import { QuestionEvent } from './questions.js';
import { reportPath, validateReport } from './report.js';
import { Roles } from './roles.js';
import { VENDOR_FILES, VIEW_FILES, verifyGenerated } from './render.js';

export interface CheckInput {
  roles: Roles;
  agent: string;
  paths: string[];
  /** content of a path in the snapshot being checked (index or commit); null if deleted */
  read: (rel: string) => string | null;
  boardAdded: string[];
  boardRemoved: string[];
  questionsAdded: string[];
  questionsRemoved: string[];
  state: Map<TaskState>;
  specs: { file: string; agent: string; task: string; status: string }[];
  /** paths that changed for the agent's task: snapshot + earlier commits since the claim */
  actualFor: (task: string, agent: string) => string[];
}

type Map<T> = globalThis.Map<string, T>;

export interface CheckResult {
  ok: boolean;
  errors: string[];
  notes: string[];
}

const GENERATED = new Set<string>([...VENDOR_FILES, ...VIEW_FILES]);

export function isGenerated(p: string) {
  return GENERATED.has(p);
}

function specAllowed(input: CheckInput): string[] {
  const active = new Set(
    [...input.state.values()].filter((t) => t.holder === input.agent && (t.status === 'DOING' || t.status === 'REVIEW')).map((t) => t.task),
  );
  const globs: string[] = [];
  for (const s of input.specs) {
    if (s.agent !== input.agent || s.status !== 'open' || !active.has(s.task)) continue;
    const text = input.read(s.file);
    const fm = text ? readFrontmatter(text).data : null;
    const ap = fm?.allowed_paths;
    if (Array.isArray(ap)) for (const g of ap) if (typeof g === 'string') globs.push(g);
  }
  return globs;
}

function parseLines<T>(lines: string[], file: string, errors: string[]): T[] {
  const out: T[] = [];
  for (const l of lines) {
    try {
      out.push(JSON.parse(l));
    } catch {
      errors.push(`${file}: added line is not JSON: ${l.slice(0, 80)}`);
    }
  }
  return out;
}

export function checkChange(input: CheckInput): CheckResult {
  const { roles, agent } = input;
  const errors: string[] = [];
  const notes: string[] = [];
  const isOwner = agent === roles.owner;
  const a = roles.agents[agent];
  if (!isOwner && !a) {
    return { ok: false, errors: [`"${agent}" is not an agent in agents/roles.yml (set --as, STAKED_AGENT or git config user.name)`], notes };
  }
  const isBoss = agent === roles.boss;
  const paths = [...new Set(input.paths.map(normalizePath))].sort();
  if (isOwner) {
    notes.push(`${agent} is the owner: lane rules do not apply`);
  } else if (a.status !== 'active') {
    errors.push(`${agent} is ${a.status} in roles.yml and must not commit`);
  }

  const extra = isOwner ? [] : specAllowed(input);
  let codeChanged = false;
  const codePaths: string[] = [];

  for (const p of paths) {
    if (isOwner) {
      if (!p.startsWith('agents/')) codePaths.push(p);
      continue;
    }
    const content = () => input.read(p);
    if (isGenerated(p)) {
      const c = content();
      if (c !== null && verifyGenerated(c) !== 'ok') errors.push(`${p}: generated file was hand-edited (run \`staked gen\`; change roles.yml / board instead)`);
      continue;
    }
    if (p === 'agents/board.jsonl' || p === 'agents/questions.jsonl') continue; // checked line by line below
    if (p.startsWith('agents/')) {
      const rest = p.slice('agents/'.length);
      const seg = rest.split('/');
      if (seg[seg.length - 1] === '.gitkeep') continue;
      if (seg[0] === 'reports' && seg.length >= 2) {
        const owner = seg.length === 2 ? seg[1].replace(/\.md$/, '') : seg[1];
        if (owner.endsWith(`-${agent}`)) continue;
        errors.push(`${p}: reports are author-owned; ${agent} may only write agents/reports/<task>-${agent}.md`);
        continue;
      }
      if (seg[0] === 'inbox' && (seg[1] === agent || isBoss)) continue;
      if (seg[0] === 'specs') continue;
      const guarded = p === 'agents/roles.yml' || p === 'agents/DECISIONS.md' || seg[0] === 'archive';
      if (guarded && p !== 'agents/DECISIONS.md' && isBoss) continue;
      if (!guarded && (matchAny(a.lane, p) || matchAny(extra, p))) continue;
      const who = p === 'agents/DECISIONS.md' ? 'the owner' : p === 'agents/roles.yml' || seg[0] === 'archive' ? 'the boss or owner' : 'its owner';
      errors.push(`${p}: only ${who} may change this`);
      continue;
    }
    codeChanged = true;
    codePaths.push(p);
    if (matchAny(a.lane, p)) continue;
    if (matchAny(extra, p)) continue;
    const owners = Object.values(roles.agents)
      .filter((x) => x.name !== agent && matchAny(x.lane, p))
      .map((x) => x.name);
    errors.push(`${p}: outside ${agent}'s lane${owners.length ? ` (lane of ${owners.join(', ')})` : ''}`);
  }

  // append-only logs: no rewrites, and agents only write their own rows
  if (input.boardRemoved.length) errors.push(`agents/board.jsonl: ${input.boardRemoved.length} line(s) removed or edited; the board is append-only`);
  if (input.questionsRemoved.length) errors.push(`agents/questions.jsonl: ${input.questionsRemoved.length} line(s) removed or edited; the ledger is append-only`);
  const boardEvents = parseLines<TaskEvent & { kind?: string; by?: string }>(input.boardAdded, 'agents/board.jsonl', errors);
  if (!isOwner) {
    for (const e of boardEvents) {
      if (e.kind === 'handover') {
        if (e.by !== agent || !isBoss) errors.push(`agents/board.jsonl: handover rows are written by the boss or owner (row by ${e.by ?? '?'})`);
      } else if (e.agent !== agent) {
        errors.push(`agents/board.jsonl: ${agent} added a row for ${e.agent ?? '?'} (${e.task ?? '?'} ${e.status ?? ''}); agents write only their own rows`);
      }
    }
    for (const q of parseLines<QuestionEvent>(input.questionsAdded, 'agents/questions.jsonl', errors)) {
      const own = q.agent === agent && q.status === 'open';
      const withdrawn = q.status === 'withdrawn' && q.by === agent;
      if (!own && !withdrawn) errors.push(`agents/questions.jsonl: ${q.id ?? '?'} ${q.status ?? ''}: agents only ask or withdraw their own questions; the owner answers`);
    }
  }

  // rule 1: claim before start
  if (!isOwner && codeChanged) {
    const mine = [...input.state.values()].filter((t) => t.holder === agent && (t.status === 'DOING' || t.status === 'REVIEW'));
    if (!mine.length) errors.push(`${agent} has no DOING task: claim before start (staked claim <task> --as ${agent})`);
  }

  // REVIEW claims must come with a valid report that matches the diff
  for (const e of boardEvents) {
    if (e.kind || String(e.status).toUpperCase() !== 'REVIEW') continue;
    const rel = reportPath(e.task, e.agent);
    const text = input.read(rel);
    if (text === null) {
      errors.push(`${e.task} set to REVIEW without a report: ${rel} must be committed`);
      continue;
    }
    const res = validateReport(text, {
      file: rel,
      roles,
      actual: input.actualFor(e.task, e.agent),
      mustList: e.agent === agent ? codePaths : undefined,
      expectTask: e.task,
      expectAgent: e.agent,
    });
    for (const err of res.errors) errors.push(`${rel}: ${err}`);
  }

  return { ok: errors.length === 0, errors, notes };
}
