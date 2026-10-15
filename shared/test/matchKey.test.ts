import { describe, expect, it } from 'vitest';
import { compareMatchKeys, matchLabel, normalizeMatchKey, parseMatchKey } from '../src/matchKey';

describe('normalizeMatchKey', () => {
  it.each([
    ['12', 'qm12'], [' 7 ', 'qm7'], ['QM012', 'qm12'], ['qm3', 'qm3'],
    ['sf3m1', 'sf3m1'], ['F1M2', 'f1m2'], ['qf02m3', 'qf2m3'],
  ])('%s → %s', (input, want) => expect(normalizeMatchKey(input)).toBe(want));

  it.each(['', '0', 'qm0', 'sf3', 'qm1m2', 'match 4', 'x9'])('rejects %j', input => {
    expect(normalizeMatchKey(input)).toBeNull();
  });
});

describe('compareMatchKeys', () => {
  it('orders numerically within a level and quals before playoffs', () => {
    const keys = ['f1m1', 'qm10', 'sf2m1', 'qm9', 'qm1', 'sf10m1', 'sf1m1', 'qm2'];
    expect([...keys].sort(compareMatchKeys)).toEqual(['qm1', 'qm2', 'qm9', 'qm10', 'sf1m1', 'sf2m1', 'sf10m1', 'f1m1']);
  });
  it('puts unparseable keys last', () => {
    expect(['zzz', 'qm1'].sort(compareMatchKeys)).toEqual(['qm1', 'zzz']);
  });
});

describe('matchLabel / parseMatchKey', () => {
  it('labels keys for people', () => {
    expect(matchLabel('qm12')).toBe('Qual 12');
    expect(matchLabel('sf3m1')).toBe('Semi 3-1');
    expect(matchLabel('f1m2')).toBe('Final 1-2');
    expect(matchLabel('weird')).toBe('weird');
  });
  it('parses levels, sets and matches', () => {
    expect(parseMatchKey('qm4')).toEqual({ level: 'qm', set: 1, match: 4 });
    expect(parseMatchKey('sf13m1')).toEqual({ level: 'sf', set: 13, match: 1 });
  });
});
