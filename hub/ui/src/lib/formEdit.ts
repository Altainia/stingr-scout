import {
  allQuestions, type ChoiceOption, type ChoiceQuestion, type FormDef, type FormKind, type MultiQuestion,
  type Question, type QuestionType, type Section,
} from '@stingr/shared';

export const QUESTION_TYPES: { type: QuestionType; label: string }[] = [
  { type: 'counter', label: 'Counter (+/−)' },
  { type: 'toggle', label: 'Yes / No' },
  { type: 'choice', label: 'Single choice' },
  { type: 'multi', label: 'Multi-select' },
  { type: 'number', label: 'Number' },
  { type: 'text', label: 'Text' },
  { type: 'rating', label: 'Rating' },
  { type: 'timer', label: 'Timer' },
  { type: 'fieldmap', label: 'Field map' },
];

export const typeLabel = (t: QuestionType): string => QUESTION_TYPES.find(x => x.type === t)?.label ?? t;

export interface Selection { si: number; qi: number | null }

export function slugify(label: string): string {
  const s = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!s) return 'question';
  return /^[a-z]/.test(s) ? s : `q_${s}`;
}

export function uniqueKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}_${i}`)) return `${base}_${i}`;
}

export const questionKeys = (f: FormDef): string[] => allQuestions(f).map(q => q.key);

export function emptyForm(kind: FormKind): FormDef {
  const titles = kind === 'match' ? ['Auto', 'Teleop', 'Endgame'] : ['Robot'];
  return { kind, version: 0, assets: {}, sections: titles.map(t => ({ id: slugify(t), title: t, questions: [] })) };
}

const starterOptions = (): ChoiceOption[] => [{ value: 'option_1', label: 'Option 1' }, { value: 'option_2', label: 'Option 2' }];

export function newQuestion(type: QuestionType, label: string, taken: Iterable<string>): Question {
  const base = { key: uniqueKey(slugify(label), taken), label, required: false };
  switch (type) {
    case 'counter': return { ...base, type, min: 0, step: 1, default: 0 };
    case 'toggle': return { ...base, type, default: false };
    case 'choice': return { ...base, type, display: 'buttons', options: starterOptions() };
    case 'multi': return { ...base, type, options: starterOptions() };
    case 'number': return { ...base, type, integer: true };
    case 'text': return { ...base, type, multiline: false };
    case 'rating': return { ...base, type, max: 5 };
    case 'timer': return { ...base, type };
    case 'fieldmap': return { ...base, type, assetId: '', maxPoints: 1, redSide: 'left' };
  }
}

export function changeType(q: Question, type: QuestionType): Question {
  const fresh = newQuestion(type, q.label, []);
  return { ...fresh, key: q.key, required: q.required, ...(q.help ? { help: q.help } : {}) } as Question;
}

function swap<T>(list: T[], i: number, j: number): T[] {
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

const withSection = (f: FormDef, si: number, fn: (s: Section) => Section): FormDef =>
  ({ ...f, sections: f.sections.map((s, i) => (i === si ? fn(s) : s)) });

export function addSection(f: FormDef, title = 'New section'): FormDef {
  const id = uniqueKey(slugify(title), f.sections.map(s => s.id));
  return { ...f, sections: [...f.sections, { id, title, questions: [] }] };
}

export const renameSection = (f: FormDef, si: number, title: string): FormDef => withSection(f, si, s => ({ ...s, title }));
export const removeSection = (f: FormDef, si: number): FormDef => ({ ...f, sections: f.sections.filter((_, i) => i !== si) });
export const moveSection = (f: FormDef, si: number, delta: -1 | 1): FormDef => {
  const sections = swap(f.sections, si, si + delta);
  return sections === f.sections ? f : { ...f, sections };
};

export function addQuestion(f: FormDef, si: number, type: QuestionType, label = 'New question'): FormDef {
  const q = newQuestion(type, label, questionKeys(f));
  return withSection(f, si, s => ({ ...s, questions: [...s.questions, q] }));
}

export const replaceQuestion = (f: FormDef, si: number, qi: number, q: Question): FormDef =>
  withSection(f, si, s => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? q : x)) }));

export const removeQuestion = (f: FormDef, si: number, qi: number): FormDef =>
  withSection(f, si, s => ({ ...s, questions: s.questions.filter((_, i) => i !== qi) }));

/** Move a question up or down; at the end of a section it moves into the neighbouring section. */
export function moveQuestion(f: FormDef, si: number, qi: number, delta: -1 | 1): { form: FormDef; si: number; qi: number } {
  const section = f.sections[si];
  const target = qi + delta;
  if (target >= 0 && target < section.questions.length) {
    return { form: withSection(f, si, s => ({ ...s, questions: swap(s.questions, qi, target) })), si, qi: target };
  }
  const ti = si + delta;
  if (ti < 0 || ti >= f.sections.length) return { form: f, si, qi };
  const q = section.questions[qi];
  const without = removeQuestion(f, si, qi);
  const into = withSection(without, ti, s => ({ ...s, questions: delta < 0 ? [...s.questions, q] : [q, ...s.questions] }));
  return { form: into, si: ti, qi: delta < 0 ? into.sections[ti].questions.length - 1 : 0 };
}

/** Drag and drop: `to.qi` is where the question goes in the target section as it looks before the move. */
export function moveQuestionTo(f: FormDef, from: { si: number; qi: number }, to: { si: number; qi: number }): { form: FormDef; si: number; qi: number } {
  const q = f.sections[from.si].questions[from.qi];
  const same = from.si === to.si;
  const at = same && to.qi > from.qi ? to.qi - 1 : to.qi;
  if (same && at === from.qi) return { form: f, si: from.si, qi: from.qi };
  const without = removeQuestion(f, from.si, from.qi);
  const form = withSection(without, to.si, s => ({ ...s, questions: [...s.questions.slice(0, at), q, ...s.questions.slice(at)] }));
  return { form, si: to.si, qi: at };
}

/** Drag and drop: `to` is where the section goes in the list as it looks before the move. */
export function moveSectionTo(f: FormDef, from: number, to: number): FormDef {
  const at = to > from ? to - 1 : to;
  if (at === from) return f;
  const moving = f.sections[from];
  const rest = f.sections.filter((_, i) => i !== from);
  return { ...f, sections: [...rest.slice(0, at), moving, ...rest.slice(at)] };
}

const followsLabel = (key: string, label: string) => new RegExp(`^${slugify(label)}(_\\d+)?$`).test(key);

/** Rename a question. Its key follows the label only while unpublished and still derived from the old label. */
export function renameQuestion(f: FormDef, q: Question, label: string, locked: boolean): Question {
  if (locked || !followsLabel(q.key, q.label)) return { ...q, label };
  const taken = questionKeys(f).filter(k => k !== q.key);
  return { ...q, label, key: uniqueKey(slugify(label), taken) };
}

type WithOptions = ChoiceQuestion | MultiQuestion;

export function addOption<Q extends WithOptions>(q: Q, label = `Option ${q.options.length + 1}`): Q {
  const value = uniqueKey(slugify(label), q.options.map(o => o.value));
  return { ...q, options: [...q.options, { value, label }] } as Q;
}

export function renameOption<Q extends WithOptions>(q: Q, i: number, label: string, locked: boolean): Q {
  const o = q.options[i];
  const value = !locked && followsLabel(o.value, o.label)
    ? uniqueKey(slugify(label), q.options.filter((_, k) => k !== i).map(x => x.value))
    : o.value;
  return { ...q, options: q.options.map((x, k) => (k === i ? { ...x, label, value } : x)) } as Q;
}

export function setOptionValue<Q extends WithOptions>(q: Q, i: number, value: string): Q {
  return { ...q, options: q.options.map((x, k) => (k === i ? { ...x, value } : x)) } as Q;
}

export function setOptionPoints(q: ChoiceQuestion, i: number, points: number | undefined): ChoiceQuestion {
  return {
    ...q,
    options: q.options.map((x, k) => {
      if (k !== i) return x;
      const { points: _old, ...rest } = x;
      return points === undefined ? rest : { ...rest, points };
    }),
  };
}

export const removeOption = <Q extends WithOptions>(q: Q, i: number): Q => ({ ...q, options: q.options.filter((_, k) => k !== i) }) as Q;
export const moveOption = <Q extends WithOptions>(q: Q, i: number, delta: -1 | 1): Q => ({ ...q, options: swap(q.options, i, i + delta) }) as Q;

export function setFieldImage(f: FormDef, si: number, qi: number, dataUrl: string): FormDef {
  const q = f.sections[si].questions[qi];
  if (q.type !== 'fieldmap') return f;
  const assetId = q.assetId || uniqueKey(`field_${q.key}`, Object.keys(f.assets));
  return { ...replaceQuestion(f, si, qi, { ...q, assetId }), assets: { ...f.assets, [assetId]: dataUrl } };
}

export function pruneAssets(f: FormDef): FormDef {
  const used = new Set(allQuestions(f).flatMap(q => (q.type === 'fieldmap' && q.assetId ? [q.assetId] : [])));
  return { ...f, assets: Object.fromEntries(Object.entries(f.assets).filter(([id]) => used.has(id))) };
}
