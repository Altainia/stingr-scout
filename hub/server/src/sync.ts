import {
  checkRecord, type DeviceInfo, type HubConfig, type RecordRef, type ScoutRecord,
  type SyncRequest, type SyncResponse,
} from '@stingr/shared';
import { type Db, tx } from './db';
import { touchDevice } from './store/devices';
import { currentEvent, eventInstances, listEvents } from './store/events';
import { getForm, listForms } from './store/forms';
import { hubIdentity } from './store/identity';
import { missingPhotoIds } from './store/photos';
import { type InsertOutcome, insertRecord } from './store/records';
import { listSchedule, listTeams } from './store/schedule';

export function buildConfig(db: Db, appBuild: string): HubConfig {
  const event = currentEvent(db);
  return {
    ...hubIdentity(db),
    eventKeys: listEvents(db).map(e => e.key),
    eventInstances: eventInstances(db),
    event,
    forms: listForms(db),
    schedule: event ? listSchedule(db, event.key) : [],
    teams: event ? listTeams(db, event.key) : [],
    appBuild,
  };
}

export function parseSyncRequest(body: unknown): SyncRequest | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'Sync request must be a JSON object';
  const b = body as { device?: Partial<DeviceInfo>; records?: unknown };
  if (!b.device || typeof b.device.id !== 'string' || !b.device.id || typeof b.device.name !== 'string') {
    return 'Sync request needs device.id and device.name';
  }
  if (!Array.isArray(b.records)) return 'Sync request needs a records list';
  const inst = (body as { eventInstances?: unknown }).eventInstances;
  const instances = typeof inst === 'object' && inst !== null && !Array.isArray(inst)
    && Object.values(inst).every(v => typeof v === 'string') ? (inst as Record<string, string>) : undefined;
  return { device: { id: b.device.id, name: b.device.name }, records: b.records as ScoutRecord[], ...(instances ? { eventInstances: instances } : {}) };
}

export type IngestResult = { ok: true; outcome: InsertOutcome; record: ScoutRecord } | { ok: false; reason: string };

export function ingestRecord(db: Db, value: unknown, via: 'usb' | 'qr', now: string, instance?: string): IngestResult {
  const errors = checkRecord(value);
  if (errors.length) return { ok: false, reason: errors.join('; ') };
  const rec = value as ScoutRecord;
  if (!db.prepare('SELECT 1 FROM events WHERE key = ?').get(rec.eventKey)) {
    return { ok: false, reason: `Event ${rec.eventKey} isn't on the hub (it may have been deleted)` };
  }
  if (instance !== undefined && instance !== eventInstances(db)[rec.eventKey]) {
    return { ok: false, reason: `Event ${rec.eventKey} was deleted on the hub; this record belongs to the deleted one` };
  }
  if (!getForm(db, rec.kind, rec.formVersion)) return { ok: false, reason: `Unknown ${rec.kind} form version ${rec.formVersion}` };
  return { ok: true, outcome: insertRecord(db, rec, via, now), record: rec };
}

export function handleSync(db: Db, req: SyncRequest, appBuild: string, now: string): SyncResponse {
  const acked: RecordRef[] = [];
  const rejected: SyncResponse['rejected'] = [];
  const photoIds = new Set<string>();
  tx(db, () => {
    for (const value of req.records) {
      const id = (value as { id?: unknown } | null)?.id;
      const res = ingestRecord(db, value, 'usb', now, typeof id === 'string' ? req.eventInstances?.[id] : undefined);
      if (res.ok) {
        acked.push({ id: res.record.id, revision: res.record.revision });
        for (const p of res.record.photoIds) photoIds.add(p);
      } else {
        const raw = (value ?? {}) as Partial<ScoutRecord>;
        rejected.push({ id: String(raw.id ?? ''), revision: Number(raw.revision ?? 0), reason: res.reason });
      }
    }
    touchDevice(db, req.device, now);
  });
  return { acked, rejected, wantedPhotoIds: missingPhotoIds(db, [...photoIds]), config: buildConfig(db, appBuild) };
}
