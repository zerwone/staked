import * as path from 'node:path';
import { readFrontmatter } from './frontmatter.js';
import { normalizePath } from './glob.js';
import { Roles } from './roles.js';

export const REPORT_FIELDS = ['task', 'agent', 'flags', 'tests_run', 'native_boot', 'files_changed'] as const;

export interface ReportData {
  task: string;
  agent: string;
  flags: string[];
  tests_run: string[];
  native_boot: boolean;
  files_changed: string[];
}

export interface ReportResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  data: Partial<ReportData> | null;
}

export function reportPath(task: string, agent: string) {
  return `agents/reports/${task}-${agent}.md`;
}

/**
 * Validate a report's frontmatter. `actual` (optional) is the set of paths that
 * really changed; when given, files_changed must be a subset of it. `mustList`
 * (optional) are paths that must appear in files_changed (e.g. the staged diff).
 */
export function validateReport(
  text: string,
  opts: { file?: string; roles?: Roles; actual?: string[]; mustList?: string[]; expectTask?: string; expectAgent?: string } = {},
): ReportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fm = readFrontmatter(text);
  if (fm.error) return { ok: false, errors: [`frontmatter does not parse: ${fm.error}`], warnings, data: null };
  if (!fm.data) return { ok: false, errors: ['missing frontmatter (--- block with task, agent, flags, tests_run, native_boot, files_changed)'], warnings, data: null };
  const d = fm.data;
  for (const f of REPORT_FIELDS) if (!(f in d)) errors.push(`missing field: ${f}`);
  const isStrList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
  if ('task' in d && (typeof d.task !== 'string' || !d.task)) errors.push('task must be a non-empty string');
  if ('agent' in d && (typeof d.agent !== 'string' || !d.agent)) errors.push('agent must be a non-empty string');
  if ('flags' in d && !isStrList(d.flags)) errors.push('flags must be a list (use [] for none)');
  if ('tests_run' in d) {
    if (!isStrList(d.tests_run)) errors.push('tests_run must be a list');
    else if ((d.tests_run as string[]).length === 0) errors.push('tests_run is empty: list what you ran (e.g. "npm test"), or "none: <reason>"');
  }
  if ('native_boot' in d && typeof d.native_boot !== 'boolean') errors.push('native_boot must be true or false');
  if ('files_changed' in d) {
    if (!isStrList(d.files_changed)) errors.push('files_changed must be a list');
    else if ((d.files_changed as string[]).length === 0) errors.push('files_changed is empty');
  }
  const data: Partial<ReportData> = {
    task: typeof d.task === 'string' ? d.task : undefined,
    agent: typeof d.agent === 'string' ? d.agent : undefined,
    flags: isStrList(d.flags) ? (d.flags as string[]) : undefined,
    tests_run: isStrList(d.tests_run) ? (d.tests_run as string[]) : undefined,
    native_boot: typeof d.native_boot === 'boolean' ? d.native_boot : undefined,
    files_changed: isStrList(d.files_changed) ? (d.files_changed as string[]).map(normalizePath) : undefined,
  };
  if (opts.file) {
    const base = path.basename(normalizePath(opts.file), '.md');
    if (data.task && data.agent && base !== `${data.task}-${data.agent}`) {
      errors.push(`file name should be ${data.task}-${data.agent}.md (got ${base}.md)`);
    }
  }
  if (opts.expectTask && data.task && data.task !== opts.expectTask) errors.push(`task is ${data.task}, expected ${opts.expectTask}`);
  if (opts.expectAgent && data.agent && data.agent !== opts.expectAgent) errors.push(`agent is ${data.agent}, expected ${opts.expectAgent}`);
  if (opts.roles && data.agent) {
    const a = opts.roles.agents[data.agent];
    if (!a) errors.push(`agent "${data.agent}" is not in roles.yml`);
    else if (data.native_boot === true && a.extra.can_boot_client === false) {
      errors.push(`native_boot: true but ${data.agent} has can_boot_client: false in roles.yml`);
    }
  }
  if (data.files_changed && opts.actual) {
    const actual = new Set(opts.actual.map(normalizePath));
    const ghost = data.files_changed.filter((f) => !actual.has(f));
    if (ghost.length) errors.push(`files_changed lists paths that did not change: ${ghost.join(', ')}`);
  }
  if (data.files_changed && opts.mustList) {
    const listed = new Set(data.files_changed);
    const missing = opts.mustList.map(normalizePath).filter((f) => !listed.has(f));
    if (missing.length) errors.push(`changed but not in files_changed: ${missing.join(', ')}`);
  }
  return { ok: errors.length === 0, errors, warnings, data };
}
