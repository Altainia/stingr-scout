import { render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../src/App.svelte';
import { fakeApi } from './helpers';

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
});
