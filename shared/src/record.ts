import { allQuestions, findQuestion, initialAnswers, initialValue } from './form';
import { normalizeMatchKey } from './matchKey';
import type { AnswerValue, FormDef, Question, ScoutRecord, Slot } from './types';
import { SLOTS } from './types';

export function isAnswered(v: AnswerValue | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0; // dimensions: any measurement in
  return true;
}

/** Whether a question has its whole answer: a dimensions question needs every measurement it asks for. */
export function isComplete(q: Question, v: AnswerValue | undefined): boolean {
  if (q.type === 'dimensions') return typeof v === 'object' && v !== null && !Array.isArray(v) && q.parts.every(p => typeof (v as Record<string, unknown>)[p] === 'number');
  return isAnswered(v);
}

export interface NewRecordParams {
  id: string;
  form: FormDef;
  eventKey: string;
  team: number;
  scout: string;
  deviceId: string;
  now: string;
  matchKey?: string;
  slot?: Slot;
}

export function newRecord(p: NewRecordParams): ScoutRecord {
  return {
    id: p.id,
    revision: 1,
    kind: p.form.kind,
    eventKey: p.eventKey,
    formVersion: p.form.version,
    matchKey: p.matchKey,
    slot: p.slot,
    team: p.team,
    scout: p.scout,
    deviceId: p.deviceId,
    noShow: false,
    answers: initialAnswers(p.form),
    missed: [],
    photoIds: [],
    createdAt: p.now,
    updatedAt: p.now,
  };
}

export function setAnswer(rec: ScoutRecord, key: string, value: AnswerValue): ScoutRecord {
  return { ...rec, answers: { ...rec.answers, [key]: value }, missed: rec.missed.filter(k => k !== key) };
}

export function markMissed(rec: ScoutRecord, key: string): ScoutRecord {
  return {
    ...rec,
    answers: { ...rec.answers, [key]: null },
    missed: rec.missed.includes(key) ? rec.missed : [...rec.missed, key],
  };
}

export function unmarkMissed(form: FormDef, rec: ScoutRecord, key: string): ScoutRecord {
  const q = findQuestion(form, key);
  return {
    ...rec,
    answers: { ...rec.answers, [key]: q ? initialValue(q) : null },
    missed: rec.missed.filter(k => k !== key),
  };
}

export function unansweredRequired(form: FormDef, rec: ScoutRecord): string[] {
  return allQuestions(form)
    .filter(q => q.required && !rec.missed.includes(q.key) && !isComplete(q, rec.answers[q.key]))
    .map(q => q.key);
}

export function finalizeSubmit(form: FormDef, rec: ScoutRecord, now: string): ScoutRecord {
  if (rec.noShow) return { ...rec, updatedAt: now };
  const add = unansweredRequired(form, rec);
  return {
    ...rec,
    answers: { ...rec.answers, ...Object.fromEntries(add.map(k => [k, null])) },
    missed: [...rec.missed, ...add],
    updatedAt: now,
  };
}

export function markNoShow(rec: ScoutRecord, now: string): ScoutRecord {
  return { ...rec, noShow: true, answers: {}, missed: [], updatedAt: now };
}

export function reviseRecord(rec: ScoutRecord, now: string): ScoutRecord {
  return { ...rec, revision: rec.revision + 1, updatedAt: now };
}

export function undoNoShow(form: FormDef, rec: ScoutRecord, now: string): ScoutRecord {
  return { ...reviseRecord(rec, now), noShow: false, formVersion: form.version, answers: initialAnswers(form), missed: [] };
}

export function checkRecord(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ['record is not an object'];
  const r = value as Record<string, unknown>;
  const e: string[] = [];
  const str = (k: string) => { if (typeof r[k] !== 'string' || r[k] === '') e.push(`${k} must be a non-empty string`); };
  const int = (k: string, min: number) => { if (!Number.isInteger(r[k]) || (r[k] as number) < min) e.push(`${k} must be an integer >= ${min}`); };

  str('id');
  int('revision', 1);
  int('formVersion', 1);
  str('eventKey');
  int('team', 1);
  str('deviceId');
  str('createdAt');
  str('updatedAt');
  if (typeof r.scout !== 'string') e.push('scout must be a string');
  if (r.kind !== 'match' && r.kind !== 'pit') e.push('kind must be "match" or "pit"');
  if (typeof r.noShow !== 'boolean') e.push('noShow must be a boolean');
  if (typeof r.answers !== 'object' || r.answers === null || Array.isArray(r.answers)) e.push('answers must be an object');
  for (const k of ['missed', 'photoIds']) {
    const v = r[k];
    if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) e.push(`${k} must be a list of strings`);
  }
  if (r.kind === 'match') {
    if (typeof r.matchKey !== 'string' || normalizeMatchKey(r.matchKey) !== r.matchKey) e.push('matchKey must be a match key like "qm12"');
    if (!SLOTS.includes(r.slot as Slot)) e.push(`slot must be one of ${SLOTS.join(', ')}`);
  }
  return e;
}
