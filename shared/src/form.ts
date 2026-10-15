import type { AnswerValue, Answers, FormDef, Question, SummaryKind } from './types';

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
    case 'toggle': return q.default;
    default: return null;
  }
}

export function initialAnswers(form: FormDef): Answers {
  return Object.fromEntries(allQuestions(form).map(q => [q.key, initialValue(q)]));
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

function typeErrors(q: Question, form: FormDef): string[] {
  const e: string[] = [];
  switch (q.type) {
    case 'counter':
      if (!isNum(q.min)) e.push('min must be a number');
      if (!isNum(q.default)) e.push('default must be a number');
      if (q.max !== undefined && !isNum(q.max)) e.push('max must be a number');
      if (!(q.step > 0)) e.push('step must be greater than 0');
      if (q.max !== undefined && q.max < q.min) e.push('max must be at least min');
      if (isNum(q.min) && isNum(q.default) && (q.default < q.min || (q.max !== undefined && q.default > q.max))) e.push('default must be between min and max');
      break;
    case 'toggle':
      if (typeof q.default !== 'boolean') e.push('default must be true or false');
      break;
    case 'choice':
    case 'multi': {
      if (!Array.isArray(q.options) || q.options.length === 0) {
        e.push('needs at least one option');
        break;
      }
      const values = q.options.map(o => o.value);
      if (values.some(v => !v.trim())) e.push('option values must not be empty');
      if (new Set(values).size !== values.length) e.push('option values must be unique');
      break;
    }
    case 'number':
      if ((q.min !== undefined && !isNum(q.min)) || (q.max !== undefined && !isNum(q.max))) e.push('min and max must be numbers');
      if (q.min !== undefined && q.max !== undefined && q.max < q.min) e.push('max must be at least min');
      break;
    case 'rating':
      if (!(Number.isInteger(q.max) && q.max >= 2 && q.max <= 10)) e.push('max must be a whole number from 2 to 10');
      break;
    case 'fieldmap':
      if (!(q.assetId in form.assets)) e.push('field image is missing');
      if (!(Number.isInteger(q.maxPoints) && q.maxPoints >= 1)) e.push('maxPoints must be at least 1');
      if (q.redSide !== 'left' && q.redSide !== 'right') e.push("redSide must be 'left' or 'right'");
      break;
    case 'text':
    case 'timer':
      break;
    default:
      e.push(`unknown type "${String((q as { type: unknown }).type)}"`);
  }
  return e;
}

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
    const where = `Question "${q.key}"`;
    if (!KEY_RE.test(q.key)) errors.push(`${where}: key must start with a lowercase letter and contain only a-z, 0-9 and _`);
    if (keys.has(q.key)) errors.push(`${where}: duplicate key`);
    keys.add(q.key);
    if (!q.label.trim()) errors.push(`${where}: label is empty`);
    if (typeof q.required !== 'boolean') errors.push(`${where}: required must be true or false`);
    for (const msg of typeErrors(q, form)) errors.push(`${where}: ${msg}`);
  }

  const previous = new Map<string, { type: string; version: number }>();
  for (const f of [...earlier].sort((a, b) => a.version - b.version)) {
    if (f.kind !== form.kind) continue;
    for (const q of allQuestions(f)) previous.set(q.key, { type: q.type, version: f.version });
  }
  for (const q of questions) {
    const prev = previous.get(q.key);
    if (prev && prev.type !== q.type) {
      warnings.push(`Question "${q.key}" was a ${prev.type} in version ${prev.version} but is now a ${q.type}; older answers will be left out of summaries`);
    }
  }
  return { errors, warnings };
}
