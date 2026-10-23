import { describe, expect, it } from 'vitest';
import { allQuestions, counterJumps, findQuestion, initialAnswers, SUMMARY_NAMES, summaryKind, summaryOptions, validateFormDef } from '../src/form';
import { matchForm, pitForm } from './fixtures';

describe('initialAnswers', () => {
  it('starts counters and toggles at their defaults and everything else empty', () => {
    expect(initialAnswers(matchForm())).toEqual({
      auto_leave: false, auto_coral: 0, start_pos: null, climb: null,
      climb_time: null, defense: null, zones: null, comments: null,
    });
  });
});

describe('summaryKind', () => {
  it('defaults by question type', () => {
    const f = matchForm();
    const keys = ['auto_leave', 'auto_coral', 'start_pos', 'climb', 'climb_time', 'defense', 'zones', 'comments'];
    expect(keys.map(k => summaryKind(findQuestion(f, k)!)))
      .toEqual(['pct', 'avg', 'scatter', 'distribution', 'avg', 'avg', 'distribution', 'list']);
  });
  it('respects an explicit summary', () => {
    const q = findQuestion(matchForm(), 'auto_coral')!;
    q.summary = 'none';
    expect(summaryKind(q)).toBe('none');
  });
});

describe('validateFormDef', () => {
  it('accepts the sample forms', () => {
    expect(validateFormDef(matchForm())).toEqual({ errors: [], warnings: [] });
    expect(validateFormDef(pitForm())).toEqual({ errors: [], warnings: [] });
  });

  it('rejects duplicate and badly formed keys', () => {
    const f = matchForm();
    f.sections[1].questions[0].key = 'auto_coral';
    f.sections[2].questions[0].key = 'Defense Rating';
    const { errors } = validateFormDef(f);
    expect(errors).toContain('Climb: Key is used by another question');
    expect(errors.some(e => e.startsWith('Defense rating: Key must start with a lowercase letter'))).toBe(true);
  });

  it('rejects a form with no questions', () => {
    expect(validateFormDef({ kind: 'pit', version: 1, sections: [], assets: {} }).errors).toContain('Form has no questions');
  });

  it('checks type-specific settings', () => {
    const f = matchForm();
    const coral = findQuestion(f, 'auto_coral');
    const climb = findQuestion(f, 'climb');
    const defense = findQuestion(f, 'defense');
    if (coral?.type !== 'counter' || climb?.type !== 'choice' || defense?.type !== 'rating') throw new Error('fixture changed');
    coral.default = -1;
    climb.options = [];
    defense.max = 1;
    delete f.assets.field;
    expect(validateFormDef(f).errors).toEqual([
      'Coral scored: Default must be at least Min',
      'Start position: Choose a field image',
      'Climb: Add at least one option',
      'Defense rating: Highest rating must be a whole number from 2 to 10',
    ]);
  });

  it('rejects structurally invalid questions', () => {
    const f = matchForm();
    f.sections[0].questions.push(
      { key: 'odd', label: 'Odd', type: 'bogus', required: false } as never,
      { key: 'loose', label: 'Loose', type: 'counter', required: 'yes', step: 1 } as never,
      { key: 'pick', label: 'Pick', type: 'choice', required: false, display: 'buttons' } as never,
    );
    expect(validateFormDef(f).errors).toEqual([
      'Odd: Unknown type "bogus"',
      'Loose: Required must be true or false',
      'Loose: Min must be a number',
      'Loose: Default must be a number',
      'Pick: Add at least one option',
    ]);
  });

  it('checks which side Red is on in a field image', () => {
    const f = matchForm();
    const map = findQuestion(f, 'start_pos');
    if (map?.type !== 'fieldmap') throw new Error('fixture changed');
    (map as { redSide: string }).redSide = 'top';
    expect(validateFormDef(f).errors).toEqual(['Start position: Red side must be left or right']);
  });

  it('needs Max to be greater than Min, since equal limits allow only one answer', () => {
    const f = matchForm();
    const coral = findQuestion(f, 'auto_coral');
    if (coral?.type !== 'counter') throw new Error('fixture changed');
    coral.max = 0; // same as min
    f.sections[0].questions.push({ key: 'weight', label: 'Weight', type: 'number', required: false, integer: false, min: 5, max: 5 });
    expect(validateFormDef(f).errors).toEqual(['Coral scored: Max must be greater than Min', 'Weight: Max must be greater than Min']);
  });

  it('warns when a key changes type between versions', () => {
    const v1 = matchForm(1);
    const v2 = matchForm(2);
    v2.sections[0].questions[1] = { key: 'auto_coral', label: 'Coral scored', type: 'toggle', required: true, default: false };
    expect(validateFormDef(v2, [v1]).warnings).toEqual([
      'Coral scored was a counter in version 1 and is now a toggle, so its older answers are left out of summaries',
    ]);
  });
});

describe('summaryOptions', () => {
  it('offers only the summaries that work for each type', () => {
    expect(summaryOptions('counter')).toEqual(['avg', 'list', 'none']);
    expect(summaryOptions('number')).toEqual(['avg', 'list', 'none']);
    expect(summaryOptions('rating')).toEqual(['avg', 'list', 'none']);
    expect(summaryOptions('timer')).toEqual(['avg', 'list', 'none']);
    expect(summaryOptions('toggle')).toEqual(['pct', 'none']);
    expect(summaryOptions('choice')).toEqual(['distribution', 'none']);
    expect(summaryOptions('multi')).toEqual(['distribution', 'none']);
    expect(summaryOptions('text')).toEqual(['list', 'none']);
    expect(summaryOptions('fieldmap')).toEqual(['scatter', 'none']);
  });

  it("puts each type's default first", () => {
    for (const q of allQuestions(matchForm())) expect(summaryOptions(q.type)[0]).toBe(summaryKind({ ...q, summary: undefined }));
  });

  it('names every summary for people', () => {
    expect(SUMMARY_NAMES).toEqual({
      avg: 'Average and max', pct: 'Percent yes', distribution: 'How often each option', list: 'List of answers',
      scatter: 'Field map plot', none: "Don't summarize",
    });
  });
});

describe('validateFormDef: summaries', () => {
  it("refuses a summary that doesn't work for the question's type", () => {
    const form = matchForm();
    const defense = allQuestions(form).find(q => q.key === 'defense')!;
    defense.summary = 'scatter';
    expect(validateFormDef(form).errors).toContain('Defense rating: Summary "Field map plot" doesn\'t work for this type of question');
  });

  it('accepts every summary a type offers', () => {
    const form = matchForm();
    const defense = allQuestions(form).find(q => q.key === 'defense')!;
    for (const s of summaryOptions('rating')) {
      defense.summary = s;
      expect(validateFormDef(form).errors).toEqual([]);
    }
  });
});

describe('defaults', () => {
  const withQuestion = (key: string) => {
    const f = [matchForm(), pitForm()].find(form => findQuestion(form, key))!;
    return { f, q: findQuestion(f, key)! };
  };

  it('starts each answer at its default, or blank when there is none', () => {
    const { f, q } = withQuestion('auto_leave');
    if (q.type !== 'toggle') throw new Error('fixture changed');
    delete q.default;
    expect(initialAnswers(f).auto_leave).toBeNull();
    q.default = true;
    expect(initialAnswers(f).auto_leave).toBe(true);

    const climb = withQuestion('climb');
    if (climb.q.type !== 'choice') throw new Error('fixture changed');
    expect(initialAnswers(climb.f).climb).toBeNull();
    climb.q.default = 'shallow';
    expect(initialAnswers(climb.f).climb).toBe('shallow');

    const defense = withQuestion('defense');
    if (defense.q.type !== 'rating') throw new Error('fixture changed');
    defense.q.default = 3;
    expect(initialAnswers(defense.f).defense).toBe(3);

    const weight = withQuestion('weight_lb');
    if (weight.q.type !== 'number') throw new Error('fixture changed');
    weight.q.default = 120;
    expect(initialAnswers(weight.f).weight_lb).toBe(120);
  });

  it('accepts a Yes / No question with no default', () => {
    const { f, q } = withQuestion('auto_leave');
    if (q.type !== 'toggle') throw new Error('fixture changed');
    delete q.default;
    expect(validateFormDef(f).errors).toEqual([]);
  });

  it('refuses defaults that do not fit the question', () => {
    const climb = withQuestion('climb');
    if (climb.q.type !== 'choice') throw new Error('fixture changed');
    climb.q.default = 'ladder';
    expect(validateFormDef(climb.f).errors).toEqual(['Climb: Default must be one of the options']);

    const defense = withQuestion('defense');
    if (defense.q.type !== 'rating') throw new Error('fixture changed');
    defense.q.default = 6; // highest rating is 5
    expect(validateFormDef(defense.f).errors).toEqual(['Defense rating: Default must be a whole number from 1 to the highest rating']);

    const weight = withQuestion('weight_lb');
    if (weight.q.type !== 'number') throw new Error('fixture changed');
    weight.q.default = 250; // max 200
    expect(validateFormDef(weight.f).errors).toEqual(['Weight (lb): Default must be between Min and Max']);
    weight.q.default = 120.5;
    weight.q.integer = true;
    expect(validateFormDef(weight.f).errors).toEqual(['Weight (lb): Default must be a whole number']);
  });
});

describe('counterJumps', () => {
  const counter = (over: { min?: number; max?: number; step?: number }) =>
    ({ key: 'c', label: 'C', type: 'counter' as const, required: false, min: 0, step: 1, default: 0, ...over });

  it('offers 5× and 10× the step only when the range is at least twice the jump', () => {
    expect(counterJumps(counter({ max: 3 }))).toEqual([1]);
    expect(counterJumps(counter({ max: 9 }))).toEqual([1]);
    expect(counterJumps(counter({ max: 10 }))).toEqual([1, 5]);
    expect(counterJumps(counter({ max: 19 }))).toEqual([1, 5]);
    expect(counterJumps(counter({ max: 20 }))).toEqual([1, 5, 10]);
    expect(counterJumps(counter({ min: 5, max: 24, step: 2 }))).toEqual([1]); // 19 is less than 10 steps of 2
    expect(counterJumps(counter({ min: 0, max: 40, step: 2 }))).toEqual([1, 5, 10]);
  });

  it('offers all three when there is no maximum', () => {
    expect(counterJumps(counter({ step: 2 }))).toEqual([1, 5, 10]);
  });
});
