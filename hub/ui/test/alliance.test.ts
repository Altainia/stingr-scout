import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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

  it('makes a short key from a long label, and keeps the typed label if saving fails', async () => {
    const setAllianceFields = vi.fn(async (f: AllianceView['fields']) => f);
    render(AlliancePage, { api: fakeApi({ alliance: async () => VIEW(), setAllianceFields }) });
    await fireEvent.input(await screen.findByLabelText('New field'), { target: { value: 'Number of balls scored into the shared hopper by the alliance' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    const key = (setAllianceFields.mock.lastCall![0] as AllianceView['fields']).at(-1)!.key;
    expect(key.length).toBeLessThanOrEqual(40);
    cleanup();
    render(AlliancePage, { api: fakeApi({ alliance: async () => VIEW(), setAllianceFields: async () => { throw new Error('nope'); } }) });
    await fireEvent.input(await screen.findByLabelText('New field'), { target: { value: 'Coral' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    await waitFor(() => expect((screen.getByLabelText('New field') as HTMLInputElement).value).toBe('Coral'));
  });

  it("doesn't save, and says so, when a value isn't a number; a failed save puts the stored value back", async () => {
    const setAllianceValue = vi.fn(async () => { throw new Error('Hub unreachable'); });
    render(AlliancePage, { api: fakeApi({ alliance: async () => VIEW(), setAllianceValue }) });
    const cell = (await screen.findByLabelText('Qual 1 red Score')) as HTMLInputElement;
    // What a browser reports for text it can't read as a number (e.g. letters, or 1e999): an empty value marked bad input.
    Object.defineProperty(cell, 'validity', { configurable: true, value: { badInput: true } });
    await fireEvent.change(cell, { target: { value: '' } });
    Object.defineProperty(cell, 'validity', { configurable: true, value: { badInput: false } });
    expect(setAllianceValue).not.toHaveBeenCalled();
    expect(screen.getByText(/isn't a number this page can save/)).toBeTruthy();
    expect(cell.value).toBe('87'); // back to what's stored
    await fireEvent.change(cell, { target: { value: '90' } });
    expect(setAllianceValue).toHaveBeenCalledWith('qm1', 'red', 'score', 90);
    await waitFor(() => expect(cell.value).toBe('87'));
  });
});

describe('AlliancePage: names', () => {
  it("links each alliance's teams, with their names on hover", async () => {
    render(AlliancePage, { api: fakeApi({ alliance: async () => VIEW(), teamNames: async () => ({ 254: 'The Cheesy Poofs' }) }) });
    const red1 = await screen.findByRole('row', { name: /Qual 1 red/ });
    const poofs = within(red1).getByRole('link', { name: '254' });
    expect(poofs.getAttribute('href')).toBe('#/teams/254');
    await vi.waitFor(() => expect(poofs.getAttribute('title')).toBe('254 The Cheesy Poofs'));
    expect(within(red1).getByRole('link', { name: '118' }).getAttribute('title')).toBeNull();
  });
});
