import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { AllianceView } from '../src/lib/api';
import AlliancePage from '../src/pages/AlliancePage.svelte';
import { fakeApi } from './helpers';

const VIEW = (): AllianceView => ({
  fields: [{ key: 'hopper', label: 'Balls in hopper', tba: 'hubFuelCount' }],
  matches: [
    { matchKey: 'qm1', red: { teams: [5098, 254, 118], values: { score: { value: 87, source: 'tba' } } }, blue: { teams: [148, 971, 1323], values: {} } },
    { matchKey: 'qm2', red: { teams: [1, 2, 3], values: {} }, blue: { teams: [4, 5, 6], values: {} } },
  ],
  shares: {},
  tbaItems: ['hubFuelCount', 'totalPoints'],
});

describe('AlliancePage', () => {
  it('lists each match with a red and a blue row, and saves a typed score', async () => {
    const setAllianceValue = vi.fn(async () => ({ ok: true as const }));
    render(AlliancePage, { api: fakeApi({ alliance: async () => VIEW(), setAllianceValue }) });
    const red1 = await screen.findByRole('row', { name: /Qual 1 red/ });
    expect(red1.textContent).toContain('5098 · 254 · 118');
    expect((within(red1).getByLabelText('Qual 1 red Score') as HTMLInputElement).value).toBe('87');
    expect(within(red1).getByText('TBA')).toBeTruthy(); // came from The Blue Alliance
    await fireEvent.change(within(screen.getByRole('row', { name: /Qual 1 blue/ })).getByLabelText('Qual 1 blue Score'), { target: { value: '64' } });
    expect(setAllianceValue).toHaveBeenCalledWith('qm1', 'blue', 'score', 64);
    await fireEvent.change(within(red1).getByLabelText('Qual 1 red Balls in hopper'), { target: { value: '' } });
    expect(setAllianceValue).toHaveBeenLastCalledWith('qm1', 'red', 'hopper', null);
  });

  it('fetches from The Blue Alliance and says what it filled', async () => {
    const fetchAllianceTba = vi.fn(async () => ({ played: 1, filled: 6 }));
    render(AlliancePage, { api: fakeApi({ alliance: async () => VIEW(), fetchAllianceTba }) });
    await fireEvent.click(await screen.findByRole('button', { name: 'Fetch from TBA' }));
    expect(await screen.findByText('Filled 6 values from 1 played match. Values typed here are kept.')).toBeTruthy();
  });

  it('adds an alliance field, linking it to a TBA score-breakdown item', async () => {
    let fields = VIEW().fields;
    const setAllianceFields = vi.fn(async (f: AllianceView['fields']) => (fields = f));
    render(AlliancePage, { api: fakeApi({ alliance: async () => ({ ...VIEW(), fields }), setAllianceFields }) }); // like the hub, it keeps what was saved
    await fireEvent.input(await screen.findByLabelText('New field'), { target: { value: 'Coral in reef' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(setAllianceFields).toHaveBeenLastCalledWith([
      { key: 'hopper', label: 'Balls in hopper', tba: 'hubFuelCount' },
      { key: 'coral_in_reef', label: 'Coral in reef' },
    ]);
    const tba = screen.getByLabelText('Balls in hopper: TBA item') as HTMLSelectElement;
    expect([...tba.options].map(o => o.textContent)).toEqual(['Not linked', 'hubFuelCount', 'totalPoints']);
    await fireEvent.change(tba, { target: { value: 'totalPoints' } });
    await waitFor(() => expect(setAllianceFields).toHaveBeenLastCalledWith([
      { key: 'hopper', label: 'Balls in hopper', tba: 'totalPoints' }, { key: 'coral_in_reef', label: 'Coral in reef' },
    ]));
  });
});
