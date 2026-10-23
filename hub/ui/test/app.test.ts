import { render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.svelte';
import { fakeApi, fakeChanges } from './helpers';

afterEach(() => { location.hash = ''; });

describe('App', () => {
  it('shows the page named in the address and marks it in the navigation', async () => {
    location.hash = '#/settings';
    render(App, { api: fakeApi({ settings: async () => ({ tbaKeySet: false }) }) });
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Hub' });
    expect(within(nav).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Pit form' }).getAttribute('href')).toBe('#/forms/pit');
  });

  it('follows links between pages', async () => {
    location.hash = '#/settings';
    render(App, { api: fakeApi({ settings: async () => ({ tbaKeySet: false }), coverage: async () => [] }) });
    location.hash = '#/coverage';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await tick();
    expect(screen.getByRole('heading', { level: 1, name: 'Coverage' })).toBeTruthy();
  });

  it('says when a page does not exist', async () => {
    location.hash = '#/nowhere';
    render(App, { api: fakeApi() });
    expect(screen.getByText(/Page not found/)).toBeTruthy();
  });

  it('counts missed-answer concerns that need a look on the Coverage menu item', async () => {
    location.hash = '#/settings';
    const missed = async () => ({
      questions: [{ id: 'q:a', acknowledged: false, key: 'a', label: 'A', missed: 9, total: 40, scouts: 5, scoutsAsked: 6, matches: [] }],
      scouts: [
        { id: 's:b:a', acknowledged: false, scout: 'B', key: 'a', label: 'A', missed: 6, total: 8, othersMissed: 2, othersTotal: 30, matches: [] },
        { id: 's:c:a', acknowledged: true, scout: 'C', key: 'a', label: 'A', missed: 6, total: 8, othersMissed: 2, othersTotal: 30, matches: [] },
      ],
    });
    render(App, { api: fakeApi({ settings: async () => ({ tbaKeySet: false }), missed }) });
    const coverage = within(screen.getByRole('navigation', { name: 'Hub' })).getByRole('link', { name: /^Coverage/ });
    expect(await within(coverage).findByText('2')).toBeTruthy();
    expect(coverage.textContent).toContain('need a look');
  });

  it('recounts the badge when the hub says something changed, not on a timer', async () => {
    vi.useFakeTimers();
    const hub = fakeChanges();
    try {
      location.hash = '#/settings';
      const missed = vi.fn(async () => ({ questions: [], scouts: [] }));
      render(App, { api: fakeApi({ settings: async () => ({ tbaKeySet: false }), missed }) });
      expect(missed).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(missed).toHaveBeenCalledTimes(1); // no polling
      hub.changed();
      await vi.advanceTimersByTimeAsync(300);
      expect(missed).toHaveBeenCalledTimes(2);
      hub.reconnected(); // catch up on anything missed while disconnected
      await vi.advanceTimersByTimeAsync(300);
      expect(missed).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
