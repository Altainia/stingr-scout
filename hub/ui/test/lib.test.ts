import { describe, expect, it } from 'vitest';
import { ago, num, pct, recordLabel, slotLabel } from '../src/lib/format';
import { href, parseRoute, type Route } from '../src/lib/router';
import { sortBy } from '../src/lib/sort';

describe('router', () => {
  it.each<[string, Route]>([
    ['', { page: 'dashboard' }],
    ['#/', { page: 'dashboard' }],
    ['#/event', { page: 'event' }],
    ['#/forms', { page: 'forms', kind: 'match' }],
    ['#/forms/pit', { page: 'forms', kind: 'pit' }],
    ['#/coverage', { page: 'coverage' }],
    ['#/teams', { page: 'teams' }],
    ['#/teams/5098', { page: 'team', team: 5098 }],
    ['#/qr', { page: 'qr' }],
    ['#/data', { page: 'data' }],
    ['#/settings', { page: 'settings' }],
    ['#/teams/abc', { page: 'notfound' }],
    ['#/nope', { page: 'notfound' }],
  ])('%s', (hash, route) => expect(parseRoute(hash)).toEqual(route));

  it('reads the teams a team is compared with, each with its colour slot', () => {
    expect(parseRoute('#/teams/5098?vs=254:2,118:3')).toEqual({ page: 'team', team: 5098, vs: [{ team: 254, slot: 2 }, { team: 118, slot: 3 }] });
    expect(parseRoute('#/teams/5098?vs=254,118')).toEqual({ page: 'team', team: 5098, vs: [{ team: 254, slot: 2 }, { team: 118, slot: 3 }] }); // typed by hand
    expect(parseRoute('#/teams/5098?vs=118:4')).toEqual({ page: 'team', team: 5098, vs: [{ team: 118, slot: 4 }] }); // keeps its colour
  });

  it('ignores compared teams it cannot use', () => {
    expect(parseRoute('#/teams/5098?vs=5098,abc,254,254,1,2,3')).toEqual({ page: 'team', team: 5098, vs: [{ team: 254, slot: 2 }, { team: 1, slot: 3 }, { team: 2, slot: 4 }] });
    expect(parseRoute('#/teams/5098?vs=254:2,118:2')).toEqual({ page: 'team', team: 5098, vs: [{ team: 254, slot: 2 }, { team: 118, slot: 3 }] }); // one colour each
  });

  it('writes the comparison into the address', () => {
    expect(href({ page: 'team', team: 5098, vs: [{ team: 118, slot: 3 }] })).toBe('#/teams/5098?vs=118:3');
    expect(href({ page: 'team', team: 5098, vs: [] })).toBe('#/teams/5098');
  });

  it('builds links that parse back to the same route', () => {
    const routes: Route[] = [{ page: 'dashboard' }, { page: 'forms', kind: 'pit' }, { page: 'team', team: 254 }, { page: 'data' }];
    for (const r of routes) expect(parseRoute(href(r))).toEqual(r);
  });
});

describe('format', () => {
  it('formats fractions and numbers, showing a dash for nothing', () => {
    expect(pct(2 / 3)).toBe('67%');
    expect(pct(null)).toBe('—');
    expect(num(3)).toBe('3');
    expect(num(2.5)).toBe('2.5');
    expect(num(12.346, 2)).toBe('12.35');
    expect(num(undefined)).toBe('—');
  });
  it('describes how long ago something happened', () => {
    const now = Date.parse('2027-03-01T12:00:00Z');
    expect(ago('2027-03-01T11:59:50Z', now)).toBe('just now');
    expect(ago('2027-03-01T11:50:00Z', now)).toBe('10 min ago');
    expect(ago('2027-03-01T09:00:00Z', now)).toBe('3 h ago');
  });
  it('labels slots and records', () => {
    expect(slotLabel('blue2')).toBe('Blue 2');
    expect(recordLabel({ kind: 'match', matchKey: 'qm3', slot: 'red1', team: 5098, scout: 'Ada' })).toBe('Qual 3 · Red 1 · Team 5098 (Ada)');
    expect(recordLabel({ kind: 'pit', team: 254, scout: 'Bo' })).toBe('Pit · Team 254 (Bo)');
    expect(recordLabel({ kind: 'match', matchKey: 'qm3', slot: 'red1', team: 5098, scout: 'Ada' }, { 5098: 'Stingr' })).toBe('Qual 3 · Red 1 · Team 5098 Stingr (Ada)');
  });
});

describe('sortBy', () => {
  const rows = [{ t: 1, v: 5 }, { t: 2, v: null }, { t: 3, v: 9 }, { t: 4, v: 1 }];
  it('sorts numbers either way and keeps empty values last', () => {
    expect(sortBy(rows, r => r.v, 'desc').map(r => r.t)).toEqual([3, 1, 4, 2]);
    expect(sortBy(rows, r => r.v, 'asc').map(r => r.t)).toEqual([4, 1, 3, 2]);
  });
  it('sorts text', () => {
    expect(sortBy(['b', 'a', 'c'], s => s, 'asc')).toEqual(['a', 'b', 'c']);
  });
});
