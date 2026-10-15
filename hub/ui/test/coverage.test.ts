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

describe('Coverage', () => {
  it('shows each slot and what was recorded for it', async () => {
    render(Coverage, { api: fakeApi({ coverage: async () => ROWS }) });
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
    const { unmount } = render(Coverage, { api: fakeApi({ coverage: async () => { throw new ApiError(409, 'No current event is selected.'); } }) });
    expect(await screen.findByRole('link', { name: 'Go to Event setup' })).toBeTruthy();
    unmount();
    render(Coverage, { api: fakeApi({ coverage: async () => [] }) });
    expect(await screen.findByRole('link', { name: 'Import one in Event setup' })).toBeTruthy();
  });
});
