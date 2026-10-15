import type { Point } from '@stingr/shared';

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function tapToPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return { x: round3(clamp((clientX - rect.left) / rect.width)), y: round3(clamp((clientY - rect.top) / rect.height)) };
}
