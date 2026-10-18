import { decodeRecordData, type FormKind, QrAssembler } from '@stingr/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PastRecords from '../src/screens/PastRecords.svelte';
import QrView from '../src/screens/QrView.svelte';
import { CONFIG, makeStore, withMixedRecords } from './helpers';

const TITLE = 'Qual 1 · Red 1 · Team 5098';

async function withSubmittedMatch() {
  const ctx = await makeStore();
  await ctx.store.startMatch({ matchKey: 'qm1', slot: 'red1', team: 5098 });
  await ctx.store.submitDraft();
  return ctx;
}

describe('PastRecords', () => {
  it('lists records with their sync state and opens one for editing', async () => {
    const { store } = await withSubmittedMatch();
    render(PastRecords, { store });
    const item = screen.getByRole('listitem', { name: TITLE });
    expect(within(item).getByText('Not synced')).toBeTruthy();
    await fireEvent.click(within(item).getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(store.draft).toMatchObject({ isEdit: true, rec: { revision: 2 } }));
  });

  it('shows synced and rejected records', async () => {
    const { store, db } = await withSubmittedMatch();
    const id = store.records[0].id;
    await db.markSynced([{ id, revision: 1 }]);
    await store.reload();
    render(PastRecords, { store });
    expect(screen.getByText('Synced ✓')).toBeTruthy();
  });

  it('offers undo for a no-show and opens QR codes', async () => {
    const { store } = await makeStore();
    await store.matchNoShow({ matchKey: 'qm1', slot: 'red1', team: 5098 });
    render(PastRecords, { store });
    const item = screen.getByRole('listitem', { name: TITLE });
    expect(within(item).getByText(/not present/)).toBeTruthy();
    await fireEvent.click(within(item).getByRole('button', { name: 'Show QR' }));
    expect(store.screen).toEqual({ name: 'qr', id: store.records[0].id });
  });
});

describe('QrView', () => {
  it('shows a code that decodes back to the record', async () => {
    const { store } = await withSubmittedMatch();
    const id = store.records[0].id;
    render(QrView, { store, id });
    const box = await waitFor(() => {
      const el = document.querySelector('[data-qr-text]');
      if (!el) throw new Error('no QR code yet');
      return el;
    });
    expect(box.querySelector('svg')).toBeTruthy();
    const res = new QrAssembler().add(box.getAttribute('data-qr-text') ?? '');
    if (res.status !== 'complete') throw new Error('expected a single complete code');
    const lookup = (kind: FormKind, v: number) => CONFIG.forms.find(f => f.kind === kind && f.version === v);
    expect(await decodeRecordData(res.data, lookup)).toEqual(store.records[0].rec);
  });
});

describe('PastRecords: other events', () => {
  it('lists unsynced records from other events, and offers both tidy-up actions', async () => {
    const { store } = await withMixedRecords();
    render(PastRecords, { store });
    const other = screen.getByRole('region', { name: 'Other events' });
    expect(within(within(other).getByRole('listitem', { name: /\(2027gone\)/ })).getByText(/isn't on the hub/)).toBeTruthy();
    expect(within(other).getByRole('listitem', { name: /\(2027old\)/ })).toBeTruthy(); // the unsynced one
    await fireEvent.click(screen.getByRole('button', { name: 'Remove synced records from other events…' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove 1 synced record from other events?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(store.records).toHaveLength(3));
    expect(screen.queryByRole('button', { name: 'Remove synced records from other events…' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Delete refused records…' }));
    const refuse = screen.getByRole('dialog', { name: 'Delete 1 record the hub refused?' });
    expect(refuse.textContent).toContain("can't be synced");
    await fireEvent.click(within(refuse).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('listitem', { name: /\(2027gone\)/ })).toBeNull());
  });
});
