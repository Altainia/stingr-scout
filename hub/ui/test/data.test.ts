import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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
    expect(screen.getByRole('link', { name: /Alliance results/ }).getAttribute('href')).toBe('/api/export/alliance.csv');
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

  const twoEvents = async () => ({
    events: [{ key: '2027demo', name: 'Demo', redSide: 'left' as const }, { key: '2027mokc', name: 'Heartland', redSide: 'left' as const }],
    current: { key: '2027mokc', name: 'Heartland', redSide: 'left' as const },
  });

  it('deletes an event only after its key is typed, and names the backup', async () => {
    const deleteEvent = vi.fn(async () => ({ ok: true as const, backup: 'stingr-1.db', removed: { matches: 12, teams: 24, records: 48, photos: 3 } }));
    render(DataPage, { api: fakeApi({ events: twoEvents, eventClearPreview: async () => ({ matches: 12, teams: 24, records: 48, photos: 3 }), deleteEvent }) });
    await fireEvent.change(await screen.findByLabelText('Event to delete'), { target: { value: '2027demo' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Delete event…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Demo (2027demo)?' });
    expect(dialog.textContent).toContain('12 matches, 24 teams, 48 records and 3 photos');
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText('Type 2027demo to confirm'))); // ready to type
    const go = within(dialog).getByRole('button', { name: 'Delete event' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await fireEvent.input(within(dialog).getByLabelText('Type 2027demo to confirm'), { target: { value: '2027demo' } });
    expect(go.disabled).toBe(false);
    await fireEvent.click(go);
    expect(deleteEvent).toHaveBeenCalledWith('2027demo', '2027demo');
    expect(await screen.findByText(/Deleted 2027demo\. A backup was saved first: backups\/stingr-1\.db/)).toBeTruthy();
  });

  it('starts a new season only after NEW SEASON is typed', async () => {
    const newSeason = vi.fn(async () => ({ ok: true as const, backup: null, removed: { events: 2, records: 48, photos: 3, forms: 2, drafts: 0, devices: 4 } }));
    render(DataPage, { api: fakeApi({ events: twoEvents, seasonClearPreview: async () => ({ events: 2, records: 48, photos: 3, forms: 2, drafts: 0, devices: 4 }), newSeason }) });
    await fireEvent.click(await screen.findByRole('button', { name: 'Start a new season…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start a new season?' });
    expect(dialog.textContent).toContain('2 events, 48 records, 3 photos, 2 published forms, 0 drafts and the list of 4 tablets');
    await fireEvent.input(within(dialog).getByLabelText('Type NEW SEASON to confirm'), { target: { value: 'NEW SEASON' } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Start new season' }));
    expect(newSeason).toHaveBeenCalledWith('NEW SEASON');
    expect(await screen.findByText(/New season started\./)).toBeTruthy();
  });
});
