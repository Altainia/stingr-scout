import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ErrorNote from '../src/components/ErrorNote.svelte';
import { ApiError } from '../src/lib/api';
import Dashboard from '../src/pages/Dashboard.svelte';
import Settings from '../src/pages/Settings.svelte';
import { fakeApi } from './helpers';

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
