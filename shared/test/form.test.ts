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
    expect(errors).toContain('Question "auto_coral": duplicate key');
    expect(errors.some(e => e.startsWith('Question "Defense Rating": key must'))).toBe(true);
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
      'Question "auto_coral": default must be between min and max',
      'Question "start_pos": field image is missing',
      'Question "climb": needs at least one option',
      'Question "defense": max must be a whole number from 2 to 10',
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
      'Question "odd": unknown type "bogus"',
      'Question "loose": required must be true or false',
      'Question "loose": min must be a number',
      'Question "loose": default must be a number',
      'Question "pick": needs at least one option',
    ]);
  });

  it('warns when a key changes type between versions', () => {
    const v1 = matchForm(1);
    const v2 = matchForm(2);
    v2.sections[0].questions[1] = { key: 'auto_coral', label: 'Coral scored', type: 'toggle', required: true, default: false };
    expect(validateFormDef(v2, [v1]).warnings).toEqual([
      'Question "auto_coral" was a counter in version 1 but is now a toggle; older answers will be left out of summaries',
    ]);
  });
});
