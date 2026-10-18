# Plan 5 — Clearing Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the team delete an event or start a new season on the hub (with typed confirmation and an automatic backup), have tablets follow the hub by dropping synced data the hub no longer has, and let a tablet be tidied or reset by hand — without ever silently losing an unsynced record or letting old records slip into new forms.

**Architecture:** The hub gains clearing functions in a new `store/clear.ts`, two confirmed routes that write a `VACUUM INTO` backup to `<data folder>/backups/` first, a per-kind form-version floor so numbering never restarts, an "unknown event" refusal in `ingestRecord`, and `hubId` / `seasonId` / `eventKeys` in the sync config. The tablet gains `pruneForHub` (run inside `runSync`), store methods for the manual actions, and UI in Past records and Settings. The hub's Export & backup page gets a Clear data section.

**Tech Stack:** existing — Node 22 `node:sqlite`, Fastify 5, Svelte 5, idb, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-stingr-scout-design.md` §6.8–§6.10.

## Global Constraints

- Nothing unsynced on a tablet is removed without the scout confirming; "Follow the hub" removes only records whose `sync === 'synced'`.
- A tablet removes nothing after syncing with a different hub (`hubId` differs or the previous config has none).
- Hub clearing requires the confirmation text in the request body (`confirm`: the event key, or `NEW SEASON`); the server checks it, not only the UI.
- Before the hub removes anything it writes `<dirname(dbPath)>/backups/stingr-<stamp>.db`; with no database file (in-memory, tests) the backup is `null` and clearing still works.
- Published form versions never restart: `publishDraft` uses `max(latest version, floor) + 1`, where the floor is the setting `form_version_floor:<kind>`.
- Copy: "Event <key> isn't on the hub (it may have been deleted)" is the refusal reason, verbatim.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; commit only after `npm test` and `npm run typecheck` pass (and `npm run e2e` where a task says so), chained with `&&`.

## Review Focus

1. A tablet's unsynced record for a deleted event must not recreate the event on the hub (Task 3 "refuses a record for an event that isn't on the hub").
2. After a new season, an old tablet record made with form version 1 must be refused, not filed under the new version 1 (Task 2 "keeps counting form versions after a new season" + Task 3).
3. A tablet that syncs with a second hub laptop must keep its records (Task 6 "removes nothing after syncing with a different hub").
4. A refused record from a deleted event must still be visible and deletable on the tablet; Past records currently shows only the current event (Task 7 "lists unsynced records from other events").
5. A failed backup must stop the clear, not proceed without one (Task 4 "does not clear anything when the backup can't be written").

---

## File Structure

```
shared/src/types.ts                       HubConfig: + hubId, seasonId, eventKeys
hub/server/src/store/identity.ts          hubIdentity(db) → { hubId, seasonId } (created on first use)
hub/server/src/store/forms.ts             (modify) publishDraft honours the version floor
hub/server/src/store/clear.ts             eventCounts, deleteEvent, seasonCounts, startNewSeason
hub/server/src/sync.ts                    (modify) buildConfig fields; ingestRecord refuses unknown events
hub/server/src/routes/clear.ts            preview + confirmed clear routes, automatic backup
hub/server/src/app.ts                     (modify) register clearRoutes
hub/server/test/clear.test.ts             store + route tests
hub/ui/src/lib/api.ts                     (modify) clear API calls
app/src/components/ConfirmDialog.svelte   (modify) confirmDisabled prop
hub/ui/src/pages/DataPage.svelte          (modify) Clear data section
hub/ui/test/data.test.ts                  (modify)
app/src/lib/db.ts                         (modify) deleteRecords, clearAll
app/src/lib/prune.ts                      pruneForHub
app/src/lib/sync.ts                       (modify) prune after each sync; SyncResult.removed
app/src/lib/store.svelte.ts               (modify) removeSyncedFromOtherEvents, deleteRefused, resetTablet
app/src/screens/PastRecords.svelte        (modify) other-events section and actions
app/src/screens/Settings.svelte           (modify) Reset this tablet
app/test/prune.test.ts, sync.test.ts, store.test.ts, records.test.ts, setup.test.ts (modify/create)
e2e/hub.spec.ts                           delete an event through the hub screen
```

---

### Task 1: Hub identity and event keys in the sync config

**Files:** Modify `shared/src/types.ts`, `hub/server/src/sync.ts`, `app/test/helpers.ts`; Create `hub/server/src/store/identity.ts`; Test `hub/server/test/sync.test.ts`

**Interfaces:**
- Produces: `HubConfig` gains `hubId: string; seasonId: string; eventKeys: string[]`. `hubIdentity(db: Db): { hubId: string; seasonId: string }` (creates and stores `hub_id` / `season_id` settings on first call); `newSeasonId(db: Db): string` (stores and returns a fresh `season_id`).

- [ ] **Step 1: Failing test** — append to `hub/server/test/sync.test.ts` inside `describe('handleSync'…)` (or a new describe):

```ts
describe('hub identity', () => {
  it('sends a stable hub id, a season id and the event keys in the config', () => {
    const db = setup();
    upsertEvent(db, { key: '2027other', name: 'Other' });
    const first = handleSync(db, { device, records: [] }, 'b', NOW).config;
    const second = handleSync(db, { device, records: [] }, 'b', NOW).config;
    expect(first.hubId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.seasonId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.hubId).toBe(first.hubId);
    expect(second.seasonId).toBe(first.seasonId);
    expect(first.eventKeys).toEqual(['2027other', '2027test']);
  });
});
```

Run: `npx vitest run --project node hub/server/test/sync.test.ts` — Expected: FAIL (`hubId` undefined).

- [ ] **Step 2: Implement.** `shared/src/types.ts` HubConfig:

```ts
export interface HubConfig {
  /** Created once per hub database; tablets only follow deletions from the hub they last synced with. */
  hubId: string;
  /** Changes when the hub starts a new season. */
  seasonId: string;
  /** Every event on the hub, so tablets can drop synced records of deleted ones. */
  eventKeys: string[];
  event: EventInfo | null;
  forms: FormDef[];
  schedule: ScheduleMatch[];
  teams: number[];
  appBuild: string;
}
```

`hub/server/src/store/identity.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { getSetting, setSetting } from './settings';

export function hubIdentity(db: Db): { hubId: string; seasonId: string } {
  let hubId = getSetting(db, 'hub_id');
  if (!hubId) setSetting(db, 'hub_id', (hubId = randomUUID()));
  let seasonId = getSetting(db, 'season_id');
  if (!seasonId) setSetting(db, 'season_id', (seasonId = randomUUID()));
  return { hubId, seasonId };
}

export function newSeasonId(db: Db): string {
  const id = randomUUID();
  setSetting(db, 'season_id', id);
  return id;
}
```

`buildConfig` in `hub/server/src/sync.ts`: return `{ ...hubIdentity(db), eventKeys: listEvents(db).map(e => e.key), event, forms…, appBuild }` (import `hubIdentity`, `listEvents`). In `app/test/helpers.ts` add `hubId: 'hub-1', seasonId: 'season-1', eventKeys: ['2027test'],` to `CONFIG`. Fix any other `HubConfig` literal typecheck reports (e.g. `app/test/*` and `hub/ui/test/*`) the same way.

- [ ] **Step 3:** `npm test && npm run typecheck` → PASS. Commit `feat(hub): hub and season ids and the event list in the sync config`.

---

### Task 2: Form versions keep counting

**Files:** Modify `hub/server/src/store/forms.ts`; Test `hub/server/test/forms-store.test.ts`

**Interfaces:** Produces setting `form_version_floor:<kind>` (string number) read by `publishDraft`; written by Task 3's `startNewSeason`.

- [ ] **Step 1: Failing test** (append):

```ts
it('keeps counting form versions after the published ones are gone', () => {
  const db = openDb(':memory:');
  setSetting(db, 'form_version_floor:match', '4');
  saveDraft(db, matchForm(), NOW);
  const res = publishDraft(db, 'match', NOW);
  expect(res.ok && res.form.version).toBe(5);
});
```

(import `setSetting` from `../src/store/settings`; use the file's existing `NOW`/imports.) Expected: FAIL (version 1).

- [ ] **Step 2: Implement** in `publishDraft`:

```ts
const floor = Number(getSetting(db, `form_version_floor:${kind}`) ?? 0);
const form: FormDef = { ...draft, kind, version: Math.max(earlier.at(-1)?.version ?? 0, floor) + 1 };
```

- [ ] **Step 3:** `npm test && npm run typecheck` → PASS. Commit `feat(hub): form version numbers never restart`.

---

### Task 3: Clearing in the hub database; refusing records for unknown events

**Files:** Create `hub/server/src/store/clear.ts`; Modify `hub/server/src/sync.ts`; Test `hub/server/test/clear.test.ts`, `hub/server/test/sync.test.ts`

**Interfaces:**
- Produces:
  - `interface EventCounts { matches: number; teams: number; records: number; photos: number }`
  - `eventCounts(db, key): EventCounts | null` (null if no such event)
  - `deleteEvent(db, key): EventCounts` (throws `Error('Unknown event "<key>"')` if missing)
  - `interface SeasonCounts { events: number; records: number; photos: number; forms: number; drafts: number; devices: number }`
  - `seasonCounts(db): SeasonCounts`; `startNewSeason(db): SeasonCounts`
- Records are counted by distinct id (a record's revisions count once).

- [ ] **Step 1: Failing tests** — `hub/server/test/clear.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../../shared/test/fixtures';
import { openDb } from '../src/db';
import { deleteEvent, eventCounts, seasonCounts, startNewSeason } from '../src/store/clear';
import { listDevices, touchDevice } from '../src/store/devices';
import { currentEvent, listEvents, setCurrentEvent, upsertEvent } from '../src/store/events';
import { getDraft, listForms, publishDraft, saveDraft } from '../src/store/forms';
import { hubIdentity } from '../src/store/identity';
import { getPhoto, putPhoto } from '../src/store/photos';
import { currentRecords, insertRecord } from '../src/store/records';
import { listSchedule, listTeams, replaceSchedule } from '../src/store/schedule';
import { getSetting } from '../src/store/settings';

const NOW = '2027-03-01T12:00:00.000Z';

function twoEvents() {
  const db = openDb(':memory:');
  for (const key of ['2027aaa', '2027bbb']) {
    upsertEvent(db, { key, name: key });
    replaceSchedule(db, key, [{ matchKey: 'qm1', red: [1, 2, 3], blue: [4, 5, 6] }]);
  }
  setCurrentEvent(db, '2027aaa');
  for (const f of [matchForm(), pitForm()]) { saveDraft(db, f, NOW); publishDraft(db, f.kind, NOW); }
  const a = record(matchForm(), { eventKey: '2027aaa', photoIds: ['p1'] });
  insertRecord(db, a, 'usb', NOW);
  insertRecord(db, { ...a, revision: 2 }, 'usb', NOW);
  insertRecord(db, record(matchForm(), { eventKey: '2027bbb' }), 'usb', NOW);
  putPhoto(db, 'p1', a.id, 'image/png', new Uint8Array([1]), NOW);
  touchDevice(db, { id: 'dev-1', name: 'Tablet 1' }, NOW);
  return db;
}

describe('deleting an event', () => {
  it('counts what would go, then removes the event with its schedule, teams, records and photos', () => {
    const db = twoEvents();
    expect(eventCounts(db, '2027aaa')).toEqual({ matches: 1, teams: 6, records: 1, photos: 1 });
    expect(eventCounts(db, '2027zzz')).toBeNull();
    expect(deleteEvent(db, '2027aaa')).toEqual({ matches: 1, teams: 6, records: 1, photos: 1 });
    expect(listEvents(db).map(e => e.key)).toEqual(['2027bbb']);
    expect(listSchedule(db, '2027aaa')).toEqual([]);
    expect(listTeams(db, '2027aaa')).toEqual([]);
    expect(currentRecords(db, '2027aaa', 'match')).toEqual([]);
    expect(getPhoto(db, 'p1')).toBeUndefined();
    expect(currentRecords(db, '2027bbb', 'match')).toHaveLength(1); // the other event is untouched
    expect(currentEvent(db)).toBeNull(); // it was the current event
    expect(listForms(db)).toHaveLength(2); // forms stay
  });

  it('refuses an unknown event', () => {
    expect(() => deleteEvent(twoEvents(), '2027zzz')).toThrow('Unknown event "2027zzz"');
  });
});

describe('starting a new season', () => {
  it('removes events, records, photos, forms, drafts and tablets; keeps settings; numbering continues', () => {
    const db = twoEvents();
    saveDraft(db, matchForm(), NOW);
    const before = hubIdentity(db);
    expect(seasonCounts(db)).toEqual({ events: 2, records: 2, photos: 1, forms: 2, drafts: 1, devices: 1 });
    expect(startNewSeason(db)).toEqual({ events: 2, records: 2, photos: 1, forms: 2, drafts: 1, devices: 1 });
    expect(seasonCounts(db)).toEqual({ events: 0, records: 0, photos: 0, forms: 0, drafts: 0, devices: 0 });
    expect(getDraft(db, 'match')).toBeNull();
    expect(listDevices(db)).toEqual([]);
    expect(currentEvent(db)).toBeNull();
    expect(getSetting(db, 'form_version_floor:match')).toBe('1');
    expect(getSetting(db, 'form_version_floor:pit')).toBe('1');
    const after = hubIdentity(db);
    expect(after.hubId).toBe(before.hubId);
    expect(after.seasonId).not.toBe(before.seasonId);
  });
});
```

Check `getDraft`'s real name/return in `hub/server/src/store/forms.ts` before running and adjust the import if it differs (for example it may return `{ draft, isDraft }`; then assert on the "no draft" shape it uses). Append to `hub/server/test/sync.test.ts`:

```ts
it('refuses a record for an event that is not on the hub', () => {
  const db = setup();
  const rec = record(matchForm(), { eventKey: '2027gone' });
  const res = handleSync(db, { device, records: [rec] }, 'b', NOW);
  expect(res.rejected).toEqual([{ id: rec.id, revision: 1, reason: "Event 2027gone isn't on the hub (it may have been deleted)" }]);
  expect(currentRecords(db, '2027gone', 'match')).toEqual([]);
});
```

Run both files — Expected: FAIL (module missing / record accepted).

- [ ] **Step 2: Implement** `hub/server/src/store/clear.ts`:

```ts
import { type Db, tx } from '../db';
import { newSeasonId } from './identity';
import { getSetting, setSetting } from './settings';

export interface EventCounts { matches: number; teams: number; records: number; photos: number }
export interface SeasonCounts { events: number; records: number; photos: number; forms: number; drafts: number; devices: number }

const count = (db: Db, sql: string, ...args: (string | number)[]): number =>
  Number((db.prepare(sql).get(...args) as unknown as { n: number }).n);

export function eventCounts(db: Db, key: string): EventCounts | null {
  if (!db.prepare('SELECT 1 FROM events WHERE key = ?').get(key)) return null;
  return {
    matches: count(db, 'SELECT COUNT(*) AS n FROM matches WHERE event_key = ?', key),
    teams: count(db, 'SELECT COUNT(*) AS n FROM teams WHERE event_key = ?', key),
    records: count(db, 'SELECT COUNT(DISTINCT id) AS n FROM records WHERE event_key = ?', key),
    photos: count(db, 'SELECT COUNT(*) AS n FROM photos WHERE record_id IN (SELECT id FROM records WHERE event_key = ?)', key),
  };
}

export function deleteEvent(db: Db, key: string): EventCounts {
  const counts = eventCounts(db, key);
  if (!counts) throw new Error(`Unknown event "${key}"`);
  tx(db, () => {
    db.prepare('DELETE FROM photos WHERE record_id IN (SELECT id FROM records WHERE event_key = ?)').run(key);
    for (const table of ['records', 'matches', 'teams']) db.prepare(`DELETE FROM ${table} WHERE event_key = ?`).run(key);
    db.prepare('DELETE FROM events WHERE key = ?').run(key);
    if (getSetting(db, 'current_event') === key) setSetting(db, 'current_event', null);
  });
  return counts;
}

export function seasonCounts(db: Db): SeasonCounts {
  return {
    events: count(db, 'SELECT COUNT(*) AS n FROM events'),
    records: count(db, 'SELECT COUNT(DISTINCT id) AS n FROM records'),
    photos: count(db, 'SELECT COUNT(*) AS n FROM photos'),
    forms: count(db, 'SELECT COUNT(*) AS n FROM forms'),
    drafts: count(db, 'SELECT COUNT(*) AS n FROM form_drafts'),
    devices: count(db, 'SELECT COUNT(*) AS n FROM devices'),
  };
}

export function startNewSeason(db: Db): SeasonCounts {
  const counts = seasonCounts(db);
  tx(db, () => {
    for (const kind of ['match', 'pit']) {
      const latest = count(db, 'SELECT COALESCE(MAX(version), 0) AS n FROM forms WHERE kind = ?', kind);
      const floor = Math.max(latest, Number(getSetting(db, `form_version_floor:${kind}`) ?? 0));
      setSetting(db, `form_version_floor:${kind}`, String(floor));
    }
    for (const table of ['photos', 'records', 'matches', 'teams', 'events', 'forms', 'form_drafts', 'devices']) db.exec(`DELETE FROM ${table}`);
    setSetting(db, 'current_event', null);
    newSeasonId(db);
  });
  return counts;
}
```

In `ingestRecord` (`hub/server/src/sync.ts`), after the shape check:

```ts
if (!db.prepare('SELECT 1 FROM events WHERE key = ?').get(rec.eventKey)) {
  return { ok: false, reason: `Event ${rec.eventKey} isn't on the hub (it may have been deleted)` };
}
```

- [ ] **Step 3:** `npm test && npm run typecheck` → PASS (fix any existing test that ingests records for an event it never created by creating that event in its setup). Commit `feat(hub): delete an event or start a new season in the database; refuse records for unknown events`.

---

### Task 4: Confirmed clearing routes with an automatic backup

**Files:** Create `hub/server/src/routes/clear.ts`; Modify `hub/server/src/app.ts`; Test `hub/server/test/clear.test.ts`

**Interfaces:**
- `GET /api/events/:key/clear` → `EventCounts` (404 if unknown)
- `POST /api/events/:key/delete` body `{ confirm: string }` → `{ ok: true, backup: string | null, removed: EventCounts }`; 400 "Type the event key to confirm" if `confirm !== key`
- `GET /api/season/clear` → `SeasonCounts`
- `POST /api/season/new` body `{ confirm: string }` → `{ ok: true, backup: string | null, removed: SeasonCounts }`; 400 "Type NEW SEASON to confirm" otherwise
- `backup` is the file name (e.g. `stingr-2027-03-01T12-00-00-000Z.db`) inside `<data folder>/backups/`.

- [ ] **Step 1: Failing tests** (append to `hub/server/test/clear.test.ts`):

```ts
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import { makeApp, setupEvent } from './helpers';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
async function fileApp() {
  const dir = mkdtempSync(join(tmpdir(), 'stingr-clear-'));
  dirs.push(dir);
  const dbPath = join(dir, 'stingr.db');
  return { dir, app: await makeApp({ db: openDb(dbPath), dbPath }) };
}

describe('clearing routes', () => {
  it('previews, refuses without the typed confirmation, then deletes an event after saving a backup', async () => {
    const { dir, app } = await fileApp();
    await setupEvent(app);
    expect((await app.inject({ url: '/api/events/2027test/clear' })).json()).toEqual({ matches: 0, teams: 0, records: 0, photos: 0 });
    const wrong = await app.inject({ method: 'POST', url: '/api/events/2027test/delete', payload: { confirm: '2027tes' } });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toBe('Type the event key to confirm');
    const res = await app.inject({ method: 'POST', url: '/api/events/2027test/delete', payload: { confirm: '2027test' } });
    expect(res.json()).toEqual({ ok: true, backup: 'stingr-2027-03-01T12-00-00-000Z.db', removed: { matches: 0, teams: 0, records: 0, photos: 0 } });
    expect(existsSync(join(dir, 'backups', 'stingr-2027-03-01T12-00-00-000Z.db'))).toBe(true);
    expect((await app.inject({ url: '/api/events' })).json().events).toEqual([]);
    expect((await app.inject({ url: '/api/events/2027test/clear' })).statusCode).toBe(404);
  });

  it('starts a new season only with NEW SEASON typed', async () => {
    const { app } = await fileApp();
    await setupEvent(app);
    expect((await app.inject({ url: '/api/season/clear' })).json()).toMatchObject({ events: 1, forms: 2 });
    expect((await app.inject({ method: 'POST', url: '/api/season/new', payload: { confirm: 'new season' } })).statusCode).toBe(400);
    const res = await app.inject({ method: 'POST', url: '/api/season/new', payload: { confirm: 'NEW SEASON' } });
    expect(res.json()).toMatchObject({ ok: true, removed: { events: 1, forms: 2 } });
    expect((await app.inject({ url: '/api/forms' })).json()).toEqual([]);
  });

  it('clears without a backup when there is no database file', async () => {
    const app = await makeApp();
    await setupEvent(app);
    const res = await app.inject({ method: 'POST', url: '/api/events/2027test/delete', payload: { confirm: '2027test' } });
    expect(res.json()).toMatchObject({ ok: true, backup: null });
  });

  it('does not clear anything when the backup cannot be written', async () => {
    const { dir, app } = await fileApp();
    await setupEvent(app);
    writeFileSync(join(dir, 'backups'), 'not a folder'); // the backups folder can't be created
    const res = await app.inject({ method: 'POST', url: '/api/season/new', payload: { confirm: 'NEW SEASON' } });
    expect(res.statusCode).toBe(500);
    expect((await app.inject({ url: '/api/events' })).json().events).toHaveLength(1);
  });
});
```

Confirm the error-body shape of `HttpError` responses in `hub/server/src/app.ts` (the tests assume `{ error: message }`; adjust to the real shape) and that 500s from thrown `Error`s don't crash the test (they return a JSON error). Expected: FAIL (404s).

- [ ] **Step 2: Implement** `hub/server/src/routes/clear.ts`:

```ts
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { HttpError } from '../http';
import { deleteEvent, eventCounts, seasonCounts, startNewSeason } from '../store/clear';

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;
const stamp = (iso: string) => iso.replace(/[:.]/g, '-');
const confirmOf = (body: unknown) => (typeof body === 'object' && body !== null && typeof (body as { confirm?: unknown }).confirm === 'string' ? (body as { confirm: string }).confirm : '');

/** Saves a copy of the database in <data folder>/backups before anything is removed. Throws if it can't. */
async function backupFirst(ctx: HubContext): Promise<string | null> {
  if (!ctx.dbPath) return null;
  const dir = join(dirname(ctx.dbPath), 'backups');
  await mkdir(dir, { recursive: true });
  const name = `stingr-${stamp(ctx.now())}.db`;
  ctx.db.exec(`VACUUM INTO ${sqlString(join(dir, name))}`);
  return name;
}

export function clearRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.get('/api/events/:key/clear', async req => {
    const counts = eventCounts(ctx.db, (req.params as { key: string }).key);
    if (!counts) throw new HttpError(404, 'No such event');
    return counts;
  });

  app.post('/api/events/:key/delete', async req => {
    const { key } = req.params as { key: string };
    if (!eventCounts(ctx.db, key)) throw new HttpError(404, 'No such event');
    if (confirmOf(req.body) !== key) throw new HttpError(400, 'Type the event key to confirm');
    const backup = await backupFirst(ctx);
    return { ok: true, backup, removed: deleteEvent(ctx.db, key) };
  });

  app.get('/api/season/clear', async () => seasonCounts(ctx.db));

  app.post('/api/season/new', async req => {
    if (confirmOf(req.body) !== 'NEW SEASON') throw new HttpError(400, 'Type NEW SEASON to confirm');
    const backup = await backupFirst(ctx);
    return { ok: true, backup, removed: startNewSeason(ctx.db) };
  });
}
```

Register `clearRoutes(app, ctx)` in `buildApp` beside `adminRoutes`. (`ctx.db` may be replaced by Restore; the routes read `ctx.db` at call time, as the others do.)

- [ ] **Step 3:** `npm test && npm run typecheck` → PASS. Commit `feat(hub): confirmed routes to delete an event or start a new season, after an automatic backup`.

---

### Task 5: Clear data on the hub's Export & backup page

**Files:** Modify `hub/ui/src/lib/api.ts`, `app/src/components/ConfirmDialog.svelte`, `hub/ui/src/pages/DataPage.svelte`; Test `hub/ui/test/data.test.ts`

**Interfaces:**
- Consumes: Task 4 routes.
- Produces `Api` methods:
  - `eventClearPreview(key): Promise<EventCounts>`
  - `deleteEvent(key, confirm): Promise<{ ok: true; backup: string | null; removed: EventCounts }>`
  - `seasonClearPreview(): Promise<SeasonCounts>`
  - `newSeason(confirm): Promise<{ ok: true; backup: string | null; removed: SeasonCounts }>`

  Re-export the `EventCounts` / `SeasonCounts` types from `../../../server/src/store/clear`.
- `ConfirmDialog` gains `confirmDisabled?: boolean` (disables the confirm button).

- [ ] **Step 1: Failing tests** (append to `hub/ui/test/data.test.ts`):

```ts
const twoEvents = async () => ({
  events: [{ key: '2027demo', name: 'Demo', redSide: 'left' as const }, { key: '2027mokc', name: 'Heartland', redSide: 'left' as const }],
  current: { key: '2027mokc', name: 'Heartland', redSide: 'left' as const },
});

it('deletes an event only after its key is typed, and names the backup', async () => {
  const deleteEvent = vi.fn(async () => ({ ok: true as const, backup: 'stingr-1.db', removed: { matches: 12, teams: 24, records: 48, photos: 3 } }));
  const events = vi.fn(twoEvents);
  render(DataPage, { api: fakeApi({ events, eventClearPreview: async () => ({ matches: 12, teams: 24, records: 48, photos: 3 }), deleteEvent }) });
  await fireEvent.change(await screen.findByLabelText('Event to delete'), { target: { value: '2027demo' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Delete event…' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete Demo (2027demo)?' });
  expect(dialog.textContent).toContain('12 matches, 24 teams, 48 records and 3 photos');
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
```

Expected: FAIL (no such controls).

- [ ] **Step 2: Implement.** `api.ts` (inside the returned object):

```ts
eventClearPreview: (key: string) => call<EventCounts>('GET', `/api/events/${encodeURIComponent(key)}/clear`),
deleteEvent: (key: string, confirm: string) =>
  call<{ ok: true; backup: string | null; removed: EventCounts }>('POST', `/api/events/${encodeURIComponent(key)}/delete`, { confirm }),
seasonClearPreview: () => call<SeasonCounts>('GET', '/api/season/clear'),
newSeason: (confirm: string) => call<{ ok: true; backup: string | null; removed: SeasonCounts }>('POST', '/api/season/new', { confirm }),
```

`ConfirmDialog.svelte`: add prop `confirmDisabled = false` and `disabled={confirmDisabled}` on the confirm button.

`DataPage.svelte` — add state and a section after Restore:

```svelte
<script lang="ts">
  // …existing…
  import type { EventCounts, SeasonCounts } from '../lib/api';
  let toDelete = $state('');
  let eventPreview = $state<EventCounts | null>(null);
  let seasonPreview = $state<SeasonCounts | null>(null);
  let typed = $state('');
  let cleared = $state<string | null>(null);

  const backupNote = (b: string | null) => (b ? ` A backup was saved first: backups/${b}` : '');

  async function askDeleteEvent() {
    error = null; typed = '';
    try { eventPreview = await api.eventClearPreview(toDelete); } catch (e) { error = e; }
  }
  async function confirmDeleteEvent() {
    const key = toDelete;
    eventPreview = null;
    try {
      const res = await api.deleteEvent(key, typed);
      cleared = `Deleted ${key}.${backupNote(res.backup)}`;
      toDelete = '';
      view = await api.events();
    } catch (e) { error = e; }
  }
  async function askNewSeason() {
    error = null; typed = '';
    try { seasonPreview = await api.seasonClearPreview(); } catch (e) { error = e; }
  }
  async function confirmNewSeason() {
    seasonPreview = null;
    try {
      const res = await api.newSeason(typed);
      cleared = `New season started.${backupNote(res.backup)}`;
      view = await api.events();
    } catch (e) { error = e; }
  }
  let deleting = $derived(view?.events.find(e => e.key === toDelete) ?? null);
</script>

<section class="card">
  <h2>Clear data</h2>
  <p>For a new event or a new season, or to clear out tests and demos. A backup is saved in the hub's data folder first, so Restore can bring everything back.</p>
  <div class="row">
    <label>Event to delete
      <select aria-label="Event to delete" value={toDelete} onchange={e => (toDelete = e.currentTarget.value)}>
        <option value="">Choose…</option>
        {#each view?.events ?? [] as ev (ev.key)}<option value={ev.key}>{ev.name} ({ev.key})</option>{/each}
      </select>
    </label>
    <button type="button" class="danger" disabled={!toDelete} onclick={askDeleteEvent}>Delete event…</button>
  </div>
  <p class="muted">Removes the event's schedule, teams, records and photos. Forms are kept.</p>
  <button type="button" class="danger" onclick={askNewSeason}>Start a new season…</button>
  <p class="muted">Removes every event, record, photo and form, and the list of tablets. Tablets drop their synced copies on their next sync.</p>
  {#if cleared}<p class="banner ok" role="status">{cleared}</p>{/if}
</section>

{#if eventPreview && deleting}
  <ConfirmDialog title="Delete {deleting.name} ({deleting.key})?" confirmLabel="Delete event" cancelLabel="Keep it"
    confirmDisabled={typed !== deleting.key} onconfirm={confirmDeleteEvent} oncancel={() => (eventPreview = null)}>
    <p>This removes {eventPreview.matches} matches, {eventPreview.teams} teams, {eventPreview.records} records and {eventPreview.photos} photos.</p>
    <label>Type {deleting.key} to confirm <input aria-label="Type {deleting.key} to confirm" value={typed} oninput={e => (typed = e.currentTarget.value)} /></label>
  </ConfirmDialog>
{/if}

{#if seasonPreview}
  <ConfirmDialog title="Start a new season?" confirmLabel="Start new season" cancelLabel="Cancel"
    confirmDisabled={typed !== 'NEW SEASON'} onconfirm={confirmNewSeason} oncancel={() => (seasonPreview = null)}>
    <p>This removes {seasonPreview.events} events, {seasonPreview.records} records, {seasonPreview.photos} photos, {seasonPreview.forms} published forms, {seasonPreview.drafts} drafts and the list of {seasonPreview.devices} tablets. Hub settings are kept.</p>
    <label>Type NEW SEASON to confirm <input aria-label="Type NEW SEASON to confirm" value={typed} oninput={e => (typed = e.currentTarget.value)} /></label>
  </ConfirmDialog>
{/if}
```

(`button.danger` already exists in `hub.css` for ✕ buttons; check it reads well on a full-size button and adjust if needed.)

- [ ] **Step 3:** `npm test && npm run typecheck` → PASS. Commit `feat(hub-ui): delete an event or start a new season from Export & backup`.

---

### Task 6: Tablets follow the hub

**Files:** Modify `app/src/lib/db.ts`, `app/src/lib/sync.ts`; Create `app/src/lib/prune.ts`; Test `app/test/prune.test.ts`, `app/test/sync.test.ts`

**Interfaces:**
- `StingrDb.deleteRecords(ids: string[]): Promise<void>`
- `StingrDb.clearAll(): Promise<void>` (records, photos and kv keys `config`, `draft`, `extraTeams`, `lastSyncAt`; keeps `settings`)
- `pruneForHub(db, before: HubConfig | undefined, after: HubConfig): Promise<number>` returns how many records were removed.
- `SyncResult` gains `removed: number`.

- [ ] **Step 1: Failing tests** — `app/test/prune.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchForm, record } from '../../shared/test/fixtures';
import { openStingrDb } from '../src/lib/db';
import { pruneForHub } from '../src/lib/prune';
import { CONFIG } from './helpers';

async function tablet() {
  const db = await openStingrDb(`prune-${Math.random()}`);
  const kept = record(matchForm(), { eventKey: '2027test' });
  const gone = record(matchForm(), { eventKey: '2027gone', photoIds: ['p1'] });
  const unsynced = record(matchForm(), { eventKey: '2027gone' });
  for (const r of [kept, gone, unsynced]) await db.putRecord(r);
  await db.markSynced([{ id: kept.id, revision: 1 }, { id: gone.id, revision: 1 }]);
  await db.putPhoto({ id: 'p1', recordId: gone.id, mime: 'image/png', data: new ArrayBuffer(1), uploaded: true, createdAt: 'x' });
  return { db, kept, gone, unsynced };
}
const ids = async (db: Awaited<ReturnType<typeof tablet>>['db']) => (await db.listRecords()).map(r => r.id).sort();

describe('pruneForHub', () => {
  it("removes synced records (and photos) of events the hub no longer has, keeping anything unsynced", async () => {
    const { db, kept, unsynced } = await tablet();
    expect(await pruneForHub(db, CONFIG, { ...CONFIG, eventKeys: ['2027test'] })).toBe(1);
    expect(await ids(db)).toEqual([kept.id, unsynced.id].sort());
    expect(await db.listPhotos()).toEqual([]);
  });

  it('removes every synced record after a new season', async () => {
    const { db, unsynced } = await tablet();
    expect(await pruneForHub(db, CONFIG, { ...CONFIG, seasonId: 'season-2', eventKeys: ['2027test', '2027gone'] })).toBe(2);
    expect(await ids(db)).toEqual([unsynced.id]);
  });

  it('removes nothing after syncing with a different hub, or the first time', async () => {
    const { db } = await tablet();
    expect(await pruneForHub(db, CONFIG, { ...CONFIG, hubId: 'hub-2', eventKeys: [] })).toBe(0);
    expect(await pruneForHub(db, undefined, { ...CONFIG, eventKeys: [] })).toBe(0);
    expect(await ids(db)).toHaveLength(3);
  });
});
```

Append to `app/test/sync.test.ts` (inside `describe('runSync'…)`):

```ts
it('drops synced records of events the hub deleted', async () => {
  const db = await fresh();
  await db.setKv('config', CONFIG);
  const old = record(matchForm(), { eventKey: '2027gone' });
  await db.putRecord(old);
  await db.markSynced([{ id: old.id, revision: 1 }]);
  const result = await runSync(deps(db, okHub().fetchImpl)); // the hub's config lists only 2027test
  expect(result.removed).toBe(1);
  expect(await db.listRecords()).toEqual([]);
});
```

Update the existing `toEqual({ acked: 2, rejected: 0, photos: 0, config: CONFIG })` expectation to include `removed: 0`. Expected: FAIL.

- [ ] **Step 2: Implement.** `db.ts` interface + `wrap`:

```ts
deleteRecords(ids: string[]): Promise<void>;
clearAll(): Promise<void>;
// …
async deleteRecords(ids) {
  const tx = db.transaction('records', 'readwrite');
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
},
async clearAll() {
  await db.clear('records');
  await db.clear('photos');
  for (const key of ['config', 'draft', 'extraTeams', 'lastSyncAt']) await db.delete('kv', key);
},
```

`app/src/lib/prune.ts`:

```ts
import type { HubConfig } from '@stingr/shared';
import type { StingrDb } from './db';

/**
 * After a sync, drop synced records (and their photos) the hub no longer has: those of deleted events, or all of
 * them after the hub started a new season. Only for the same hub; unsynced records are always kept.
 */
export async function pruneForHub(db: StingrDb, before: HubConfig | undefined, after: HubConfig): Promise<number> {
  if (!before?.hubId || before.hubId !== after.hubId) return 0;
  const newSeason = before.seasonId !== after.seasonId;
  const events = new Set(after.eventKeys);
  const gone = (await db.listRecords()).filter(r => r.sync === 'synced' && (newSeason || !events.has(r.rec.eventKey)));
  if (!gone.length) return 0;
  const ids = new Set(gone.map(r => r.id));
  await db.deleteRecords([...ids]);
  for (const p of await db.listPhotos()) if (ids.has(p.recordId)) await db.deletePhoto(p.id);
  return gone.length;
}
```

`sync.ts`: at the start of `runSync`: `const before = await db.getKv('config');`. After the batch loop: `let removed = 0; if (config) { removed = await pruneForHub(db, before, config); await db.setKv('config', config); }`, and return `{ acked, rejected, photos: uploaded, removed, config: … }`; add `removed: number` to `SyncResult`. Update the `RESULT` constant in `app/test/syncController.test.ts` with `removed: 0`.

- [ ] **Step 3:** `npm test && npm run typecheck` → PASS. Commit `feat(app): tablets drop synced records the hub deleted or left behind in a new season`.

---

### Task 7: Tidying a tablet by hand

**Files:** Modify `app/src/lib/store.svelte.ts`, `app/src/screens/PastRecords.svelte`, `app/src/screens/Settings.svelte`; Test `app/test/store.test.ts`, `app/test/records.test.ts`, `app/test/setup.test.ts`

**Interfaces:**
- Store getters/methods:
  - `otherEventRecords: LocalRecord[]` (records whose event isn't the current one)
  - `removeSyncedFromOtherEvents(): Promise<number>`
  - `deleteRefused(): Promise<number>` (removes records with `sync === 'rejected'` and their photos)
  - `resetTablet(): Promise<void>` (`db.clearAll()`, clears `draft`/state, `reload()`, goes home)

- [ ] **Step 1: Failing tests.** Read `app/test/store.test.ts`, `app/test/records.test.ts` (Past records) and `app/test/setup.test.ts` (Settings) for their helpers first. Then add:

store.test.ts:

```ts
describe('tidying', () => {
  async function withRecords() {
    const { store, db } = await makeStore();
    const here = record(matchForm(), { eventKey: '2027test' });
    const old = record(matchForm(), { eventKey: '2027old' });
    const oldUnsynced = record(matchForm(), { eventKey: '2027old' });
    const refused = record(matchForm(), { eventKey: '2027gone' });
    for (const r of [here, old, oldUnsynced, refused]) await db.putRecord(r);
    await db.markSynced([{ id: here.id, revision: 1 }, { id: old.id, revision: 1 }]);
    await db.markRejected({ id: refused.id, revision: 1 }, "Event 2027gone isn't on the hub (it may have been deleted)");
    await store.reload();
    return { store, db, here, old, oldUnsynced, refused };
  }

  it('removes synced records of other events, keeping unsynced ones', async () => {
    const { store, here, oldUnsynced, refused } = await withRecords();
    expect(await store.removeSyncedFromOtherEvents()).toBe(1);
    expect(store.records.map(r => r.id).sort()).toEqual([here.id, oldUnsynced.id, refused.id].sort());
  });

  it('deletes the records the hub refused', async () => {
    const { store, refused } = await withRecords();
    expect(await store.deleteRefused()).toBe(1);
    expect(store.records.some(r => r.id === refused.id)).toBe(false);
  });

  it('resets the tablet but keeps its name and slot', async () => {
    const { store, db } = await withRecords();
    await store.resetTablet();
    expect(store.records).toEqual([]);
    expect(store.config).toBeNull();
    expect(await db.getKv('config')).toBeUndefined();
    expect(store.settings).toMatchObject({ deviceId: 'dev-1', deviceName: 'Tablet 1', defaultSlot: 'red1' });
    expect(store.screen).toEqual({ name: 'home' });
  });
});
```

records.test.ts (Past records screen):

```ts
it('lists unsynced records from other events, and offers both tidy-up actions', async () => {
  // same setup as store.test's withRecords, then render(PastRecords, { store })
  const other = screen.getByRole('region', { name: 'Other events' });
  expect(within(other).getByText(/2027gone/)).toBeTruthy(); // the refused one, with its reason
  await fireEvent.click(screen.getByRole('button', { name: 'Remove synced records from other events…' }));
  const dialog = screen.getByRole('dialog', { name: 'Remove 1 synced record from other events?' });
  await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Delete refused records…' }));
  const refuse = screen.getByRole('dialog', { name: 'Delete 1 record the hub refused?' });
  expect(refuse.textContent).toContain("can't be synced");
  await fireEvent.click(within(refuse).getByRole('button', { name: 'Delete' }));
  expect(screen.queryByText(/2027gone/)).toBeNull();
});
```

setup.test.ts (Settings screen):

```ts
it('resets the tablet, asking twice when records are unsynced', async () => {
  // a store with one pending record; render(Settings, { store })
  await fireEvent.click(screen.getByRole('button', { name: 'Reset this tablet…' }));
  const first = screen.getByRole('dialog', { name: 'Reset this tablet?' });
  expect(first.textContent).toContain('1 record has not been synced and will be lost');
  await fireEvent.click(within(first).getByRole('button', { name: 'Reset' }));
  const second = screen.getByRole('dialog', { name: 'Lose 1 unsynced record?' });
  await fireEvent.click(within(second).getByRole('button', { name: 'Yes, reset and lose it' }));
  expect(store.records).toEqual([]);
});
```

Fill in the setup lines using each file's existing helpers. Expected: FAIL.

- [ ] **Step 2: Implement.** Store:

```ts
get otherEventRecords(): LocalRecord[] {
  const key = this.event?.key;
  return key ? this.records.filter(r => r.rec.eventKey !== key) : [];
}

async removeSyncedFromOtherEvents(): Promise<number> {
  return this.removeRecords(this.otherEventRecords.filter(r => r.sync === 'synced'));
}

async deleteRefused(): Promise<number> {
  return this.removeRecords(this.records.filter(r => r.sync === 'rejected'));
}

private async removeRecords(rows: LocalRecord[]): Promise<number> {
  const ids = new Set(rows.map(r => r.id));
  await this.db.deleteRecords([...ids]);
  for (const p of this.photos) if (ids.has(p.recordId)) await this.db.deletePhoto(p.id);
  await this.reload();
  return rows.length;
}

async resetTablet(): Promise<void> {
  await this.db.clearAll();
  this.draft = null;
  await this.reload();
  this.screen = { name: 'home' };
}
```

(`reload()` must set `config` to `null` when the kv is gone — it already does `?? null`. Check the draft field's real name.)

PastRecords.svelte: keep the current-event list; add, when `store.otherEventRecords.some(r => r.sync !== 'synced')`, a `<section aria-labelledby="other-title"><h2 id="other-title">Other events</h2>` listing those records with their event key, status and reason. Below the lists, show:
- the button "Remove synced records from other events…", when `syncedOther > 0`
- the button "Delete refused records…", when `refused > 0`

Each button opens a `ConfirmDialog`, titled with a count and pluralised:
- "Remove 1 synced record from other events?" / "Remove 3 synced records from other events?", confirm label "Remove"
- "Delete 1 record the hub refused?", confirm label "Delete", with the body "They can't be synced, because the hub no longer has their event or form."

Settings.svelte: a "This tablet" section after Appearance with the button "Reset this tablet…" and the hint "Removes records, photos and the loaded event and forms, for demos and testing. Keeps this tablet's name and slot."
- First dialog: "Reset this tablet?", confirm label "Reset". It names the record count, and when `store.pendingCount > 0` (or a draft exists) it adds "N record(s) have not been synced and will be lost."
- When anything is unsynced, a second dialog follows: "Lose N unsynced record(s)?", confirm label "Yes, reset and lose it/them".
- After the reset, the app shows Home, and the next sync reloads the event and forms.

- [ ] **Step 3:** `npm test && npm run typecheck` → PASS. Commit `feat(app): remove old synced records, delete refused ones, or reset the tablet`.

---

### Task 8: End to end — delete an event from the hub screen

**Files:** Modify `e2e/hub.spec.ts`

- [ ] **Step 1: Test** (append; it creates its own event so the rest of the suite is unaffected):

```ts
test('deletes an event from Export & backup after typing its key', async ({ page }) => {
  expect((await api.post('/api/events', { data: { key: '2027gone', name: 'Gone Regional' } })).ok()).toBe(true);
  await page.goto('/hub/#/data');
  await page.getByLabel('Event to delete').selectOption('2027gone');
  await page.getByRole('button', { name: 'Delete event…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Gone Regional (2027gone)?' });
  await expect(dialog.getByRole('button', { name: 'Delete event' })).toBeDisabled();
  await dialog.getByLabel('Type 2027gone to confirm').fill('2027gone');
  await dialog.getByRole('button', { name: 'Delete event' }).click();
  await expect(page.getByText(/Deleted 2027gone\. A backup was saved first: backups\/stingr-/)).toBeVisible();
  const { events } = await (await api.get('/api/events')).json();
  expect(events.map((e: { key: string }) => e.key)).not.toContain('2027gone');
});
```

- [ ] **Step 2:** `npm run e2e` → all pass. Commit (with `npm test && npm run typecheck && npm run e2e` first) `test(e2e): delete an event from the hub screen`.
