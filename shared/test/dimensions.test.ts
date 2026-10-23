import { describe, expect, it } from 'vitest';
import { describeAnswer } from '../src/describe';
import { feetInches, fromFeetInches, toFeetInches } from '../src/dimensions';
import { findQuestion, initialAnswers, summaryKind, summaryOptions, validateFormDef } from '../src/form';
import { decodeRecordData, encodeRecordQr, QrAssembler } from '../src/qr';
import { finalizeSubmit, isAnswered, markNoShow, setAnswer, unansweredRequired } from '../src/record';
import { questionStat } from '../src/scoring';
import type { DimensionsQuestion, FormDef, Question } from '../src/types';
import { record } from './fixtures';

const size: DimensionsQuestion = { key: 'frame', label: 'Frame size', type: 'dimensions', required: true, parts: ['length', 'width', 'height'] };
const form = (q: Question = size): FormDef => ({ kind: 'pit', version: 1, assets: {}, sections: [{ id: 'robot', title: 'Robot', questions: [q] }] });
const NOW = '2027-03-01T10:00:00.000Z';

describe('feet and inches', () => {
  it('shows inches as feet and inches, with halves and quarters as fractions', () => {
    expect(feetInches(30)).toBe('2′ 6″');
    expect(feetInches(30.5)).toBe('2′ 6½″');
    expect(feetInches(24.25)).toBe('2′ 0¼″');
    expect(feetInches(35.75)).toBe('2′ 11¾″');
    expect(feetInches(8)).toBe('0′ 8″');
    expect(feetInches(30.3)).toBe('2′ 6.3″');
    expect(feetInches(35.99)).toBe('3′ 0″'); // rounds up into the next foot, never 2′ 12″
  });

  it('splits inches into feet and inches, and adds them back up', () => {
    expect(toFeetInches(30.5)).toEqual({ feet: 2, inches: 6.5 });
    expect(toFeetInches(11)).toEqual({ feet: 0, inches: 11 });
    expect(fromFeetInches(2, 6.5)).toBe(30.5);
    expect(fromFeetInches(0, 30)).toBe(30); // 30 typed in the inches box
    expect(fromFeetInches(null, 4)).toBe(4);
    expect(fromFeetInches(3, null)).toBe(36);
    expect(fromFeetInches(null, null)).toBeNull();
  });
});

describe('dimensions questions', () => {
  it('start unanswered, with their measurement summary', () => {
    expect(initialAnswers(form())).toEqual({ frame: null });
    expect(summaryOptions('dimensions')).toEqual(['size', 'none']);
    expect(summaryKind(size)).toBe('size');
  });

  it('need at least one measurement, each one once', () => {
    expect(validateFormDef(form()).errors).toEqual([]);
    expect(validateFormDef(form({ ...size, parts: [] })).errors).toEqual(['Frame size: Tick at least one of length, width and height']);
    expect(validateFormDef(form({ ...size, parts: ['length', 'length'] })).errors).toEqual(['Frame size: Each measurement can only be asked once']);
    expect(validateFormDef(form({ ...size, parts: ['depth' as never] })).errors).toEqual(['Frame size: Measurements must be length, width or height']);
  });

  it('count as answered once any measurement is in, but a required one needs every measurement', () => {
    expect(isAnswered({})).toBe(false);
    expect(isAnswered({ length: 30 })).toBe(true);
    const part = setAnswer(record(form()), 'frame', { length: 30, width: 28 });
    expect(unansweredRequired(form(), part)).toEqual(['frame']);
    const full = setAnswer(part, 'frame', { length: 30, width: 28, height: 40 });
    expect(unansweredRequired(form(), full)).toEqual([]);
    expect(finalizeSubmit(form(), part, NOW)).toMatchObject({ missed: ['frame'], answers: { frame: null } });
  });

  it('read as length × width × height', () => {
    expect(describeAnswer(size, { length: 30, width: 28.5, height: 40 })).toBe('2′ 6″ × 2′ 4½″ × 3′ 4″');
    expect(describeAnswer(size, { length: 30, height: 40 })).toBe('2′ 6″ × — × 3′ 4″');
    expect(describeAnswer({ ...size, parts: ['height'] }, { height: 40 })).toBe('3′ 4″');
    expect(describeAnswer(size, null)).toBe('—');
  });

  it('average each measurement across records, leaving out no-shows and other kinds of answer', () => {
    const recs = [
      setAnswer(record(form()), 'frame', { length: 30, width: 28 }),
      setAnswer(record(form()), 'frame', { length: 32, width: 28, height: 40 }),
      markNoShow(setAnswer(record(form()), 'frame', { length: 99 }), NOW),
      setAnswer(record(form()), 'frame', 12), // the key was a number question once
    ];
    expect(questionStat(size, recs)).toEqual({ kind: 'size', n: 2, parts: { length: 31, width: 28, height: 40 } });
  });

  it('travel by QR code', async () => {
    const f = form();
    const r = setAnswer(record(f, { id: '6f1c2b9e-0d4a-4c1e-9a7b-3e2f1d0c9b8a' }), 'frame', { length: 30.5, height: 40 });
    const chunks = await encodeRecordQr(f, r);
    const asm = new QrAssembler();
    let res = asm.add(chunks[0]);
    for (const c of chunks.slice(1)) res = asm.add(c);
    if (res.status !== 'complete') throw new Error(`expected complete, got ${res.status}`);
    expect(await decodeRecordData(res.data, () => f)).toEqual(r);
    expect(findQuestion(f, 'frame')).toBe(size);
  });
});
