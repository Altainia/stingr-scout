import { markNoShow, setAnswer } from '@stingr/shared';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { buildTeamSummaries } from '../../server/src/summaries';
import { matchForm, pitForm, record } from '../../../shared/test/fixtures';
import Teams from '../src/pages/Teams.svelte';
import { fakeApi, fakeChanges } from './helpers';

const f = matchForm();
const NOW = '2027-03-01T10:00:00.000Z';
const records = [
  setAnswer(setAnswer(record(f, { team: 254 }), 'auto_coral', 1), 'climb', 'none'),   // 4 points
  setAnswer(setAnswer(record(f, { team: 5098 }), 'auto_coral', 3), 'climb', 'deep'),  // 24 points
  markNoShow(record(f, { team: 118 }), NOW),                                         // no points
];
const summaries = buildTeamSummaries([118, 254, 5098], f, records, []);

const teamOrder = () => screen.getAllByRole('row').slice(1).map(r => r.querySelector('td')?.textContent);

describe('Teams', () => {
  it('ranks teams by estimated points with empty values last', async () => {
    render(Teams, { api: fakeApi({ summaries: async () => ({ form: f, summaries }) }) });
    await screen.findByRole('link', { name: '5098' });
    expect(teamOrder()).toEqual(['5098', '254', '118']);
    expect(screen.getByRole('columnheader', { name: /Est\. points/ }).getAttribute('aria-sort')).toBe('descending');
    expect(screen.getByRole('link', { name: '254' }).getAttribute('href')).toBe('#/teams/254');
  });

  it('sorts by any column', async () => {
    render(Teams, { api: fakeApi({ summaries: async () => ({ form: f, summaries }) }) });
    await fireEvent.click(await screen.findByRole('button', { name: /^Team/ }));
    expect(teamOrder()).toEqual(['118', '254', '5098']);
    await fireEvent.click(screen.getByRole('button', { name: /^Team/ }));
    expect(teamOrder()).toEqual(['5098', '254', '118']);
  });

  it('shows per-question summaries', async () => {
    render(Teams, { api: fakeApi({ summaries: async () => ({ form: f, summaries }) }) });
    await screen.findByRole('link', { name: '5098' });
    expect(screen.getByRole('columnheader', { name: /Coral scored/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Endgame pts/ })).toBeTruthy();
    expect(screen.getByText('Deep 100%')).toBeTruthy();
  });

  it('explains when no match form is published', async () => {
    render(Teams, { api: fakeApi({ summaries: async () => ({ form: null, summaries: [] }) }) });
    expect(await screen.findByText(/No match form is published yet/)).toBeTruthy();
  });
});

describe('Teams: refreshing', () => {
  it("refreshes when the hub's data changes, not on a timer", async () => {
    vi.useFakeTimers();
    const hub = fakeChanges();
    try {
      const summaries = vi.fn(async () => ({ form: null, summaries: [] }));
      render(Teams, { api: fakeApi({ summaries }) });
      await vi.advanceTimersByTimeAsync(0);
      expect(summaries).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(summaries).toHaveBeenCalledTimes(1);
      hub.changed();
      await vi.advanceTimersByTimeAsync(300);
      expect(summaries).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

describe('Teams: estimated score share', () => {
  it('adds a sortable column for each team\'s estimated share of the alliance score', async () => {
    const summaries = buildTeamSummaries([5098, 254], null, [], []);
    render(Teams, { api: fakeApi({ summaries: async () => ({ form: null, summaries, scoreShares: { 5098: 21.5, 254: null } }) }) });
    const header = await screen.findByRole('button', { name: 'Score share' });
    expect(header).toBeTruthy();
    expect(screen.getByText('21.5')).toBeTruthy();
  });
});

describe('Teams: names', () => {
  it("shows each team's name beside its number", async () => {
    render(Teams, { api: fakeApi({ summaries: async () => ({ form: f, summaries }), teamNames: async () => ({ 254: 'The Cheesy Poofs' }) }) });
    const link = await screen.findByRole('link', { name: '254' });
    await vi.waitFor(() => expect(link.closest('td')!.textContent).toContain('The Cheesy Poofs'));
    expect(screen.getByRole('link', { name: '118' }).closest('td')!.textContent).toBe('118');
  });
});

describe('Teams: robot size', () => {
  it('adds a column for each measurement a pit dimensions question asks, sortable by size', async () => {
    const pf = pitForm();
    pf.sections[0].questions.push({ key: 'frame', label: 'Frame size', type: 'dimensions', required: false, parts: ['length', 'height'] });
    const pits = [
      setAnswer(record(pf, { team: 254 }), 'frame', { length: 30.5, height: 40 }),
      setAnswer(record(pf, { team: 5098 }), 'frame', { length: 28, height: 44 }),
    ];
    const withPits = buildTeamSummaries([118, 254, 5098], f, records, pits, pf);
    render(Teams, { api: fakeApi({ summaries: async () => ({ form: f, pitForm: pf, summaries: withPits }) }) });
    await fireEvent.click(await screen.findByRole('button', { name: /^Length/ }));
    expect(teamOrder()).toEqual(['254', '5098', '118']); // biggest first, unmeasured last
    const row = screen.getByRole('link', { name: '254' }).closest('tr')!;
    expect(row.textContent).toContain('2′ 6½″');
    expect(row.textContent).toContain('3′ 4″');
  });
});
