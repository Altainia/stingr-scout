import type { HubConfig, ScoutRecord, SyncResponse } from '@stingr/shared';
import type { StingrDb } from './db';
import { pruneForHub } from './prune';

export interface SyncProgress { done: number; total: number }
export interface SyncResult { acked: number; rejected: number; photos: number; removed: number; config: HubConfig }
export interface SyncDeps { db: StingrDb; fetch: typeof fetch; device: { id: string; name: string }; now: () => string }

export const BATCH = 25;
const LOST = 'Lost the connection to the hub. Check the cable, then sync again.';

export async function pingHub(fetchImpl: typeof fetch, timeoutMs = 1500): Promise<{ appBuild: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl('/api/ping', { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { hub?: unknown; appBuild?: unknown };
    return body.hub === 'stingr-scout' ? { appBuild: String(body.appBuild ?? '') } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function send(deps: SyncDeps, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await deps.fetch(url, init);
  } catch {
    throw new Error(LOST);
  }
  if (!res.ok) {
    let message = `The hub answered with an error (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // not JSON; keep the generic message
    }
    throw new Error(message);
  }
  return res;
}

export async function runSync(deps: SyncDeps, onProgress: (p: SyncProgress) => void = () => {}): Promise<SyncResult> {
  const { db } = deps;
  const before = await db.getKv('config'); // to notice events the hub deleted, or a new season
  const waiting = (await db.listRecords()).filter(r => r.sync !== 'synced').map(r => r.rec);
  const batches: ScoutRecord[][] = [];
  for (let i = 0; i < waiting.length; i += BATCH) batches.push(waiting.slice(i, i + BATCH));
  if (batches.length === 0) batches.push([]); // still fetch the latest forms and schedule
  const photos = (await db.listPhotos()).filter(p => !p.uploaded);
  const progress: SyncProgress = { done: 0, total: waiting.length + photos.length };
  onProgress({ ...progress });

  let config: HubConfig | null = null;
  let acked = 0;
  let rejected = 0;
  for (const records of batches) {
    const res = await send(deps, '/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device: deps.device, records }),
    });
    const body = (await res.json()) as SyncResponse;
    await db.markSynced(body.acked);
    acked += body.acked.length;
    for (const r of body.rejected) await db.markRejected(r, r.reason);
    rejected += body.rejected.length;
    config = body.config;
    progress.done += records.length;
    onProgress({ ...progress });
  }
  let removed = 0;
  if (config) {
    removed = await pruneForHub(db, before, config);
    await db.setKv('config', config);
  }
  await db.setKv('lastSyncAt', deps.now());

  // Upload every waiting photo that a record the hub now has actually lists (not photos from an
  // unsubmitted or discarded edit). PUT is idempotent on the hub.
  const listed = new Set((await db.listRecords()).filter(r => r.sync === 'synced').flatMap(r => r.rec.photoIds));
  let uploaded = 0;
  for (const p of photos) {
    if (listed.has(p.id)) {
      await send(deps, `/api/photos/${encodeURIComponent(p.id)}?recordId=${encodeURIComponent(p.recordId)}`, {
        method: 'PUT',
        headers: { 'content-type': p.mime },
        body: new Blob([p.data], { type: p.mime }),
      });
      await db.markPhotoUploaded(p.id);
      uploaded++;
    }
    progress.done++;
    onProgress({ ...progress });
  }
  return { acked, rejected, photos: uploaded, removed, config: config as HubConfig };
}
