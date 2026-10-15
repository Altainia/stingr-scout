import type { Point, Side } from './types';

export function mirrorPoint(p: Point): Point {
  return { x: 1 - p.x, y: 1 - p.y };
}

/** Show the image rotated 180° when Red sits on the other side at this venue, so it matches the view from the stands. */
export function isRotated(imageRedSide: Side, venueRedSide: Side): boolean {
  return imageRedSide !== venueRedSide;
}

/** Convert a tap on the image as displayed into the image's own frame. */
export function toCanonical(p: Point, rotated: boolean): Point {
  return rotated ? mirrorPoint(p) : p;
}

/** Convert a stored point into where it appears on the displayed image (a 180° turn is its own inverse). */
export const toDisplay = toCanonical;
