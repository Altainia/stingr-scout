import { markMissed, markNoShow, setAnswer } from '@stingr/shared';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { buildTeamSummaries, eventAverages } from '../../server/src/summaries';
import { matchForm, pitForm, record } from '../../../shared/test/fixtures';
import TeamPage from '../src/pages/TeamPage.svelte';
import { fakeApi, fakeChanges } from './helpers';

const NOW = '2027-03-01T10:00:00.000Z';
const f = matchForm();
const r1 = setAnswer(setAnswer(setAnswer(setAnswer(record(f, { matchKey: 'qm1', team: 5098 }), 'auto_coral', 2), 'climb', 'deep'), 'comments', 'Fast driver'), 'start_pos', [{ x: 0.2, y: 0.3 }]);
const r2 = { ...markMissed(setAnswer(record(f, { matchKey: 'qm2', team: 5098 }), 'auto_coral', 4), 'climb'), revision: 2 };
const r3 = markNoShow(record(f, { matchKey: 'qm3', team: 5098 }), NOW);
const pit = setAnswer(record(pitForm(), { team: 5098, photoIds: ['ph1'] }), 'drivetrain', 'swerve');
const detail = {
  summary: buildTeamSummaries([5098], f, [r1, r2, r3], [pit])[0],
  matchForm: f, pitForm: pitForm(), matchRecords: [r1, r2, r3], pitRecords: [pit],
  eventAverages: eventAverages(f, [r1, r2, r3]),
  allianceShares: [{ item: 'score', label: 'Score', value: 41.25, results: 4 }, { item: 'hopper', label: 'Balls in hopper', value: 5.8, results: 4 }],
  allianceByMatch: {
    qm1: { side: 'red' as const, score: 87, opponent: 64, fields: { hopper: 31 } },
    qm2: { side: 'red' as const, score: 50, opponent: 71, fields: { hopper: null } },
    qm3: { side: 'red' as const, score: null, opponent: null, fields: { hopper: null } },
  },
};

describe('TeamPage', () => {
  it("shows the team's figures and every match", async () => {
    render(TeamPage, { api: fakeApi({ team: async () => detail }), team: 5098 });
    expect(await screen.findByRole('heading', { name: 'Team 5098' })).toBeTruthy();
    expect(screen.getByText('Deep')).toBeTruthy();
    expect(screen.getByText('Robot not present')).toBeTruthy();
    expect(screen.getAllByText('missed').length).toBeGreaterThan(0);
  });

  it('shows trends, comments and the field-map plot', async () => {
    render(TeamPage, { api: fakeApi({ team: async () => detail }), team: 5098 });
    expect(await screen.findByRole('img', { name: /^Points per match/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /^Coral scored by match/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /^Defense rating by match/ })).toBeTruthy();
    const comments = screen.getByRole('heading', { name: 'Comments' }).parentElement!;
    expect(within(comments).getByText('Fast driver')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Start position: 1 points' })).toBeTruthy();
  });

  it('shows pit answers and photos', async () => {
    render(TeamPage, { api: fakeApi({ team: async () => detail }), team: 5098 });
    expect(await screen.findByText('Swerve')).toBeTruthy();
    expect(screen.getByAltText('Team 5098 robot').getAttribute('src')).toBe('/api/photos/ph1');
  });

  it("opens an edited record's history", async () => {
    const history = vi.fn(async () => [{ ...r2, revision: 1, scout: 'Bo' }, r2]);
    render(TeamPage, { api: fakeApi({ team: async () => detail, history }), team: 5098 });
    await fireEvent.click(await screen.findByRole('button', { name: 'History (2)' }));
    expect(history).toHaveBeenCalledWith(r2.id);
    expect(await screen.findByText(/Revision 1 · .* · Bo/)).toBeTruthy();
  });
});


describe('TeamPage: refreshing', () => {
  it("refreshes when the hub's data changes, not on a timer", async () => {
    vi.useFakeTimers();
    const hub = fakeChanges();
    try {
      const teamFn = vi.fn(async () => detail);
      render(TeamPage, { api: fakeApi({ team: teamFn }), team: 5098 });
      await vi.advanceTimersByTimeAsync(0);
      expect(teamFn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(teamFn).toHaveBeenCalledTimes(1);
      hub.changed();
      await vi.advanceTimersByTimeAsync(300);
      expect(teamFn).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

describe('TeamPage: comparing teams', () => {
  const other = (team: number) => {
    const rs = [setAnswer(record(f, { matchKey: 'qm2', team, slot: 'blue1' }), 'auto_coral', 5)];
    return { ...detail, summary: buildTeamSummaries([team], f, rs, [])[0], matchRecords: rs, pitRecords: [] };
  };
  const api = (over = {}) => fakeApi({
    team: async (t: number) => (t === 5098 ? detail : other(t)),
    teams: async () => [118, 254, 5098, 6328],
    teamNames: async () => ({ 5098: 'Stingr', 254: 'The Cheesy Poofs' }),
    ...over,
  });

  it('adds a team to compare with, giving it the next free colour', async () => {
    location.hash = '#/teams/5098';
    render(TeamPage, { api: api(), team: 5098, vs: [] });
    const picker = (await screen.findByLabelText('Compare with')) as HTMLSelectElement;
    expect([...picker.options].map(o => o.textContent)).toEqual(['Choose a team…', '118', '254 The Cheesy Poofs', '6328']);
    await fireEvent.change(picker, { target: { value: '254' } });
    expect(location.hash).toBe('#/teams/5098?vs=254:2');
  });

  it('shows the compared teams as chips, charts a line per team, and lines them up in a table', async () => {
    location.hash = '#/teams/5098?vs=254:3';
    render(TeamPage, { api: api(), team: 5098, vs: [{ team: 254, slot: 3 }] });
    expect(await screen.findByRole('img', { name: /^Points per match, compared/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /^Coral scored, compared/ })).toBeTruthy();
    expect(screen.queryByRole('img', { name: /^Points per match:/ })).toBeNull(); // the by-section stack is for one team
    const table = screen.getByRole('table', { name: 'Teams side by side' });
    const rows = within(table).getAllByRole('row').map(r => r.textContent ?? '');
    expect(rows.some(r => r.includes('5098 Stingr'))).toBe(true);
    expect(rows.some(r => r.includes('254 The Cheesy Poofs'))).toBe(true);
    expect(rows.at(-1)).toContain('Event average');
    await fireEvent.click(screen.getByRole('button', { name: 'Stop comparing with 254' }));
    expect(location.hash).toBe('#/teams/5098');
  });

  it('allows at most three teams to compare with', async () => {
    render(TeamPage, { api: api(), team: 5098, vs: [{ team: 118, slot: 2 }, { team: 254, slot: 3 }, { team: 6328, slot: 4 }] });
    expect(await screen.findByText(/up to 3 teams/)).toBeTruthy();
    expect(screen.queryByLabelText('Compare with')).toBeNull();
  });
});

describe('TeamPage: alliance estimates', () => {
  it("shows the team's estimated share of the alliance score and each field, or what it still needs", async () => {
    render(TeamPage, { api: fakeApi({ team: async () => detail }), team: 5098 });
    const card = await screen.findByRole('region', { name: 'Estimated from alliance results' });
    expect(within(card).getByText('41.3')).toBeTruthy();
    expect(within(card).getByText('Score').closest('div')!.textContent).toContain('4 alliances');
    expect(within(card).getByText('Balls in hopper').closest('div')!.textContent).toContain('4 alliances');
  });
});

describe('TeamPage: alliance results in the charts', () => {
  it('charts each alliance field for the whole alliance, against the team\'s estimated share', async () => {
    render(TeamPage, { api: fakeApi({ team: async () => detail }), team: 5098 });
    const chart = await screen.findByRole('img', { name: /^Balls in hopper — whole alliance by match/ });
    expect(within(chart).getByText('Est. share 5.8')).toBeTruthy();
    expect(chart.closest('figure')!.textContent).toContain('Alliance avg 31 over 1 match'); // not "Team avg"
    expect(screen.getByText(/On whole-alliance charts it is the team's estimated share/)).toBeTruthy();
  });

  it('puts the alliance score and the result behind the points per match', async () => {
    render(TeamPage, { api: fakeApi({ team: async () => detail }), team: 5098 });
    const chart = await screen.findByRole('img', { name: /^Points per match/ });
    expect(chart.querySelectorAll('.alliance-col')).toHaveLength(2);
    expect(within(chart).getByText('W')).toBeTruthy();
    expect(within(chart).getByText('L')).toBeTruthy();
  });

  it('adds the estimated shares to the side-by-side table when comparing', async () => {
    const other = { ...detail, allianceShares: [{ item: 'score', label: 'Score', value: 20, results: 5 }, { item: 'hopper', label: 'Balls in hopper', value: 3, results: 5 }] };
    render(TeamPage, { api: fakeApi({ team: async (t: number) => (t === 5098 ? detail : other), teams: async () => [254, 5098], teamNames: async () => ({}) }), team: 5098, vs: [{ team: 254, slot: 2 }] });
    const table = await screen.findByRole('table', { name: 'Teams side by side' });
    const header = within(table).getAllByRole('columnheader').map(h => h.textContent);
    expect(header).toContain('Score share');
    expect(header).toContain('Balls in hopper share');
    expect(within(table).getByText('41.3')).toBeTruthy();
  });
});
