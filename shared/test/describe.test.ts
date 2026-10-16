import { describe, expect, it } from 'vitest';
import { describeAnswer } from '../src/describe';
import { findQuestion } from '../src/form';
import { matchForm } from './fixtures';

const q = (key: string) => findQuestion(matchForm(), key)!;

describe('describeAnswer', () => {
  it('shows each kind of answer the way a scout would read it', () => {
    expect(describeAnswer(q('auto_coral'), 3)).toBe('3');
    expect(describeAnswer(q('auto_leave'), false)).toBe('No');
    expect(describeAnswer(q('climb'), 'deep')).toBe('Deep');
    expect(describeAnswer(q('zones'), ['near', 'far'])).toBe('Near, Far');
    expect(describeAnswer(q('climb_time'), 2.5)).toBe('2.5 s');
    expect(describeAnswer(q('start_pos'), [{ x: 0.1, y: 0.2 }])).toBe('1 point');
    expect(describeAnswer(q('start_pos'), [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }])).toBe('2 points');
    expect(describeAnswer(q('comments'), 'fast')).toBe('fast');
    expect(describeAnswer(q('defense'), null)).toBe('—');
    expect(describeAnswer(q('zones'), [])).toBe('—');
  });

  it('shows answers recorded under an older question type instead of failing', () => {
    expect(describeAnswer(q('zones'), 5)).toBe('5'); // was a counter
    expect(describeAnswer(q('climb_time'), 'fast')).toBe('fast'); // was text
    expect(describeAnswer(q('start_pos'), 3)).toBe('3');
    expect(describeAnswer(q('auto_leave'), 2)).toBe('2');
  });
});
