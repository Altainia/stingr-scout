import { type ChoiceQuestion, type CounterQuestion, validateFormDef } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm } from '../../../shared/test/fixtures';
import {
  addOption, addQuestion, addSection, changeType, emptyForm, moveOption, moveQuestion, moveQuestionTo, moveSection, moveSectionTo, newQuestion,
  pruneAssets, QUESTION_TYPES, removeOption, removeQuestion, removeSection, renameOption, renameQuestion, renameSection,
  setFieldImage, setOptionPoints, setOptionValue, slugify, uniqueKey,
} from '../src/lib/formEdit';

describe('keys', () => {
  it('turns labels into keys', () => {
    expect(slugify('Coral scored!')).toBe('coral_scored');
    expect(slugify('  2nd climb ')).toBe('q_2nd_climb');
    expect(slugify('!!!')).toBe('question');
  });
  it('makes keys unique', () => {
    expect(uniqueKey('a', [])).toBe('a');
    expect(uniqueKey('a', ['a', 'a_2'])).toBe('a_3');
  });
});

describe('sections', () => {
  it('starts each kind of form with sensible sections', () => {
    expect(emptyForm('match').sections.map(s => [s.id, s.title])).toEqual([['auto', 'Auto'], ['teleop', 'Teleop'], ['endgame', 'Endgame']]);
    expect(emptyForm('pit').sections.map(s => s.title)).toEqual(['Robot']);
  });
  it('adds, renames, moves and removes sections', () => {
    let f = addSection(emptyForm('pit'), 'Robot');
    expect(f.sections.map(s => s.id)).toEqual(['robot', 'robot_2']);
    f = renameSection(f, 1, 'Drive team');
    f = moveSection(f, 1, -1);
    expect(f.sections.map(s => s.title)).toEqual(['Drive team', 'Robot']);
    expect(moveSection(f, 0, -1)).toEqual(f);
    expect(removeSection(f, 0).sections.map(s => s.title)).toEqual(['Robot']);
  });
});

describe('questions', () => {
  it('adds a question with defaults and a unique key', () => {
    let f = addQuestion(emptyForm('match'), 0, 'counter');
    f = addQuestion(f, 1, 'counter');
    expect(f.sections[0].questions[0]).toEqual({ key: 'new_question', label: 'New question', required: false, type: 'counter', min: 0, step: 1, default: 0 });
    expect(f.sections[1].questions[0].key).toBe('new_question_2');
  });

  it('gives every type a valid starting point', () => {
    const f = emptyForm('match');
    f.sections[0].questions = QUESTION_TYPES.filter(t => t.type !== 'fieldmap').map((t, i) => newQuestion(t.type, `Q ${i}`, []));
    expect(validateFormDef(f).errors).toEqual([]);
    expect(newQuestion('fieldmap', 'Start', [])).toMatchObject({ type: 'fieldmap', assetId: '', maxPoints: 1, redSide: 'left' });
  });

  it('moves questions within a section and across sections', () => {
    let f = addQuestion(addQuestion(emptyForm('match'), 0, 'counter', 'A'), 0, 'toggle', 'B');
    let r = moveQuestion(f, 0, 1, -1);
    expect(r.form.sections[0].questions.map(q => q.label)).toEqual(['B', 'A']);
    expect([r.si, r.qi]).toEqual([0, 0]);
    r = moveQuestion(r.form, 0, 1, 1); // A is last in Auto: it moves to the start of Teleop
    expect(r.form.sections[0].questions.map(q => q.label)).toEqual(['B']);
    expect(r.form.sections[1].questions.map(q => q.label)).toEqual(['A']);
    expect([r.si, r.qi]).toEqual([1, 0]);
    f = r.form;
    expect(moveQuestion(f, 0, 0, -1).form).toEqual(f); // first question of the first section stays
    expect(removeQuestion(f, 1, 0).sections[1].questions).toEqual([]);
  });

  it('drops a question at any position, in any section', () => {
    let f = emptyForm('match');
    for (const label of ['A', 'B', 'C']) f = addQuestion(f, 0, 'counter', label);
    const labels = (form: typeof f, si: number) => form.sections[si].questions.map(q => q.label);
    let r = moveQuestionTo(f, { si: 0, qi: 0 }, { si: 0, qi: 3 }); // A to the end
    expect(labels(r.form, 0)).toEqual(['B', 'C', 'A']);
    expect([r.si, r.qi]).toEqual([0, 2]);
    r = moveQuestionTo(f, { si: 0, qi: 2 }, { si: 0, qi: 0 }); // C to the top
    expect(labels(r.form, 0)).toEqual(['C', 'A', 'B']);
    r = moveQuestionTo(f, { si: 0, qi: 1 }, { si: 2, qi: 0 }); // B into Endgame
    expect(labels(r.form, 0)).toEqual(['A', 'C']);
    expect(labels(r.form, 2)).toEqual(['B']);
    expect([r.si, r.qi]).toEqual([2, 0]);
    expect(moveQuestionTo(f, { si: 0, qi: 1 }, { si: 0, qi: 2 }).form).toEqual(f); // dropped where it already was
  });

  it('drops a section at any position', () => {
    const f = emptyForm('match');
    expect(moveSectionTo(f, 0, 3).sections.map(s => s.title)).toEqual(['Teleop', 'Endgame', 'Auto']);
    expect(moveSectionTo(f, 2, 0).sections.map(s => s.title)).toEqual(['Endgame', 'Auto', 'Teleop']);
    expect(moveSectionTo(f, 1, 2)).toEqual(f);
  });

  it('changes type but keeps the key, label and required flag; a new Yes / No has no default', () => {
    const q = { ...newQuestion('counter', 'Coral', []), required: true };
    expect(changeType(q, 'toggle')).toEqual({ key: 'coral', label: 'Coral', required: true, type: 'toggle' });
  });

  it('brings back what a type was set to before, and carries nothing across types', () => {
    const counter: CounterQuestion = { ...(newQuestion('counter', 'Coral', []) as CounterQuestion), max: 12, points: 4, default: 2, summary: 'list' as const };
    const toggle = changeType(counter, 'toggle');
    expect(toggle).not.toHaveProperty('max');
    expect(toggle).not.toHaveProperty('default');
    const renamed = { ...toggle, label: 'Coral pieces', required: true };
    expect(changeType(renamed, 'counter', counter)).toEqual({ ...counter, label: 'Coral pieces', required: true });
  });

  it('never reuses a key that is in published data', () => {
    const f = addQuestion(emptyForm('match'), 0, 'counter', 'Coral scored', ['coral_scored']);
    expect(f.sections[0].questions[0].key).toBe('coral_scored_2');
    const g = addQuestion(emptyForm('match'), 0, 'counter');
    expect(renameQuestion(g, g.sections[0].questions[0], 'Coral scored', false, ['coral_scored']).key).toBe('coral_scored_2');
  });

  it('renames a new question and its key together', () => {
    const f = addQuestion(emptyForm('match'), 0, 'counter');
    const q = f.sections[0].questions[0];
    expect(renameQuestion(f, q, 'Coral scored', false)).toMatchObject({ label: 'Coral scored', key: 'coral_scored' });
  });

  it('keeps a published key when the label changes', () => {
    const f = matchForm();
    const q = f.sections[0].questions[1]; // auto_coral
    expect(renameQuestion(f, q, 'Coral pieces', true)).toMatchObject({ label: 'Coral pieces', key: 'auto_coral' });
  });

  it('keeps a key the mentor typed by hand', () => {
    const f = matchForm();
    const q = f.sections[0].questions[1]; // label "Coral scored", key "auto_coral"
    expect(renameQuestion(f, q, 'Coral pieces', false).key).toBe('auto_coral');
  });
});

describe('options', () => {
  it("keeps a choice's default on its option when the option's value changes, and clears it when the option goes", () => {
    const climb = { ...(matchForm().sections[1].questions[0] as ChoiceQuestion), default: 'shallow' };
    expect(setOptionValue(climb, 1, 'low').default).toBe('low');
    expect(renameOption({ ...climb, options: climb.options.map(o => (o.value === 'shallow' ? { ...o, value: 'shallow' } : o)) }, 1, 'Low climb', false).default)
      .toBe(renameOption(climb, 1, 'Low climb', false).options[1].value);
    expect(removeOption(climb, 1)).not.toHaveProperty('default');
    expect(removeOption(climb, 2).default).toBe('shallow');
    expect(setOptionValue(climb, 0, 'nothing').default).toBe('shallow');
  });

  const choice = newQuestion('choice', 'Climb', []) as ChoiceQuestion;

  it('adds options with unique values', () => {
    const q = addOption(addOption(choice, 'Deep'), 'Deep');
    expect(q.options.map(o => o.value)).toEqual(['option_1', 'option_2', 'deep', 'deep_2']);
  });
  it('lets the value follow the label until it is published', () => {
    expect(renameOption(choice, 0, 'Shallow', false).options[0]).toEqual({ value: 'shallow', label: 'Shallow' });
    expect(renameOption(choice, 0, 'Shallow', true).options[0]).toEqual({ value: 'option_1', label: 'Shallow' });
  });
  it('sets values and points, moves and removes', () => {
    let q = setOptionValue(choice, 1, 'deep');
    q = setOptionPoints(q, 1, 12);
    expect(q.options[1]).toEqual({ value: 'deep', label: 'Option 2', points: 12 });
    expect(setOptionPoints(q, 1, undefined).options[1]).toEqual({ value: 'deep', label: 'Option 2' });
    q = moveOption(q, 1, -1);
    expect(q.options.map(o => o.value)).toEqual(['deep', 'option_1']);
    expect(removeOption(q, 0).options.map(o => o.value)).toEqual(['option_1']);
  });
});

describe('field images', () => {
  it('stores the image as a form asset and drops unused ones', () => {
    let f = addQuestion(emptyForm('match'), 0, 'fieldmap', 'Start');
    f = setFieldImage(f, 0, 0, 'data:image/png;base64,AAA');
    const q = f.sections[0].questions[0];
    expect(q.type === 'fieldmap' && q.assetId).toBe('field_start');
    expect(f.assets).toEqual({ field_start: 'data:image/png;base64,AAA' });
    f = { ...f, assets: { ...f.assets, old: 'data:x' } };
    expect(Object.keys(pruneAssets(f).assets)).toEqual(['field_start']);
  });
});
