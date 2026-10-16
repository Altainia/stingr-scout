import { describe, expect, it } from 'vitest';
import { findQuestion, initialAnswers, summaryKind, validateFormDef } from '../src/form';
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
