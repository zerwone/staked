import { Repo } from './context.js';
import { appendLine, LanesError, readJsonl } from './util.js';

export const STATUSES = ['TODO', 'DOING', 'BLOCKED', 'REVIEW', 'DONE', 'PAUSED', 'STOPPED'] as const;
export type Status = (typeof STATUSES)[number];
export const CLOSED: Status[] = ['DONE', 'STOPPED'];

export interface TaskEvent {
  ts: string;
  task: string;
  agent: string;
  status: Status;
  note?: string;
  flags?: string[];
  kind?: undefined;
}

export interface HandoverEvent {
  ts: string;
  kind: 'handover';
  from: string;
  to: string;
  lanes: string[];
  boss: boolean;
  by: string;
  released?: string[];
}

export type BoardEvent = TaskEvent | HandoverEvent;

export interface TaskState {
  task: string;
  status: Status;
  agent: string; // agent of the latest event
  holder: string | null; // agent who claimed it (DOING/REVIEW/BLOCKED), else null
  ts: string;
  note: string;
  flags: string[];
  reviewBy: string | null; // agent who put it into REVIEW last
  claimedAt: string | null; // ts of the claim (latest DOING after a non-DOING state)
  history: TaskEvent[];
}

export function parseStatus(s: string | undefined): Status {
  const u = (s ?? '').toUpperCase();
  if (!(STATUSES as readonly string[]).includes(u)) throw new LanesError(`bad status "${s ?? ''}" (one of ${STATUSES.join(' ')})`);
  return u as Status;
}

export function readBoard(repo: Repo): { events: BoardEvent[]; errors: { line: number; text: string }[] } {
  const { rows, errors } = readJsonl<BoardEvent>(repo.boardFile);
  return { events: rows, errors };
}

export function taskEvents(events: BoardEvent[]): TaskEvent[] {
  return events.filter((e): e is TaskEvent => !e.kind && typeof (e as TaskEvent).task === 'string');
}

export function handoverEvents(events: BoardEvent[]): HandoverEvent[] {
  return events.filter((e): e is HandoverEvent => e.kind === 'handover');
}

/** Latest event per task wins. Stable on equal timestamps: later line wins. */
export function boardState(events: BoardEvent[]): Map<string, TaskState> {
  const indexed = taskEvents(events).map((e, i) => ({ e, i }));
  indexed.sort((a, b) => (a.e.ts < b.e.ts ? -1 : a.e.ts > b.e.ts ? 1 : a.i - b.i));
  const map = new Map<string, TaskState>();
  for (const { e } of indexed) {
    const prev = map.get(e.task);
    const status = parseStatusSafe(e.status);
    if (!status) continue;
    const st: TaskState = prev ?? {
      task: e.task,
      status,
      agent: e.agent,
      holder: null,
      ts: e.ts,
      note: '',
      flags: [],
      reviewBy: null,
      claimedAt: null,
      history: [],
    };
    if (status === 'DOING' && (!prev || prev.status !== 'DOING' || prev.holder !== e.agent)) st.claimedAt = e.ts;
    st.status = status;
    st.agent = e.agent;
    st.ts = e.ts;
    st.note = e.note ?? '';
    st.flags = Array.isArray(e.flags) ? e.flags : [];
    if (status === 'REVIEW') st.reviewBy = e.agent;
    if (status === 'DOING') st.holder = e.agent;
    else if (status === 'REVIEW' || status === 'BLOCKED') st.holder = st.holder ?? e.agent;
    else st.holder = null;
    st.history.push(e);
    map.set(e.task, st);
  }
  return map;
}

function parseStatusSafe(s: unknown): Status | null {
  const u = String(s ?? '').toUpperCase();
  return (STATUSES as readonly string[]).includes(u) ? (u as Status) : null;
}

export function isOpen(s: TaskState) {
  return !CLOSED.includes(s.status);
}

export function doingTasks(state: Map<string, TaskState>, agent: string): TaskState[] {
  return [...state.values()].filter((t) => t.status === 'DOING' && t.holder === agent);
}

/** Tasks sorted newest first. */
export function sortedTasks(state: Map<string, TaskState>, all = false): TaskState[] {
  return [...state.values()].filter((t) => all || isOpen(t)).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : a.task.localeCompare(b.task)));
}

export function appendEvent(repo: Repo, e: BoardEvent) {
  appendLine(repo.boardFile, e);
}
