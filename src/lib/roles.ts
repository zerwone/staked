import * as fs from 'node:fs';
import { Repo } from './context.js';
import { parse, scalar, stringify, YamlError, YamlValue } from './yaml.js';
import { StakedError, NAME_RE } from './util.js';

export type AgentStatus = 'active' | 'paused' | 'retired';
export const AGENT_STATUSES: AgentStatus[] = ['active', 'paused', 'retired'];

export interface Agent {
  name: string;
  status: AgentStatus;
  lane: string[];
  reviews: string[];
  context?: string[]; // which generated files this agent reads
  extra: Record<string, YamlValue>;
}

export interface Roles {
  owner: string;
  boss: string;
  agents: Record<string, Agent>;
  rules: string[];
  resources: string[];
  extra: Record<string, YamlValue>;
}

export const DEFAULT_RULES = [
  'claim before start, one task at a time',
  "never edit another lane's files",
  'shared interfaces change in agents/specs first',
  'nobody approves their own work',
  'no deploy, push or migration without owner go',
];

function strList(v: YamlValue | undefined, where: string): string[] {
  if (v === undefined || v === null) return [];
  if (typeof v === 'string') return [v];
  if (!Array.isArray(v)) throw new StakedError(`roles.yml: ${where} must be a list`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new StakedError(`roles.yml: ${where} must contain strings`);
    return x;
  });
}

export function parseRoles(text: string): Roles {
  let doc: YamlValue;
  try {
    doc = parse(text);
  } catch (e) {
    if (e instanceof YamlError) throw new StakedError(`roles.yml: ${e.message}`);
    throw e;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new StakedError('roles.yml: expected a mapping at top level');
  const { owner, boss, agents, rules, resources, ...extra } = doc as Record<string, YamlValue>;
  if (typeof owner !== 'string' || !owner) throw new StakedError('roles.yml: `owner` is required');
  if (!agents || typeof agents !== 'object' || Array.isArray(agents)) throw new StakedError('roles.yml: `agents` must be a mapping');
  const out: Record<string, Agent> = {};
  for (const [name, raw] of Object.entries(agents as Record<string, YamlValue>)) {
    if (!NAME_RE.test(name)) throw new StakedError(`roles.yml: bad agent name "${name}"`);
    const a = (raw ?? {}) as Record<string, YamlValue>;
    if (typeof a !== 'object' || Array.isArray(a)) throw new StakedError(`roles.yml: agents.${name} must be a mapping`);
    const { status, lane, reviews, context, ...rest } = a;
    const st = (status ?? 'active') as AgentStatus;
    if (!AGENT_STATUSES.includes(st)) throw new StakedError(`roles.yml: agents.${name}.status must be one of ${AGENT_STATUSES.join(', ')}`);
    out[name] = {
      name,
      status: st,
      lane: strList(lane, `agents.${name}.lane`),
      reviews: strList(reviews, `agents.${name}.reviews`),
      context: context === undefined ? undefined : strList(context, `agents.${name}.context`),
      extra: rest,
    };
  }
  if (owner in out) throw new StakedError('roles.yml: owner must not also be an agent');
  const b = typeof boss === 'string' ? boss : '';
  if (b && !(b in out) && b !== owner) throw new StakedError(`roles.yml: boss "${b}" is not an agent`);
  return {
    owner,
    boss: b,
    agents: out,
    rules: rules === undefined ? [...DEFAULT_RULES] : strList(rules, 'rules'),
    resources: strList(resources, 'resources'),
    extra,
  };
}

export function loadRoles(repo: Repo): Roles {
  let text: string;
  try {
    text = fs.readFileSync(repo.rolesFile, 'utf8');
  } catch {
    throw new StakedError(`cannot read ${repo.rel(repo.rolesFile)}. Run \`staked init\`.`);
  }
  return parseRoles(text);
}

const HEADER = `# staked roles file: single source of truth for roles, lanes and status.
# Edit this file (or use \`staked handover\`), then run \`staked gen\`.
# Never hand-edit the generated CLAUDE.md / AGENTS.md / GEMINI.md / .cursor/rules.
# agent status: active | paused | retired
`;

export function serializeRoles(r: Roles): string {
  const agents: Record<string, YamlValue> = {};
  for (const a of Object.values(r.agents)) {
    const o: Record<string, YamlValue> = { status: a.status, lane: a.lane, reviews: a.reviews };
    if (a.context) o.context = a.context;
    Object.assign(o, a.extra);
    agents[a.name] = o;
  }
  const doc: Record<string, YamlValue> = {
    owner: r.owner,
    boss: r.boss,
    agents,
    rules: r.rules,
    resources: r.resources,
    ...r.extra,
  };
  // rules read better as a block list, resources last
  const { rules, resources, ...rest } = doc;
  let body = stringify(rest as YamlValue);
  body += 'rules:\n' + (rules as string[]).map((x) => `  - ${scalar(x)}`).join('\n') + '\n';
  body += stringify({ resources } as YamlValue);
  return HEADER + body;
}

export function saveRoles(repo: Repo, r: Roles) {
  const text = serializeRoles(r);
  // round-trip guard: never write a file we cannot read back identically
  const back = parseRoles(text);
  if (JSON.stringify(back) !== JSON.stringify(r)) {
    throw new StakedError('internal: roles.yml round-trip mismatch; refusing to write');
  }
  fs.writeFileSync(repo.rolesFile, text);
}

export function getAgent(r: Roles, n: string): Agent {
  const a = r.agents[n];
  if (!a) throw new StakedError(`unknown agent "${n}" (agents: ${Object.keys(r.agents).join(', ') || 'none'})`);
  return a;
}

export function isOwner(r: Roles, who: string | null | undefined) {
  return !!who && who === r.owner;
}

export function isPrivileged(r: Roles, who: string | null | undefined) {
  return !!who && (who === r.owner || who === r.boss);
}
