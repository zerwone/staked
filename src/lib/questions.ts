import { Repo } from './context.js';
import { appendLine, expiryTime, readJsonl } from './util.js';

export interface QuestionEvent {
  ts: string;
  id: string;
  agent: string;
  text: string;
  blocking: string[];
  default: string | null;
  expires: string | null;
  status: 'open' | 'answered' | 'withdrawn';
  answer: string | null;
  by?: string;
}

export interface Question extends QuestionEvent {
  asked: string; // ts of the first event
  duplicates: number; // >0 when two different "open" creations share an id
}

export function readQuestionEvents(repo: Repo) {
  return readJsonl<QuestionEvent>(repo.questionsFile);
}

/** Fold the append-only ledger: latest event per id wins; first event fixes who asked and when. */
export function questionState(events: QuestionEvent[]): Map<string, Question> {
  const map = new Map<string, Question>();
  const indexed = events.map((e, i) => ({ e, i })).sort((a, b) => (a.e.ts < b.e.ts ? -1 : a.e.ts > b.e.ts ? 1 : a.i - b.i));
  for (const { e } of indexed) {
    if (!e || typeof e.id !== 'string') continue;
    const prev = map.get(e.id);
    if (!prev) {
      map.set(e.id, { ...normalize(e), asked: e.ts, duplicates: 0 });
      continue;
    }
    const dup = e.status === 'open' && prev.status === 'open' && e.text !== prev.text && e.agent !== prev.agent;
    const merged: Question = {
      ...prev,
      ...normalize({ ...prev, ...e }),
      // creation fields stay with the original unless this is a new question text
      agent: prev.agent,
      text: dup ? prev.text : e.text ?? prev.text,
      asked: prev.asked,
      duplicates: prev.duplicates + (dup ? 1 : 0),
    };
    map.set(e.id, merged);
  }
  return map;
}

function normalize(e: QuestionEvent): QuestionEvent {
  return {
    ts: e.ts,
    id: e.id,
    agent: e.agent,
    text: e.text ?? '',
    blocking: Array.isArray(e.blocking) ? e.blocking : [],
    default: e.default ?? null,
    expires: e.expires ?? null,
    status: e.status ?? 'open',
    answer: e.answer ?? null,
    ...(e.by ? { by: e.by } : {}),
  };
}

export function nextQuestionId(events: QuestionEvent[]): string {
  let max = 0;
  for (const e of events) {
    const m = /^Q-(\d+)$/.exec(e.id ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return 'Q-' + String(max + 1).padStart(3, '0');
}

export function isExpired(q: Question, now: Date): boolean {
  return q.status === 'open' && !!q.expires && expiryTime(q.expires) < now.getTime();
}

/**
 * Owner's phone view ranking: questions blocking the most (still open) tasks first,
 * then oldest first.
 */
export function rankOpen(qs: Question[], closedTasks: Set<string>): Question[] {
  return qs
    .filter((q) => q.status === 'open')
    .sort((a, b) => {
      const wa = liveBlocking(a, closedTasks).length;
      const wb = liveBlocking(b, closedTasks).length;
      if (wa !== wb) return wb - wa;
      return a.asked < b.asked ? -1 : a.asked > b.asked ? 1 : a.id.localeCompare(b.id);
    });
}

/** Blocked tasks that are not closed. Unknown task ids still count: the asker said they block. */
export function liveBlocking(q: Question, closedTasks: Set<string>): string[] {
  return q.blocking.filter((t) => !closedTasks.has(t));
}

export function appendQuestion(repo: Repo, e: QuestionEvent) {
  appendLine(repo.questionsFile, e);
}
