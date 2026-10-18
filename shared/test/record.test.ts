import { describe, expect, it } from 'vitest';
import { initialAnswers } from '../src/form';
import {
  checkRecord, finalizeSubmit, isAnswered, markMissed, markNoShow, newRecord,
  setAnswer, unansweredRequired, undoNoShow, unmarkMissed,
} from '../src/record';
import type { AnswerValue } from '../src/types';
import { matchForm, pitForm, record } from './fixtures';

const NOW = '2027-03-01T10:00:00.000Z';
const LATER = '2027-03-01T10:05:00.000Z';

describe('isAnswered', () => {
  it.each([
    [null, false], [undefined, false], ['', false], ['  ', false], [[], false],
    [0, true], [false, true], ['x', true], [['a'], true], [[{ x: 0, y: 0 }], true],
  ])('%j → %s', (v, want) => expect(isAnswered(v as AnswerValue | undefined)).toBe(want));
});

describe('newRecord', () => {
  it('starts at revision 1 with initial answers', () => {
    const r = newRecord({ id: 'r1', form: matchForm(), eventKey: '2027test', team: 5098, scout: 'Ada', deviceId: 'd1', now: NOW, matchKey: 'qm1', slot: 'red1' });
    expect(r).toMatchObject({ id: 'r1', revision: 1, kind: 'match', formVersion: 1, noShow: false, missed: [], photoIds: [], createdAt: NOW, updatedAt: NOW });
    expect(r.answers).toEqual(initialAnswers(matchForm()));
  });
});

describe('missed answers', () => {
  it('markMissed clears the value and records the key once', () => {
    let r = setAnswer(record(matchForm()), 'auto_coral', 3);
    r = markMissed(markMissed(r, 'auto_coral'), 'auto_coral');
    expect(r.answers.auto_coral).toBeNull();
    expect(r.missed).toEqual(['auto_coral']);
  });
  it('setAnswer un-misses the question', () => {
    const r = setAnswer(markMissed(record(matchForm()), 'climb'), 'climb', 'deep');
    expect(r.missed).toEqual([]);
    expect(r.answers.climb).toBe('deep');
  });
  it('unmarkMissed restores the initial value', () => {
    const f = matchForm();
    const r = unmarkMissed(f, markMissed(record(f), 'auto_coral'), 'auto_coral');
    expect(r.missed).toEqual([]);
    expect(r.answers.auto_coral).toBe(0);
  });
});

describe('finalizeSubmit', () => {
  it('marks unanswered required questions as missed', () => {
    const f = matchForm();
    let r = record(f);
    expect(unansweredRequired(f, r)).toEqual(['climb']);
    r = finalizeSubmit(f, r, LATER);
    expect(r.missed).toEqual(['climb']);
    expect(r.updatedAt).toBe(LATER);
    expect(unansweredRequired(f, r)).toEqual([]);
  });
  it('leaves empty optional questions alone', () => {
    const f = matchForm();
    const r = finalizeSubmit(f, setAnswer(record(f), 'climb', 'none'), LATER);
    expect(r.missed).toEqual([]);
    expect(r.answers.comments).toBeNull();
  });
  it('flags a required Yes / No with no default until the scout picks', () => {
    const f = matchForm();
    const leave = f.sections[0].questions[0];
    if (leave.type !== 'toggle') throw new Error('fixture changed');
    delete leave.default;
    const r = record(f);
    expect(unansweredRequired(f, r)).toContain('auto_leave');
    expect(unansweredRequired(f, setAnswer(r, 'auto_leave', false))).not.toContain('auto_leave');
  });
  it('counts a counter left at its default as answered', () => {
    expect(unansweredRequired(matchForm(), record(matchForm()))).not.toContain('auto_coral');
  });
  it('treats whitespace-only required text as missed', () => {
    const f = matchForm();
    f.sections[2].questions[2].required = true; // comments
    const r = finalizeSubmit(f, setAnswer(setAnswer(record(f), 'climb', 'deep'), 'comments', '   '), LATER);
    expect(r.missed).toEqual(['comments']);
    expect(r.answers.comments).toBeNull();
  });
});

describe('no-show', () => {
  it('markNoShow empties answers and missed', () => {
    const r = markNoShow(markMissed(record(matchForm()), 'climb'), LATER);
    expect(r).toMatchObject({ noShow: true, answers: {}, missed: [], updatedAt: LATER, revision: 1 });
  });
  it('a submitted no-show has nothing missing', () => {
    const f = matchForm();
    expect(finalizeSubmit(f, markNoShow(record(f), NOW), LATER).missed).toEqual([]);
  });
  it('undoNoShow creates a new revision with fresh answers', () => {
    const f = matchForm();
    const u = undoNoShow(f, markNoShow(record(f), NOW), LATER);
    expect(u).toMatchObject({ revision: 2, noShow: false, missed: [], updatedAt: LATER });
    expect(u.answers).toEqual(initialAnswers(f));
  });
});

describe('checkRecord', () => {
  it('accepts valid match and pit records', () => {
    expect(checkRecord(record(matchForm()))).toEqual([]);
    expect(checkRecord(record(pitForm()))).toEqual([]);
  });
  it('reports bad fields', () => {
    expect(checkRecord({ ...record(matchForm()), revision: 0, slot: 'green1', matchKey: 'qm01' })).toEqual([
      'revision must be an integer >= 1',
      'matchKey must be a match key like "qm12"',
      'slot must be one of red1, red2, red3, blue1, blue2, blue3',
    ]);
  });
  it('rejects non-objects', () => {
    expect(checkRecord('nope')).toEqual(['record is not an object']);
  });
});
