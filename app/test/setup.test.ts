import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Settings from '../src/screens/Settings.svelte';
import Setup from '../src/screens/Setup.svelte';
import { makeStore } from './helpers';

describe('Setup', () => {
  it('names the tablet and picks its usual slot', async () => {
    const { store } = await makeStore({ settings: { deviceName: '' } });
    expect(store.screen).toEqual({ name: 'setup' });
    render(Setup, { store });
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText('Tablet name'), { target: { value: 'Tablet 2' } });
    await fireEvent.change(screen.getByLabelText('Default slot'), { target: { value: 'blue2' } });
    await fireEvent.click(save);
    await waitFor(() => expect(store.screen).toEqual({ name: 'home' }));
    expect(store.settings).toMatchObject({ deviceName: 'Tablet 2', defaultSlot: 'blue2' });
  });
});

describe('Settings', () => {
  it('shows tablet details and saves changes', async () => {
    const { store } = await makeStore();
    render(Settings, { store });
    expect(screen.getByText('dev-1')).toBeTruthy();
    await fireEvent.input(screen.getByLabelText('Tablet name'), { target: { value: 'Tablet 9' } });
    await fireEvent.change(screen.getByLabelText('Red alliance side'), { target: { value: 'right' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.settings.deviceName).toBe('Tablet 9'));
    expect(store.settings.redSideOverride).toBe('right');
    expect(await screen.findByText('Saved ✓')).toBeTruthy();
    await fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
    expect(document.documentElement.dataset.theme).toBe('dark'); // applies straight away
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(store.screen).toEqual({ name: 'home' });
  });
});
