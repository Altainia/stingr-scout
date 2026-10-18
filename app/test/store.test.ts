import { setAnswer } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { openStingrDb } from '../src/lib/db';
import { AppStore } from '../src/lib/store.svelte';
import { CONFIG, makeStore, withMixedRecords } from './helpers';

const match = { matchKey: 'qm1', slot: 'red1' as const, team: 5098 };

describe('AppStore', () => {
  it('asks for tablet setup on first launch', async () => {
    const db = await openStingrDb(`store-first-${Math.random()}`);
    const store = new AppStore({ db, newId: () => 'dev-new' });
    await store.load();
    expect(store.screen).toEqual({ name: 'setup' });
    expect(store.settings.deviceId).toBe('dev-new');
    expect((await db.getKv('settings'))?.deviceId).toBe('dev-new');
  });

  it('starts a match as a saved draft', async () => {
    const { store, db } = await makeStore();
    await store.startMatch(match);
    expect(store.screen).toEqual({ name: 'form' });
    expect(store.draft?.isEdit).toBe(false);
    expect(store.draft?.rec).toMatchObject({
      kind: 'match', matchKey: 'qm1', slot: 'red1', team: 5098, scout: 'Ada', deviceId: 'dev-1', eventKey: '2027test', formVersion: 1,
    });
    expect((await db.getKv('draft'))?.rec.id).toBe(store.draft?.rec.id);
  });

  it('restores an unfinished draft after a restart', async () => {
    const { store, db } = await makeStore();
    await store.startMatch(match);
    await store.updateDraft(setAnswer(store.draft!.rec, 'auto_coral', 4));
    const again = new AppStore({ db });
    await again.load();
    expect(again.screen).toEqual({ name: 'form' });
    expect(again.draft?.rec.answers.auto_coral).toBe(4);
  });

  it('drops a reopened draft that had already been submitted', async () => {
    const { store, db } = await makeStore();
    await store.startMatch(match);
    const draft = await db.getKv('draft');
    await store.submitDraft();
    await db.setKv('draft', draft!); // as if Chrome died between saving the record and clearing the draft
    const again = new AppStore({ db });
    await again.load();
    expect(again.draft).toBeNull();
    expect(again.screen).toEqual({ name: 'home' });
    expect(await db.getKv('draft')).toBeUndefined();
  });

  it('keeps a reopened edit that is newer than the saved record', async () => {
    const { store, db } = await makeStore();
    await store.startMatch(match);
    await store.submitDraft();
    await store.editRecord(store.records[0].id);
    const again = new AppStore({ db });
    await again.load();
    expect(again.draft).toMatchObject({ isEdit: true, rec: { revision: 2 } });
  });

  it('refuses to start before forms arrive from the hub', async () => {
    const { store } = await makeStore({ config: null });
    await expect(store.startMatch(match)).rejects.toThrow('No match form has been loaded from the hub yet');
  });

  it('submits a draft, marking unanswered required questions as missed', async () => {
    const { store, db } = await makeStore();
    await store.startMatch(match);
    await store.submitDraft();
    expect(store.screen).toEqual({ name: 'home' });
    expect(store.draft).toBeNull();
    expect(await db.getKv('draft')).toBeUndefined();
    expect(store.records).toHaveLength(1);
    expect(store.records[0]).toMatchObject({ sync: 'pending', rec: { missed: ['climb'] } });
    expect(store.pendingCount).toBe(1);
    expect(store.eventRecords).toHaveLength(1);
  });

  it('records a match no-show without opening a form', async () => {
    const { store } = await makeStore();
    await store.matchNoShow(match);
    expect(store.screen).toEqual({ name: 'home' });
    expect(store.records[0].rec).toMatchObject({ noShow: true, answers: {}, missed: [], matchKey: 'qm1', team: 5098 });
  });

  it('edits a submitted record as a new revision and can discard the edit', async () => {
    const { store, db } = await makeStore();
    await store.startMatch(match);
    await store.submitDraft();
    const id = store.records[0].id;
    await store.editRecord(id);
    expect(store.draft).toMatchObject({ isEdit: true, rec: { id, revision: 2 } });
    await store.discardDraft();
    expect(store.screen).toEqual({ name: 'records' });
    expect(store.records[0].rec.revision).toBe(1);
    expect(await db.getKv('draft')).toBeUndefined();
  });

  it('undoes a pit no-show by opening the pit form as a new revision', async () => {
    const { store } = await makeStore();
    await store.pitNoShow(5098);
    await store.undoNoShow(store.records[0].id);
    expect(store.screen).toEqual({ name: 'form' });
    expect(store.draft).toMatchObject({ isEdit: true, rec: { kind: 'pit', team: 5098, revision: 2, noShow: false } });
  });

  it('keeps photos with the draft and deletes them if the draft is discarded', async () => {
    const { store } = await makeStore();
    await store.startPit(5098);
    await store.addPhoto(new Uint8Array([9]).buffer, 'image/jpeg');
    expect(store.draft?.rec.photoIds).toEqual(['id-2']);
    expect(store.photos).toMatchObject([{ id: 'id-2', recordId: 'id-1', mime: 'image/jpeg', uploaded: false }]);
    await store.discardDraft();
    expect(store.photos).toEqual([]);
    expect(store.screen).toEqual({ name: 'pit' });
  });

  it('removes a photo from the draft', async () => {
    const { store } = await makeStore();
    await store.startPit(5098);
    await store.addPhoto(new Uint8Array([9]).buffer, 'image/jpeg');
    await store.removePhoto('id-2');
    expect(store.draft?.rec.photoIds).toEqual([]);
    expect(store.photos).toEqual([]);
  });

  it("uses the event's Red side unless this tablet overrides it", async () => {
    const { store } = await makeStore({ config: { ...CONFIG, event: { key: '2027test', name: 'Test Event', redSide: 'right' } } });
    expect(store.venueRedSide).toBe('right');
    await store.saveSettings({ redSideOverride: 'left' });
    expect(store.venueRedSide).toBe('left');
    await store.saveSettings({ redSideOverride: 'event' });
    expect(store.venueRedSide).toBe('right');
  });

  it('waits for a photo that is still saving before submitting', async () => {
    const { store } = await makeStore();
    await store.startPit(5098);
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const job = store.trackPhoto(async () => {
      await gate;
      await store.addPhoto(new Uint8Array([1]).buffer, 'image/jpeg');
    });
    expect(store.savingPhotos).toBe(1);
    const submitting = store.submitDraft();
    release();
    await job;
    await submitting;
    expect(store.records[0].rec.photoIds).toEqual(['id-2']);
    expect(store.savingPhotos).toBe(0);
  });

  it('keeps every photo when several are saved at once', async () => {
    const { store } = await makeStore();
    await store.startPit(5098);
    await Promise.all([
      store.addPhoto(new Uint8Array([1]).buffer, 'image/jpeg'),
      store.addPhoto(new Uint8Array([2]).buffer, 'image/jpeg'),
    ]);
    expect(store.draft?.rec.photoIds).toHaveLength(2);
  });

  it('deletes photos removed from a record once the edit is submitted', async () => {
    const { store } = await makeStore();
    await store.startPit(5098);
    await store.addPhoto(new Uint8Array([1]).buffer, 'image/jpeg');
    await store.submitDraft();
    await store.editRecord(store.records[0].id);
    await store.removePhoto('id-2');
    expect(store.photos).toHaveLength(1); // still needed if the edit is discarded
    await store.submitDraft();
    expect(store.photos).toEqual([]);
  });

  it('remembers teams added by hand', async () => {
    const { store, db } = await makeStore();
    await store.addExtraTeam(254);
    await store.addExtraTeam(254);
    expect(store.extraTeams).toEqual([254]);
    expect(await db.getKv('extraTeams')).toEqual([254]);
  });
});

describe('tidying a tablet', () => {
  it('removes synced records of other events, keeping unsynced ones', async () => {
    const { store, here, oldUnsynced, refused } = await withMixedRecords();
    expect(await store.removeSyncedFromOtherEvents()).toBe(1);
    expect(store.records.map(r => r.id).sort()).toEqual([here.id, oldUnsynced.id, refused.id].sort());
  });

  it('deletes the records the hub refused', async () => {
    const { store, refused } = await withMixedRecords();
    expect(await store.deleteRefused()).toBe(1);
    expect(store.records.some(r => r.id === refused.id)).toBe(false);
  });

  it('resets the tablet but keeps its name and slot', async () => {
    const { store, db } = await withMixedRecords();
    await store.startMatch(match);
    await store.resetTablet();
    expect(store.records).toEqual([]);
    expect(store.draft).toBeNull();
    expect(store.config).toBeNull();
    expect(await db.getKv('config')).toBeUndefined();
    expect(await db.getKv('draft')).toBeUndefined();
    expect(store.settings).toMatchObject({ deviceId: 'dev-1', deviceName: 'Tablet 1', defaultSlot: 'red1' });
    expect(store.screen).toEqual({ name: 'home' });
  });
});
