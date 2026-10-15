import { describe, expect, it } from 'vitest';
import { mirrorPoint, toCanonical, toDisplay } from '../src/fieldmap';

describe('field map mirroring', () => {
  it('rotates a point 180 degrees', () => {
    expect(mirrorPoint({ x: 0.25, y: 0.1 })).toEqual({ x: 0.75, y: 0.9 });
  });
  it('mirrors only for red slots when enabled', () => {
    const p = { x: 0.2, y: 0.3 };
    expect(toCanonical(p, 'red2', true)).toEqual({ x: 0.8, y: 0.7 });
    expect(toCanonical(p, 'blue1', true)).toEqual(p);
    expect(toCanonical(p, 'red1', false)).toEqual(p);
    expect(toCanonical(p, undefined, true)).toEqual(p);
  });
  it('display and canonical conversions undo each other', () => {
    const p = { x: 0.125, y: 0.875 };
    expect(toDisplay(toCanonical(p, 'red3', true), 'red3', true)).toEqual(p);
  });
});
