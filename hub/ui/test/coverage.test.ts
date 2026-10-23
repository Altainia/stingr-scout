import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/lib/api';
import Coverage from '../src/pages/Coverage.svelte';
import { fakeApi } from './helpers';

const cell = (team: number, status: 'empty' | 'ok' | 'missed' | 'noshow', recordIds: string[] = []) => ({ team, status, recordIds });
const ROWS = [
  {
    matchKey: 'qm1', scheduled: true,
    cells: { red1: cell(5098, 'ok', ['a', 'b']), red2: cell(254, 'missed', ['c']), red3: cell(3, 'empty'), blue1: cell(4, 'noshow', ['d']), blue2: cell(5, 'empty'), blue3: cell(6, 'empty') },
  },
  {
    matchKey: 'qm2', scheduled: false,
    cells: { red1: cell(0, 'empty'), red2: cell(0, 'empty'), red3: cell(0, 'empty'), blue1: cell(0, 'empty'), blue2: cell(0, 'empty'), blue3: cell(99, 'ok', ['e']) },
  },
];

const NONE = async () => ({ questions: [], scouts: [] });
const REPORT = async () => ({
  questions: [{
    key: 'climb_time', label: 'Climb time', missed: 9, total: 40, scouts: 5, scoutsAsked: 6,
    matches: [{ matchKey: 'qm3', slot: 'red2' as const, team: 254, scout: 'Ada' }],
  }],
  scouts: [{
    scout: 'Ben', key: 'defense', label: 'Defense rating', missed: 6, total: 8, othersMissed: 2, othersTotal: 30,
    matches: [{ matchKey: 'qm7', slot: 'blue1' as const, team: 118, scout: 'Ben' }],
  }],
});

describe('Coverage', () => {
  it('shows each slot and what was recorded for it', async () => {
    render(Coverage, { api: fakeApi({ missed: NONE, coverage: async () => ROWS }) });
    const red1 = await screen.findByLabelText('Qual 1 Red 1');
    expect(red1.className).toContain('cell-ok');
    expect(red1.textContent).toContain('✓');
    expect(within(red1).getByText('2×')).toBeTruthy();
    expect(within(red1).getByRole('link', { name: '5098' }).getAttribute('href')).toBe('#/teams/5098');
    expect(screen.getByLabelText('Qual 1 Red 2').className).toContain('cell-missed');
    expect(screen.getByLabelText('Qual 1 Blue 1').textContent).toContain('✗');
    expect(screen.getByText('(not in schedule)')).toBeTruthy();
    expect(screen.getByText('4 of 12 robot-matches scouted · 1 with missed answers · 1 robots not present')).toBeTruthy();
  });

  it('points to Event setup when there is no event or schedule', async () => {
    const { unmount } = render(Coverage, { api: fakeApi({ missed: NONE, coverage: async () => { throw new ApiError(409, 'No current event is selected.'); } }) });
    expect(await screen.findByRole('link', { name: 'Go to Event setup' })).toBeTruthy();
    unmount();
    render(Coverage, { api: fakeApi({ missed: NONE, coverage: async () => [] }) });
    expect(await screen.findByRole('link', { name: 'Import one in Event setup' })).toBeTruthy();
  });

  it('points out questions scouts often miss, and scouts who miss a question more than others', async () => {
    render(Coverage, { api: fakeApi({ coverage: async () => ROWS, missed: REPORT }) });
    const section = await screen.findByRole('region', { name: 'Missed answers' });
    expect(within(section).getByText('Climb time', { selector: 'strong' }).closest('li')!.textContent).toContain('missed in 9 of 40 matches (23%), by 5 of 6 scouts');
    expect(within(section).getByText('Ben', { selector: 'strong' }).closest('li')!.textContent).toContain('misses Defense rating in 6 of 8 matches (75%); other scouts 2 of 30 (7%)');
    expect(within(section).getByText('Qual 3 · Red 2 · Team 254 (Ada)')).toBeTruthy(); // in the matches list
  });

  it('says when nothing stands out', async () => {
    render(Coverage, { api: fakeApi({ coverage: async () => ROWS, missed: NONE }) });
    const section = await screen.findByRole('region', { name: 'Missed answers' });
    expect(section.textContent).toContain('Nothing stands out yet');
  });
});
