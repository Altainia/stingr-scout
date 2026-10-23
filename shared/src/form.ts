import type { AnswerValue, Answers, CounterQuestion, FormDef, Question, SummaryKind } from './types';

const KEY_RE = /^[a-z][a-z0-9_]*$/;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function allQuestions(form: FormDef): Question[] {
  return form.sections.flatMap(s => s.questions);
}

export function findQuestion(form: FormDef, key: string): Question | undefined {
  return allQuestions(form).find(q => q.key === key);
}

export function initialValue(q: Question): AnswerValue {
  switch (q.type) {
    case 'counter': return q.default;
    case 'toggle': case 'choice': case 'number': case 'rating': return q.default ?? null;
    default: return null;
  }
}

export function initialAnswers(form: FormDef): Answers {
  return Object.fromEntries(allQuestions(form).map(q => [q.key, initialValue(q)]));
}

/**
 * The jumps a counter offers, as multiples of its step: always 1×, plus 5× and 10× when the range is at least twice
 * the jump (so one tap never covers more than half of it). An open-ended counter (no Max) offers all three.
 */
export function counterJumps(q: CounterQuestion): number[] {
  if (q.max === undefined) return [1, 5, 10];
  const range = q.max - q.min;
  return [1, 5, 10].filter(m => m === 1 || range >= 2 * m * q.step);
}

/** What each summary is called in the hub. */
export const SUMMARY_NAMES: Record<SummaryKind, string> = {
  avg: 'Average and max', pct: 'Percent yes', distribution: 'How often each option', list: 'List of answers',
  scatter: 'Field map plot', none: "Don't summarize",
};

/** The summaries that give a meaningful result for a type of question, its default first. */
export function summaryOptions(type: Question['type']): SummaryKind[] {
  switch (type) {
    case 'counter': case 'number': case 'rating': case 'timer': return ['avg', 'list', 'none'];
    case 'toggle': return ['pct', 'none'];
    case 'choice': case 'multi': return ['distribution', 'none'];
    case 'text': return ['list', 'none'];
    case 'fieldmap': return ['scatter', 'none'];
  }
}

function defaultSummary(q: Question): SummaryKind {
  switch (q.type) {
    case 'counter': case 'number': case 'rating': case 'timer': return 'avg';
    case 'toggle': return 'pct';
    case 'choice': case 'multi': return 'distribution';
    case 'text': return 'list';
    case 'fieldmap': return 'scatter';
  }
}

export function summaryKind(q: Question): SummaryKind {
  return q.summary ?? defaultSummary(q);
}

/** Problems with one question, worded with the field names the hub's form editor shows. */
function typeErrors(q: Question, form: FormDef): string[] {
  const e: string[] = [];
  switch (q.type) {
    case 'counter':
      if (!isNum(q.min)) e.push('Min must be a number');
      if (!isNum(q.default)) e.push('Default must be a number');
      if (q.max !== undefined && !isNum(q.max)) e.push('Max must be a number');
      if (!(q.step > 0)) e.push('Step must be greater than 0');
      if (q.max !== undefined && q.max <= q.min) e.push('Max must be greater than Min');
      else if (isNum(q.min) && isNum(q.default)) {
        if (q.max === undefined && q.default < q.min) e.push('Default must be at least Min');
        if (q.max !== undefined && (q.default < q.min || q.default > q.max)) e.push('Default must be between Min and Max');
      }
      break;
    case 'toggle':
      if (q.default !== undefined && typeof q.default !== 'boolean') e.push('Default must be Yes or No');
      break;
    case 'choice':
    case 'multi': {
      if (!Array.isArray(q.options) || q.options.length === 0) {
        e.push('Add at least one option');
        break;
      }
      const values = q.options.map(o => o.value);
      if (values.some(v => !v.trim())) e.push('Option values can\'t be empty');
      if (new Set(values).size !== values.length) e.push('Option values must all be different');
      if (q.type === 'choice' && q.default !== undefined && !values.includes(q.default)) e.push('Default must be one of the options');
      break;
    }
    case 'number':
      if ((q.min !== undefined && !isNum(q.min)) || (q.max !== undefined && !isNum(q.max))) e.push('Min and Max must be numbers');
      else if (q.min !== undefined && q.max !== undefined && q.max <= q.min) e.push('Max must be greater than Min');
      else if (q.default !== undefined) {
        if (!isNum(q.default)) e.push('Default must be a number');
        else if ((q.min !== undefined && q.default < q.min) || (q.max !== undefined && q.default > q.max)) {
          e.push(q.min !== undefined && q.max !== undefined ? 'Default must be between Min and Max' : q.min !== undefined ? 'Default must be at least Min' : 'Default must be at most Max');
        } else if (q.integer && !Number.isInteger(q.default)) e.push('Default must be a whole number');
      }
      break;
    case 'rating':
      if (!(Number.isInteger(q.max) && q.max >= 2 && q.max <= 10)) e.push('Highest rating must be a whole number from 2 to 10');
      else if (q.default !== undefined && !(Number.isInteger(q.default) && q.default >= 1 && q.default <= q.max)) {
        e.push('Default must be a whole number from 1 to the highest rating');
      }
      break;
    case 'fieldmap':
      if (!(q.assetId in form.assets)) e.push('Choose a field image');
      if (!(Number.isInteger(q.maxPoints) && q.maxPoints >= 1)) e.push('Points to mark must be at least 1');
      if (q.redSide !== 'left' && q.redSide !== 'right') e.push('Red side must be left or right');
      break;
    case 'text':
    case 'timer':
      break;
    default:
      e.push(`Unknown type "${String((q as { type: unknown }).type)}"`);
  }
  return e;
}

/** How problems refer to a question: its label, or its key when the label is empty. */
const questionName = (q: Question): string => (typeof q.label === 'string' && q.label.trim() ? q.label.trim() : q.key);

export function validateFormDef(form: FormDef, earlier: FormDef[] = []): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const questions = allQuestions(form);
  if (questions.length === 0) errors.push('Form has no questions');

  const sectionIds = new Set<string>();
  for (const s of form.sections) {
    if (!s.id.trim()) errors.push('A section has an empty id');
    else if (sectionIds.has(s.id)) errors.push(`Duplicate section id "${s.id}"`);
    sectionIds.add(s.id);
    if (!s.title.trim()) errors.push(`Section "${s.id}" has no title`);
  }

  const keys = new Set<string>();
  for (const q of questions) {
    const where = questionName(q);
    if (!KEY_RE.test(q.key)) errors.push(`${where}: Key must start with a lowercase letter and use only a-z, 0-9 and _`);
    if (keys.has(q.key)) errors.push(`${where}: Key is used by another question`);
    keys.add(q.key);
    if (!q.label.trim()) errors.push(`${where}: Label is empty`);
    if (typeof q.required !== 'boolean') errors.push(`${where}: Required must be true or false`);
    for (const msg of typeErrors(q, form)) errors.push(`${where}: ${msg}`);
    if (q.summary !== undefined && !summaryOptions(q.type).includes(q.summary)) {
      errors.push(`${where}: Summary "${SUMMARY_NAMES[q.summary] ?? q.summary}" doesn't work for this type of question`);
    }
  }

  const previous = new Map<string, { type: string; version: number }>();
  for (const f of [...earlier].sort((a, b) => a.version - b.version)) {
    if (f.kind !== form.kind) continue;
    for (const q of allQuestions(f)) previous.set(q.key, { type: q.type, version: f.version });
  }
  for (const q of questions) {
    const prev = previous.get(q.key);
    if (prev && prev.type !== q.type) {
      warnings.push(`${questionName(q)} was a ${prev.type} in version ${prev.version} and is now a ${q.type}, so its older answers are left out of summaries`);
    }
  }
  return { errors, warnings };
}
