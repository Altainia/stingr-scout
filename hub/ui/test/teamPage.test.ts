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
