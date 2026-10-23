import { describe, expect, it } from 'vitest';
import { teamLabel } from '../src/teamName';

describe('teamLabel', () => {
  it("puts a team's name after its number, when it has one", () => {
    expect(teamLabel(254, { 254: 'The Cheesy Poofs' })).toBe('254 The Cheesy Poofs');
    expect(teamLabel(3, { 254: 'The Cheesy Poofs' })).toBe('3');
    expect(teamLabel(3)).toBe('3');
  });
});
