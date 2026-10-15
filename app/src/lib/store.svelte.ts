import {
  type EventInfo, finalizeSubmit, type FormDef, type FormKind, type HubConfig, markNoShow, newRecord,
  reviseRecord, type ScoutRecord, type Slot, undoNoShow,
} from '@stingr/shared';
import type { Draft, LocalPhoto, LocalRecord, Settings, StingrDb } from './db';
import { formVersion, latestForm } from './session';

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
  photos = $state<LocalPhoto[]>([]);
  draft = $state<Draft | null>(null);
  extraTeams = $state<number[]>([]);
  screen = $state<Screen>({ name: 'home' });

  readonly db: StingrDb;
  private readonly now: () => string;
  private readonly newId: () => string;

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
    this.draft = (await this.db.getKv('draft')) ?? null;
    await this.reload();
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

  get pendingCount(): number {
    return this.records.filter(r => r.sync !== 'synced').length;
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

  async submitDraft(): Promise<void> {
    const d = this.draft;
    if (!d) return;
    const rec = $state.snapshot(d.rec) as ScoutRecord;
    const form = this.formOf(rec);
    if (!form) throw new Error(`Form version ${rec.formVersion} is not on this tablet`);
    // Save first so the next screen already sees the new record, then leave the form, then clear the draft.
    await this.saveRecord(finalizeSubmit(form, rec, this.now()));
    this.screen = { name: rec.kind === 'pit' ? 'pit' : 'home' };
    await this.setDraft(null);
  }

  async discardDraft(): Promise<void> {
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
    const d = this.draft;
    if (!d) return;
    const id = this.newId();
    await this.db.putPhoto({ id, recordId: d.rec.id, mime, data, uploaded: false, createdAt: this.now() });
    await this.updateDraft({ ...d.rec, photoIds: [...d.rec.photoIds, id] });
    this.photos = await this.db.listPhotos();
  }

  async removePhoto(id: string): Promise<void> {
    const d = this.draft;
    if (!d) return;
    const submitted = this.records.find(r => r.id === d.rec.id)?.rec.photoIds ?? [];
    if (!submitted.includes(id)) await this.db.deletePhoto(id);
    await this.updateDraft({ ...d.rec, photoIds: d.rec.photoIds.filter(x => x !== id) });
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
    await this.db.putRecord(rec);
    this.records = await this.db.listRecords();
  }

  private async setDraft(d: Draft | null): Promise<void> {
    this.draft = d; // synchronous, so back-to-back edits always build on the latest answers
    if (d) await this.db.setKv('draft', $state.snapshot(d) as Draft);
    else await this.db.deleteKv('draft');
  }
}
