import type { Point, Slot } from './types';

export function mirrorPoint(p: Point): Point {
  return { x: 1 - p.x, y: 1 - p.y };
}

/** Convert a tap as the scout saw it into the field image's own frame. */
export function toCanonical(p: Point, slot: Slot | undefined, mirrorForRed: boolean): Point {
  return mirrorForRed && slot?.startsWith('red') ? mirrorPoint(p) : p;
}

/** Convert a stored point into what this scout should see. (Rotation by 180° is its own inverse.) */
export const toDisplay = toCanonical;
