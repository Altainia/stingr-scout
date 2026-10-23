import { describe, expect, it } from 'vitest';
import { estimateShares } from '../src/contribution';

/** Alliances made of every combination of three teams, scored as the exact sum of the teams' true shares. */
function allianceResults(shares: Record<number, number>) {
  const teams = Object.keys(shares).map(Number);
  const out: { teams: number[]; value: number | null }[] = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++)
      for (let k = j + 1; k < teams.length; k++) out.push({ teams: [teams[i], teams[j], teams[k]], value: shares[teams[i]] + shares[teams[j]] + shares[teams[k]] });
  return out;
}

describe('estimateShares', () => {
  it("recovers each team's share from alliance totals", () => {
    const truth = { 1: 10, 2: 20, 3: 5, 4: 15, 5: 0, 6: 30 };
    const est = estimateShares(allianceResults(truth));
    for (const [t, v] of Object.entries(truth)) expect(est.get(Number(t))).toBeCloseTo(v, 0);
  });

  it('leaves out alliances with no value', () => {
    const truth = { 1: 10, 2: 20, 3: 5, 4: 15, 5: 0, 6: 30 };
    const with_blanks = [...allianceResults(truth), { teams: [1, 2, 3], value: null }];
    expect(estimateShares(with_blanks).get(6)).toBeCloseTo(30, 0);
  });

  it('gives no estimate for a team with fewer than 3 alliance results', () => {
    const results = [
      { teams: [1, 2, 3], value: 30 }, { teams: [1, 2, 4], value: 30 }, { teams: [1, 3, 4], value: 30 }, { teams: [2, 3, 4], value: 30 },
      { teams: [1, 2, 9], value: 40 },
    ];
    const est = estimateShares(results);
    expect(est.get(1)).not.toBeNull();
    expect(est.get(9)).toBeNull(); // only one result
  });

  it('stays defined with very few results (no division by zero)', () => {
    const est = estimateShares([{ teams: [1, 2, 3], value: 30 }]);
    expect([...est.values()]).toEqual([null, null, null]);
    expect(estimateShares([]).size).toBe(0);
  });
});
