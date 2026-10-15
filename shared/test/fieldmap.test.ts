import { describe, expect, it } from 'vitest';
import { isRotated, mirrorPoint, toCanonical, toDisplay } from '../src/fieldmap';

describe('field map orientation', () => {
  it('rotates a point 180 degrees', () => {
    expect(mirrorPoint({ x: 0.25, y: 0.1 })).toEqual({ x: 0.75, y: 0.9 });
  });
  it('rotates the view when the venue puts Red on the other side from the image', () => {
    expect(isRotated('left', 'left')).toBe(false);
    expect(isRotated('left', 'right')).toBe(true);
    expect(isRotated('right', 'left')).toBe(true);
  });
  it('converts taps on a rotated view back to the image frame', () => {
    const p = { x: 0.2, y: 0.3 };
    expect(toCanonical(p, true)).toEqual({ x: 0.8, y: 0.7 });
    expect(toCanonical(p, false)).toEqual(p);
    const q = { x: 0.125, y: 0.875 }; // binary-exact, so the round trip is exact
    expect(toDisplay(toCanonical(q, true), true)).toEqual(q);
  });
});
