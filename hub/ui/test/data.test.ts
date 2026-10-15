import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DataPage from '../src/pages/DataPage.svelte';
import { fakeApi } from './helpers';

const withEvent = async () => ({ events: [], current: { key: '2027mokc', name: 'Heartland', redSide: 'left' as const } });

describe('DataPage', () => {
  it('links the CSV exports and the backup', async () => {
    render(DataPage, { api: fakeApi({ events: withEvent }) });
    expect((await screen.findByRole('link', { name: /Match data/ })).getAttribute('href')).toBe('/api/export/matches.csv');
    expect(screen.getByRole('link', { name: /Pit data/ }).getAttribute('href')).toBe('/api/export/pit.csv');
    expect(screen.getByRole('link', { name: /Team summaries/ }).getAttribute('href')).toBe('/api/export/teams.csv');
    expect(screen.getByRole('link', { name: 'Download backup' }).getAttribute('href')).toBe('/api/backup');
  });

  it('asks for an event before exporting', async () => {
    render(DataPage, { api: fakeApi({ events: async () => ({ events: [], current: null }) }) });
    expect(await screen.findByRole('link', { name: 'Choose an event first' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Match data/ })).toBeNull();
  });

  it('restores a backup after confirming', async () => {
    const restore = vi.fn(async () => ({ ok: true as const }));
    render(DataPage, { api: fakeApi({ events: withEvent, restore }) });
    const file = new File(['sqlite'], 'stingr-backup.db', { type: 'application/octet-stream' });
    await fireEvent.change(await screen.findByLabelText('Backup file'), { target: { files: [file] } });
    await fireEvent.click(screen.getByRole('button', { name: 'Restore…' }));
    const dialog = screen.getByRole('dialog', { name: 'Replace all hub data?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Replace with the backup' }));
    expect(restore).toHaveBeenCalledWith(file);
    expect(await screen.findByText(/^Restored\./)).toBeTruthy();
  });
});
