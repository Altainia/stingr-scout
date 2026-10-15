import { expect, it } from 'vitest';
import { fitWithin } from '../src/lib/photos';

it('shrinks photos so the longest edge is at most 1600 px', () => {
  expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  expect(fitWithin(1000, 3000)).toEqual({ width: 533, height: 1600 });
  expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
});
