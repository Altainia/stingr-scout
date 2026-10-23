import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ErrorNote from '../src/components/ErrorNote.svelte';
import { ApiError } from '../src/lib/api';
import Dashboard from '../src/pages/Dashboard.svelte';
import Settings from '../src/pages/Settings.svelte';
import type { Api, MissedReport } from '../src/lib/api';
import { fakeApi, fakeChanges } from './helpers';

describe('ErrorNote', () => {
  it('explains when no event is selected', () => {
    render(ErrorNote, { error: new ApiError(409, 'No current event is selected. Choose one in Event setup first.') });
    expect(screen.getByRole('alert').textContent).toContain('No current event is selected');
    expect(screen.getByRole('link', { name: 'Go to Event setup' }).getAttribute('href')).toBe('#/event');
  });
  it('shows nothing without an error', () => {
    render(ErrorNote, { error: null });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Settings', () => {
  it('saves and removes the TBA key', async () => {
    const saveSettings = vi.fn(async (s: { tbaKey: string }) => ({ tbaKeySet: s.tbaKey !== '' }));
    render(Settings, { api: fakeApi({ settings: async () => ({ tbaKeySet: false }), saveSettings }) });
    expect(await screen.findByText('No key saved yet.')).toBeTruthy();
    await fireEvent.input(screen.getByLabelText('TBA API key'), { target: { value: 'abc123' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(saveSettings).toHaveBeenCalledWith({ tbaKey: 'abc123' });
    expect(await screen.findByText('A key is saved.')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    expect(saveSettings).toHaveBeenLastCalledWith({ tbaKey: '' });
    expect(await screen.findByText('No key saved yet.')).toBeTruthy();
  });
});

describe('Settings theme', () => {
  it('switches the theme straight away', async () => {
    render(Settings, { api: fakeApi({ settings: async () => ({ tbaKeySet: false }) }) });
    await fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'light' } });
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

const CONCERNS = async (): Promise<MissedReport> => ({
  questions: [{ id: 'q:climb_time', acknowledged: false, key: 'climb_time', label: 'Climb time', missed: 9, total: 40, scouts: 5, scoutsAsked: 6, matches: [] }],
  scouts: [
    { id: 's:ben:defense', acknowledged: false, scout: 'Ben', key: 'defense', label: 'Defense rating', missed: 6, total: 8, othersMissed: 2, othersTotal: 30, matches: [] },
    { id: 's:ada:climb', acknowledged: true, scout: 'Ada', key: 'climb', label: 'Climb', missed: 4, total: 7, othersMissed: 2, othersTotal: 30, matches: [] },
  ],
});
const dashboardApi = (over: Partial<Api> = {}) => fakeApi({
  events: async () => ({ events: [], current: { key: '2027mokc', name: 'Heartland', redSide: 'left' } }),
  devices: async () => ({ adb: { available: true, devices: [] }, devices: [] }),
  ...over,
});

describe('Dashboard: missed answers', () => {
  it('lists the concerns that need a look, and acknowledges one', async () => {
    const ackMissed = vi.fn(async () => { const r = await CONCERNS(); r.questions[0].acknowledged = true; return r; });
    render(Dashboard, { api: dashboardApi({ missed: CONCERNS, ackMissed }) });
    const card = await screen.findByRole('region', { name: 'Needs a look (2)' });
    expect(within(card).getByText('Climb time', { selector: 'strong' })).toBeTruthy();
    expect(within(card).queryByText('Ada', { selector: 'strong' })).toBeNull(); // already acknowledged
    expect(within(card).getByRole('link', { name: /See all on Coverage/ }).getAttribute('href')).toBe('#/coverage');
    await fireEvent.click(within(within(card).getByText('Climb time', { selector: 'strong' }).closest('li')!).getByRole('button', { name: 'Acknowledge' }));
    expect(ackMissed).toHaveBeenCalledWith('q:climb_time');
    expect(await screen.findByRole('region', { name: 'Needs a look (1)' })).toBeTruthy();
  });

  it('shows no card when nothing needs a look', async () => {
    const allAcked = async () => { const r = await CONCERNS(); for (const c of [...r.questions, ...r.scouts]) c.acknowledged = true; return r; };
    render(Dashboard, { api: dashboardApi({ missed: allAcked }) });
    expect(await screen.findByText('Heartland')).toBeTruthy();
    expect(screen.queryByRole('region', { name: /Needs a look/ })).toBeNull();
  });
});

describe('Dashboard', () => {
  it('shows the event, plugged-in tablets and sync times', async () => {
    const api = fakeApi({
      events: async () => ({ events: [], current: { key: '2027mokc', name: 'Heartland', redSide: 'left' } }),
      devices: async () => ({
        adb: { available: true, devices: [{ serial: 'G5N', state: 'device', reversed: true }, { serial: 'ABC', state: 'unauthorized', reversed: false }] },
        devices: [{ id: 'd1', name: 'Tablet 1', lastSyncAt: new Date().toISOString() }],
      }),
    });
    render(Dashboard, { api });
    expect(await screen.findByText('Heartland')).toBeTruthy();
    expect(screen.getByText('Connected ✓')).toBeTruthy();
    expect(screen.getByText('Accept the "Allow USB debugging" prompt on the tablet')).toBeTruthy();
    expect(screen.getByText('Tablet 1')).toBeTruthy();
    expect(screen.getByText('just now')).toBeTruthy();
  });

  it('explains when adb is missing and no event exists', async () => {
    const api = fakeApi({
      events: async () => ({ events: [], current: null }),
      devices: async () => ({ adb: { available: false, devices: [], error: 'adb is not installed. Install it with: sudo apt install adb' }, devices: [] }),
    });
    render(Dashboard, { api });
    expect(await screen.findByText('adb is not installed. Install it with: sudo apt install adb')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Set one up' }).getAttribute('href')).toBe('#/event');
    await waitFor(() => expect(screen.getByText('No tablet has synced yet.')).toBeTruthy());
  });
});

describe('Dashboard: tablets with the same USB serial', () => {
  it('lists both, with their model, and keeps the synced list showing', async () => {
    const twin = { serial: '0123456789ABCDEF', state: 'device', model: 'P00C', reversed: true };
    const api = fakeApi({
      events: async () => ({ events: [], current: null }),
      devices: async () => ({
        adb: { available: true, devices: [{ ...twin, transportId: '7' }, { ...twin, transportId: '9' }] },
        devices: [{ id: 'd1', name: 'Tablet 1', lastSyncAt: new Date().toISOString() }],
      }),
    });
    render(Dashboard, { api });
    expect(await screen.findByText('Tablet 1')).toBeTruthy();
    const plugged = screen.getByRole('heading', { name: 'Plugged-in tablets' }).closest('section')!;
    expect(within(plugged).getAllByRole('listitem')).toHaveLength(2);
    expect(within(plugged).getAllByText(/P00C/)).toHaveLength(2);
  });
});

describe('Dashboard: refreshing', () => {
  it("refreshes when the hub's data changes, not on a timer", async () => {
    vi.useFakeTimers();
    const hub = fakeChanges();
    try {
      const events = vi.fn(async () => ({ events: [], current: { key: '2027mokc', name: 'Heartland', redSide: 'left' as const } }));
      const devices = vi.fn(async () => ({ adb: { available: true, devices: [] }, devices: [] }));
      render(Dashboard, { api: fakeApi({ events, devices, missed: CONCERNS }) });
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(events).toHaveBeenCalledTimes(1);
      expect(devices.mock.calls.length).toBeGreaterThan(20); // USB connections are still checked every 2 seconds
      hub.changed();
      await vi.advanceTimersByTimeAsync(300);
      expect(events).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
