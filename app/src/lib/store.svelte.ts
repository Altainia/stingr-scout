import {
  type EventInfo, finalizeSubmit, type FormDef, type FormKind, type HubConfig, markNoShow, newRecord,
  reviseRecord, type ScoutRecord, type Side, type Slot, undoNoShow,
} from '@stingr/shared';
import type { Draft, LocalPhoto, LocalRecord, Settings, StingrDb, SyncState } from './db';
import { formVersion, latestForm, type PitView } from './session';

export type Screen =
  | { name: 'setup' }
  | { name: 'home' }
  | { name: 'form' }
  | { name: 'pit' }
  | { name: 'records' }
  | { name: 'qr'; id: string }
  | { name: 'settings' };

export interface StoreDeps { db: StingrDb; now?: () => string; newId?: () => string }
export interface MatchStart { matchKey: string; slot: Slot; team: number }

export class AppStore {
  settings = $state<Settings>({ deviceId: '', deviceName: '', defaultSlot: 'red1', scout: '' });
  config = $state<HubConfig | null>(null);
  records = $state<LocalRecord[]>([]);
  /** How the pit list is filtered and sorted; kept while the scout goes between the list and a form. */
  pitView = $state<PitView>({ search: '', show: 'all', sort: 'number' });
  photos = $state<LocalPhoto[]>([]);
  draft = $state<Draft | null>(null);
  extraTeams = $state<number[]>([]);
  screen = $state<Screen>({ name: 'home' });
  /** Photos being resized or stored right now; Submit waits for them. */
  savingPhotos = $state(0);

  readonly db: StingrDb;
  private readonly now: () => string;
  private readonly newId: () => string;
  private readonly photoJobs = new Set<Promise<void>>();

  constructor(deps: StoreDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  async load(): Promise<void> {
    const saved = await this.db.getKv('settings');
    this.settings = saved ?? { deviceId: this.newId(), deviceName: '', defaultSlot: 'red1', scout: '' };
    if (!saved) await this.db.setKv('settings', $state.snapshot(this.settings));
    this.extraTeams = (await this.db.getKv('extraTeams')) ?? [];
    let draft = (await this.db.getKv('draft')) ?? null;
    await this.reload();
    // If the app stopped right after saving a record but before clearing its draft, the draft is stale.
    const stored = draft ? this.records.find(r => r.id === draft?.rec.id) : undefined;
    if (draft && stored && stored.rec.revision >= draft.rec.revision) {
      await this.db.deleteKv('draft');
      draft = null;
    }
    this.draft = draft;
    this.screen = !this.settings.deviceName ? { name: 'setup' } : this.draft ? { name: 'form' } : { name: 'home' };
  }

  async reload(): Promise<void> {
    this.config = (await this.db.getKv('config')) ?? null;
    this.records = await this.db.listRecords();
    this.photos = await this.db.listPhotos();
  }

  get event(): EventInfo | null {
    return this.config?.event ?? null;
  }

  get eventRecords(): ScoutRecord[] {
    const key = this.event?.key;
    return this.records.map(r => r.rec).filter(r => !key || r.eventKey === key);
  }

  /** Records of events other than the current one (none when no event is loaded). */
  get otherEventRecords(): LocalRecord[] {
    const key = this.event?.key;
    return key ? this.records.filter(r => r.rec.eventKey !== key) : [];
  }

  /** Tidying between events: synced records of other events go; unsynced ones stay. */
  async removeSyncedFromOtherEvents(): Promise<number> {
    return this.removeRecords(this.otherEventRecords.filter(r => r.sync === 'synced'), 'synced');
  }

  /** Records the hub refused (for example because their event was deleted) can't be synced, so the scout may delete them. */
  async deleteRefused(): Promise<number> {
    return this.removeRecords(this.records.filter(r => r.sync === 'rejected'), 'rejected');
  }

  private async removeRecords(rows: LocalRecord[], state: SyncState): Promise<number> {
    if (!rows.length) return 0;
    const deleted = new Set(await this.db.deleteRecords(rows.map(r => r.id), state));
    for (const p of this.photos) if (deleted.has(p.recordId)) await this.db.deletePhoto(p.id);
    await this.reload();
    return deleted.size;
  }

  /** For demos and testing: everything but the tablet's identity and theme goes; the next sync loads the hub's event again. */
  async resetTablet(): Promise<void> {
    await this.db.clearAll();
    this.draft = null;
    await this.reload();
    this.screen = { name: 'home' };
  }

  get pendingCount(): number {
    return this.records.filter(r => r.sync !== 'synced').length;
  }

  /** Which side Red is on as seen from the stands: this tablet's override, else the event's setting. */
  get venueRedSide(): Side {
    const o = this.settings.redSideOverride;
    return o === 'left' || o === 'right' ? o : this.event?.redSide ?? 'left';
  }

  form(kind: FormKind): FormDef | null {
    return latestForm(this.config?.forms ?? [], kind);
  }

  formOf(rec: ScoutRecord): FormDef | null {
    return formVersion(this.config?.forms ?? [], rec.kind, rec.formVersion);
  }

  go(screen: Screen): void {
    this.screen = screen;
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    await this.db.setKv('settings', $state.snapshot(this.settings));
  }

  async addExtraTeam(team: number): Promise<void> {
    if (this.extraTeams.includes(team)) return;
    this.extraTeams = [...this.extraTeams, team];
    await this.db.setKv('extraTeams', $state.snapshot(this.extraTeams));
  }

  async startMatch(p: MatchStart): Promise<void> {
    await this.setDraft({ rec: this.create('match', p.team, p.matchKey, p.slot), isEdit: false });
    this.screen = { name: 'form' };
  }

  async matchNoShow(p: MatchStart): Promise<void> {
    await this.saveRecord(markNoShow(this.create('match', p.team, p.matchKey, p.slot), this.now()));
  }

  async startPit(team: number): Promise<void> {
    await this.setDraft({ rec: this.create('pit', team), isEdit: false });
    this.screen = { name: 'form' };
  }

  async pitNoShow(team: number): Promise<void> {
    await this.saveRecord(markNoShow(this.create('pit', team), this.now()));
  }

  async updateDraft(rec: ScoutRecord): Promise<void> {
    if (this.draft) await this.setDraft({ ...this.draft, rec });
  }

  /** Run a photo save (resize + store). Submit and discard wait for it, so a photo is never left out of its record. */
  trackPhoto(job: () => Promise<void>): Promise<void> {
    this.savingPhotos++;
    const p: Promise<void> = job().finally(() => {
      this.savingPhotos--;
      this.photoJobs.delete(p);
    });
    this.photoJobs.add(p);
    return p;
  }

  async submitDraft(): Promise<void> {
    await Promise.allSettled([...this.photoJobs]);
    const d = this.draft;
    if (!d) return;
    const rec = $state.snapshot(d.rec) as ScoutRecord;
    const form = this.formOf(rec);
    if (!form) throw new Error(`Form version ${rec.formVersion} is not on this tablet`);
    // Save first so the next screen already sees the new record, then leave the form, then clear the draft.
    const submitted = finalizeSubmit(form, rec, this.now());
    await this.saveRecord(submitted);
    // Photos this record no longer lists (removed during an edit) aren't needed on the tablet any more.
    const keep = new Set(submitted.photoIds);
    for (const p of this.photos) if (p.recordId === submitted.id && !keep.has(p.id)) await this.db.deletePhoto(p.id);
    this.photos = await this.db.listPhotos();
    this.screen = { name: rec.kind === 'pit' ? 'pit' : 'home' };
    await this.setDraft(null);
  }

  async discardDraft(): Promise<void> {
    await Promise.allSettled([...this.photoJobs]);
    const d = this.draft;
    if (!d) return;
    const kept = new Set(this.records.find(r => r.id === d.rec.id)?.rec.photoIds ?? []);
    for (const id of d.rec.photoIds) if (!kept.has(id)) await this.db.deletePhoto(id);
    this.screen = { name: d.rec.kind === 'pit' ? 'pit' : d.isEdit ? 'records' : 'home' };
    await this.setDraft(null);
    this.photos = await this.db.listPhotos();
  }

  async editRecord(id: string): Promise<void> {
    const r = this.records.find(x => x.id === id);
    if (!r) return;
    await this.setDraft({ rec: reviseRecord($state.snapshot(r.rec) as ScoutRecord, this.now()), isEdit: true });
    this.screen = { name: 'form' };
  }

  async undoNoShow(id: string): Promise<void> {
    const r = this.records.find(x => x.id === id);
    const form = r ? this.form(r.rec.kind) : null;
    if (!r || !form) return;
    await this.setDraft({ rec: undoNoShow(form, $state.snapshot(r.rec) as ScoutRecord, this.now()), isEdit: true });
    this.screen = { name: 'form' };
  }

  async addPhoto(data: ArrayBuffer, mime: string): Promise<void> {
    const recordId = this.draft?.rec.id;
    if (!recordId) return;
    const id = this.newId();
    await this.db.putPhoto({ id, recordId, mime, data, uploaded: false, createdAt: this.now() });
    // Re-read the draft after the await: other edits may have happened meanwhile.
    const cur = this.draft;
    if (!cur || cur.rec.id !== recordId) {
      await this.db.deletePhoto(id);
      return;
    }
    await this.updateDraft({ ...cur.rec, photoIds: [...cur.rec.photoIds, id] });
    this.photos = await this.db.listPhotos();
  }

  async removePhoto(id: string): Promise<void> {
    const d = this.draft;
    if (!d) return;
    const submitted = this.records.find(r => r.id === d.rec.id)?.rec.photoIds ?? [];
    if (!submitted.includes(id)) await this.db.deletePhoto(id);
    const cur = this.draft;
    if (cur && cur.rec.id === d.rec.id) await this.updateDraft({ ...cur.rec, photoIds: cur.rec.photoIds.filter(x => x !== id) });
    this.photos = await this.db.listPhotos();
  }

  private create(kind: FormKind, team: number, matchKey?: string, slot?: Slot): ScoutRecord {
    const form = this.form(kind);
    const ev = this.event;
    if (!form || !ev) throw new Error(`No ${kind} form has been loaded from the hub yet`);
    return newRecord({
      id: this.newId(), form: $state.snapshot(form) as FormDef, eventKey: ev.key, team,
      scout: this.settings.scout.trim(), deviceId: this.settings.deviceId, now: this.now(), matchKey, slot,
    });
  }

  private async saveRecord(rec: ScoutRecord): Promise<void> {
    await this.db.putRecord(rec, this.config?.eventInstances?.[rec.eventKey]);
    this.records = await this.db.listRecords();
  }

  private async setDraft(d: Draft | null): Promise<void> {
    this.draft = d; // synchronous, so back-to-back edits always build on the latest answers
    if (d) await this.db.setKv('draft', $state.snapshot(d) as Draft);
    else await this.db.deleteKv('draft');
  }
}
