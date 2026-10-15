# Plan 1 — Foundation & Hub Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the offline-PWA approach on the real tablet, then build the shared library (form/record model, validation, scoring, QR codec) and the complete hub server (SQLite storage, sync API, schedule/TBA import, coverage, summaries, CSV export, backup/restore, USB watcher).

**Architecture:** An npm-workspaces TypeScript monorepo. `shared/` is pure TypeScript with no I/O, used by both the hub and (in Plan 2) the tablet app. `hub/server/` is a Fastify server on 127.0.0.1:5098 backed by Node's built-in `node:sqlite`. It exposes a JSON API that the tablet app (Plan 2) and hub UI (Plan 3) consume. Packaging is Plan 4.

**Tech Stack:** Node ≥ 22.13, TypeScript 7.0.2, Vitest 5.0.5, tsx 4.23.15, Fastify 5.12.7, @fastify/static 10.1.6, `node:sqlite`.

**Spec:** `docs/superpowers/specs/2026-10-15-stingr-scout-design.md`

**Later plans (not in this document):** Plan 2 — tablet app (Svelte PWA). Plan 3 — hub UI. Plan 4 — release packaging and `install.sh`.

## Global Constraints

- Node.js **≥ 22.13** (required for un-flagged `node:sqlite`). No native npm modules anywhere.
- Hub server listens on **127.0.0.1** only, port **5098** (env `STINGR_PORT` overrides, for tests/dev only).
- Hub data directory default: `~/.local/share/stingr-scout/data/` (env `STINGR_DATA_DIR` overrides). Database file: `stingr.db`.
- ESM everywhere (`"type": "module"`). TypeScript `strict`. Use `import type` for type-only imports (`verbatimModuleSyntax`). No TypeScript parameter properties or enums.
- Imports inside a package are extensionless relative paths (`./form`); the hub imports shared as `@stingr/shared`.
- Tablet target browser is Chrome 119 (Android 7). Shared code may use `CompressionStream('deflate-raw')`, `crypto.randomUUID`, `structuredClone`.
- QR codes contain only QR-alphanumeric characters: `0-9 A-Z space $ % * + - . / :`.
- Missed/empty answers are never treated as 0 in any statistic, point estimate or export.
- Hub UI (Plan 3) must use hash-based routing; the server serves it as static files under `/hub/`.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (shown once here; add it to every `git commit` in this plan).

## Review Focus

1. A tablet unplugged mid-sync re-sends records the hub already stored → hub acknowledges them again and stores no duplicates (Task 11, `api-core.test.ts` "re-sending the same records").
2. Free-text comments containing commas, quotes, newlines or a leading `=`/`+`/`@` → the CSV still opens with one row per record and no formulas (Task 14, `export.test.ts` "escapes awkward text").
3. Match numbers ≥ 10 must sort after 9 (`qm10` after `qm9`, not after `qm1`) in schedules, coverage and exports (Task 3 `matchKey.test.ts`; Task 7 `store.test.ts` "lists the schedule in match order").
4. A question every scout marked missed for a team → its statistic is empty (`null`), never `NaN` or 0, and the team's point total is still computed from the other questions (Task 5, `scoring.test.ts` "all missed").
5. Fetching from TBA before the event's schedule is published (TBA returns zero matches) must not wipe a schedule imported from CSV (Task 12, `schedule-import.test.ts` "keeps the existing schedule").

---

## File Structure

```
package.json                 root: workspaces, scripts, dev deps
tsconfig.json                one typecheck config for shared + hub/server
vitest.config.ts             test file globs
.gitignore                   (exists) + spikes/
spikes/pwa-probe/            Task 1 throwaway (git-ignored)
shared/
  package.json               @stingr/shared, exports ./src/index.ts
  src/index.ts               re-exports every module below
  src/types.ts               all shared types (forms, records, schedule, sync)
  src/form.ts                question helpers, initial answers, form validation
  src/matchKey.ts            parse/normalize/compare/label match keys
  src/fieldmap.ts            field-map point mirroring
  src/record.ts              record lifecycle: new, answer, missed, no-show, submit, checkRecord
  src/scoring.ts             per-question stats and estimated points
  src/qr.ts                  base45, QR payload, multi-part chunks, assembler
  test/fixtures.ts           sample forms and records used by all tests
  test/*.test.ts
hub/server/
  package.json               @stingr/hub-server
  src/db.ts                  open SQLite, migrations, transactions
  src/store/settings.ts      key/value settings
  src/store/events.ts        events + current event
  src/store/schedule.ts      matches + teams per event
  src/store/forms.ts         published forms + drafts
  src/store/records.ts       record revisions
  src/store/photos.ts        photo blobs
  src/store/devices.ts       tablets seen by sync
  src/sync.ts                parse/handle sync requests, ingest records, build config
  src/adb.ts                 USB watcher (adb devices / adb reverse)
  src/http.ts                HttpError + request helpers
  src/app.ts                 Fastify app factory
  src/routes/sync.ts         /api/ping, /api/sync, /api/photos
  src/routes/records.ts      /api/records, /api/records/:id/history
  src/routes/forms.ts        /api/forms
  src/routes/event.ts        /api/events, /api/schedule (JSON), /api/teams, /api/settings
  src/scheduleIo.ts          schedule CSV parsing + JSON validation
  src/tba.ts                 The Blue Alliance client
  src/routes/scheduleImport.ts  /api/schedule/csv, /api/schedule/tba
  src/coverage.ts            coverage grid
  src/summaries.ts           team summaries
  src/routes/data.ts         /api/records, /api/qr, /api/coverage, /api/summaries
  src/export.ts              CSV builders
  src/routes/export.ts       /api/export/*
  src/routes/admin.ts        /api/backup, /api/restore, /api/devices
  src/main.ts                CLI entry: open DB, start watcher, listen, open browser
  test/helpers.ts            app factory for tests
  test/*.test.ts
```

---

### Task 1: Device probe — offline home-screen PWA on the ZenPad (throwaway spike)

This checks the spec's §10 risks before anything is built on them. **This task needs the human partner to tap through steps on the tablet.** Nothing from it is committed except a findings note.

**Files:**
- Create (git-ignored): `spikes/pwa-probe/index.html`, `spikes/pwa-probe/sw.js`, `spikes/pwa-probe/manifest.json`, `spikes/pwa-probe/make-icons.mjs`, `spikes/pwa-probe/ping.txt`
- Modify: `.gitignore` (add `spikes/`)
- Create: `docs/superpowers/notes/2026-10-15-pwa-probe-findings.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a go/no-go finding for the PWA-over-`adb reverse` approach.

- [ ] **Step 1: Ignore spikes and create the probe page**

```bash
echo 'spikes/' >> .gitignore
mkdir -p spikes/pwa-probe
echo ok > spikes/pwa-probe/ping.txt
```

`spikes/pwa-probe/index.html`:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="manifest" href="manifest.json">
  <title>Stingr probe</title>
</head>
<body style="font:20px sans-serif;padding:16px">
  <h1>Stingr probe</h1>
  <p>Display mode: <b id="mode"></b></p>
  <p>Persisted storage: <b id="persist"></b></p>
  <p>Service worker: <b id="sw"></b></p>
  <p>Counter in IndexedDB: <b id="count"></b> <button id="inc" style="font-size:24px">+1</button></p>
  <p>Hub reachable: <b id="hub"></b></p>
  <script>
    const $ = id => document.getElementById(id);
    $('mode').textContent = matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser tab';
    navigator.storage.persist().then(p => { $('persist').textContent = String(p); });
    navigator.serviceWorker.register('sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => { $('sw').textContent = 'ready'; }, e => { $('sw').textContent = 'error ' + e; });
    const open = () => new Promise((res, rej) => {
      const r = indexedDB.open('probe', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    async function get() {
      const db = await open();
      return new Promise(res => { const q = db.transaction('kv').objectStore('kv').get('n'); q.onsuccess = () => res(q.result || 0); });
    }
    async function put(n) {
      const db = await open();
      return new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(n, 'n'); t.oncomplete = res; });
    }
    get().then(n => { $('count').textContent = n; });
    $('inc').onclick = async () => { const n = (await get()) + 1; await put(n); $('count').textContent = n; };
    fetch('/ping.txt', { cache: 'no-store' }).then(r => { $('hub').textContent = r.ok ? 'yes' : 'no'; }, () => { $('hub').textContent = 'no'; });
  </script>
</body>
</html>
```

`spikes/pwa-probe/sw.js`:

```js
const CACHE = 'probe-v1';
const FILES = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (new URL(e.request.url).pathname.endsWith('/ping.txt')) return; // always network
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
```

`spikes/pwa-probe/manifest.json`:

```json
{
  "name": "Stingr Probe",
  "short_name": "Probe",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#f5b400",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`spikes/pwa-probe/make-icons.mjs` (writes solid-color PNGs with no dependencies):

```js
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array(size).fill(row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [192, 512]) writeFileSync(new URL(`icon-${s}.png`, import.meta.url), png(s, [245, 180, 0]));
```

- [ ] **Step 2: Serve the probe and map it to the tablet**

```bash
node spikes/pwa-probe/make-icons.mjs
python3 -m http.server 5098 --bind 127.0.0.1 --directory spikes/pwa-probe &   # note the PID
adb reverse tcp:5098 tcp:5098
adb shell am start -a android.intent.action.VIEW -d http://localhost:5098/index.html
```

Expected: Chrome opens on the tablet showing "Stingr probe", Service worker: ready, Hub reachable: yes.

- [ ] **Step 3: Human partner installs and exercises it (on the tablet)**

Ask the human partner to:
1. Tap **+1** three times (counter shows 3).
2. Chrome menu (⋮) → **Add to Home screen** (or "Install app"). Note exactly which wording appeared and whether it said "installing".
3. Open the probe from the new home-screen icon. Note "Display mode" and "Persisted storage".

- [ ] **Step 4: Go offline, reboot, verify**

```bash
kill <python PID>
adb reverse --remove-all
adb reboot
```

After the tablet restarts (and is unplugged or not — either is fine), ask the human partner to open the probe **from the home-screen icon** and report: does it load, Counter value (expected 3), Hub reachable (expected no), Display mode.

- [ ] **Step 5: Record findings and decide**

Write `docs/superpowers/notes/2026-10-15-pwa-probe-findings.md` with: menu wording seen, display mode before/after reboot, persisted storage result, counter after reboot, whether it loaded offline.

Decision rule:
- Loads offline from the icon with counter = 3 → **GO** (standalone vs browser-tab display mode is acceptable either way; note it for Plan 2).
- Does not load offline, or counter reset → **STOP.** Report to the human partner; the spec's approach must be revisited (spec §10 fallback: Capacitor APK) before continuing.

```bash
git add .gitignore docs/superpowers/notes/2026-10-15-pwa-probe-findings.md
git commit -m "docs: record PWA probe findings on ZenPad"
```

---

### Task 2: Monorepo scaffold, shared types, form helpers and validation

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `shared/package.json`, `shared/src/index.ts`, `shared/src/types.ts`, `shared/src/form.ts`
- Create: `shared/test/fixtures.ts`, `shared/test/form.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `@stingr/shared`):
  - Types: `FormKind`, `Slot`, `SLOTS`, `SummaryKind`, `Question` (union of `CounterQuestion | ToggleQuestion | ChoiceQuestion | MultiQuestion | NumberQuestion | TextQuestion | RatingQuestion | TimerQuestion | FieldMapQuestion`), `QuestionType`, `ChoiceOption`, `Section`, `FormDef`, `Point`, `AnswerValue`, `Answers`, `ScoutRecord`, `EventInfo`, `ScheduleMatch`, `DeviceInfo`, `HubConfig`, `SyncRequest`, `RecordRef`, `SyncResponse`.
  - `allQuestions(form: FormDef): Question[]`
  - `findQuestion(form: FormDef, key: string): Question | undefined`
  - `initialValue(q: Question): AnswerValue`
  - `initialAnswers(form: FormDef): Answers`
  - `summaryKind(q: Question): SummaryKind`
  - `validateFormDef(form: FormDef, earlier?: FormDef[]): { errors: string[]; warnings: string[] }`
  - Test fixtures (`shared/test/fixtures.ts`): `matchForm(version = 1): FormDef`, `pitForm(version = 1): FormDef`.

- [ ] **Step 1: Create the workspace files**

`package.json`:

```json
{
  "name": "stingr-scout",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.13" },
  "workspaces": ["shared", "hub/*"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json",
    "hub": "tsx hub/server/src/main.ts"
  },
  "devDependencies": {
    "@types/node": "^22.13.0",
    "tsx": "4.23.15",
    "typescript": "7.0.2",
    "vitest": "5.0.5"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "preserve",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["shared", "hub/server", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['shared/**/*.test.ts', 'hub/server/**/*.test.ts'] },
});
```

`shared/package.json`:

```json
{
  "name": "@stingr/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

Run: `npm install`
Expected: completes; `node_modules/@stingr/shared` is a symlink to `shared`.

- [ ] **Step 2: Write the shared types**

`shared/src/types.ts`:

```ts
export type FormKind = 'match' | 'pit';
export type Slot = 'red1' | 'red2' | 'red3' | 'blue1' | 'blue2' | 'blue3';
export const SLOTS: Slot[] = ['red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3'];
export type SummaryKind = 'avg' | 'pct' | 'distribution' | 'list' | 'scatter' | 'none';

interface QuestionBase {
  key: string;
  label: string;
  help?: string;
  required: boolean;
  summary?: SummaryKind;
}
export interface ChoiceOption { value: string; label: string; points?: number }

export interface CounterQuestion extends QuestionBase { type: 'counter'; min: number; max?: number; step: number; default: number; points?: number }
export interface ToggleQuestion extends QuestionBase { type: 'toggle'; default: boolean; points?: number }
export interface ChoiceQuestion extends QuestionBase { type: 'choice'; options: ChoiceOption[]; display: 'buttons' | 'dropdown' }
export interface MultiQuestion extends QuestionBase { type: 'multi'; options: { value: string; label: string }[] }
export interface NumberQuestion extends QuestionBase { type: 'number'; min?: number; max?: number; integer: boolean }
export interface TextQuestion extends QuestionBase { type: 'text'; multiline: boolean }
export interface RatingQuestion extends QuestionBase { type: 'rating'; max: number }
export interface TimerQuestion extends QuestionBase { type: 'timer' }
export interface FieldMapQuestion extends QuestionBase { type: 'fieldmap'; assetId: string; maxPoints: number; mirrorForRed: boolean }

export type Question =
  | CounterQuestion | ToggleQuestion | ChoiceQuestion | MultiQuestion | NumberQuestion
  | TextQuestion | RatingQuestion | TimerQuestion | FieldMapQuestion;
export type QuestionType = Question['type'];

export interface Section { id: string; title: string; questions: Question[] }
export interface FormDef {
  kind: FormKind;
  version: number;
  sections: Section[];
  /** assetId → image data URL (field map images) */
  assets: Record<string, string>;
}

export interface Point { x: number; y: number }
/** counter/number/rating/timer → number; toggle → boolean; choice/text → string; multi → string[]; fieldmap → Point[] */
export type AnswerValue = number | boolean | string | string[] | Point[] | null;
export type Answers = Record<string, AnswerValue>;

export interface ScoutRecord {
  id: string;
  revision: number;
  kind: FormKind;
  eventKey: string;
  formVersion: number;
  matchKey?: string;
  slot?: Slot;
  team: number;
  scout: string;
  deviceId: string;
  noShow: boolean;
  answers: Answers;
  missed: string[];
  photoIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EventInfo { key: string; name: string }
export interface ScheduleMatch { matchKey: string; red: [number, number, number]; blue: [number, number, number] }
export interface DeviceInfo { id: string; name: string }

export interface HubConfig {
  event: EventInfo | null;
  forms: FormDef[];
  schedule: ScheduleMatch[];
  teams: number[];
  appBuild: string;
}
export interface SyncRequest { device: DeviceInfo; records: ScoutRecord[] }
export interface RecordRef { id: string; revision: number }
export interface SyncResponse {
  acked: RecordRef[];
  rejected: (RecordRef & { reason: string })[];
  wantedPhotoIds: string[];
  config: HubConfig;
}
```

`shared/src/index.ts`:

```ts
export * from './types';
export * from './form';
```

- [ ] **Step 3: Write the fixtures**

`shared/test/fixtures.ts`:

```ts
import type { FormDef } from '../src/types';

export function matchForm(version = 1): FormDef {
  return {
    kind: 'match',
    version,
    assets: { field: 'data:image/png;base64,iVBORw0KGgo=' },
    sections: [
      {
        id: 'auto', title: 'Auto', questions: [
          { key: 'auto_leave', label: 'Left starting zone', type: 'toggle', required: true, default: false, points: 3 },
          { key: 'auto_coral', label: 'Coral scored', type: 'counter', required: true, min: 0, step: 1, default: 0, points: 4 },
          { key: 'start_pos', label: 'Start position', type: 'fieldmap', required: false, assetId: 'field', maxPoints: 1, mirrorForRed: true },
        ],
      },
      {
        id: 'endgame', title: 'Endgame', questions: [
          {
            key: 'climb', label: 'Climb', type: 'choice', required: true, display: 'buttons', options: [
              { value: 'none', label: 'None', points: 0 },
              { value: 'shallow', label: 'Shallow', points: 6 },
              { value: 'deep', label: 'Deep', points: 12 },
            ],
          },
          { key: 'climb_time', label: 'Climb time', type: 'timer', required: false },
        ],
      },
      {
        id: 'notes', title: 'Notes', questions: [
          { key: 'defense', label: 'Defense rating', type: 'rating', required: false, max: 5 },
          { key: 'zones', label: 'Zones used', type: 'multi', required: false, options: [{ value: 'near', label: 'Near' }, { value: 'far', label: 'Far' }] },
          { key: 'comments', label: 'Comments', type: 'text', required: false, multiline: true },
        ],
      },
    ],
  };
}

export function pitForm(version = 1): FormDef {
  return {
    kind: 'pit',
    version,
    assets: {},
    sections: [
      {
        id: 'robot', title: 'Robot', questions: [
          { key: 'drivetrain', label: 'Drivetrain', type: 'choice', required: true, display: 'dropdown', options: [{ value: 'swerve', label: 'Swerve' }, { value: 'tank', label: 'Tank' }] },
          { key: 'weight_lb', label: 'Weight (lb)', type: 'number', required: false, integer: false, min: 0, max: 200 },
        ],
      },
    ],
  };
}
```

- [ ] **Step 4: Write the failing tests**

`shared/test/form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findQuestion, initialAnswers, summaryKind, validateFormDef } from '../src/form';
import { matchForm, pitForm } from './fixtures';

describe('initialAnswers', () => {
  it('starts counters and toggles at their defaults and everything else empty', () => {
    expect(initialAnswers(matchForm())).toEqual({
      auto_leave: false, auto_coral: 0, start_pos: null, climb: null,
      climb_time: null, defense: null, zones: null, comments: null,
    });
  });
});

describe('summaryKind', () => {
  it('defaults by question type', () => {
    const f = matchForm();
    const keys = ['auto_leave', 'auto_coral', 'start_pos', 'climb', 'climb_time', 'defense', 'zones', 'comments'];
    expect(keys.map(k => summaryKind(findQuestion(f, k)!)))
      .toEqual(['pct', 'avg', 'scatter', 'distribution', 'avg', 'avg', 'distribution', 'list']);
  });
  it('respects an explicit summary', () => {
    const q = findQuestion(matchForm(), 'auto_coral')!;
    q.summary = 'none';
    expect(summaryKind(q)).toBe('none');
  });
});

describe('validateFormDef', () => {
  it('accepts the sample forms', () => {
    expect(validateFormDef(matchForm())).toEqual({ errors: [], warnings: [] });
    expect(validateFormDef(pitForm())).toEqual({ errors: [], warnings: [] });
  });

  it('rejects duplicate and badly formed keys', () => {
    const f = matchForm();
    f.sections[1].questions[0].key = 'auto_coral';
    f.sections[2].questions[0].key = 'Defense Rating';
    const { errors } = validateFormDef(f);
    expect(errors).toContain('Question "auto_coral": duplicate key');
    expect(errors.some(e => e.startsWith('Question "Defense Rating": key must'))).toBe(true);
  });

  it('rejects a form with no questions', () => {
    expect(validateFormDef({ kind: 'pit', version: 1, sections: [], assets: {} }).errors).toContain('Form has no questions');
  });

  it('checks type-specific settings', () => {
    const f = matchForm();
    const coral = findQuestion(f, 'auto_coral');
    const climb = findQuestion(f, 'climb');
    const defense = findQuestion(f, 'defense');
    if (coral?.type !== 'counter' || climb?.type !== 'choice' || defense?.type !== 'rating') throw new Error('fixture changed');
    coral.default = -1;
    climb.options = [];
    defense.max = 1;
    delete f.assets.field;
    expect(validateFormDef(f).errors).toEqual([
      'Question "auto_coral": default must be between min and max',
      'Question "start_pos": field image is missing',
      'Question "climb": needs at least one option',
      'Question "defense": max must be a whole number from 2 to 10',
    ]);
  });

  it('warns when a key changes type between versions', () => {
    const v1 = matchForm(1);
    const v2 = matchForm(2);
    v2.sections[0].questions[1] = { key: 'auto_coral', label: 'Coral scored', type: 'toggle', required: true, default: false };
    expect(validateFormDef(v2, [v1]).warnings).toEqual([
      'Question "auto_coral" was a counter in version 1 but is now a toggle; older answers will be left out of summaries',
    ]);
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run shared/test/form.test.ts`
Expected: FAIL — cannot resolve `../src/form`.

- [ ] **Step 6: Implement `shared/src/form.ts`**

```ts
import type { AnswerValue, Answers, FormDef, Question, SummaryKind } from './types';

const KEY_RE = /^[a-z][a-z0-9_]*$/;

export function allQuestions(form: FormDef): Question[] {
  return form.sections.flatMap(s => s.questions);
}

export function findQuestion(form: FormDef, key: string): Question | undefined {
  return allQuestions(form).find(q => q.key === key);
}

export function initialValue(q: Question): AnswerValue {
  switch (q.type) {
    case 'counter': return q.default;
    case 'toggle': return q.default;
    default: return null;
  }
}

export function initialAnswers(form: FormDef): Answers {
  return Object.fromEntries(allQuestions(form).map(q => [q.key, initialValue(q)]));
}

function defaultSummary(q: Question): SummaryKind {
  switch (q.type) {
    case 'counter': case 'number': case 'rating': case 'timer': return 'avg';
    case 'toggle': return 'pct';
    case 'choice': case 'multi': return 'distribution';
    case 'text': return 'list';
    case 'fieldmap': return 'scatter';
  }
}

export function summaryKind(q: Question): SummaryKind {
  return q.summary ?? defaultSummary(q);
}

function typeErrors(q: Question, form: FormDef): string[] {
  const e: string[] = [];
  switch (q.type) {
    case 'counter':
      if (!(q.step > 0)) e.push('step must be greater than 0');
      if (q.max !== undefined && q.max < q.min) e.push('max must be at least min');
      if (q.default < q.min || (q.max !== undefined && q.default > q.max)) e.push('default must be between min and max');
      break;
    case 'choice':
    case 'multi': {
      if (q.options.length === 0) e.push('needs at least one option');
      const values = q.options.map(o => o.value);
      if (values.some(v => !v.trim())) e.push('option values must not be empty');
      if (new Set(values).size !== values.length) e.push('option values must be unique');
      break;
    }
    case 'number':
      if (q.min !== undefined && q.max !== undefined && q.max < q.min) e.push('max must be at least min');
      break;
    case 'rating':
      if (!(Number.isInteger(q.max) && q.max >= 2 && q.max <= 10)) e.push('max must be a whole number from 2 to 10');
      break;
    case 'fieldmap':
      if (!(q.assetId in form.assets)) e.push('field image is missing');
      if (!(Number.isInteger(q.maxPoints) && q.maxPoints >= 1)) e.push('maxPoints must be at least 1');
      break;
  }
  return e;
}

export function validateFormDef(form: FormDef, earlier: FormDef[] = []): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const questions = allQuestions(form);
  if (questions.length === 0) errors.push('Form has no questions');

  const sectionIds = new Set<string>();
  for (const s of form.sections) {
    if (!s.id.trim()) errors.push('A section has an empty id');
    else if (sectionIds.has(s.id)) errors.push(`Duplicate section id "${s.id}"`);
    sectionIds.add(s.id);
    if (!s.title.trim()) errors.push(`Section "${s.id}" has no title`);
  }

  const keys = new Set<string>();
  for (const q of questions) {
    const where = `Question "${q.key}"`;
    if (!KEY_RE.test(q.key)) errors.push(`${where}: key must start with a lowercase letter and contain only a-z, 0-9 and _`);
    if (keys.has(q.key)) errors.push(`${where}: duplicate key`);
    keys.add(q.key);
    if (!q.label.trim()) errors.push(`${where}: label is empty`);
    for (const msg of typeErrors(q, form)) errors.push(`${where}: ${msg}`);
  }

  const previous = new Map<string, { type: string; version: number }>();
  for (const f of [...earlier].sort((a, b) => a.version - b.version)) {
    if (f.kind !== form.kind) continue;
    for (const q of allQuestions(f)) previous.set(q.key, { type: q.type, version: f.version });
  }
  for (const q of questions) {
    const prev = previous.get(q.key);
    if (prev && prev.type !== q.type) {
      warnings.push(`Question "${q.key}" was a ${prev.type} in version ${prev.version} but is now a ${q.type}; older answers will be left out of summaries`);
    }
  }
  return { errors, warnings };
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run shared/test/form.test.ts && npm run typecheck`
Expected: all tests PASS; typecheck prints no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts shared
git commit -m "feat(shared): scaffold workspace, form types and validation"
```

---

### Task 3: Match keys and field-map mirroring

**Files:**
- Create: `shared/src/matchKey.ts`, `shared/src/fieldmap.ts`
- Modify: `shared/src/index.ts` (add exports)
- Test: `shared/test/matchKey.test.ts`, `shared/test/fieldmap.test.ts`

**Interfaces:**
- Consumes: `Point`, `Slot` from Task 2.
- Produces:
  - `type CompLevel = 'qm' | 'ef' | 'qf' | 'sf' | 'f'`
  - `parseMatchKey(key: string): { level: CompLevel; set: number; match: number } | null`
  - `normalizeMatchKey(input: string): string | null` — `"12"`/`"QM012"` → `"qm12"`; `"sf3m1"` stays; invalid → `null`
  - `compareMatchKeys(a: string, b: string): number`
  - `matchLabel(key: string): string` — `"qm12"` → `"Qual 12"`, `"sf3m1"` → `"Semi 3-1"`
  - `mirrorPoint(p: Point): Point`, `toCanonical(p: Point, slot: Slot | undefined, mirrorForRed: boolean): Point`, `toDisplay` (same signature as `toCanonical`)

- [ ] **Step 1: Write the failing tests**

`shared/test/matchKey.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compareMatchKeys, matchLabel, normalizeMatchKey, parseMatchKey } from '../src/matchKey';

describe('normalizeMatchKey', () => {
  it.each([
    ['12', 'qm12'], [' 7 ', 'qm7'], ['QM012', 'qm12'], ['qm3', 'qm3'],
    ['sf3m1', 'sf3m1'], ['F1M2', 'f1m2'], ['qf02m3', 'qf2m3'],
  ])('%s → %s', (input, want) => expect(normalizeMatchKey(input)).toBe(want));

  it.each(['', '0', 'qm0', 'sf3', 'qm1m2', 'match 4', 'x9'])('rejects %j', input => {
    expect(normalizeMatchKey(input)).toBeNull();
  });
});

describe('compareMatchKeys', () => {
  it('orders numerically within a level and quals before playoffs', () => {
    const keys = ['f1m1', 'qm10', 'sf2m1', 'qm9', 'qm1', 'sf10m1', 'sf1m1', 'qm2'];
    expect([...keys].sort(compareMatchKeys)).toEqual(['qm1', 'qm2', 'qm9', 'qm10', 'sf1m1', 'sf2m1', 'sf10m1', 'f1m1']);
  });
  it('puts unparseable keys last', () => {
    expect(['zzz', 'qm1'].sort(compareMatchKeys)).toEqual(['qm1', 'zzz']);
  });
});

describe('matchLabel / parseMatchKey', () => {
  it('labels keys for people', () => {
    expect(matchLabel('qm12')).toBe('Qual 12');
    expect(matchLabel('sf3m1')).toBe('Semi 3-1');
    expect(matchLabel('f1m2')).toBe('Final 1-2');
    expect(matchLabel('weird')).toBe('weird');
  });
  it('parses levels, sets and matches', () => {
    expect(parseMatchKey('qm4')).toEqual({ level: 'qm', set: 1, match: 4 });
    expect(parseMatchKey('sf13m1')).toEqual({ level: 'sf', set: 13, match: 1 });
  });
});
```

`shared/test/fieldmap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mirrorPoint, toCanonical, toDisplay } from '../src/fieldmap';

describe('field map mirroring', () => {
  it('rotates a point 180 degrees', () => {
    expect(mirrorPoint({ x: 0.25, y: 0.1 })).toEqual({ x: 0.75, y: 0.9 });
  });
  it('mirrors only for red slots when enabled', () => {
    const p = { x: 0.2, y: 0.3 };
    expect(toCanonical(p, 'red2', true)).toEqual({ x: 0.8, y: 0.7 });
    expect(toCanonical(p, 'blue1', true)).toEqual(p);
    expect(toCanonical(p, 'red1', false)).toEqual(p);
    expect(toCanonical(p, undefined, true)).toEqual(p);
  });
  it('display and canonical conversions undo each other', () => {
    const p = { x: 0.125, y: 0.875 };
    expect(toDisplay(toCanonical(p, 'red3', true), 'red3', true)).toEqual(p);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run shared/test/matchKey.test.ts shared/test/fieldmap.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`shared/src/matchKey.ts`:

```ts
export type CompLevel = 'qm' | 'ef' | 'qf' | 'sf' | 'f';
const LEVELS: CompLevel[] = ['qm', 'ef', 'qf', 'sf', 'f'];
const LEVEL_NAMES: Record<CompLevel, string> = { qm: 'Qual', ef: 'Eighth', qf: 'Quarter', sf: 'Semi', f: 'Final' };
const RE = /^(qm|ef|qf|sf|f)(\d+)(?:m(\d+))?$/;

export interface ParsedMatchKey { level: CompLevel; set: number; match: number }

export function parseMatchKey(key: string): ParsedMatchKey | null {
  const m = RE.exec(key);
  if (!m) return null;
  const level = m[1] as CompLevel;
  if (level === 'qm') {
    const match = Number(m[2]);
    return m[3] === undefined && match > 0 ? { level, set: 1, match } : null;
  }
  if (m[3] === undefined) return null;
  const set = Number(m[2]);
  const match = Number(m[3]);
  return set > 0 && match > 0 ? { level, set, match } : null;
}

function formatMatchKey(p: ParsedMatchKey): string {
  return p.level === 'qm' ? `qm${p.match}` : `${p.level}${p.set}m${p.match}`;
}

export function normalizeMatchKey(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n > 0 ? `qm${n}` : null;
  }
  const p = parseMatchKey(s);
  return p ? formatMatchKey(p) : null;
}

export function compareMatchKeys(a: string, b: string): number {
  const pa = parseMatchKey(a);
  const pb = parseMatchKey(b);
  if (!pa || !pb) return pa ? -1 : pb ? 1 : a.localeCompare(b);
  return LEVELS.indexOf(pa.level) - LEVELS.indexOf(pb.level) || pa.set - pb.set || pa.match - pb.match;
}

export function matchLabel(key: string): string {
  const p = parseMatchKey(key);
  if (!p) return key;
  return p.level === 'qm' ? `Qual ${p.match}` : `${LEVEL_NAMES[p.level]} ${p.set}-${p.match}`;
}
```

`shared/src/fieldmap.ts`:

```ts
import type { Point, Slot } from './types';

export function mirrorPoint(p: Point): Point {
  return { x: 1 - p.x, y: 1 - p.y };
}

/** Convert a tap as the scout saw it into the field image's own frame. */
export function toCanonical(p: Point, slot: Slot | undefined, mirrorForRed: boolean): Point {
  return mirrorForRed && slot?.startsWith('red') ? mirrorPoint(p) : p;
}

/** Convert a stored point into what this scout should see. (Rotation by 180° is its own inverse.) */
export const toDisplay = toCanonical;
```

Append to `shared/src/index.ts`:

```ts
export * from './matchKey';
export * from './fieldmap';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run shared && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): match key parsing/ordering and field map mirroring"
```

---

### Task 4: Record lifecycle — answers, missed, no-show, submit, validation

**Files:**
- Create: `shared/src/record.ts`
- Modify: `shared/src/index.ts`, `shared/test/fixtures.ts` (add `record()`)
- Test: `shared/test/record.test.ts`

**Interfaces:**
- Consumes: Task 2 types + `allQuestions`, `findQuestion`, `initialAnswers`, `initialValue`; Task 3 `normalizeMatchKey`.
- Produces:
  - `isAnswered(v: AnswerValue | undefined): boolean` — `null`/`undefined`/blank string/empty array are unanswered; `0` and `false` are answered
  - `interface NewRecordParams { id: string; form: FormDef; eventKey: string; team: number; scout: string; deviceId: string; now: string; matchKey?: string; slot?: Slot }`
  - `newRecord(p: NewRecordParams): ScoutRecord`
  - `setAnswer(rec: ScoutRecord, key: string, value: AnswerValue): ScoutRecord`
  - `markMissed(rec: ScoutRecord, key: string): ScoutRecord`
  - `unmarkMissed(form: FormDef, rec: ScoutRecord, key: string): ScoutRecord`
  - `unansweredRequired(form: FormDef, rec: ScoutRecord): string[]`
  - `finalizeSubmit(form: FormDef, rec: ScoutRecord, now: string): ScoutRecord`
  - `markNoShow(rec: ScoutRecord, now: string): ScoutRecord`
  - `reviseRecord(rec: ScoutRecord, now: string): ScoutRecord` — revision + 1
  - `undoNoShow(form: FormDef, rec: ScoutRecord, now: string): ScoutRecord`
  - `checkRecord(value: unknown): string[]` — runtime shape validation; `[]` = valid
  - Fixture: `record(form: FormDef, over?: Partial<ScoutRecord>): ScoutRecord` (event `2027test`, team 5098, scout `Ada`, device `dev-1`, match `qm1`/`red1` for match forms, ids `rec-1`, `rec-2`, …)

- [ ] **Step 1: Add the record fixture**

In `shared/test/fixtures.ts`, replace the first line (`import type { FormDef } from '../src/types';`) with:

```ts
import { newRecord } from '../src/record';
import type { FormDef, ScoutRecord } from '../src/types';
```

Then append to the end of the file:

```ts
let seq = 0;
export function record(form: FormDef, over: Partial<ScoutRecord> = {}): ScoutRecord {
  const base = newRecord({
    id: over.id ?? `rec-${++seq}`,
    form,
    eventKey: '2027test',
    team: 5098,
    scout: 'Ada',
    deviceId: 'dev-1',
    now: '2027-03-01T10:00:00.000Z',
    ...(form.kind === 'match' ? { matchKey: 'qm1', slot: 'red1' as const } : {}),
  });
  return { ...base, ...over };
}
```

- [ ] **Step 2: Write the failing tests**

`shared/test/record.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initialAnswers } from '../src/form';
import {
  checkRecord, finalizeSubmit, isAnswered, markMissed, markNoShow, newRecord,
  setAnswer, unansweredRequired, undoNoShow, unmarkMissed,
} from '../src/record';
import type { AnswerValue } from '../src/types';
import { matchForm, pitForm, record } from './fixtures';

const NOW = '2027-03-01T10:00:00.000Z';
const LATER = '2027-03-01T10:05:00.000Z';

describe('isAnswered', () => {
  it.each([
    [null, false], [undefined, false], ['', false], ['  ', false], [[], false],
    [0, true], [false, true], ['x', true], [['a'], true], [[{ x: 0, y: 0 }], true],
  ])('%j → %s', (v, want) => expect(isAnswered(v as AnswerValue | undefined)).toBe(want));
});

describe('newRecord', () => {
  it('starts at revision 1 with initial answers', () => {
    const r = newRecord({ id: 'r1', form: matchForm(), eventKey: '2027test', team: 5098, scout: 'Ada', deviceId: 'd1', now: NOW, matchKey: 'qm1', slot: 'red1' });
    expect(r).toMatchObject({ id: 'r1', revision: 1, kind: 'match', formVersion: 1, noShow: false, missed: [], photoIds: [], createdAt: NOW, updatedAt: NOW });
    expect(r.answers).toEqual(initialAnswers(matchForm()));
  });
});

describe('missed answers', () => {
  it('markMissed clears the value and records the key once', () => {
    let r = setAnswer(record(matchForm()), 'auto_coral', 3);
    r = markMissed(markMissed(r, 'auto_coral'), 'auto_coral');
    expect(r.answers.auto_coral).toBeNull();
    expect(r.missed).toEqual(['auto_coral']);
  });
  it('setAnswer un-misses the question', () => {
    const r = setAnswer(markMissed(record(matchForm()), 'climb'), 'climb', 'deep');
    expect(r.missed).toEqual([]);
    expect(r.answers.climb).toBe('deep');
  });
  it('unmarkMissed restores the initial value', () => {
    const f = matchForm();
    const r = unmarkMissed(f, markMissed(record(f), 'auto_coral'), 'auto_coral');
    expect(r.missed).toEqual([]);
    expect(r.answers.auto_coral).toBe(0);
  });
});

describe('finalizeSubmit', () => {
  it('marks unanswered required questions as missed', () => {
    const f = matchForm();
    let r = record(f);
    expect(unansweredRequired(f, r)).toEqual(['climb']);
    r = finalizeSubmit(f, r, LATER);
    expect(r.missed).toEqual(['climb']);
    expect(r.updatedAt).toBe(LATER);
    expect(unansweredRequired(f, r)).toEqual([]);
  });
  it('leaves empty optional questions alone', () => {
    const f = matchForm();
    const r = finalizeSubmit(f, setAnswer(record(f), 'climb', 'none'), LATER);
    expect(r.missed).toEqual([]);
    expect(r.answers.comments).toBeNull();
  });
  it('counts a counter left at its default as answered', () => {
    expect(unansweredRequired(matchForm(), record(matchForm()))).not.toContain('auto_coral');
  });
  it('treats whitespace-only required text as missed', () => {
    const f = matchForm();
    f.sections[2].questions[2].required = true; // comments
    const r = finalizeSubmit(f, setAnswer(setAnswer(record(f), 'climb', 'deep'), 'comments', '   '), LATER);
    expect(r.missed).toEqual(['comments']);
    expect(r.answers.comments).toBeNull();
  });
});

describe('no-show', () => {
  it('markNoShow empties answers and missed', () => {
    const r = markNoShow(markMissed(record(matchForm()), 'climb'), LATER);
    expect(r).toMatchObject({ noShow: true, answers: {}, missed: [], updatedAt: LATER, revision: 1 });
  });
  it('a submitted no-show has nothing missing', () => {
    const f = matchForm();
    expect(finalizeSubmit(f, markNoShow(record(f), NOW), LATER).missed).toEqual([]);
  });
  it('undoNoShow creates a new revision with fresh answers', () => {
    const f = matchForm();
    const u = undoNoShow(f, markNoShow(record(f), NOW), LATER);
    expect(u).toMatchObject({ revision: 2, noShow: false, missed: [], updatedAt: LATER });
    expect(u.answers).toEqual(initialAnswers(f));
  });
});

describe('checkRecord', () => {
  it('accepts valid match and pit records', () => {
    expect(checkRecord(record(matchForm()))).toEqual([]);
    expect(checkRecord(record(pitForm()))).toEqual([]);
  });
  it('reports bad fields', () => {
    expect(checkRecord({ ...record(matchForm()), revision: 0, slot: 'green1', matchKey: 'qm01' })).toEqual([
      'revision must be an integer >= 1',
      'matchKey must be a match key like "qm12"',
      'slot must be one of red1, red2, red3, blue1, blue2, blue3',
    ]);
  });
  it('rejects non-objects', () => {
    expect(checkRecord('nope')).toEqual(['record is not an object']);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run shared/test/record.test.ts`
Expected: FAIL — cannot resolve `../src/record`.

- [ ] **Step 4: Implement `shared/src/record.ts`**

```ts
import { allQuestions, findQuestion, initialAnswers, initialValue } from './form';
import { normalizeMatchKey } from './matchKey';
import type { AnswerValue, FormDef, ScoutRecord, Slot } from './types';
import { SLOTS } from './types';

export function isAnswered(v: AnswerValue | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export interface NewRecordParams {
  id: string;
  form: FormDef;
  eventKey: string;
  team: number;
  scout: string;
  deviceId: string;
  now: string;
  matchKey?: string;
  slot?: Slot;
}

export function newRecord(p: NewRecordParams): ScoutRecord {
  return {
    id: p.id,
    revision: 1,
    kind: p.form.kind,
    eventKey: p.eventKey,
    formVersion: p.form.version,
    matchKey: p.matchKey,
    slot: p.slot,
    team: p.team,
    scout: p.scout,
    deviceId: p.deviceId,
    noShow: false,
    answers: initialAnswers(p.form),
    missed: [],
    photoIds: [],
    createdAt: p.now,
    updatedAt: p.now,
  };
}

export function setAnswer(rec: ScoutRecord, key: string, value: AnswerValue): ScoutRecord {
  return { ...rec, answers: { ...rec.answers, [key]: value }, missed: rec.missed.filter(k => k !== key) };
}

export function markMissed(rec: ScoutRecord, key: string): ScoutRecord {
  return {
    ...rec,
    answers: { ...rec.answers, [key]: null },
    missed: rec.missed.includes(key) ? rec.missed : [...rec.missed, key],
  };
}

export function unmarkMissed(form: FormDef, rec: ScoutRecord, key: string): ScoutRecord {
  const q = findQuestion(form, key);
  return {
    ...rec,
    answers: { ...rec.answers, [key]: q ? initialValue(q) : null },
    missed: rec.missed.filter(k => k !== key),
  };
}

export function unansweredRequired(form: FormDef, rec: ScoutRecord): string[] {
  return allQuestions(form)
    .filter(q => q.required && !rec.missed.includes(q.key) && !isAnswered(rec.answers[q.key]))
    .map(q => q.key);
}

export function finalizeSubmit(form: FormDef, rec: ScoutRecord, now: string): ScoutRecord {
  if (rec.noShow) return { ...rec, updatedAt: now };
  const add = unansweredRequired(form, rec);
  return {
    ...rec,
    answers: { ...rec.answers, ...Object.fromEntries(add.map(k => [k, null])) },
    missed: [...rec.missed, ...add],
    updatedAt: now,
  };
}

export function markNoShow(rec: ScoutRecord, now: string): ScoutRecord {
  return { ...rec, noShow: true, answers: {}, missed: [], updatedAt: now };
}

export function reviseRecord(rec: ScoutRecord, now: string): ScoutRecord {
  return { ...rec, revision: rec.revision + 1, updatedAt: now };
}

export function undoNoShow(form: FormDef, rec: ScoutRecord, now: string): ScoutRecord {
  return { ...reviseRecord(rec, now), noShow: false, formVersion: form.version, answers: initialAnswers(form), missed: [] };
}

export function checkRecord(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ['record is not an object'];
  const r = value as Record<string, unknown>;
  const e: string[] = [];
  const str = (k: string) => { if (typeof r[k] !== 'string' || r[k] === '') e.push(`${k} must be a non-empty string`); };
  const int = (k: string, min: number) => { if (!Number.isInteger(r[k]) || (r[k] as number) < min) e.push(`${k} must be an integer >= ${min}`); };

  str('id');
  int('revision', 1);
  int('formVersion', 1);
  str('eventKey');
  int('team', 1);
  str('deviceId');
  str('createdAt');
  str('updatedAt');
  if (typeof r.scout !== 'string') e.push('scout must be a string');
  if (r.kind !== 'match' && r.kind !== 'pit') e.push('kind must be "match" or "pit"');
  if (typeof r.noShow !== 'boolean') e.push('noShow must be a boolean');
  if (typeof r.answers !== 'object' || r.answers === null || Array.isArray(r.answers)) e.push('answers must be an object');
  for (const k of ['missed', 'photoIds']) {
    const v = r[k];
    if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) e.push(`${k} must be a list of strings`);
  }
  if (r.kind === 'match') {
    if (typeof r.matchKey !== 'string' || normalizeMatchKey(r.matchKey) !== r.matchKey) e.push('matchKey must be a match key like "qm12"');
    if (!SLOTS.includes(r.slot as Slot)) e.push(`slot must be one of ${SLOTS.join(', ')}`);
  }
  return e;
}
```

Append to `shared/src/index.ts`:

```ts
export * from './record';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run shared && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add shared
git commit -m "feat(shared): record lifecycle with missed answers and no-shows"
```

---

### Task 5: Statistics and estimated points

**Files:**
- Create: `shared/src/scoring.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/scoring.test.ts`

**Interfaces:**
- Consumes: `allQuestions`, `summaryKind` (Task 2); `isAnswered` (Task 4).
- Produces:
  - `type QuestionStat = { kind: 'avg'; n: number; avg: number | null; max: number | null } | { kind: 'pct'; n: number; pct: number | null } | { kind: 'distribution'; n: number; counts: Record<string, number> } | { kind: 'list'; values: string[] } | { kind: 'scatter'; points: Point[] } | { kind: 'none' }` (`pct` is a fraction 0..1)
  - `usableValues(q: Question, records: ScoutRecord[]): AnswerValue[]` — skips no-shows, missed, empty, and wrong-typed values
  - `questionStat(q: Question, records: ScoutRecord[]): QuestionStat`
  - `questionPoints(q: Question, records: ScoutRecord[]): number | null` — average points per match from this question; `null` if the question has no points or no usable values
  - `interface PointsEstimate { total: number | null; bySection: Record<string, number | null> }`
  - `estimatedPoints(form: FormDef, records: ScoutRecord[]): PointsEstimate`
  - `recordPoints(form: FormDef, rec: ScoutRecord): number | null`

- [ ] **Step 1: Write the failing tests**

`shared/test/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findQuestion } from '../src/form';
import { markMissed, markNoShow, setAnswer } from '../src/record';
import { estimatedPoints, questionPoints, questionStat, recordPoints } from '../src/scoring';
import type { ScoutRecord } from '../src/types';
import { matchForm, record } from './fixtures';

const f = matchForm();
const q = (key: string) => findQuestion(f, key)!;
const NOW = '2027-03-01T10:00:00.000Z';

function rec(answers: Record<string, unknown>, missed: string[] = []): ScoutRecord {
  let r = record(f);
  for (const [k, v] of Object.entries(answers)) r = setAnswer(r, k, v as never);
  for (const k of missed) r = markMissed(r, k);
  return r;
}

const r1 = rec({ auto_coral: 2, auto_leave: true, climb: 'deep', zones: ['near'], comments: 'fast', start_pos: [{ x: 0.1, y: 0.2 }] });
const r2 = rec({ auto_coral: 4, auto_leave: false, climb: 'none', zones: ['near', 'far'] });
const r3 = rec({ auto_leave: true, climb: 'shallow' }, ['auto_coral']);
const r4 = markNoShow(rec({ auto_coral: 99, climb: 'deep' }), NOW);
const all = [r1, r2, r3, r4];

describe('questionStat', () => {
  it('averages counters, skipping missed answers and no-shows', () => {
    expect(questionStat(q('auto_coral'), all)).toEqual({ kind: 'avg', n: 2, avg: 3, max: 4 });
  });
  it('gives toggles as a fraction', () => {
    expect(questionStat(q('auto_leave'), all)).toEqual({ kind: 'pct', n: 3, pct: 2 / 3 });
  });
  it('counts choice and multi-select options', () => {
    expect(questionStat(q('climb'), all)).toEqual({ kind: 'distribution', n: 3, counts: { deep: 1, none: 1, shallow: 1 } });
    expect(questionStat(q('zones'), all)).toEqual({ kind: 'distribution', n: 2, counts: { near: 2, far: 1 } });
  });
  it('lists text and collects field-map points', () => {
    expect(questionStat(q('comments'), all)).toEqual({ kind: 'list', values: ['fast'] });
    expect(questionStat(q('start_pos'), all)).toEqual({ kind: 'scatter', points: [{ x: 0.1, y: 0.2 }] });
  });
  it('all missed: gives null rather than NaN or 0', () => {
    const missedAll = [rec({ climb: 'deep' }, ['auto_coral']), rec({ climb: 'none' }, ['auto_coral'])];
    expect(questionStat(q('auto_coral'), missedAll)).toEqual({ kind: 'avg', n: 0, avg: null, max: null });
    expect(questionPoints(q('auto_coral'), missedAll)).toBeNull();
    expect(estimatedPoints(f, missedAll).total).toBe(6); // leave 0, climb (12 + 0) / 2
  });
});

describe('points', () => {
  it('estimates average points per match by question and section', () => {
    expect(questionPoints(q('auto_coral'), all)).toBe(12);   // avg 3 × 4
    expect(questionPoints(q('auto_leave'), all)).toBe(2);    // 2/3 × 3
    expect(questionPoints(q('climb'), all)).toBe(6);         // (12 + 0 + 6) / 3
    expect(questionPoints(q('comments'), all)).toBeNull();   // no points configured
    expect(estimatedPoints(f, all)).toEqual({ total: 20, bySection: { auto: 14, endgame: 6, notes: null } });
  });
  it('scores a single record', () => {
    expect(recordPoints(f, r1)).toBe(23); // 2×4 + 3 + 12
    expect(recordPoints(f, r4)).toBeNull(); // no-show
  });
  it('returns null totals when there is nothing to score', () => {
    expect(estimatedPoints(f, [])).toEqual({ total: null, bySection: { auto: null, endgame: null, notes: null } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run shared/test/scoring.test.ts`
Expected: FAIL — cannot resolve `../src/scoring`.

- [ ] **Step 3: Implement `shared/src/scoring.ts`**

```ts
import { summaryKind } from './form';
import { isAnswered } from './record';
import type { AnswerValue, FormDef, Point, Question, ScoutRecord } from './types';

export type QuestionStat =
  | { kind: 'avg'; n: number; avg: number | null; max: number | null }
  | { kind: 'pct'; n: number; pct: number | null }
  | { kind: 'distribution'; n: number; counts: Record<string, number> }
  | { kind: 'list'; values: string[] }
  | { kind: 'scatter'; points: Point[] }
  | { kind: 'none' };

function valueMatchesType(q: Question, v: AnswerValue): boolean {
  switch (q.type) {
    case 'counter': case 'number': case 'rating': case 'timer':
      return typeof v === 'number' && Number.isFinite(v);
    case 'toggle':
      return typeof v === 'boolean';
    case 'choice': case 'text':
      return typeof v === 'string';
    case 'multi':
      return Array.isArray(v) && v.every(x => typeof x === 'string');
    case 'fieldmap':
      return Array.isArray(v) && v.every(p => typeof p === 'object' && p !== null && typeof (p as Point).x === 'number' && typeof (p as Point).y === 'number');
  }
}

export function usableValues(q: Question, records: ScoutRecord[]): AnswerValue[] {
  const out: AnswerValue[] = [];
  for (const r of records) {
    if (r.noShow || r.missed.includes(q.key)) continue;
    const v = r.answers[q.key];
    if (v !== undefined && isAnswered(v) && valueMatchesType(q, v)) out.push(v);
  }
  return out;
}

const mean = (nums: number[]): number | null => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);

export function questionStat(q: Question, records: ScoutRecord[]): QuestionStat {
  const vals = usableValues(q, records);
  const kind = summaryKind(q);
  switch (kind) {
    case 'avg': {
      const nums = vals.filter((v): v is number => typeof v === 'number');
      return { kind, n: nums.length, avg: mean(nums), max: nums.length ? Math.max(...nums) : null };
    }
    case 'pct': {
      const bools = vals.filter((v): v is boolean => typeof v === 'boolean');
      return { kind, n: bools.length, pct: bools.length ? bools.filter(Boolean).length / bools.length : null };
    }
    case 'distribution': {
      const counts: Record<string, number> = {};
      for (const v of vals) {
        const items = Array.isArray(v) ? v : [v];
        for (const item of items) if (typeof item === 'string') counts[item] = (counts[item] ?? 0) + 1;
      }
      return { kind, n: vals.length, counts };
    }
    case 'list':
      return { kind, values: vals.map(v => String(v)) };
    case 'scatter':
      return { kind, points: vals.flatMap(v => (Array.isArray(v) ? (v as Point[]) : [])) };
    case 'none':
      return { kind };
  }
}

export function questionPoints(q: Question, records: ScoutRecord[]): number | null {
  if (q.type === 'counter' && q.points !== undefined) {
    const avg = mean(usableValues(q, records) as number[]);
    return avg === null ? null : avg * q.points;
  }
  if (q.type === 'toggle' && q.points !== undefined) {
    const vals = usableValues(q, records);
    return vals.length ? (vals.filter(v => v === true).length / vals.length) * q.points : null;
  }
  if (q.type === 'choice' && q.options.some(o => o.points !== undefined)) {
    const pts = new Map(q.options.map(o => [o.value, o.points ?? 0]));
    return mean(usableValues(q, records).map(v => pts.get(v as string) ?? 0));
  }
  return null;
}

export interface PointsEstimate { total: number | null; bySection: Record<string, number | null> }

export function estimatedPoints(form: FormDef, records: ScoutRecord[]): PointsEstimate {
  const bySection: Record<string, number | null> = {};
  let total: number | null = null;
  for (const s of form.sections) {
    let sec: number | null = null;
    for (const q of s.questions) {
      const p = questionPoints(q, records);
      if (p !== null) sec = (sec ?? 0) + p;
    }
    bySection[s.id] = sec;
    if (sec !== null) total = (total ?? 0) + sec;
  }
  return { total, bySection };
}

export function recordPoints(form: FormDef, rec: ScoutRecord): number | null {
  return estimatedPoints(form, [rec]).total;
}
```

Append to `shared/src/index.ts`:

```ts
export * from './scoring';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run shared && npm run typecheck`
Expected: PASS, no type errors. (`toBe(2)` for `2/3 × 3` holds exactly in IEEE doubles; if it ever fails, switch that assertion to `toBeCloseTo(2)`.)

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): question statistics and estimated points"
```

---

### Task 6: QR codec — base45, payload, multi-part chunks

**Files:**
- Create: `shared/src/qr.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/qr.test.ts`

**Interfaces:**
- Consumes: `allQuestions` (Task 2); `checkRecord` (Task 4); types.
- Produces:
  - `base45Encode(bytes: Uint8Array): string`, `base45Decode(text: string): Uint8Array` (throws on invalid input)
  - `QR_FORMAT = 1`, `QR_CHUNK_CHARS = 900`
  - `type FormLookup = (kind: FormKind, version: number) => FormDef | undefined`
  - `encodeRecordQr(form: FormDef, rec: ScoutRecord): Promise<string[]>` — one string per QR code, each `ST1:<group>:<part>/<total>:<base45>`
  - `interface QrChunk { group: string; part: number; total: number; data: string }`, `parseQrChunk(text: string): QrChunk | null`
  - `type AssembleResult = { status: 'partial'; group: string; have: number; total: number } | { status: 'complete'; group: string; data: string } | { status: 'invalid'; reason: string }`
  - `class QrAssembler { add(text: string): AssembleResult }`
  - `decodeRecordData(data: string, getForm: FormLookup): Promise<ScoutRecord>` (throws `Error` with a human-readable message)

- [ ] **Step 1: Write the failing tests**

`shared/test/qr.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { base45Decode, base45Encode, decodeRecordData, encodeRecordQr, parseQrChunk, QrAssembler } from '../src/qr';
import { markMissed, markNoShow, setAnswer } from '../src/record';
import type { FormDef, FormKind, ScoutRecord } from '../src/types';
import { matchForm, pitForm, record } from './fixtures';

const forms: FormDef[] = [matchForm(), pitForm()];
const lookup = (kind: FormKind, version: number) => forms.find(f => f.kind === kind && f.version === version);
const ALNUM = /^[0-9A-Z $%*+\-./:]+$/;

async function roundTrip(form: FormDef, rec: ScoutRecord) {
  const chunks = await encodeRecordQr(form, rec);
  const asm = new QrAssembler();
  let res = asm.add(chunks[0]);
  for (const c of chunks.slice(1)) res = asm.add(c);
  if (res.status !== 'complete') throw new Error(`expected complete, got ${res.status}`);
  return { chunks, decoded: await decodeRecordData(res.data, lookup) };
}

describe('base45', () => {
  const enc = (s: string) => base45Encode(new TextEncoder().encode(s));
  it.each([['AB', 'BB8'], ['Hello!!', '%69 VD92EX0'], ['base-45', 'UJCLQE7W581']])('%s ↔ %s', (plain, coded) => {
    expect(enc(plain)).toBe(coded);
    expect(new TextDecoder().decode(base45Decode(coded))).toBe(plain);
  });
  it('rejects invalid input', () => {
    expect(() => base45Decode('GGW')).toThrow();
    expect(() => base45Decode('a')).toThrow();
    expect(() => base45Decode('A')).toThrow();
  });
});

describe('record QR codes', () => {
  it('round-trips a filled match record in one code', async () => {
    const f = matchForm();
    let r = record(f, { id: '6f1c2b9e-0d4a-4c1e-9a7b-3e2f1d0c9b8a' });
    r = setAnswer(r, 'auto_coral', 3);
    r = setAnswer(r, 'climb', 'deep');
    r = setAnswer(r, 'start_pos', [{ x: 0.25, y: 0.5 }]);
    r = setAnswer(r, 'zones', ['near', 'far']);
    r = setAnswer(r, 'comments', 'Fast, "great" driver');
    r = markMissed(r, 'defense');
    const { chunks, decoded } = await roundTrip(f, r);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatch(/^ST1:6F1C2B9E\.1:1\/1:/);
    expect(chunks[0]).toMatch(ALNUM);
    expect(decoded).toEqual(r);
  });

  it('round-trips a pit no-show', async () => {
    const f = pitForm();
    const r = markNoShow(record(f), '2027-03-01T11:00:00.000Z');
    expect((await roundTrip(f, r)).decoded).toEqual(r);
  });

  it('splits a large record into parts that can arrive in any order', async () => {
    let seed = 1;
    const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    const text = Array.from({ length: 4000 }, () => 'abcdefghijklmnopqrstuvwxyz '[Math.floor(rand() * 27)]).join('');
    const f = matchForm();
    const r = setAnswer(record(f), 'comments', text);
    const chunks = await encodeRecordQr(f, r);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c).toMatch(ALNUM);

    const asm = new QrAssembler();
    const reversed = [...chunks].reverse();
    for (const c of reversed.slice(0, -1)) expect(asm.add(c).status).toBe('partial');
    expect(asm.add(reversed[0])).toMatchObject({ status: 'partial', have: chunks.length - 1 }); // duplicate part
    const done = asm.add(reversed[reversed.length - 1]);
    if (done.status !== 'complete') throw new Error('expected complete');
    expect(await decodeRecordData(done.data, lookup)).toEqual(r);
  });

  it('rejects codes that are not ours', () => {
    expect(new QrAssembler().add('https://example.com')).toEqual({ status: 'invalid', reason: 'Not a Stingr Scout QR code' });
    expect(parseQrChunk('ST1:ABC.1:3/2:XX')).toBeNull();
  });

  it('explains when the hub lacks the form version', async () => {
    const f2 = matchForm(2);
    const chunks = await encodeRecordQr(f2, record(f2));
    const res = new QrAssembler().add(chunks[0]);
    if (res.status !== 'complete') throw new Error('expected complete');
    await expect(decodeRecordData(res.data, lookup)).rejects.toThrow("This hub doesn't have match form version 2");
  });

  it('rejects corrupt data', async () => {
    await expect(decodeRecordData('ZZZZ', lookup)).rejects.toThrow('QR data is corrupt');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run shared/test/qr.test.ts`
Expected: FAIL — cannot resolve `../src/qr`.

- [ ] **Step 3: Implement `shared/src/qr.ts`**

```ts
import { allQuestions } from './form';
import { checkRecord } from './record';
import type { AnswerValue, FormDef, FormKind, Point, Question, ScoutRecord, Slot } from './types';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

export function base45Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const n = bytes[i] * 256 + bytes[i + 1];
      out += ALPHABET[n % 45] + ALPHABET[Math.floor(n / 45) % 45] + ALPHABET[Math.floor(n / 2025)];
    } else {
      const n = bytes[i];
      out += ALPHABET[n % 45] + ALPHABET[Math.floor(n / 45)];
    }
  }
  return out;
}

export function base45Decode(text: string): Uint8Array {
  const vals = [...text].map(ch => {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error(`Invalid base45 character "${ch}"`);
    return v;
  });
  if (vals.length % 3 === 1) throw new Error('Invalid base45 length');
  const out: number[] = [];
  for (let i = 0; i < vals.length; i += 3) {
    if (i + 2 < vals.length) {
      const n = vals[i] + vals[i + 1] * 45 + vals[i + 2] * 2025;
      if (n > 0xffff) throw new Error('Invalid base45 group');
      out.push(n >> 8, n & 0xff);
    } else {
      const n = vals[i] + vals[i + 1] * 45;
      if (n > 0xff) throw new Error('Invalid base45 group');
      out.push(n);
    }
  }
  return new Uint8Array(out);
}

export const QR_FORMAT = 1;
export const QR_CHUNK_CHARS = 900;
export type FormLookup = (kind: FormKind, version: number) => FormDef | undefined;

type Payload = [
  format: number, kind: FormKind, formVersion: number, eventKey: string, matchKey: string | null,
  slot: Slot | null, team: number, scout: string, id: string, revision: number, noShow: number,
  deviceId: string, createdAt: string, updatedAt: string, photoIds: string[], values: unknown[], missed: number[],
];

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function packValue(q: Question, v: AnswerValue | undefined): unknown {
  if (v === undefined || v === null) return null;
  if (q.type === 'fieldmap' && Array.isArray(v)) return (v as Point[]).map(p => [round3(p.x), round3(p.y)]);
  return v;
}

function unpackValue(q: Question, v: unknown): AnswerValue {
  if (v === null || v === undefined) return null;
  if (q.type === 'fieldmap') return (v as [number, number][]).map(([x, y]) => ({ x, y }));
  return v as AnswerValue;
}

function recordToPayload(form: FormDef, rec: ScoutRecord): Payload {
  const qs = allQuestions(form);
  return [
    QR_FORMAT, rec.kind, rec.formVersion, rec.eventKey, rec.matchKey ?? null, rec.slot ?? null, rec.team,
    rec.scout, rec.id, rec.revision, rec.noShow ? 1 : 0, rec.deviceId, rec.createdAt, rec.updatedAt,
    rec.photoIds,
    rec.noShow ? [] : qs.map(q => packValue(q, rec.answers[q.key])),
    qs.flatMap((q, i) => (rec.missed.includes(q.key) ? [i] : [])),
  ];
}

function payloadToRecord(p: unknown, getForm: FormLookup): ScoutRecord {
  if (!Array.isArray(p) || p[0] !== QR_FORMAT || p.length !== 17) {
    throw new Error('Not a Stingr Scout QR code (or one from an incompatible version)');
  }
  const [, kind, formVersion, eventKey, matchKey, slot, team, scout, id, revision, noShow,
    deviceId, createdAt, updatedAt, photoIds, values, missed] = p as Payload;
  const form = getForm(kind, formVersion);
  if (!form) throw new Error(`This hub doesn't have ${kind} form version ${formVersion}`);
  const qs = allQuestions(form);
  const rec: ScoutRecord = {
    id, revision, kind, eventKey, formVersion,
    matchKey: matchKey ?? undefined,
    slot: slot ?? undefined,
    team, scout, deviceId,
    noShow: noShow === 1,
    answers: noShow === 1 ? {} : Object.fromEntries(qs.map((q, i) => [q.key, unpackValue(q, values[i])])),
    missed: missed.map(i => qs[i]?.key).filter((k): k is string => k !== undefined),
    photoIds, createdAt, updatedAt,
  };
  const errors = checkRecord(rec);
  if (errors.length) throw new Error(`Invalid record in QR code: ${errors.join('; ')}`);
  return rec;
}

async function pipeBytes(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeRecordQr(form: FormDef, rec: ScoutRecord): Promise<string[]> {
  if (form.kind !== rec.kind || form.version !== rec.formVersion) throw new Error('Form does not match record');
  const json = JSON.stringify(recordToPayload(form, rec));
  const data = base45Encode(await pipeBytes(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
  const group = `${rec.id.replace(/[^0-9a-zA-Z]/g, '').slice(0, 8).toUpperCase()}.${rec.revision}`;
  const total = Math.max(1, Math.ceil(data.length / QR_CHUNK_CHARS));
  return Array.from({ length: total }, (_, i) =>
    `ST1:${group}:${i + 1}/${total}:${data.slice(i * QR_CHUNK_CHARS, (i + 1) * QR_CHUNK_CHARS)}`);
}

export interface QrChunk { group: string; part: number; total: number; data: string }

export function parseQrChunk(text: string): QrChunk | null {
  // Only strip line breaks: a trailing space can be real base45 data.
  const m = /^ST1:([0-9A-Z]{1,8}\.\d+):(\d+)\/(\d+):([\s\S]*)$/.exec(text.replace(/[\r\n]+$/, ''));
  if (!m) return null;
  const part = Number(m[2]);
  const total = Number(m[3]);
  if (total < 1 || part < 1 || part > total) return null;
  return { group: m[1], part, total, data: m[4] };
}

export type AssembleResult =
  | { status: 'partial'; group: string; have: number; total: number }
  | { status: 'complete'; group: string; data: string }
  | { status: 'invalid'; reason: string };

export class QrAssembler {
  private groups = new Map<string, { total: number; parts: Map<number, string> }>();

  add(text: string): AssembleResult {
    const c = parseQrChunk(text);
    if (!c) return { status: 'invalid', reason: 'Not a Stingr Scout QR code' };
    let g = this.groups.get(c.group);
    if (!g || g.total !== c.total) {
      g = { total: c.total, parts: new Map() };
      this.groups.set(c.group, g);
    }
    g.parts.set(c.part, c.data);
    if (g.parts.size < g.total) return { status: 'partial', group: c.group, have: g.parts.size, total: g.total };
    this.groups.delete(c.group);
    const parts = g.parts;
    const data = Array.from({ length: g.total }, (_, i) => parts.get(i + 1) ?? '').join('');
    return { status: 'complete', group: c.group, data };
  }
}

export async function decodeRecordData(data: string, getForm: FormLookup): Promise<ScoutRecord> {
  let payload: unknown;
  try {
    const bytes = await pipeBytes(base45Decode(data), new DecompressionStream('deflate-raw'));
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('QR data is corrupt');
  }
  return payloadToRecord(payload, getForm);
}
```

Append to `shared/src/index.ts`:

```ts
export * from './qr';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run shared && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): QR codec with base45 and multi-part codes"
```

---

### Task 7: Hub database, settings, events, schedule and teams

**Files:**
- Create: `hub/server/package.json`, `hub/server/src/db.ts`, `hub/server/src/store/settings.ts`, `hub/server/src/store/events.ts`, `hub/server/src/store/schedule.ts`
- Test: `hub/server/test/store.test.ts`

**Interfaces:**
- Consumes: `EventInfo`, `ScheduleMatch`, `compareMatchKeys` from `@stingr/shared`.
- Produces:
  - `type Db = DatabaseSync`; `SCHEMA_VERSION = 1`; `openDb(path: string): Db` (`':memory:'` allowed); `schemaVersion(db: Db): number`; `tx<T>(db: Db, fn: () => T): T`
  - `getSetting(db, key: string): string | null`; `setSetting(db, key: string, value: string | null): void` (`null` deletes)
  - `upsertEvent(db, ev: EventInfo): void`; `listEvents(db): EventInfo[]` (by key); `currentEvent(db): EventInfo | null`; `setCurrentEvent(db, key: string): void` (throws `Error('Unknown event "<key>"')`)
  - `replaceSchedule(db, eventKey: string, matches: ScheduleMatch[]): void` (also adds every non-zero team); `listSchedule(db, eventKey): ScheduleMatch[]` (match order); `listTeams(db, eventKey): number[]` (ascending); `addTeam(db, eventKey, team: number): void`; `removeTeam(db, eventKey, team: number): void`
  - Settings keys used across the hub: `current_event`, `tba_key`.

- [ ] **Step 1: Create the package**

`hub/server/package.json`:

```json
{
  "name": "@stingr/hub-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": { "@stingr/shared": "*" }
}
```

Run: `npm install`
Expected: completes; `node_modules/@stingr/hub-server` symlink exists.

- [ ] **Step 2: Write the failing tests**

`hub/server/test/store.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb, schemaVersion } from '../src/db';
import { currentEvent, listEvents, setCurrentEvent, upsertEvent } from '../src/store/events';
import { addTeam, listSchedule, listTeams, removeTeam, replaceSchedule } from '../src/store/schedule';
import { getSetting, setSetting } from '../src/store/settings';

describe('openDb', () => {
  it('creates the schema once and reopens an existing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stingr-'));
    try {
      const path = join(dir, 'x.db');
      const a = openDb(path);
      expect(schemaVersion(a)).toBe(1);
      upsertEvent(a, { key: '2027a', name: 'A' });
      a.close();
      const b = openDb(path);
      expect(listEvents(b)).toEqual([{ key: '2027a', name: 'A' }]);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('settings', () => {
  it('stores, replaces and deletes values', () => {
    const db = openDb(':memory:');
    expect(getSetting(db, 'tba_key')).toBeNull();
    setSetting(db, 'tba_key', 'abc');
    setSetting(db, 'tba_key', 'def');
    expect(getSetting(db, 'tba_key')).toBe('def');
    setSetting(db, 'tba_key', null);
    expect(getSetting(db, 'tba_key')).toBeNull();
  });
});

describe('events', () => {
  it('upserts, lists and tracks the current event', () => {
    const db = openDb(':memory:');
    expect(currentEvent(db)).toBeNull();
    upsertEvent(db, { key: '2027b', name: 'B' });
    upsertEvent(db, { key: '2027a', name: 'A' });
    upsertEvent(db, { key: '2027a', name: 'A2' });
    expect(listEvents(db)).toEqual([{ key: '2027a', name: 'A2' }, { key: '2027b', name: 'B' }]);
    setCurrentEvent(db, '2027b');
    expect(currentEvent(db)).toEqual({ key: '2027b', name: 'B' });
    expect(() => setCurrentEvent(db, 'nope')).toThrow('Unknown event "nope"');
  });
});

describe('schedule and teams', () => {
  it('lists the schedule in match order and derives teams', () => {
    const db = openDb(':memory:');
    upsertEvent(db, { key: 'e', name: 'E' });
    addTeam(db, 'e', 9999);
    replaceSchedule(db, 'e', [
      { matchKey: 'qm10', red: [1, 2, 3], blue: [4, 5, 6] },
      { matchKey: 'qm9', red: [6, 5, 4], blue: [3, 2, 0] },
      { matchKey: 'qm1', red: [1, 2, 3], blue: [4, 5, 6] },
    ]);
    expect(listSchedule(db, 'e').map(m => m.matchKey)).toEqual(['qm1', 'qm9', 'qm10']);
    expect(listSchedule(db, 'e')[1]).toEqual({ matchKey: 'qm9', red: [6, 5, 4], blue: [3, 2, 0] });
    expect(listTeams(db, 'e')).toEqual([1, 2, 3, 4, 5, 6, 9999]);
  });

  it('replacing the schedule drops old matches but keeps teams', () => {
    const db = openDb(':memory:');
    upsertEvent(db, { key: 'e', name: 'E' });
    replaceSchedule(db, 'e', [{ matchKey: 'qm1', red: [1, 2, 3], blue: [4, 5, 6] }]);
    replaceSchedule(db, 'e', [{ matchKey: 'qm2', red: [7, 8, 9], blue: [10, 11, 12] }]);
    expect(listSchedule(db, 'e').map(m => m.matchKey)).toEqual(['qm2']);
    expect(listTeams(db, 'e')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('removes a team', () => {
    const db = openDb(':memory:');
    upsertEvent(db, { key: 'e', name: 'E' });
    addTeam(db, 'e', 5098);
    addTeam(db, 'e', 5098);
    addTeam(db, 'e', 254);
    removeTeam(db, 'e', 5098);
    expect(listTeams(db, 'e')).toEqual([254]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run hub/server/test/store.test.ts`
Expected: FAIL — cannot resolve `../src/db`.

- [ ] **Step 4: Implement**

`hub/server/src/db.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE events (key TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE matches (
    event_key TEXT NOT NULL, match_key TEXT NOT NULL,
    red1 INTEGER NOT NULL, red2 INTEGER NOT NULL, red3 INTEGER NOT NULL,
    blue1 INTEGER NOT NULL, blue2 INTEGER NOT NULL, blue3 INTEGER NOT NULL,
    PRIMARY KEY (event_key, match_key)
  );
  CREATE TABLE teams (event_key TEXT NOT NULL, team INTEGER NOT NULL, PRIMARY KEY (event_key, team));
  CREATE TABLE forms (
    kind TEXT NOT NULL, version INTEGER NOT NULL, json TEXT NOT NULL, published_at TEXT NOT NULL,
    PRIMARY KEY (kind, version)
  );
  CREATE TABLE form_drafts (kind TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE records (
    id TEXT NOT NULL, revision INTEGER NOT NULL, kind TEXT NOT NULL, event_key TEXT NOT NULL,
    team INTEGER NOT NULL, match_key TEXT, slot TEXT, json TEXT NOT NULL,
    received_at TEXT NOT NULL, via TEXT NOT NULL,
    PRIMARY KEY (id, revision)
  );
  CREATE INDEX records_by_event ON records (event_key, kind);
  CREATE TABLE photos (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, received_at TEXT NOT NULL);
  CREATE TABLE devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, last_sync_at TEXT);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function schemaVersion(db: Db): number {
  return (db.prepare('PRAGMA user_version').get() as unknown as { user_version: number }).user_version;
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  for (let v = schemaVersion(db); v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}
```

`hub/server/src/store/settings.ts`:

```ts
import type { Db } from '../db';

export function getSetting(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as unknown as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string | null): void {
  if (value === null) db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  else db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value);
}
```

`hub/server/src/store/events.ts`:

```ts
import type { EventInfo } from '@stingr/shared';
import type { Db } from '../db';
import { getSetting, setSetting } from './settings';

export function upsertEvent(db: Db, ev: EventInfo): void {
  db.prepare('INSERT INTO events (key, name) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET name = excluded.name').run(ev.key, ev.name);
}

export function listEvents(db: Db): EventInfo[] {
  return db.prepare('SELECT key, name FROM events ORDER BY key').all() as unknown as EventInfo[];
}

export function currentEvent(db: Db): EventInfo | null {
  const key = getSetting(db, 'current_event');
  if (!key) return null;
  const row = db.prepare('SELECT key, name FROM events WHERE key = ?').get(key) as unknown as EventInfo | undefined;
  return row ? { key: row.key, name: row.name } : null;
}

export function setCurrentEvent(db: Db, key: string): void {
  if (!db.prepare('SELECT 1 FROM events WHERE key = ?').get(key)) throw new Error(`Unknown event "${key}"`);
  setSetting(db, 'current_event', key);
}
```

`hub/server/src/store/schedule.ts`:

```ts
import { compareMatchKeys, type ScheduleMatch } from '@stingr/shared';
import { type Db, tx } from '../db';

type MatchRow = { match_key: string; red1: number; red2: number; red3: number; blue1: number; blue2: number; blue3: number };

export function replaceSchedule(db: Db, eventKey: string, matches: ScheduleMatch[]): void {
  tx(db, () => {
    db.prepare('DELETE FROM matches WHERE event_key = ?').run(eventKey);
    const insert = db.prepare('INSERT INTO matches (event_key, match_key, red1, red2, red3, blue1, blue2, blue3) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const team = db.prepare('INSERT OR IGNORE INTO teams (event_key, team) VALUES (?, ?)');
    for (const m of matches) {
      insert.run(eventKey, m.matchKey, ...m.red, ...m.blue);
      for (const t of [...m.red, ...m.blue]) if (t > 0) team.run(eventKey, t);
    }
  });
}

export function listSchedule(db: Db, eventKey: string): ScheduleMatch[] {
  const rows = db.prepare('SELECT * FROM matches WHERE event_key = ?').all(eventKey) as unknown as MatchRow[];
  return rows
    .map(r => ({ matchKey: r.match_key, red: [r.red1, r.red2, r.red3], blue: [r.blue1, r.blue2, r.blue3] }) as ScheduleMatch)
    .sort((a, b) => compareMatchKeys(a.matchKey, b.matchKey));
}

export function listTeams(db: Db, eventKey: string): number[] {
  const rows = db.prepare('SELECT team FROM teams WHERE event_key = ? ORDER BY team').all(eventKey) as unknown as { team: number }[];
  return rows.map(r => r.team);
}

export function addTeam(db: Db, eventKey: string, team: number): void {
  db.prepare('INSERT OR IGNORE INTO teams (event_key, team) VALUES (?, ?)').run(eventKey, team);
}

export function removeTeam(db: Db, eventKey: string, team: number): void {
  db.prepare('DELETE FROM teams WHERE event_key = ? AND team = ?').run(eventKey, team);
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run hub/server && npm run typecheck`
Expected: PASS (an `ExperimentalWarning: SQLite` line in the output is normal), no type errors.

- [ ] **Step 6: Commit**

```bash
git add package-lock.json hub/server
git commit -m "feat(hub): SQLite schema, settings, events and schedule storage"
```

---

### Task 8: Form storage — drafts and immutable published versions

**Files:**
- Create: `hub/server/src/store/forms.ts`
- Test: `hub/server/test/forms-store.test.ts`

**Interfaces:**
- Consumes: `openDb`, `tx`, `Db` (Task 7); `validateFormDef`, `FormDef`, `FormKind` (shared); fixtures `matchForm`, `pitForm`.
- Produces:
  - `listForms(db, kind?: FormKind): FormDef[]` (by kind then version)
  - `getForm(db, kind: FormKind, version: number): FormDef | undefined`
  - `latestForm(db, kind: FormKind): FormDef | undefined`
  - `hasDraft(db, kind): boolean`
  - `getDraft(db, kind): FormDef | null` — the draft (version 0), else a copy of the latest published form, else `null`
  - `saveDraft(db, form: FormDef, now: string): void` (stored with version 0)
  - `discardDraft(db, kind): void`
  - `type PublishResult = { ok: true; form: FormDef; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] }`
  - `publishDraft(db, kind, now: string): PublishResult`

- [ ] **Step 1: Write the failing tests**

`hub/server/test/forms-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm } from '../../../shared/test/fixtures';
import { openDb } from '../src/db';
import { discardDraft, getDraft, getForm, hasDraft, latestForm, listForms, publishDraft, saveDraft } from '../src/store/forms';

const NOW = '2027-03-01T12:00:00.000Z';

describe('form storage', () => {
  it('starts empty', () => {
    const db = openDb(':memory:');
    expect(getDraft(db, 'match')).toBeNull();
    expect(listForms(db)).toEqual([]);
    expect(latestForm(db, 'match')).toBeUndefined();
  });

  it('publishes drafts as consecutive versions', () => {
    const db = openDb(':memory:');
    saveDraft(db, matchForm(), NOW);
    expect(hasDraft(db, 'match')).toBe(true);
    expect(publishDraft(db, 'match', NOW)).toEqual({ ok: true, form: matchForm(1), warnings: [] });
    expect(hasDraft(db, 'match')).toBe(false);
    expect(getDraft(db, 'match')).toEqual(matchForm(1));

    saveDraft(db, matchForm(7), NOW); // the version in a draft is ignored
    const second = publishDraft(db, 'match', NOW);
    expect(second.ok && second.form.version).toBe(2);
    expect(listForms(db, 'match').map(f => f.version)).toEqual([1, 2]);
    expect(getForm(db, 'match', 1)).toEqual(matchForm(1));
    expect(latestForm(db, 'match')?.version).toBe(2);
  });

  it('refuses to publish an invalid draft and keeps it', () => {
    const db = openDb(':memory:');
    saveDraft(db, { ...matchForm(), sections: [] }, NOW);
    expect(publishDraft(db, 'match', NOW)).toEqual({ ok: false, errors: ['Form has no questions'], warnings: [] });
    expect(listForms(db)).toEqual([]);
    expect(hasDraft(db, 'match')).toBe(true);
  });

  it('refuses to publish when there is no draft', () => {
    const db = openDb(':memory:');
    expect(publishDraft(db, 'pit', NOW)).toEqual({ ok: false, errors: ['There are no unpublished changes to publish'], warnings: [] });
  });

  it('discards a draft', () => {
    const db = openDb(':memory:');
    saveDraft(db, pitForm(), NOW);
    discardDraft(db, 'pit');
    expect(getDraft(db, 'pit')).toBeNull();
  });

  it('keeps match and pit forms separate', () => {
    const db = openDb(':memory:');
    saveDraft(db, pitForm(), NOW);
    publishDraft(db, 'pit', NOW);
    saveDraft(db, matchForm(), NOW);
    publishDraft(db, 'match', NOW);
    expect(listForms(db).map(f => `${f.kind}${f.version}`)).toEqual(['match1', 'pit1']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run hub/server/test/forms-store.test.ts`
Expected: FAIL — cannot resolve `../src/store/forms`.

- [ ] **Step 3: Implement `hub/server/src/store/forms.ts`**

```ts
import { type FormDef, type FormKind, validateFormDef } from '@stingr/shared';
import { type Db, tx } from '../db';

type JsonRow = { json: string };
const parse = (row: JsonRow | undefined): FormDef | undefined => (row ? (JSON.parse(row.json) as FormDef) : undefined);

export function listForms(db: Db, kind?: FormKind): FormDef[] {
  const rows = (kind
    ? db.prepare('SELECT json FROM forms WHERE kind = ? ORDER BY version').all(kind)
    : db.prepare('SELECT json FROM forms ORDER BY kind, version').all()) as unknown as JsonRow[];
  return rows.map(r => JSON.parse(r.json) as FormDef);
}

export function getForm(db: Db, kind: FormKind, version: number): FormDef | undefined {
  return parse(db.prepare('SELECT json FROM forms WHERE kind = ? AND version = ?').get(kind, version) as unknown as JsonRow | undefined);
}

export function latestForm(db: Db, kind: FormKind): FormDef | undefined {
  return parse(db.prepare('SELECT json FROM forms WHERE kind = ? ORDER BY version DESC LIMIT 1').get(kind) as unknown as JsonRow | undefined);
}

export function hasDraft(db: Db, kind: FormKind): boolean {
  return db.prepare('SELECT 1 FROM form_drafts WHERE kind = ?').get(kind) !== undefined;
}

export function getDraft(db: Db, kind: FormKind): FormDef | null {
  const draft = parse(db.prepare('SELECT json FROM form_drafts WHERE kind = ?').get(kind) as unknown as JsonRow | undefined);
  return draft ?? latestForm(db, kind) ?? null;
}

export function saveDraft(db: Db, form: FormDef, now: string): void {
  db.prepare('INSERT INTO form_drafts (kind, json, updated_at) VALUES (?, ?, ?) ON CONFLICT (kind) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at')
    .run(form.kind, JSON.stringify({ ...form, version: 0 }), now);
}

export function discardDraft(db: Db, kind: FormKind): void {
  db.prepare('DELETE FROM form_drafts WHERE kind = ?').run(kind);
}

export type PublishResult =
  | { ok: true; form: FormDef; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

export function publishDraft(db: Db, kind: FormKind, now: string): PublishResult {
  const draft = parse(db.prepare('SELECT json FROM form_drafts WHERE kind = ?').get(kind) as unknown as JsonRow | undefined);
  if (!draft) return { ok: false, errors: ['There are no unpublished changes to publish'], warnings: [] };
  const earlier = listForms(db, kind);
  const form: FormDef = { ...draft, kind, version: (earlier.at(-1)?.version ?? 0) + 1 };
  const { errors, warnings } = validateFormDef(form, earlier);
  if (errors.length) return { ok: false, errors, warnings };
  tx(db, () => {
    db.prepare('INSERT INTO forms (kind, version, json, published_at) VALUES (?, ?, ?, ?)').run(kind, form.version, JSON.stringify(form), now);
    discardDraft(db, kind);
  });
  return { ok: true, form, warnings };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run hub/server && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add hub/server
git commit -m "feat(hub): form drafts and versioned publishing"
```

---

### Task 9: Records, photos, devices and the sync service

**Files:**
- Create: `hub/server/src/store/records.ts`, `hub/server/src/store/photos.ts`, `hub/server/src/store/devices.ts`, `hub/server/src/sync.ts`
- Test: `hub/server/test/sync.test.ts`

**Interfaces:**
- Consumes: Tasks 7–8 stores; shared `checkRecord`, types; fixtures `matchForm`, `pitForm`, `record`.
- Produces:
  - `type InsertOutcome = 'inserted' | 'duplicate'`; `insertRecord(db, rec: ScoutRecord, via: 'usb' | 'qr', now: string): InsertOutcome`
  - `currentRecords(db, eventKey: string, kind: FormKind): ScoutRecord[]` (highest revision per id); `recordHistory(db, id: string): ScoutRecord[]` (by revision)
  - `putPhoto(db, id: string, recordId: string, mime: string, data: Uint8Array, now: string): void`; `getPhoto(db, id): { mime: string; data: Uint8Array } | undefined`; `missingPhotoIds(db, ids: string[]): string[]`
  - `type DeviceRow = { id: string; name: string; lastSyncAt: string | null }`; `touchDevice(db, d: DeviceInfo, now: string): void`; `listDevices(db): DeviceRow[]`
  - `buildConfig(db, appBuild: string): HubConfig`
  - `parseSyncRequest(body: unknown): SyncRequest | string` (string = error message)
  - `type IngestResult = { ok: true; outcome: InsertOutcome; record: ScoutRecord } | { ok: false; reason: string }`; `ingestRecord(db, value: unknown, via: 'usb' | 'qr', now: string): IngestResult`
  - `handleSync(db, req: SyncRequest, appBuild: string, now: string): SyncResponse`

- [ ] **Step 1: Write the failing tests**

`hub/server/test/sync.test.ts`:

```ts
import { reviseRecord, setAnswer } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../../shared/test/fixtures';
import { openDb } from '../src/db';
import { listDevices } from '../src/store/devices';
import { setCurrentEvent, upsertEvent } from '../src/store/events';
import { publishDraft, saveDraft } from '../src/store/forms';
import { getPhoto, putPhoto } from '../src/store/photos';
import { currentRecords, recordHistory } from '../src/store/records';
import { replaceSchedule } from '../src/store/schedule';
import { handleSync, parseSyncRequest } from '../src/sync';

const NOW = '2027-03-01T12:00:00.000Z';
const LATER = '2027-03-01T12:10:00.000Z';
const device = { id: 'dev-1', name: 'Tablet 1' };

function setup() {
  const db = openDb(':memory:');
  upsertEvent(db, { key: '2027test', name: 'Test' });
  setCurrentEvent(db, '2027test');
  saveDraft(db, matchForm(), NOW);
  publishDraft(db, 'match', NOW);
  saveDraft(db, pitForm(), NOW);
  publishDraft(db, 'pit', NOW);
  replaceSchedule(db, '2027test', [{ matchKey: 'qm1', red: [5098, 2, 3], blue: [4, 5, 6] }]);
  return db;
}

describe('handleSync', () => {
  it('acks new records and returns the hub config', () => {
    const db = setup();
    const r = record(matchForm());
    const res = handleSync(db, { device, records: [r] }, 'build-1', NOW);
    expect(res.acked).toEqual([{ id: r.id, revision: 1 }]);
    expect(res.rejected).toEqual([]);
    expect(res.config).toMatchObject({ event: { key: '2027test', name: 'Test' }, appBuild: 'build-1', teams: [2, 3, 4, 5, 6, 5098] });
    expect(res.config.schedule).toHaveLength(1);
    expect(res.config.forms.map(f => `${f.kind}${f.version}`)).toEqual(['match1', 'pit1']);
    expect(currentRecords(db, '2027test', 'match')).toEqual([r]);
    expect(listDevices(db)).toEqual([{ id: 'dev-1', name: 'Tablet 1', lastSyncAt: NOW }]);
  });

  it('acks duplicates without storing them twice', () => {
    const db = setup();
    const r = record(matchForm());
    handleSync(db, { device, records: [r] }, 'b', NOW);
    const again = handleSync(db, { device, records: [r] }, 'b', LATER);
    expect(again.acked).toEqual([{ id: r.id, revision: 1 }]);
    expect(recordHistory(db, r.id)).toHaveLength(1);
  });

  it('keeps every revision and serves the latest', () => {
    const db = setup();
    const r = record(matchForm());
    const r2 = reviseRecord(setAnswer(r, 'auto_coral', 5), LATER);
    handleSync(db, { device, records: [r] }, 'b', NOW);
    handleSync(db, { device, records: [r2] }, 'b', LATER);
    expect(currentRecords(db, '2027test', 'match')).toEqual([r2]);
    expect(recordHistory(db, r.id).map(x => x.revision)).toEqual([1, 2]);
  });

  it('rejects records with an unknown form version or a bad shape', () => {
    const db = setup();
    const bad = { ...record(matchForm()), formVersion: 9 };
    const res = handleSync(db, { device, records: [bad, { id: 'x' } as never] }, 'b', NOW);
    expect(res.acked).toEqual([]);
    expect(res.rejected).toEqual([
      { id: bad.id, revision: 1, reason: 'Unknown match form version 9' },
      { id: 'x', revision: 0, reason: expect.stringContaining('revision must be an integer') },
    ]);
  });

  it('asks only for photos it does not have', () => {
    const db = setup();
    const p = record(pitForm(), { photoIds: ['ph-1', 'ph-2'] });
    putPhoto(db, 'ph-1', p.id, 'image/jpeg', new Uint8Array([1, 2, 3]), NOW);
    expect(handleSync(db, { device, records: [p] }, 'b', NOW).wantedPhotoIds).toEqual(['ph-2']);
    expect(getPhoto(db, 'ph-1')).toEqual({ mime: 'image/jpeg', data: new Uint8Array([1, 2, 3]) });
  });
});

describe('parseSyncRequest', () => {
  it('accepts a well-formed request', () => {
    expect(parseSyncRequest({ device, records: [] })).toEqual({ device, records: [] });
  });
  it.each([
    [null, 'Sync request must be a JSON object'],
    [{ records: [] }, 'Sync request needs device.id and device.name'],
    [{ device }, 'Sync request needs a records list'],
  ])('rejects %j', (body, msg) => expect(parseSyncRequest(body)).toBe(msg));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run hub/server/test/sync.test.ts`
Expected: FAIL — cannot resolve `../src/store/devices`.

- [ ] **Step 3: Implement the stores**

`hub/server/src/store/records.ts`:

```ts
import type { FormKind, ScoutRecord } from '@stingr/shared';
import type { Db } from '../db';

export type InsertOutcome = 'inserted' | 'duplicate';
type JsonRow = { json: string };

export function insertRecord(db: Db, rec: ScoutRecord, via: 'usb' | 'qr', now: string): InsertOutcome {
  const res = db.prepare(
    'INSERT OR IGNORE INTO records (id, revision, kind, event_key, team, match_key, slot, json, received_at, via) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(rec.id, rec.revision, rec.kind, rec.eventKey, rec.team, rec.matchKey ?? null, rec.slot ?? null, JSON.stringify(rec), now, via);
  return Number(res.changes) > 0 ? 'inserted' : 'duplicate';
}

export function currentRecords(db: Db, eventKey: string, kind: FormKind): ScoutRecord[] {
  const rows = db.prepare(`
    SELECT r.json FROM records r
    JOIN (SELECT id, MAX(revision) AS rev FROM records WHERE event_key = ? AND kind = ? GROUP BY id) m
      ON r.id = m.id AND r.revision = m.rev
    ORDER BY r.received_at, r.id
  `).all(eventKey, kind) as unknown as JsonRow[];
  return rows.map(r => JSON.parse(r.json) as ScoutRecord);
}

export function recordHistory(db: Db, id: string): ScoutRecord[] {
  const rows = db.prepare('SELECT json FROM records WHERE id = ? ORDER BY revision').all(id) as unknown as JsonRow[];
  return rows.map(r => JSON.parse(r.json) as ScoutRecord);
}
```

`hub/server/src/store/photos.ts`:

```ts
import type { Db } from '../db';

export function putPhoto(db: Db, id: string, recordId: string, mime: string, data: Uint8Array, now: string): void {
  db.prepare('INSERT OR IGNORE INTO photos (id, record_id, mime, data, received_at) VALUES (?, ?, ?, ?, ?)').run(id, recordId, mime, data, now);
}

export function getPhoto(db: Db, id: string): { mime: string; data: Uint8Array } | undefined {
  const row = db.prepare('SELECT mime, data FROM photos WHERE id = ?').get(id) as unknown as { mime: string; data: Uint8Array } | undefined;
  return row ? { mime: row.mime, data: row.data } : undefined;
}

export function missingPhotoIds(db: Db, ids: string[]): string[] {
  const has = db.prepare('SELECT 1 FROM photos WHERE id = ?');
  return ids.filter(id => has.get(id) === undefined);
}
```

`hub/server/src/store/devices.ts`:

```ts
import type { DeviceInfo } from '@stingr/shared';
import type { Db } from '../db';

export type DeviceRow = { id: string; name: string; lastSyncAt: string | null };

export function touchDevice(db: Db, d: DeviceInfo, now: string): void {
  db.prepare('INSERT INTO devices (id, name, last_sync_at) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, last_sync_at = excluded.last_sync_at')
    .run(d.id, d.name, now);
}

export function listDevices(db: Db): DeviceRow[] {
  const rows = db.prepare('SELECT id, name, last_sync_at FROM devices ORDER BY name, id').all() as unknown as { id: string; name: string; last_sync_at: string | null }[];
  return rows.map(r => ({ id: r.id, name: r.name, lastSyncAt: r.last_sync_at }));
}
```

- [ ] **Step 4: Implement `hub/server/src/sync.ts`**

```ts
import {
  checkRecord, type DeviceInfo, type HubConfig, type RecordRef, type ScoutRecord,
  type SyncRequest, type SyncResponse,
} from '@stingr/shared';
import { type Db, tx } from './db';
import { touchDevice } from './store/devices';
import { currentEvent } from './store/events';
import { getForm, listForms } from './store/forms';
import { missingPhotoIds } from './store/photos';
import { type InsertOutcome, insertRecord } from './store/records';
import { listSchedule, listTeams } from './store/schedule';

export function buildConfig(db: Db, appBuild: string): HubConfig {
  const event = currentEvent(db);
  return {
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
  return { device: { id: b.device.id, name: b.device.name }, records: b.records as ScoutRecord[] };
}

export type IngestResult = { ok: true; outcome: InsertOutcome; record: ScoutRecord } | { ok: false; reason: string };

export function ingestRecord(db: Db, value: unknown, via: 'usb' | 'qr', now: string): IngestResult {
  const errors = checkRecord(value);
  if (errors.length) return { ok: false, reason: errors.join('; ') };
  const rec = value as ScoutRecord;
  if (!getForm(db, rec.kind, rec.formVersion)) return { ok: false, reason: `Unknown ${rec.kind} form version ${rec.formVersion}` };
  return { ok: true, outcome: insertRecord(db, rec, via, now), record: rec };
}

export function handleSync(db: Db, req: SyncRequest, appBuild: string, now: string): SyncResponse {
  const acked: RecordRef[] = [];
  const rejected: SyncResponse['rejected'] = [];
  const photoIds = new Set<string>();
  tx(db, () => {
    for (const value of req.records) {
      const res = ingestRecord(db, value, 'usb', now);
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
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run hub/server && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add hub/server
git commit -m "feat(hub): record, photo and device storage with sync service"
```

---

### Task 10: USB watcher (adb)

**Files:**
- Create: `hub/server/src/adb.ts`
- Test: `hub/server/test/adb.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type AdbExec = (args: string[]) => Promise<string>` (resolves stdout, rejects on failure)
  - `type AdbDevice = { serial: string; state: string; reversed: boolean; error?: string }`
  - `type AdbStatus = { available: boolean; devices: AdbDevice[]; error?: string }`
  - `parseAdbDevices(output: string): { serial: string; state: string }[]`
  - `class AdbWatcher { constructor(exec: AdbExec, port: number); status: AdbStatus; poll(): Promise<AdbStatus>; start(intervalMs?: number): void; stop(): void }`
  - `nodeAdbExec(adbPath?: string): AdbExec`

- [ ] **Step 1: Write the failing tests**

`hub/server/test/adb.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type AdbExec, AdbWatcher, parseAdbDevices } from '../src/adb';

function fakeAdb(responses: Record<string, string | Error>) {
  const calls: string[] = [];
  const exec: AdbExec = async args => {
    const cmd = args.join(' ');
    calls.push(cmd);
    const r = responses[cmd];
    if (r instanceof Error) throw r;
    if (r === undefined) throw new Error(`unexpected adb ${cmd}`);
    return r;
  };
  return { exec, calls };
}

const LISTING = [
  'List of devices attached',
  'G5NPCV000761Z8M        device usb:1-1 product:WW_P00C model:P00C device:P00C_2 transport_id:1',
  'ABC123                 unauthorized usb:1-2 transport_id:2',
  '',
].join('\n');

describe('parseAdbDevices', () => {
  it('reads serials and states', () => {
    expect(parseAdbDevices(LISTING)).toEqual([
      { serial: 'G5NPCV000761Z8M', state: 'device' },
      { serial: 'ABC123', state: 'unauthorized' },
    ]);
  });
  it('handles no devices', () => {
    expect(parseAdbDevices('List of devices attached\n\n')).toEqual([]);
  });
});

describe('AdbWatcher', () => {
  it('reverses the hub port for authorized tablets only', async () => {
    const { exec, calls } = fakeAdb({ devices: LISTING, '-s G5NPCV000761Z8M reverse tcp:5098 tcp:5098': '' });
    const status = await new AdbWatcher(exec, 5098).poll();
    expect(calls).toEqual(['devices', '-s G5NPCV000761Z8M reverse tcp:5098 tcp:5098']);
    expect(status).toEqual({
      available: true,
      devices: [
        { serial: 'G5NPCV000761Z8M', state: 'device', reversed: true },
        { serial: 'ABC123', state: 'unauthorized', reversed: false },
      ],
    });
  });

  it('explains how to install adb when it is missing', async () => {
    const missing = Object.assign(new Error('spawn adb ENOENT'), { code: 'ENOENT' });
    const status = await new AdbWatcher(fakeAdb({ devices: missing }).exec, 5098).poll();
    expect(status).toEqual({ available: false, devices: [], error: 'adb is not installed. Install it with: sudo apt install adb' });
  });

  it('reports a failed reverse on the device', async () => {
    const { exec } = fakeAdb({ devices: LISTING, '-s G5NPCV000761Z8M reverse tcp:5098 tcp:5098': new Error('device offline') });
    const status = await new AdbWatcher(exec, 5098).poll();
    expect(status.devices[0]).toEqual({ serial: 'G5NPCV000761Z8M', state: 'device', reversed: false, error: 'device offline' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run hub/server/test/adb.test.ts`
Expected: FAIL — cannot resolve `../src/adb`.

- [ ] **Step 3: Implement `hub/server/src/adb.ts`**

```ts
import { execFile } from 'node:child_process';

export type AdbExec = (args: string[]) => Promise<string>;
export type AdbDevice = { serial: string; state: string; reversed: boolean; error?: string };
export type AdbStatus = { available: boolean; devices: AdbDevice[]; error?: string };

export function parseAdbDevices(output: string): { serial: string; state: string }[] {
  return output
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('List of devices') && !l.startsWith('*'))
    .map(l => {
      const [serial, state] = l.split(/\s+/);
      return { serial, state: state ?? 'unknown' };
    });
}

function adbErrorMessage(e: unknown): string {
  const err = e as NodeJS.ErrnoException | undefined;
  if (err?.code === 'ENOENT') return 'adb is not installed. Install it with: sudo apt install adb';
  return err?.message ?? String(e);
}

export class AdbWatcher {
  status: AdbStatus = { available: false, devices: [], error: 'Not checked yet' };
  private readonly exec: AdbExec;
  private readonly port: number;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(exec: AdbExec, port: number) {
    this.exec = exec;
    this.port = port;
  }

  /** List devices and (re-)apply `adb reverse` to every authorized one. Re-applying is cheap and survives replugs. */
  async poll(): Promise<AdbStatus> {
    if (this.polling) return this.status;
    this.polling = true;
    try {
      let out: string;
      try {
        out = await this.exec(['devices']);
      } catch (e) {
        this.status = { available: false, devices: [], error: adbErrorMessage(e) };
        return this.status;
      }
      const devices: AdbDevice[] = [];
      for (const d of parseAdbDevices(out)) {
        if (d.state !== 'device') {
          devices.push({ ...d, reversed: false });
          continue;
        }
        try {
          await this.exec(['-s', d.serial, 'reverse', `tcp:${this.port}`, `tcp:${this.port}`]);
          devices.push({ ...d, reversed: true });
        } catch (e) {
          devices.push({ ...d, reversed: false, error: adbErrorMessage(e) });
        }
      }
      this.status = { available: true, devices };
      return this.status;
    } finally {
      this.polling = false;
    }
  }

  start(intervalMs = 2000): void {
    if (this.timer) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function nodeAdbExec(adbPath = 'adb'): AdbExec {
  return args => new Promise((resolve, reject) => {
    execFile(adbPath, args, { timeout: 5000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run hub/server && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Verify against the real tablet (if plugged in)**

Run: `npx tsx -e "import('./hub/server/src/adb.ts').then(async m => console.log(JSON.stringify(await new m.AdbWatcher(m.nodeAdbExec(), 5098).poll())))"`
Expected: `{"available":true,"devices":[{"serial":"G5NPCV000761Z8M","state":"device","reversed":true}]}` (or an empty device list if nothing is plugged in).

- [ ] **Step 6: Commit**

```bash
git add hub/server
git commit -m "feat(hub): adb USB watcher that maps the hub port onto tablets"
```

---

### Task 11: Fastify app and core API (ping, sync, photos, records, forms, events, teams, settings)

**Files:**
- Create: `hub/server/src/http.ts`, `hub/server/src/app.ts`, `hub/server/src/routes/sync.ts`, `hub/server/src/routes/records.ts`, `hub/server/src/routes/forms.ts`, `hub/server/src/routes/event.ts`
- Create: `hub/server/test/helpers.ts`
- Modify: `hub/server/package.json` (dependencies, via npm)
- Test: `hub/server/test/api-core.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 7–10.
- Produces:
  - `class HttpError extends Error { readonly status: number; constructor(status: number, message: string) }`
  - `requireEvent(db: Db): EventInfo` (throws 409), `parseKind(value: unknown): FormKind` (throws 404), `bodyObject(body: unknown): Record<string, unknown>` (throws 400)
  - `interface HubContext { db: Db; dbPath: string | null; appBuild: string; now: () => string; fetch: typeof fetch; adb: AdbWatcher | null; qr: QrAssembler }` — routes always read `ctx.db` at request time (restore swaps it)
  - `interface AppOptions { db: Db; dbPath?: string | null; appBuild?: string; now?: () => string; fetch?: typeof fetch; adb?: AdbWatcher | null; staticRoots?: { app?: string; hubUi?: string } }`
  - `buildApp(opts: AppOptions): Promise<FastifyInstance>`
  - Errors are always JSON `{ "error": "<message>" }`.
  - HTTP API added here:

| Method & path | Body | Response |
|---|---|---|
| `GET /api/ping` | — | `{ hub: 'stingr-scout', appBuild }` |
| `POST /api/sync` | `SyncRequest` | `SyncResponse` |
| `PUT /api/photos/:id?recordId=` | image bytes (`image/jpeg`/`png`/`webp`) | 204 |
| `GET /api/photos/:id` | — | image bytes |
| `GET /api/records?kind=match\|pit` | — | `ScoutRecord[]` (current revisions, current event) |
| `GET /api/records/:id/history` | — | `ScoutRecord[]` |
| `GET /api/forms` | — | `FormDef[]` (all published) |
| `GET /api/forms/:kind/draft` | — | `{ draft: FormDef \| null, isDraft: boolean }` |
| `PUT /api/forms/:kind/draft` | `FormDef` | `{ errors, warnings }` (saved even with errors) |
| `DELETE /api/forms/:kind/draft` | — | `{ draft, isDraft: false }` |
| `POST /api/forms/:kind/publish` | — | `PublishResult` (422 if not ok) |
| `GET /api/events` / `POST /api/events` / `PUT /api/events/current` | `{ key, name }` / `{ key }` | `{ events: EventInfo[], current: EventInfo \| null }` |
| `GET /api/schedule` | — | `ScheduleMatch[]` |
| `GET /api/teams` / `POST /api/teams` / `DELETE /api/teams/:team` | `{ team }` | `number[]` |
| `GET /api/settings` / `PUT /api/settings` | `{ tbaKey }` | `{ tbaKeySet: boolean }` |
| `GET /` and `GET /hub/` | — | static apps, or a plain-text "not built yet" note |

- Test helpers (`hub/server/test/helpers.ts`): `NOW`, `makeApp(opts?: Partial<AppOptions>)`, `publish(app, form): Promise<FormDef>`, `setupEvent(app, forms?)` (creates event `2027test` and publishes `matchForm()` + `pitForm()` by default).

- [ ] **Step 1: Add dependencies**

Run: `npm install -w @stingr/hub-server fastify@5.12.7 @fastify/static@10.1.6`
Expected: `hub/server/package.json` lists both under `dependencies`.

- [ ] **Step 2: Write test helpers and the failing tests**

`hub/server/test/helpers.ts`:

```ts
import type { FormDef } from '@stingr/shared';
import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import { matchForm, pitForm } from '../../../shared/test/fixtures';
import { type AppOptions, buildApp } from '../src/app';
import { openDb } from '../src/db';

export const NOW = '2027-03-01T12:00:00.000Z';

export function makeApp(opts: Partial<AppOptions> = {}): Promise<FastifyInstance> {
  return buildApp({ db: openDb(':memory:'), appBuild: 'test-build', now: () => NOW, ...opts });
}

export async function publish(app: FastifyInstance, form: FormDef): Promise<FormDef> {
  const put = await app.inject({ method: 'PUT', url: `/api/forms/${form.kind}/draft`, payload: form });
  expect(put.statusCode).toBe(200);
  const pub = await app.inject({ method: 'POST', url: `/api/forms/${form.kind}/publish` });
  expect(pub.statusCode).toBe(200);
  return pub.json().form as FormDef;
}

export async function setupEvent(app: FastifyInstance, forms: FormDef[] = [matchForm(), pitForm()]): Promise<void> {
  const ev = await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027test', name: 'Test Event' } });
  expect(ev.statusCode).toBe(200);
  for (const f of forms) await publish(app, f);
}
```

`hub/server/test/api-core.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../../shared/test/fixtures';
import { makeApp, setupEvent } from './helpers';

const device = { id: 'dev-1', name: 'Tablet 1' };

describe('basics', () => {
  it('answers ping', async () => {
    const app = await makeApp();
    expect((await app.inject({ url: '/api/ping' })).json()).toEqual({ hub: 'stingr-scout', appBuild: 'test-build' });
  });
  it('explains when the web apps are not built', async () => {
    const app = await makeApp();
    expect((await app.inject({ url: '/' })).body).toContain('not been built');
    expect((await app.inject({ url: '/hub/' })).body).toContain('not been built');
    const hub = await app.inject({ url: '/hub' });
    expect(hub.statusCode).toBe(302);
    expect(hub.headers.location).toBe('/hub/');
  });
});

describe('events', () => {
  it('creates events and selects the first as current', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027OHCL', name: 'Buckeye' } });
    const res = await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027mokc', name: 'Heartland' } });
    expect(res.json()).toEqual({
      events: [{ key: '2027mokc', name: 'Heartland' }, { key: '2027ohcl', name: 'Buckeye' }],
      current: { key: '2027ohcl', name: 'Buckeye' },
    });
    const switched = await app.inject({ method: 'PUT', url: '/api/events/current', payload: { key: '2027mokc' } });
    expect(switched.json().current.key).toBe('2027mokc');
  });
  it('rejects bad keys and unknown events', async () => {
    const app = await makeApp();
    expect((await app.inject({ method: 'POST', url: '/api/events', payload: { key: 'Bad Key!' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/events/current', payload: { key: 'nope' } })).statusCode).toBe(404);
  });
  it('needs a current event for event data', async () => {
    const res = await (await makeApp()).inject({ url: '/api/schedule' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/No current event/);
  });
});

describe('teams and settings', () => {
  it('adds and removes teams', async () => {
    const app = await makeApp();
    await setupEvent(app);
    expect((await app.inject({ method: 'POST', url: '/api/teams', payload: { team: 'frc5098' } })).json()).toEqual([5098]);
    expect((await app.inject({ method: 'POST', url: '/api/teams', payload: { team: 0 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: '/api/teams/5098' })).json()).toEqual([]);
  });
  it('stores the TBA key without revealing it', async () => {
    const app = await makeApp();
    expect((await app.inject({ url: '/api/settings' })).json()).toEqual({ tbaKeySet: false });
    expect((await app.inject({ method: 'PUT', url: '/api/settings', payload: { tbaKey: ' abc ' } })).json()).toEqual({ tbaKeySet: true });
    expect((await app.inject({ url: '/api/settings' })).body).not.toContain('abc');
  });
});

describe('forms', () => {
  it('saves drafts, reports problems and publishes', async () => {
    const app = await makeApp();
    expect((await app.inject({ url: '/api/forms/match/draft' })).json()).toEqual({ draft: null, isDraft: false });
    const bad = await app.inject({ method: 'PUT', url: '/api/forms/match/draft', payload: { ...matchForm(), sections: [] } });
    expect(bad.json()).toEqual({ errors: ['Form has no questions'], warnings: [] });
    expect((await app.inject({ method: 'POST', url: '/api/forms/match/publish' })).statusCode).toBe(422);
    await app.inject({ method: 'PUT', url: '/api/forms/match/draft', payload: matchForm() });
    const pub = await app.inject({ method: 'POST', url: '/api/forms/match/publish' });
    expect(pub.json()).toEqual({ ok: true, form: matchForm(1), warnings: [] });
    expect((await app.inject({ url: '/api/forms' })).json()).toEqual([matchForm(1)]);
  });
  it('rejects malformed forms and unknown kinds', async () => {
    const app = await makeApp();
    expect((await app.inject({ method: 'PUT', url: '/api/forms/match/draft', payload: { sections: 'x' } })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/forms/robot/draft' })).statusCode).toBe(404);
    const noOptions = { sections: [{ id: 'a', title: 'A', questions: [{ type: 'choice', key: 'c', label: 'C', required: false }] }], assets: {} };
    const res = await app.inject({ method: 'PUT', url: '/api/forms/match/draft', payload: noOptions });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('The form is malformed');
  });
});

describe('sync over HTTP', () => {
  it('re-sending the same records is harmless', async () => {
    const app = await makeApp();
    await setupEvent(app);
    const recs = [record(matchForm()), record(matchForm(), { slot: 'blue2' })];
    const first = await app.inject({ method: 'POST', url: '/api/sync', payload: { device, records: recs } });
    expect(first.json().acked).toHaveLength(2);
    const again = await app.inject({ method: 'POST', url: '/api/sync', payload: { device, records: recs } });
    expect(again.json().acked).toEqual(recs.map(r => ({ id: r.id, revision: 1 })));
    expect((await app.inject({ url: '/api/records?kind=match' })).json()).toHaveLength(2);
    expect((await app.inject({ url: `/api/records/${recs[0].id}/history` })).json()).toHaveLength(1);
  });
  it('rejects a malformed request', async () => {
    const res = await (await makeApp()).inject({ method: 'POST', url: '/api/sync', payload: { device } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Sync request needs a records list' });
  });
});

describe('photos', () => {
  it('stores and serves photos', async () => {
    const app = await makeApp();
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
    const put = await app.inject({ method: 'PUT', url: '/api/photos/ph-1?recordId=rec-9', headers: { 'content-type': 'image/jpeg' }, payload: bytes });
    expect(put.statusCode).toBe(204);
    const get = await app.inject({ url: '/api/photos/ph-1' });
    expect(get.headers['content-type']).toBe('image/jpeg');
    expect(get.rawPayload).toEqual(bytes);
  });
  it('rejects other content and unknown photos', async () => {
    const app = await makeApp();
    const put = await app.inject({ method: 'PUT', url: '/api/photos/ph-1?recordId=r', headers: { 'content-type': 'text/plain' }, payload: 'hi' });
    expect(put.statusCode).toBe(415);
    expect((await app.inject({ url: '/api/photos/nope' })).statusCode).toBe(404);
  });
});

describe('pit forms', () => {
  it('publishes pit forms independently', async () => {
    const app = await makeApp();
    await setupEvent(app, [pitForm()]);
    expect((await app.inject({ url: '/api/forms' })).json().map((f: { kind: string }) => f.kind)).toEqual(['pit']);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run hub/server/test/api-core.test.ts`
Expected: FAIL — cannot resolve `../src/app`.

- [ ] **Step 4: Implement `hub/server/src/http.ts`**

```ts
import type { EventInfo, FormKind } from '@stingr/shared';
import type { Db } from './db';
import { currentEvent } from './store/events';

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function requireEvent(db: Db): EventInfo {
  const ev = currentEvent(db);
  if (!ev) throw new HttpError(409, 'No current event is selected. Choose one in Event setup first.');
  return ev;
}

export function parseKind(value: unknown): FormKind {
  if (value === 'match' || value === 'pit') return value;
  throw new HttpError(404, `Unknown form kind "${String(value)}"`);
}

export function bodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Expected a JSON object');
  return body as Record<string, unknown>;
}
```

- [ ] **Step 5: Implement the route modules**

`hub/server/src/routes/sync.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { HttpError } from '../http';
import { getPhoto, putPhoto } from '../store/photos';
import { handleSync, parseSyncRequest } from '../sync';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function syncRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.get('/api/ping', async () => ({ hub: 'stingr-scout', appBuild: ctx.appBuild }));

  app.post('/api/sync', async req => {
    const parsed = parseSyncRequest(req.body);
    if (typeof parsed === 'string') throw new HttpError(400, parsed);
    return handleSync(ctx.db, parsed, ctx.appBuild, ctx.now());
  });

  app.put('/api/photos/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { recordId } = req.query as { recordId?: string };
    const mime = (req.headers['content-type'] ?? '').split(';')[0].trim();
    if (!PHOTO_TYPES.includes(mime)) throw new HttpError(415, 'Photos must be JPEG, PNG or WebP');
    if (!recordId) throw new HttpError(400, 'recordId is required');
    putPhoto(ctx.db, id, recordId, mime, req.body as Buffer, ctx.now());
    return reply.status(204).send();
  });

  app.get('/api/photos/:id', async (req, reply) => {
    const photo = getPhoto(ctx.db, (req.params as { id: string }).id);
    if (!photo) throw new HttpError(404, 'No such photo');
    return reply.type(photo.mime).header('cache-control', 'max-age=31536000, immutable').send(Buffer.from(photo.data));
  });
}
```

`hub/server/src/routes/records.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { parseKind, requireEvent } from '../http';
import { currentRecords, recordHistory } from '../store/records';

export function recordRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.get('/api/records', async req => {
    const kind = parseKind((req.query as { kind?: string }).kind ?? 'match');
    return currentRecords(ctx.db, requireEvent(ctx.db).key, kind);
  });
  app.get('/api/records/:id/history', async req => recordHistory(ctx.db, (req.params as { id: string }).id));
}
```

`hub/server/src/routes/forms.ts`:

```ts
import { type FormDef, validateFormDef } from '@stingr/shared';
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { bodyObject, HttpError, parseKind } from '../http';
import { discardDraft, getDraft, hasDraft, listForms, publishDraft, saveDraft } from '../store/forms';

export function formRoutes(app: FastifyInstance, ctx: HubContext): void {
  const kindParam = (params: unknown) => parseKind((params as { kind: string }).kind);

  app.get('/api/forms', async () => listForms(ctx.db));

  app.get('/api/forms/:kind/draft', async req => {
    const kind = kindParam(req.params);
    return { draft: getDraft(ctx.db, kind), isDraft: hasDraft(ctx.db, kind) };
  });

  app.put('/api/forms/:kind/draft', async req => {
    const kind = kindParam(req.params);
    const b = bodyObject(req.body);
    if (!Array.isArray(b.sections) || typeof b.assets !== 'object' || b.assets === null) {
      throw new HttpError(400, 'A form needs sections and assets');
    }
    const form = { ...(b as unknown as FormDef), kind, version: 0 };
    let check: ReturnType<typeof validateFormDef>;
    try {
      check = validateFormDef(form, listForms(ctx.db, kind));
    } catch {
      throw new HttpError(400, 'The form is malformed');
    }
    saveDraft(ctx.db, form, ctx.now());
    return check;
  });

  app.delete('/api/forms/:kind/draft', async req => {
    const kind = kindParam(req.params);
    discardDraft(ctx.db, kind);
    return { draft: getDraft(ctx.db, kind), isDraft: false };
  });

  app.post('/api/forms/:kind/publish', async (req, reply) => {
    const res = publishDraft(ctx.db, kindParam(req.params), ctx.now());
    return res.ok ? res : reply.status(422).send(res);
  });
}
```

`hub/server/src/routes/event.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { bodyObject, HttpError, requireEvent } from '../http';
import { currentEvent, listEvents, setCurrentEvent, upsertEvent } from '../store/events';
import { addTeam, listSchedule, listTeams, removeTeam } from '../store/schedule';
import { getSetting, setSetting } from '../store/settings';

const EVENT_KEY_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;

export function parseTeam(value: unknown): number {
  const n = typeof value === 'string' ? Number(value.trim().replace(/^frc/i, '')) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 99999) throw new HttpError(400, 'Team must be a number from 1 to 99999');
  return n;
}

export function eventRoutes(app: FastifyInstance, ctx: HubContext): void {
  const eventsView = () => ({ events: listEvents(ctx.db), current: currentEvent(ctx.db) });

  app.get('/api/events', async () => eventsView());

  app.post('/api/events', async req => {
    const b = bodyObject(req.body);
    const key = typeof b.key === 'string' ? b.key.trim().toLowerCase() : '';
    if (!EVENT_KEY_RE.test(key)) {
      throw new HttpError(400, 'Event key must be 2-32 characters: lowercase letters, digits, - or _ (for example 2027ohcl)');
    }
    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : key;
    upsertEvent(ctx.db, { key, name });
    if (!currentEvent(ctx.db)) setCurrentEvent(ctx.db, key);
    return eventsView();
  });

  app.put('/api/events/current', async req => {
    const key = String(bodyObject(req.body).key ?? '');
    if (!listEvents(ctx.db).some(e => e.key === key)) throw new HttpError(404, `Unknown event "${key}"`);
    setCurrentEvent(ctx.db, key);
    return eventsView();
  });

  app.get('/api/schedule', async () => listSchedule(ctx.db, requireEvent(ctx.db).key));

  app.get('/api/teams', async () => listTeams(ctx.db, requireEvent(ctx.db).key));

  app.post('/api/teams', async req => {
    const ev = requireEvent(ctx.db);
    addTeam(ctx.db, ev.key, parseTeam(bodyObject(req.body).team));
    return listTeams(ctx.db, ev.key);
  });

  app.delete('/api/teams/:team', async req => {
    const ev = requireEvent(ctx.db);
    removeTeam(ctx.db, ev.key, parseTeam((req.params as { team: string }).team));
    return listTeams(ctx.db, ev.key);
  });

  app.get('/api/settings', async () => ({ tbaKeySet: getSetting(ctx.db, 'tba_key') !== null }));

  app.put('/api/settings', async req => {
    const b = bodyObject(req.body);
    if (typeof b.tbaKey === 'string') setSetting(ctx.db, 'tba_key', b.tbaKey.trim() || null);
    return { tbaKeySet: getSetting(ctx.db, 'tba_key') !== null };
  });
}
```

- [ ] **Step 6: Implement `hub/server/src/app.ts`**

```ts
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { QrAssembler } from '@stingr/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AdbWatcher } from './adb';
import type { Db } from './db';
import { HttpError } from './http';
import { eventRoutes } from './routes/event';
import { formRoutes } from './routes/forms';
import { recordRoutes } from './routes/records';
import { syncRoutes } from './routes/sync';

export interface HubContext {
  db: Db;
  dbPath: string | null;
  appBuild: string;
  now: () => string;
  fetch: typeof fetch;
  adb: AdbWatcher | null;
  qr: QrAssembler;
}

export interface AppOptions {
  db: Db;
  dbPath?: string | null;
  appBuild?: string;
  now?: () => string;
  fetch?: typeof fetch;
  adb?: AdbWatcher | null;
  staticRoots?: { app?: string; hubUi?: string };
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const ctx: HubContext = {
    db: opts.db,
    dbPath: opts.dbPath ?? null,
    appBuild: opts.appBuild ?? 'dev',
    now: opts.now ?? (() => new Date().toISOString()),
    fetch: opts.fetch ?? fetch,
    adb: opts.adb ?? null,
    qr: new QrAssembler(),
  };

  const app = Fastify({ bodyLimit: 20 * 1024 * 1024 });
  app.addContentTypeParser(['image/jpeg', 'image/png', 'image/webp'], { parseAs: 'buffer', bodyLimit: 25 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 1024 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: err.message });
    app.log.error(err);
    return reply.status(500).send({ error: `Internal error: ${err.message}` });
  });

  syncRoutes(app, ctx);
  recordRoutes(app, ctx);
  formRoutes(app, ctx);
  eventRoutes(app, ctx);

  await registerStatic(app, opts.staticRoots ?? {});
  return app;
}

async function registerStatic(app: FastifyInstance, roots: { app?: string; hubUi?: string }): Promise<void> {
  if (roots.app && existsSync(roots.app)) {
    await app.register(fastifyStatic, { root: roots.app, prefix: '/' });
  } else {
    app.get('/', async (_req, reply) => reply.type('text/plain').send('The tablet app has not been built yet (npm run build).'));
  }
  if (roots.hubUi && existsSync(roots.hubUi)) {
    await app.register(fastifyStatic, { root: roots.hubUi, prefix: '/hub/', decorateReply: false });
  } else {
    app.get('/hub/', async (_req, reply) => reply.type('text/plain').send('The hub UI has not been built yet (npm run build).'));
  }
  app.get('/hub', async (_req, reply) => reply.redirect('/hub/'));
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run hub/server && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add package-lock.json hub/server
git commit -m "feat(hub): Fastify app with sync, photo, record, form, event and team APIs"
```

---

### Task 12: Schedule import — CSV, manual JSON and The Blue Alliance

**Files:**
- Create: `hub/server/src/scheduleIo.ts`, `hub/server/src/tba.ts`, `hub/server/src/routes/scheduleImport.ts`
- Modify: `hub/server/src/app.ts` (register routes)
- Test: `hub/server/test/schedule-import.test.ts`

**Interfaces:**
- Consumes: `normalizeMatchKey`, `compareMatchKeys`, `ScheduleMatch` (shared); `replaceSchedule`, `listSchedule`, `addTeam`, `upsertEvent`, `getSetting` (stores); `HubContext`, `HttpError`, `requireEvent` (Task 11).
- Produces:
  - `parseScheduleCsv(text: string): { matches: ScheduleMatch[]; errors: string[] }`
  - `checkScheduleMatch(value: unknown): ScheduleMatch | string`
  - `TBA_BASE = 'https://www.thebluealliance.com/api/v3'`; `interface TbaEventData { name: string | null; matches: ScheduleMatch[]; teams: number[] }`; `fetchTbaEvent(eventKey: string, apiKey: string, fetchImpl?: typeof fetch): Promise<TbaEventData>` (throws `Error` with a human message)
  - HTTP:

| Method & path | Body | Response |
|---|---|---|
| `PUT /api/schedule` | `ScheduleMatch[]` | `ScheduleMatch[]` (400 on bad input) |
| `POST /api/schedule/csv` | `text/csv` | `{ matches: number }` (422 `{ errors }`) |
| `POST /api/schedule/tba` | — | `{ matches: number; teams: number; scheduleReplaced: boolean }` (400 no key, 502 TBA failure) |

- [ ] **Step 1: Write the failing tests**

`hub/server/test/schedule-import.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkScheduleMatch, parseScheduleCsv } from '../src/scheduleIo';
import { fetchTbaEvent, TBA_BASE } from '../src/tba';
import { makeApp, setupEvent } from './helpers';

describe('parseScheduleCsv', () => {
  it('reads a header in any order with BOM, CRLF, blank lines and frc prefixes', () => {
    const csv = '﻿Red1,red2,red3,Blue1,blue2,blue3,Match\r\n1,2,3,4,5,6,1\r\n\r\nfrc7, 8 ,9,10,11,12,qm10\r\n';
    expect(parseScheduleCsv(csv)).toEqual({
      matches: [
        { matchKey: 'qm1', red: [1, 2, 3], blue: [4, 5, 6] },
        { matchKey: 'qm10', red: [7, 8, 9], blue: [10, 11, 12] },
      ],
      errors: [],
    });
  });
  it('reads rows without a header in standard order', () => {
    expect(parseScheduleCsv('3,1,2,3,4,5,6').matches).toEqual([{ matchKey: 'qm3', red: [1, 2, 3], blue: [4, 5, 6] }]);
  });
  it('reports problems with line numbers', () => {
    const csv = 'match,red1,red2,red3,blue1,blue2,blue3\nx,1,2,3,4,5,6\n2,1,2,abc,4,5,6\n4,1,2,3,4,5,6\n4,1,2,3,4,5,6';
    expect(parseScheduleCsv(csv).errors).toEqual([
      'Line 2: "x" is not a match number or key',
      'Line 3: "abc" is not a team number',
      'Line 5: match qm4 appears twice',
    ]);
  });
  it('reports missing columns and empty files', () => {
    expect(parseScheduleCsv('match,red1,red2\n1,2,3').errors).toEqual(['Missing column(s): red3, blue1, blue2, blue3']);
    expect(parseScheduleCsv('\n\n').errors).toEqual(['The file is empty']);
  });
});

describe('checkScheduleMatch', () => {
  it('normalizes valid matches and rejects bad ones', () => {
    expect(checkScheduleMatch({ matchKey: '5', red: [1, 2, 3], blue: [4, 5, 0] })).toEqual({ matchKey: 'qm5', red: [1, 2, 3], blue: [4, 5, 0] });
    expect(checkScheduleMatch({ matchKey: 'nope', red: [1, 2, 3], blue: [4, 5, 6] })).toBe('"nope" is not a match key');
    expect(checkScheduleMatch({ matchKey: 'qm1', red: [1, 2], blue: [4, 5, 6] })).toBe('Match qm1 needs three red and three blue team numbers');
  });
});

const alliance = (r: number[], b: number[]) => ({
  red: { team_keys: r.map(t => `frc${t}`) },
  blue: { team_keys: b.map(t => `frc${t}`) },
});

const TBA_DATA: Record<string, unknown> = {
  '/event/2027test/simple': { key: '2027test', name: 'Test Regional' },
  '/event/2027test/matches/simple': [
    { key: '2027test_sf1m1', alliances: alliance([1, 2, 3], [4, 5, 6]) },
    { key: '2027test_qm10', alliances: alliance([7, 8, 9], [10, 11, 12]) },
    { key: '2027test_qm2', alliances: alliance([1, 2, 3], [4, 5, 6]) },
  ],
  '/event/2027test/teams/keys': ['frc12', 'frc1', 'frc5098'],
};

function fakeFetch(data: Record<string, unknown>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace(TBA_BASE, '');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (headers['X-TBA-Auth-Key'] !== 'key123') return new Response('{}', { status: 401 });
    if (!(path in data)) return new Response('null', { status: 404 });
    return new Response(JSON.stringify(data[path]), { status: 200 });
  }) as typeof fetch;
}

describe('fetchTbaEvent', () => {
  it('maps matches and teams in order', async () => {
    expect(await fetchTbaEvent('2027test', 'key123', fakeFetch(TBA_DATA))).toEqual({
      name: 'Test Regional',
      matches: [
        { matchKey: 'qm2', red: [1, 2, 3], blue: [4, 5, 6] },
        { matchKey: 'qm10', red: [7, 8, 9], blue: [10, 11, 12] },
        { matchKey: 'sf1m1', red: [1, 2, 3], blue: [4, 5, 6] },
      ],
      teams: [1, 12, 5098],
    });
  });
  it('explains failures', async () => {
    await expect(fetchTbaEvent('2027test', 'wrong', fakeFetch(TBA_DATA))).rejects.toThrow('The Blue Alliance rejected the API key');
    await expect(fetchTbaEvent('2027none', 'key123', fakeFetch(TBA_DATA))).rejects.toThrow('The Blue Alliance has no event "2027none"');
    const offline = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    await expect(fetchTbaEvent('2027test', 'key123', offline)).rejects.toThrow("Couldn't reach The Blue Alliance");
  });
});

describe('schedule import routes', () => {
  it('imports CSV and reports CSV errors', async () => {
    const app = await makeApp();
    await setupEvent(app);
    const ok = await app.inject({ method: 'POST', url: '/api/schedule/csv', headers: { 'content-type': 'text/csv' }, payload: '1,1,2,3,4,5,6\n2,6,5,4,3,2,1' });
    expect(ok.json()).toEqual({ matches: 2 });
    const bad = await app.inject({ method: 'POST', url: '/api/schedule/csv', headers: { 'content-type': 'text/csv' }, payload: 'x,1,2,3,4,5,6' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().errors).toHaveLength(1);
    expect((await app.inject({ url: '/api/schedule' })).json()).toHaveLength(2);
  });

  it('accepts a manually edited schedule as JSON', async () => {
    const app = await makeApp();
    await setupEvent(app);
    const res = await app.inject({ method: 'PUT', url: '/api/schedule', payload: [{ matchKey: '1', red: [1, 2, 3], blue: [4, 5, 6] }] });
    expect(res.json()).toEqual([{ matchKey: 'qm1', red: [1, 2, 3], blue: [4, 5, 6] }]);
    const bad = await app.inject({ method: 'PUT', url: '/api/schedule', payload: [{ matchKey: 'qm1', red: [1], blue: [] }] });
    expect(bad.statusCode).toBe(400);
  });

  it('fetches from TBA once a key is set', async () => {
    const app = await makeApp({ fetch: fakeFetch(TBA_DATA) });
    await setupEvent(app);
    expect((await app.inject({ method: 'POST', url: '/api/schedule/tba' })).statusCode).toBe(400);
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { tbaKey: 'key123' } });
    const res = await app.inject({ method: 'POST', url: '/api/schedule/tba' });
    expect(res.json()).toEqual({ matches: 3, teams: 3, scheduleReplaced: true });
    expect((await app.inject({ url: '/api/events' })).json().current).toEqual({ key: '2027test', name: 'Test Regional' });
    expect((await app.inject({ url: '/api/teams' })).json()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 5098]);
  });

  it('keeps the existing schedule when TBA has no matches yet', async () => {
    const empty = { ...TBA_DATA, '/event/2027test/matches/simple': [] };
    const app = await makeApp({ fetch: fakeFetch(empty) });
    await setupEvent(app);
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { tbaKey: 'key123' } });
    await app.inject({ method: 'POST', url: '/api/schedule/csv', headers: { 'content-type': 'text/csv' }, payload: '1,1,2,3,4,5,6' });
    const res = await app.inject({ method: 'POST', url: '/api/schedule/tba' });
    expect(res.json()).toEqual({ matches: 0, teams: 3, scheduleReplaced: false });
    expect((await app.inject({ url: '/api/schedule' })).json()).toHaveLength(1);
  });

  it('reports TBA failures as 502', async () => {
    const app = await makeApp({ fetch: fakeFetch(TBA_DATA) });
    await setupEvent(app);
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { tbaKey: 'wrong' } });
    const res = await app.inject({ method: 'POST', url: '/api/schedule/tba' });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('The Blue Alliance rejected the API key');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run hub/server/test/schedule-import.test.ts`
Expected: FAIL — cannot resolve `../src/scheduleIo`.

- [ ] **Step 3: Implement `hub/server/src/scheduleIo.ts`**

```ts
import { normalizeMatchKey, type ScheduleMatch } from '@stingr/shared';

const COLUMNS = ['match', 'red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3'];
type Trio = [number, number, number];

export function parseScheduleCsv(text: string): { matches: ScheduleMatch[]; errors: string[] } {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l, i) => ({ n: i + 1, cells: l.split(',').map(c => c.trim()) }))
    .filter(l => l.cells.some(c => c !== ''));
  const matches: ScheduleMatch[] = [];
  const errors: string[] = [];
  if (lines.length === 0) return { matches, errors: ['The file is empty'] };

  let index = COLUMNS.map((_, i) => i);
  if (lines[0].cells.some(c => c.toLowerCase() === 'match')) {
    const header = lines.shift()!.cells.map(c => c.toLowerCase());
    index = COLUMNS.map(c => header.indexOf(c));
    const missing = COLUMNS.filter((_, i) => index[i] < 0);
    if (missing.length) return { matches, errors: [`Missing column(s): ${missing.join(', ')}`] };
  }

  const seen = new Set<string>();
  for (const line of lines) {
    const cell = (i: number) => line.cells[index[i]] ?? '';
    const key = normalizeMatchKey(cell(0));
    if (!key) {
      errors.push(`Line ${line.n}: "${cell(0)}" is not a match number or key`);
      continue;
    }
    const raw = [1, 2, 3, 4, 5, 6].map(i => cell(i).replace(/^frc/i, ''));
    const bad = raw.find(t => !/^\d{1,5}$/.test(t));
    if (bad !== undefined) {
      errors.push(`Line ${line.n}: "${bad}" is not a team number`);
      continue;
    }
    if (seen.has(key)) {
      errors.push(`Line ${line.n}: match ${key} appears twice`);
      continue;
    }
    seen.add(key);
    const t = raw.map(Number);
    matches.push({ matchKey: key, red: [t[0], t[1], t[2]], blue: [t[3], t[4], t[5]] });
  }
  return { matches, errors };
}

export function checkScheduleMatch(value: unknown): ScheduleMatch | string {
  if (typeof value !== 'object' || value === null) return 'Each match must be an object';
  const m = value as { matchKey?: unknown; red?: unknown; blue?: unknown };
  const key = typeof m.matchKey === 'string' ? normalizeMatchKey(m.matchKey) : null;
  if (!key) return `"${String(m.matchKey)}" is not a match key`;
  const side = (v: unknown): v is Trio =>
    Array.isArray(v) && v.length === 3 && v.every(t => Number.isInteger(t) && t >= 0 && t <= 99999);
  if (!side(m.red) || !side(m.blue)) return `Match ${key} needs three red and three blue team numbers`;
  return { matchKey: key, red: [...m.red] as Trio, blue: [...m.blue] as Trio };
}
```

- [ ] **Step 4: Implement `hub/server/src/tba.ts`**

```ts
import { compareMatchKeys, normalizeMatchKey, type ScheduleMatch } from '@stingr/shared';

export const TBA_BASE = 'https://www.thebluealliance.com/api/v3';

export interface TbaEventData { name: string | null; matches: ScheduleMatch[]; teams: number[] }

type TbaMatch = { key: string; alliances: { red: { team_keys: string[] }; blue: { team_keys: string[] } } };
const teamNumber = (key: string): number => Number(key.replace(/^frc/, '')) || 0;

export async function fetchTbaEvent(eventKey: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<TbaEventData> {
  const get = async (path: string): Promise<unknown> => {
    let res: Response;
    try {
      res = await fetchImpl(`${TBA_BASE}${path}`, {
        headers: { 'X-TBA-Auth-Key': apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error("Couldn't reach The Blue Alliance. Is this laptop online?");
    }
    if (res.status === 401) throw new Error('The Blue Alliance rejected the API key');
    if (res.status === 404) throw new Error(`The Blue Alliance has no event "${eventKey}"`);
    if (!res.ok) throw new Error(`The Blue Alliance returned HTTP ${res.status}`);
    return res.json();
  };

  const [event, matches, teams] = (await Promise.all([
    get(`/event/${eventKey}/simple`),
    get(`/event/${eventKey}/matches/simple`),
    get(`/event/${eventKey}/teams/keys`),
  ])) as [{ name?: string } | null, TbaMatch[] | null, string[] | null];

  const trio = (keys: string[]) => [0, 1, 2].map(i => teamNumber(keys[i] ?? '')) as [number, number, number];
  const schedule: ScheduleMatch[] = [];
  for (const m of matches ?? []) {
    const key = normalizeMatchKey(m.key.slice(m.key.indexOf('_') + 1));
    if (key) schedule.push({ matchKey: key, red: trio(m.alliances.red.team_keys), blue: trio(m.alliances.blue.team_keys) });
  }
  schedule.sort((a, b) => compareMatchKeys(a.matchKey, b.matchKey));
  return {
    name: event?.name ?? null,
    matches: schedule,
    teams: (teams ?? []).map(teamNumber).filter(n => n > 0).sort((a, b) => a - b),
  };
}
```

- [ ] **Step 5: Implement `hub/server/src/routes/scheduleImport.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { HttpError, requireEvent } from '../http';
import { checkScheduleMatch, parseScheduleCsv } from '../scheduleIo';
import { upsertEvent } from '../store/events';
import { addTeam, listSchedule, replaceSchedule } from '../store/schedule';
import { getSetting } from '../store/settings';
import { fetchTbaEvent } from '../tba';

export function scheduleImportRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.put('/api/schedule', async req => {
    const ev = requireEvent(ctx.db);
    if (!Array.isArray(req.body)) throw new HttpError(400, 'Expected a list of matches');
    const checked = req.body.map(checkScheduleMatch);
    const problem = checked.find((c): c is string => typeof c === 'string');
    if (problem) throw new HttpError(400, problem);
    const matches = checked as Exclude<(typeof checked)[number], string>[];
    if (new Set(matches.map(m => m.matchKey)).size !== matches.length) throw new HttpError(400, 'A match appears twice');
    replaceSchedule(ctx.db, ev.key, matches);
    return listSchedule(ctx.db, ev.key);
  });

  app.post('/api/schedule/csv', async (req, reply) => {
    const ev = requireEvent(ctx.db);
    if (typeof req.body !== 'string') throw new HttpError(415, 'Send the schedule as text/csv');
    const { matches, errors } = parseScheduleCsv(req.body);
    if (errors.length) return reply.status(422).send({ errors });
    replaceSchedule(ctx.db, ev.key, matches);
    return { matches: matches.length };
  });

  app.post('/api/schedule/tba', async () => {
    const ev = requireEvent(ctx.db);
    const apiKey = getSetting(ctx.db, 'tba_key');
    if (!apiKey) throw new HttpError(400, 'Enter a TBA API key in Settings first');
    let data: Awaited<ReturnType<typeof fetchTbaEvent>>;
    try {
      data = await fetchTbaEvent(ev.key, apiKey, ctx.fetch);
    } catch (e) {
      throw new HttpError(502, (e as Error).message);
    }
    if (data.name) upsertEvent(ctx.db, { key: ev.key, name: data.name });
    for (const t of data.teams) addTeam(ctx.db, ev.key, t);
    // Before the schedule is released TBA returns no matches; never wipe an imported schedule with nothing.
    const scheduleReplaced = data.matches.length > 0;
    if (scheduleReplaced) replaceSchedule(ctx.db, ev.key, data.matches);
    return { matches: data.matches.length, teams: data.teams.length, scheduleReplaced };
  });
}
```

In `hub/server/src/app.ts` add the import next to the other route imports:

```ts
import { scheduleImportRoutes } from './routes/scheduleImport';
```

and add this line after `eventRoutes(app, ctx);`:

```ts
  scheduleImportRoutes(app, ctx);
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run hub/server && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add hub/server
git commit -m "feat(hub): schedule import from CSV, JSON and The Blue Alliance"
```

---

### Task 13: Coverage grid, team summaries and QR intake

**Files:**
- Create: `hub/server/src/coverage.ts`, `hub/server/src/summaries.ts`, `hub/server/src/routes/data.ts`
- Modify: `hub/server/src/app.ts` (register routes)
- Test: `hub/server/test/analysis.test.ts`, `hub/server/test/api-data.test.ts`

**Interfaces:**
- Consumes: shared `SLOTS`, `compareMatchKeys`, `allQuestions`, `estimatedPoints`, `questionStat`, `decodeRecordData`, `encodeRecordQr` (tests); stores; `ingestRecord` (Task 9); `parseTeam` (Task 11, `routes/event.ts`); `HubContext.qr`.
- Produces:
  - `type CellStatus = 'empty' | 'noshow' | 'ok' | 'missed'`; `interface CoverageCell { team: number; status: CellStatus; recordIds: string[] }`; `interface CoverageRow { matchKey: string; scheduled: boolean; cells: Record<Slot, CoverageCell> }`
  - `buildCoverage(schedule: ScheduleMatch[], records: ScoutRecord[]): CoverageRow[]` — a cell's status is the "worst" of its records (missed > ok > noshow > empty); records for unscheduled matches get their own rows (`scheduled: false`)
  - `interface TeamSummary { team: number; matchRecords: number; noShows: number; noShowPct: number | null; estPoints: number | null; estPointsBySection: Record<string, number | null>; stats: Record<string, QuestionStat>; pit: 'none' | 'done' | 'noshow' }`
  - `buildTeamSummaries(teams: number[], matchForm: FormDef | null, matchRecords: ScoutRecord[], pitRecords: ScoutRecord[]): TeamSummary[]` — every team in `teams` or in any record, ascending
  - HTTP:

| Method & path | Body | Response |
|---|---|---|
| `POST /api/qr` | `{ text }` | `{ status: 'partial', group, have, total }` or `{ status: 'stored' \| 'duplicate', record: { id, revision, kind, team, matchKey, slot, scout } }`; 422 `{ status: 'invalid', reason }` |
| `GET /api/coverage` | — | `CoverageRow[]` |
| `GET /api/summaries` | — | `{ form: FormDef \| null, summaries: TeamSummary[] }` (latest match form) |
| `GET /api/summaries/:team` | — | `{ summary: TeamSummary, matchForm, pitForm, matchRecords: ScoutRecord[] (match order), pitRecords: ScoutRecord[] }` |

- [ ] **Step 1: Write the failing analysis tests**

`hub/server/test/analysis.test.ts`:

```ts
import { markMissed, markNoShow, setAnswer } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../../shared/test/fixtures';
import { buildCoverage } from '../src/coverage';
import { buildTeamSummaries } from '../src/summaries';

const NOW = '2027-03-01T12:00:00.000Z';

describe('buildCoverage', () => {
  it('marks each slot with the state of its records', () => {
    const f = matchForm();
    const schedule = [
      { matchKey: 'qm1', red: [1, 2, 3] as [number, number, number], blue: [4, 5, 6] as [number, number, number] },
      { matchKey: 'qm2', red: [7, 8, 9] as [number, number, number], blue: [10, 11, 12] as [number, number, number] },
    ];
    const a = record(f, { id: 'a', team: 1, slot: 'red1' });
    const b = record(f, { id: 'b', team: 1, slot: 'red1', scout: 'Bo' });
    const c = markMissed(record(f, { id: 'c', team: 2, slot: 'red2' }), 'climb');
    const d = markNoShow(record(f, { id: 'd', team: 4, slot: 'blue1' }), NOW);
    const e = record(f, { id: 'e', team: 99, matchKey: 'qm3', slot: 'blue3' });
    const pit = record(pitForm(), { id: 'p' });

    const rows = buildCoverage(schedule, [a, b, c, d, e, pit]);
    expect(rows.map(r => [r.matchKey, r.scheduled])).toEqual([['qm1', true], ['qm2', true], ['qm3', false]]);
    expect(rows[0].cells).toEqual({
      red1: { team: 1, status: 'ok', recordIds: ['a', 'b'] },
      red2: { team: 2, status: 'missed', recordIds: ['c'] },
      red3: { team: 3, status: 'empty', recordIds: [] },
      blue1: { team: 4, status: 'noshow', recordIds: ['d'] },
      blue2: { team: 5, status: 'empty', recordIds: [] },
      blue3: { team: 6, status: 'empty', recordIds: [] },
    });
    expect(rows[1].cells.blue3).toEqual({ team: 12, status: 'empty', recordIds: [] });
    expect(rows[2].cells.blue3).toEqual({ team: 99, status: 'ok', recordIds: ['e'] });
    expect(rows[2].cells.red1).toEqual({ team: 0, status: 'empty', recordIds: [] });
  });
});

describe('buildTeamSummaries', () => {
  it('summarizes every team with points, no-shows and pit status', () => {
    const f = matchForm();
    const t1a = setAnswer(setAnswer(record(f, { team: 1 }), 'auto_coral', 2), 'climb', 'deep');
    const t1b = markNoShow(record(f, { team: 1, matchKey: 'qm2' }), NOW);
    const t3 = setAnswer(record(f, { team: 3 }), 'climb', 'none');
    const pit2 = setAnswer(record(pitForm(), { team: 2 }), 'drivetrain', 'swerve');
    const pit1 = markNoShow(record(pitForm(), { team: 1 }), NOW);

    const s = buildTeamSummaries([1, 2], f, [t1a, t1b, t3], [pit2, pit1]);
    expect(s.map(x => x.team)).toEqual([1, 2, 3]);
    expect(s[0]).toMatchObject({
      team: 1, matchRecords: 2, noShows: 1, noShowPct: 0.5, estPoints: 20,
      estPointsBySection: { auto: 8, endgame: 12, notes: null }, pit: 'noshow',
    });
    expect(s[0].stats.auto_coral).toEqual({ kind: 'avg', n: 1, avg: 2, max: 2 });
    expect(s[1]).toMatchObject({ team: 2, matchRecords: 0, noShows: 0, noShowPct: null, estPoints: null, pit: 'done' });
    expect(s[2]).toMatchObject({ team: 3, matchRecords: 1, estPoints: 0, pit: 'none' });
  });

  it('works before any match form is published', () => {
    expect(buildTeamSummaries([1], null, [], [])).toEqual([
      { team: 1, matchRecords: 0, noShows: 0, noShowPct: null, estPoints: null, estPointsBySection: {}, stats: {}, pit: 'none' },
    ]);
  });
});
```

- [ ] **Step 2: Write the failing route tests**

`hub/server/test/api-data.test.ts`:

```ts
import { encodeRecordQr, setAnswer } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, record } from '../../../shared/test/fixtures';
import { makeApp, setupEvent } from './helpers';

const device = { id: 'dev-1', name: 'Tablet 1' };

describe('coverage and summaries', () => {
  it('serves coverage and summaries for the current event', async () => {
    const app = await makeApp();
    await setupEvent(app);
    await app.inject({ method: 'POST', url: '/api/schedule/csv', headers: { 'content-type': 'text/csv' }, payload: '1,5098,2,3,4,5,6' });
    const r = setAnswer(record(matchForm()), 'climb', 'deep');
    await app.inject({ method: 'POST', url: '/api/sync', payload: { device, records: [r] } });

    const coverage = (await app.inject({ url: '/api/coverage' })).json();
    expect(coverage[0].cells.red1).toEqual({ team: 5098, status: 'ok', recordIds: [r.id] });

    const all = (await app.inject({ url: '/api/summaries' })).json();
    expect(all.form.version).toBe(1);
    expect(all.summaries.find((s: { team: number }) => s.team === 5098).estPoints).toBe(12);

    const team = (await app.inject({ url: '/api/summaries/5098' })).json();
    expect(team.summary.team).toBe(5098);
    expect(team.matchRecords).toEqual([r]);
    expect(team.pitForm.kind).toBe('pit');
  });
});

describe('QR intake', () => {
  it('stores scanned records once', async () => {
    const app = await makeApp();
    await setupEvent(app);
    const r = setAnswer(record(matchForm()), 'climb', 'deep');
    const [code] = await encodeRecordQr(matchForm(), r);
    const first = await app.inject({ method: 'POST', url: '/api/qr', payload: { text: code } });
    expect(first.json()).toEqual({
      status: 'stored',
      record: { id: r.id, revision: 1, kind: 'match', team: 5098, matchKey: 'qm1', slot: 'red1', scout: 'Ada' },
    });
    expect((await app.inject({ method: 'POST', url: '/api/qr', payload: { text: code } })).json().status).toBe('duplicate');
    expect((await app.inject({ url: '/api/records?kind=match' })).json()).toEqual([r]);
  });

  it('collects multi-part codes', async () => {
    const app = await makeApp();
    await setupEvent(app);
    let seed = 7;
    const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    const text = Array.from({ length: 4000 }, () => 'abcdefghijklmnopqrstuvwxyz '[Math.floor(rand() * 27)]).join('');
    const chunks = await encodeRecordQr(matchForm(), setAnswer(record(matchForm()), 'comments', text));
    expect(chunks.length).toBeGreaterThan(1);
    const first = (await app.inject({ method: 'POST', url: '/api/qr', payload: { text: chunks[0] } })).json();
    expect(first).toMatchObject({ status: 'partial', have: 1, total: chunks.length });
    let last;
    for (const c of chunks.slice(1)) last = (await app.inject({ method: 'POST', url: '/api/qr', payload: { text: c } })).json();
    expect(last.status).toBe('stored');
  });

  it('rejects text that is not ours', async () => {
    const res = await (await makeApp()).inject({ method: 'POST', url: '/api/qr', payload: { text: 'hello' } });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ status: 'invalid', reason: 'Not a Stingr Scout QR code' });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run hub/server/test/analysis.test.ts hub/server/test/api-data.test.ts`
Expected: FAIL — cannot resolve `../src/coverage`.

- [ ] **Step 4: Implement `hub/server/src/coverage.ts`**

```ts
import { compareMatchKeys, type ScheduleMatch, type ScoutRecord, type Slot, SLOTS } from '@stingr/shared';

export type CellStatus = 'empty' | 'noshow' | 'ok' | 'missed';
export interface CoverageCell { team: number; status: CellStatus; recordIds: string[] }
export interface CoverageRow { matchKey: string; scheduled: boolean; cells: Record<Slot, CoverageCell> }

const RANK: Record<CellStatus, number> = { empty: 0, noshow: 1, ok: 2, missed: 3 };

function emptyCells(teams: number[]): Record<Slot, CoverageCell> {
  return Object.fromEntries(SLOTS.map((s, i) => [s, { team: teams[i] ?? 0, status: 'empty', recordIds: [] }])) as Record<Slot, CoverageCell>;
}

export function buildCoverage(schedule: ScheduleMatch[], records: ScoutRecord[]): CoverageRow[] {
  const rows = new Map<string, CoverageRow>();
  for (const m of schedule) rows.set(m.matchKey, { matchKey: m.matchKey, scheduled: true, cells: emptyCells([...m.red, ...m.blue]) });
  for (const r of records) {
    if (r.kind !== 'match' || !r.matchKey || !r.slot) continue;
    let row = rows.get(r.matchKey);
    if (!row) {
      row = { matchKey: r.matchKey, scheduled: false, cells: emptyCells([]) };
      rows.set(r.matchKey, row);
    }
    const cell = row.cells[r.slot];
    if (!row.scheduled && cell.team === 0) cell.team = r.team;
    cell.recordIds.push(r.id);
    const status: CellStatus = r.noShow ? 'noshow' : r.missed.length ? 'missed' : 'ok';
    if (RANK[status] > RANK[cell.status]) cell.status = status;
  }
  return [...rows.values()].sort((a, b) => compareMatchKeys(a.matchKey, b.matchKey));
}
```

- [ ] **Step 5: Implement `hub/server/src/summaries.ts`**

```ts
import { allQuestions, estimatedPoints, type FormDef, type QuestionStat, questionStat, type ScoutRecord } from '@stingr/shared';

export interface TeamSummary {
  team: number;
  matchRecords: number;
  noShows: number;
  noShowPct: number | null;
  estPoints: number | null;
  estPointsBySection: Record<string, number | null>;
  stats: Record<string, QuestionStat>;
  pit: 'none' | 'done' | 'noshow';
}

function summarizeTeam(team: number, form: FormDef | null, recs: ScoutRecord[], pits: ScoutRecord[]): TeamSummary {
  const noShows = recs.filter(r => r.noShow).length;
  const est = form ? estimatedPoints(form, recs) : { total: null, bySection: {} };
  return {
    team,
    matchRecords: recs.length,
    noShows,
    noShowPct: recs.length ? noShows / recs.length : null,
    estPoints: est.total,
    estPointsBySection: est.bySection,
    stats: form ? Object.fromEntries(allQuestions(form).map(q => [q.key, questionStat(q, recs)])) : {},
    pit: pits.length === 0 ? 'none' : pits.some(p => !p.noShow) ? 'done' : 'noshow',
  };
}

export function buildTeamSummaries(teams: number[], matchForm: FormDef | null, matchRecords: ScoutRecord[], pitRecords: ScoutRecord[]): TeamSummary[] {
  const all = new Set([...teams, ...matchRecords.map(r => r.team), ...pitRecords.map(r => r.team)]);
  return [...all]
    .sort((a, b) => a - b)
    .map(team => summarizeTeam(team, matchForm, matchRecords.filter(r => r.team === team), pitRecords.filter(r => r.team === team)));
}
```

- [ ] **Step 6: Implement `hub/server/src/routes/data.ts`**

```ts
import { compareMatchKeys, decodeRecordData, type FormKind, type ScoutRecord } from '@stingr/shared';
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { buildCoverage } from '../coverage';
import { bodyObject, HttpError, requireEvent } from '../http';
import { getForm, latestForm } from '../store/forms';
import { currentRecords } from '../store/records';
import { listSchedule, listTeams } from '../store/schedule';
import { buildTeamSummaries } from '../summaries';
import { ingestRecord } from '../sync';
import { parseTeam } from './event';

export function dataRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.post('/api/qr', async (req, reply) => {
    const { text } = bodyObject(req.body);
    if (typeof text !== 'string') throw new HttpError(400, 'Send { text } with the scanned QR text');
    const res = ctx.qr.add(text);
    if (res.status === 'invalid') return reply.status(422).send({ status: 'invalid', reason: res.reason });
    if (res.status === 'partial') return res;
    let rec: ScoutRecord;
    try {
      rec = await decodeRecordData(res.data, (kind: FormKind, version: number) => getForm(ctx.db, kind, version));
    } catch (e) {
      return reply.status(422).send({ status: 'invalid', reason: (e as Error).message });
    }
    const ingest = ingestRecord(ctx.db, rec, 'qr', ctx.now());
    if (!ingest.ok) return reply.status(422).send({ status: 'invalid', reason: ingest.reason });
    const { id, revision, kind, team, matchKey, slot, scout } = ingest.record;
    return { status: ingest.outcome === 'inserted' ? 'stored' : 'duplicate', record: { id, revision, kind, team, matchKey, slot, scout } };
  });

  app.get('/api/coverage', async () => {
    const ev = requireEvent(ctx.db);
    return buildCoverage(listSchedule(ctx.db, ev.key), currentRecords(ctx.db, ev.key, 'match'));
  });

  app.get('/api/summaries', async () => {
    const ev = requireEvent(ctx.db);
    const form = latestForm(ctx.db, 'match') ?? null;
    return {
      form,
      summaries: buildTeamSummaries(listTeams(ctx.db, ev.key), form, currentRecords(ctx.db, ev.key, 'match'), currentRecords(ctx.db, ev.key, 'pit')),
    };
  });

  app.get('/api/summaries/:team', async req => {
    const ev = requireEvent(ctx.db);
    const team = parseTeam((req.params as { team: string }).team);
    const matchForm = latestForm(ctx.db, 'match') ?? null;
    const matchRecords = currentRecords(ctx.db, ev.key, 'match')
      .filter(r => r.team === team)
      .sort((a, b) => compareMatchKeys(a.matchKey ?? '', b.matchKey ?? ''));
    const pitRecords = currentRecords(ctx.db, ev.key, 'pit').filter(r => r.team === team);
    const [summary] = buildTeamSummaries([team], matchForm, matchRecords, pitRecords);
    return { summary, matchForm, pitForm: latestForm(ctx.db, 'pit') ?? null, matchRecords, pitRecords };
  });
}
```

In `hub/server/src/app.ts` add `import { dataRoutes } from './routes/data';` with the other route imports, and `dataRoutes(app, ctx);` after `scheduleImportRoutes(app, ctx);`.

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run hub/server && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add hub/server
git commit -m "feat(hub): coverage grid, team summaries and QR intake"
```

---

### Task 14: CSV export

**Files:**
- Create: `hub/server/src/export.ts`, `hub/server/src/routes/export.ts`
- Modify: `hub/server/src/app.ts` (register routes)
- Test: `hub/server/test/export.test.ts`

**Interfaces:**
- Consumes: shared `allQuestions`, `compareMatchKeys`, `recordPoints`, `summaryKind`, `SLOTS`; `TeamSummary`, `buildTeamSummaries` (Task 13); stores.
- Produces:
  - `csvCell(v: string | number | boolean | null | undefined): string`; `toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string` (CRLF line ends, trailing CRLF)
  - `formatAnswer(v: AnswerValue | undefined): string | number | boolean | null` — arrays joined with `;`, points as `x,y`, strings starting with `= + - @` tab or CR prefixed with `'`
  - `questionKeyColumns(forms: FormDef[]): string[]` — newest version's order first, then keys only in older versions
  - `matchesCsv(eventKey: string, forms: FormDef[], records: ScoutRecord[]): string`
  - `pitCsv(eventKey: string, forms: FormDef[], records: ScoutRecord[]): string`
  - `teamsCsv(summaries: TeamSummary[], form: FormDef | null): string`
  - HTTP: `GET /api/export/matches.csv | pit.csv | teams.csv` → `text/csv` with `content-disposition: attachment; filename="<event>-<file>"`; unknown file → 404

- [ ] **Step 1: Write the failing tests**

`hub/server/test/export.test.ts`:

```ts
import { markMissed, setAnswer } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../../shared/test/fixtures';
import { matchesCsv, pitCsv, teamsCsv } from '../src/export';
import { buildTeamSummaries } from '../src/summaries';
import { makeApp, setupEvent } from './helpers';

describe('matchesCsv', () => {
  it('uses the union of question columns across form versions, in match order', () => {
    const v1 = matchForm(1);
    const v2 = matchForm(2);
    v2.sections[0].questions.push({ key: 'teleop_algae', label: 'Algae', type: 'counter', required: false, min: 0, step: 1, default: 0, points: 2 });
    v2.sections[2].questions = v2.sections[2].questions.filter(q => q.key !== 'zones');
    const a = setAnswer(setAnswer(record(v1, { id: 'a', matchKey: 'qm10', slot: 'blue1', team: 254 }), 'zones', ['near', 'far']), 'climb', 'deep');
    const b = markMissed(setAnswer(record(v2, { id: 'b', matchKey: 'qm2', slot: 'red3', team: 5098 }), 'teleop_algae', 3), 'climb');

    const lines = matchesCsv('2027test', [v1, v2], [a, b]).split('\r\n');
    expect(lines[0]).toBe('event,match,slot,team,scout,device,no_show,est_points,missed,revision,updated_at,auto_leave,auto_coral,start_pos,teleop_algae,climb,climb_time,defense,comments,zones');
    expect(lines[1]).toBe('2027test,qm2,red3,5098,Ada,dev-1,false,6,climb,1,2027-03-01T10:00:00.000Z,false,0,,3,,,,,');
    expect(lines[2]).toBe('2027test,qm10,blue1,254,Ada,dev-1,false,12,,1,2027-03-01T10:00:00.000Z,false,0,,,deep,,,,near;far');
    expect(lines[3]).toBe('');
  });

  it('escapes awkward text and blocks spreadsheet formulas', () => {
    const f = matchForm();
    const c = setAnswer(setAnswer(record(f, { id: 'c' }), 'comments', 'Fast, "great"\ndriver'), 'start_pos', [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]);
    const d = setAnswer(record(f, { id: 'd', matchKey: 'qm3' }), 'comments', '=HYPERLINK("x")');
    const e = setAnswer(record(f, { id: 'e', matchKey: 'qm4' }), 'comments', '-slow');
    const csv = matchesCsv('2027test', [f], [c, d, e]);
    expect(csv).toContain('"Fast, ""great""\ndriver"');
    expect(csv).toContain('"0.1,0.2;0.3,0.4"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",'-slow\r\n");
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(4);
  });
});

describe('pitCsv', () => {
  it('writes one row per pit record', () => {
    const p = setAnswer(record(pitForm(), { id: 'p', team: 254, photoIds: ['x', 'y'] }), 'drivetrain', 'swerve');
    expect(pitCsv('2027test', [pitForm()], [p])).toBe(
      'event,team,scout,device,no_show,photos,missed,revision,updated_at,drivetrain,weight_lb\r\n'
      + '2027test,254,Ada,dev-1,false,2,,1,2027-03-01T10:00:00.000Z,swerve,\r\n',
    );
  });
});

describe('teamsCsv', () => {
  it('flattens team summaries', () => {
    const f = matchForm();
    const r = setAnswer(setAnswer(setAnswer(record(f), 'auto_coral', 2), 'auto_leave', true), 'climb', 'deep');
    const lines = teamsCsv(buildTeamSummaries([5098], f, [r], []), f).split('\r\n');
    expect(lines[0]).toBe('team,match_records,no_shows,no_show_pct,est_points,pit,est_auto,est_endgame,est_notes,auto_leave_pct,auto_coral_avg,auto_coral_max,climb_none_pct,climb_shallow_pct,climb_deep_pct,climb_time_avg,climb_time_max,defense_avg,defense_max,zones_near_pct,zones_far_pct');
    expect(lines[1]).toBe('5098,1,0,0,23,none,11,12,,100,2,2,0,0,100,,,,,,');
  });
});

describe('export route', () => {
  it('downloads CSV files for the current event', async () => {
    const app = await makeApp();
    await setupEvent(app);
    const res = await app.inject({ url: '/api/export/matches.csv' });
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="2027test-matches.csv"');
    expect(res.body.startsWith('event,match,slot')).toBe(true);
    expect((await app.inject({ url: '/api/export/teams.csv' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/export/pit.csv' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/export/secrets.csv' })).statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run hub/server/test/export.test.ts`
Expected: FAIL — cannot resolve `../src/export`.

- [ ] **Step 3: Implement `hub/server/src/export.ts`**

```ts
import {
  allQuestions, type AnswerValue, compareMatchKeys, type FormDef, type Point, recordPoints,
  type ScoutRecord, type Slot, SLOTS, summaryKind,
} from '@stingr/shared';
import type { TeamSummary } from './summaries';

type Cell = string | number | boolean | null | undefined;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Spreadsheet apps treat cells starting with these characters as formulas. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function formatAnswer(v: AnswerValue | undefined): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return FORMULA_START.test(v) ? `'${v}` : v;
  if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : `${(x as Point).x},${(x as Point).y}`)).join(';');
  return v;
}

const round2 = (n: number | null | undefined): number | null => (n === null || n === undefined ? null : Math.round(n * 100) / 100);
const pct = (f: number | null): number | null => (f === null ? null : Math.round(f * 1000) / 10);
const newest = (forms: FormDef[]): FormDef | undefined =>
  forms.reduce<FormDef | undefined>((best, f) => (!best || f.version > best.version ? f : best), undefined);

export function questionKeyColumns(forms: FormDef[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const f of [...forms].sort((a, b) => b.version - a.version)) {
    for (const q of allQuestions(f)) {
      if (!seen.has(q.key)) {
        seen.add(q.key);
        keys.push(q.key);
      }
    }
  }
  return keys;
}

export function matchesCsv(eventKey: string, forms: FormDef[], records: ScoutRecord[]): string {
  const latest = newest(forms);
  const keys = questionKeyColumns(forms);
  const header = ['event', 'match', 'slot', 'team', 'scout', 'device', 'no_show', 'est_points', 'missed', 'revision', 'updated_at', ...keys];
  const sorted = [...records].sort((a, b) =>
    compareMatchKeys(a.matchKey ?? '', b.matchKey ?? '') || SLOTS.indexOf(a.slot as Slot) - SLOTS.indexOf(b.slot as Slot));
  const rows = sorted.map(r => [
    eventKey, r.matchKey, r.slot, r.team, r.scout, r.deviceId, r.noShow,
    latest ? round2(recordPoints(latest, r)) : null,
    r.missed.join(';'), r.revision, r.updatedAt,
    ...keys.map(k => formatAnswer(r.answers[k])),
  ]);
  return toCsv(header, rows);
}

export function pitCsv(eventKey: string, forms: FormDef[], records: ScoutRecord[]): string {
  const keys = questionKeyColumns(forms);
  const header = ['event', 'team', 'scout', 'device', 'no_show', 'photos', 'missed', 'revision', 'updated_at', ...keys];
  const sorted = [...records].sort((a, b) => a.team - b.team || a.updatedAt.localeCompare(b.updatedAt));
  const rows = sorted.map(r => [
    eventKey, r.team, r.scout, r.deviceId, r.noShow, r.photoIds.length, r.missed.join(';'), r.revision, r.updatedAt,
    ...keys.map(k => formatAnswer(r.answers[k])),
  ]);
  return toCsv(header, rows);
}

type Column = { name: string; get: (s: TeamSummary) => Cell };

export function teamsCsv(summaries: TeamSummary[], form: FormDef | null): string {
  const cols: Column[] = [
    { name: 'team', get: s => s.team },
    { name: 'match_records', get: s => s.matchRecords },
    { name: 'no_shows', get: s => s.noShows },
    { name: 'no_show_pct', get: s => pct(s.noShowPct) },
    { name: 'est_points', get: s => round2(s.estPoints) },
    { name: 'pit', get: s => s.pit },
  ];
  if (form) {
    for (const sec of form.sections) cols.push({ name: `est_${sec.id}`, get: s => round2(s.estPointsBySection[sec.id]) });
    for (const q of allQuestions(form)) {
      const kind = summaryKind(q);
      if (kind === 'avg') {
        cols.push({ name: `${q.key}_avg`, get: s => { const st = s.stats[q.key]; return st?.kind === 'avg' ? round2(st.avg) : null; } });
        cols.push({ name: `${q.key}_max`, get: s => { const st = s.stats[q.key]; return st?.kind === 'avg' ? st.max : null; } });
      } else if (kind === 'pct') {
        cols.push({ name: `${q.key}_pct`, get: s => { const st = s.stats[q.key]; return st?.kind === 'pct' ? pct(st.pct) : null; } });
      } else if (kind === 'distribution' && (q.type === 'choice' || q.type === 'multi')) {
        for (const o of q.options) {
          cols.push({
            name: `${q.key}_${o.value}_pct`,
            get: s => { const st = s.stats[q.key]; return st?.kind === 'distribution' && st.n ? pct((st.counts[o.value] ?? 0) / st.n) : null; },
          });
        }
      }
    }
  }
  return toCsv(cols.map(c => c.name), summaries.map(s => cols.map(c => c.get(s))));
}
```

- [ ] **Step 4: Implement `hub/server/src/routes/export.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { matchesCsv, pitCsv, teamsCsv } from '../export';
import { HttpError, requireEvent } from '../http';
import { latestForm, listForms } from '../store/forms';
import { currentRecords } from '../store/records';
import { listTeams } from '../store/schedule';
import { buildTeamSummaries } from '../summaries';

export function exportRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.get('/api/export/:file', async (req, reply) => {
    const ev = requireEvent(ctx.db);
    const { file } = req.params as { file: string };
    let csv: string;
    switch (file) {
      case 'matches.csv':
        csv = matchesCsv(ev.key, listForms(ctx.db, 'match'), currentRecords(ctx.db, ev.key, 'match'));
        break;
      case 'pit.csv':
        csv = pitCsv(ev.key, listForms(ctx.db, 'pit'), currentRecords(ctx.db, ev.key, 'pit'));
        break;
      case 'teams.csv': {
        const form = latestForm(ctx.db, 'match') ?? null;
        const summaries = buildTeamSummaries(listTeams(ctx.db, ev.key), form, currentRecords(ctx.db, ev.key, 'match'), currentRecords(ctx.db, ev.key, 'pit'));
        csv = teamsCsv(summaries, form);
        break;
      }
      default:
        throw new HttpError(404, `Unknown export "${file}"`);
    }
    return reply
      .type('text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${ev.key}-${file}"`)
      .send(csv);
  });
}
```

In `hub/server/src/app.ts` add `import { exportRoutes } from './routes/export';` and `exportRoutes(app, ctx);` after `dataRoutes(app, ctx);`.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run hub/server && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add hub/server
git commit -m "feat(hub): CSV export of matches, pit data and team summaries"
```

---

### Task 15: Backup, restore and USB status API

**Files:**
- Create: `hub/server/src/routes/admin.ts`
- Modify: `hub/server/src/app.ts` (register routes)
- Test: `hub/server/test/admin.test.ts`

**Interfaces:**
- Consumes: `openDb`, `schemaVersion`, `SCHEMA_VERSION` (Task 7); `listDevices` (Task 9); `AdbWatcher`/`AdbStatus` (Task 10); `HubContext` (Task 11).
- Produces (HTTP):

| Method & path | Body | Response |
|---|---|---|
| `GET /api/backup` | — | SQLite file, `content-disposition: attachment; filename="stingr-backup-<timestamp>.db"` |
| `POST /api/restore` | backup file as `application/octet-stream` | `{ ok: true }`; 422 not a backup; 400 in-memory DB. Saves the replaced DB as `<db>.before-restore-<timestamp>` first. |
| `GET /api/devices` | — | `{ adb: AdbStatus, devices: DeviceRow[] }` |

- [ ] **Step 1: Write the failing tests**

`hub/server/test/admin.test.ts`:

```ts
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AdbWatcher } from '../src/adb';
import { openDb } from '../src/db';
import { makeApp } from './helpers';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function fileApp() {
  const dir = mkdtempSync(join(tmpdir(), 'stingr-admin-'));
  dirs.push(dir);
  const dbPath = join(dir, 'stingr.db');
  return { dir, app: await makeApp({ db: openDb(dbPath), dbPath }) };
}

const keys = async (app: Awaited<ReturnType<typeof makeApp>>) =>
  (await app.inject({ url: '/api/events' })).json().events.map((e: { key: string }) => e.key);

describe('backup and restore', () => {
  it('restores a backup and keeps a copy of what it replaced', async () => {
    const { dir, app } = await fileApp();
    await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027one' } });
    const backup = await app.inject({ url: '/api/backup' });
    expect(backup.headers['content-disposition']).toBe('attachment; filename="stingr-backup-2027-03-01T12-00-00-000Z.db"');

    await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027two' } });
    expect(await keys(app)).toEqual(['2027one', '2027two']);

    const restore = await app.inject({ method: 'POST', url: '/api/restore', headers: { 'content-type': 'application/octet-stream' }, payload: backup.rawPayload });
    expect(restore.json()).toEqual({ ok: true });
    expect(await keys(app)).toEqual(['2027one']);
    expect(readdirSync(dir).some(f => f.startsWith('stingr.db.before-restore-'))).toBe(true);
  });

  it('refuses a file that is not a backup and changes nothing', async () => {
    const { app } = await fileApp();
    await app.inject({ method: 'POST', url: '/api/events', payload: { key: '2027one' } });
    const res = await app.inject({ method: 'POST', url: '/api/restore', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from('hello') });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'That file is not a Stingr Scout backup' });
    expect(await keys(app)).toEqual(['2027one']);
  });

  it('cannot restore an in-memory database', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/restore', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from('x') });
    expect(res.statusCode).toBe(400);
  });
});

describe('devices', () => {
  it('reports the USB watcher status and known tablets', async () => {
    const adb = { status: { available: true, devices: [{ serial: 'S1', state: 'device', reversed: true }] } } as unknown as AdbWatcher;
    const app = await makeApp({ adb });
    expect((await app.inject({ url: '/api/devices' })).json()).toEqual({ adb: adb.status, devices: [] });
  });
  it('says when the watcher is not running', async () => {
    const res = (await (await makeApp()).inject({ url: '/api/devices' })).json();
    expect(res.adb).toEqual({ available: false, devices: [], error: 'USB watcher is not running' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run hub/server/test/admin.test.ts`
Expected: FAIL — `/api/backup` returns 404.

- [ ] **Step 3: Implement `hub/server/src/routes/admin.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import type { HubContext } from '../app';
import { openDb, SCHEMA_VERSION, schemaVersion } from '../db';
import { HttpError } from '../http';
import { listDevices } from '../store/devices';

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;
const stamp = (iso: string) => iso.replace(/[:.]/g, '-');

export function adminRoutes(app: FastifyInstance, ctx: HubContext): void {
  app.get('/api/backup', async (_req, reply) => {
    const tmp = join(tmpdir(), `stingr-backup-${randomUUID()}.db`);
    try {
      ctx.db.exec(`VACUUM INTO ${sqlString(tmp)}`);
      const data = await readFile(tmp);
      return reply
        .type('application/octet-stream')
        .header('content-disposition', `attachment; filename="stingr-backup-${stamp(ctx.now())}.db"`)
        .send(data);
    } finally {
      await rm(tmp, { force: true });
    }
  });

  app.post('/api/restore', async req => {
    if (!ctx.dbPath) throw new HttpError(400, 'Restore needs a database file (not available in this mode)');
    if (!Buffer.isBuffer(req.body)) throw new HttpError(415, 'Send the backup file as application/octet-stream');
    const dbPath = ctx.dbPath;
    const incoming = `${dbPath}.restore`;
    await writeFile(incoming, req.body);
    try {
      const check = new DatabaseSync(incoming);
      try {
        const v = schemaVersion(check);
        check.prepare('SELECT COUNT(*) FROM records').get();
        if (v < 1 || v > SCHEMA_VERSION) throw new Error(`unsupported schema version ${v}`);
      } finally {
        check.close();
      }
    } catch {
      await rm(incoming, { force: true });
      throw new HttpError(422, 'That file is not a Stingr Scout backup');
    }
    ctx.db.exec(`VACUUM INTO ${sqlString(`${dbPath}.before-restore-${stamp(ctx.now())}`)}`);
    ctx.db.close();
    for (const suffix of ['-wal', '-shm']) await rm(dbPath + suffix, { force: true });
    await rename(incoming, dbPath);
    ctx.db = openDb(dbPath); // migrates older backups forward
    return { ok: true };
  });

  app.get('/api/devices', async () => ({
    adb: ctx.adb?.status ?? { available: false, devices: [], error: 'USB watcher is not running' },
    devices: listDevices(ctx.db),
  }));
}
```

In `hub/server/src/app.ts` add `import { adminRoutes } from './routes/admin';` and `adminRoutes(app, ctx);` after `exportRoutes(app, ctx);`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run hub/server && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add hub/server
git commit -m "feat(hub): database backup/restore and USB status endpoints"
```

---

### Task 16: Hub entry point, README and end-to-end smoke check

**Files:**
- Create: `hub/server/src/main.ts`, `README.md`

**Interfaces:**
- Consumes: `openDb` (Task 7), `AdbWatcher`, `nodeAdbExec` (Task 10), `buildApp` (Task 11).
- Produces: `npm run hub [-- --no-open]` — starts the hub on 127.0.0.1:5098 (env `STINGR_PORT`), data in `~/.local/share/stingr-scout/data` (env `STINGR_DATA_DIR`), static roots under `STINGR_WEB_ROOT` (default: repo root → `app/dist`, `hub/ui/dist`), app build id from `STINGR_APP_BUILD` (default `dev`). Plan 4 sets these env vars in the release launcher.

- [ ] **Step 1: Implement `hub/server/src/main.ts`**

```ts
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdbWatcher, nodeAdbExec } from './adb';
import { buildApp } from './app';
import { openDb } from './db';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.STINGR_PORT ?? 5098);
const dataDir = process.env.STINGR_DATA_DIR ?? join(homedir(), '.local', 'share', 'stingr-scout', 'data');
const webRoot = process.env.STINGR_WEB_ROOT ?? resolve(here, '../../..');
const url = `http://localhost:${port}/hub/`;

function openBrowser(): void {
  if (process.argv.includes('--no-open')) return;
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}

mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, 'stingr.db');
const db = openDb(dbPath);
const adb = new AdbWatcher(nodeAdbExec(process.env.ADB ?? 'adb'), port);
const app = await buildApp({
  db,
  dbPath,
  adb,
  appBuild: process.env.STINGR_APP_BUILD ?? 'dev',
  staticRoots: { app: join(webRoot, 'app', 'dist'), hubUi: join(webRoot, 'hub', 'ui', 'dist') },
});

try {
  await app.listen({ host: '127.0.0.1', port });
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.log(`A Stingr Scout hub is already running at ${url}. Opening it.`);
    openBrowser();
    process.exit(0);
  }
  throw e;
}

adb.start();
console.log(`Stingr Scout hub running at ${url}`);
console.log(`Data folder: ${dataDir}`);
openBrowser();

const shutdown = async () => {
  adb.stop();
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **Step 2: Write `README.md`**

````markdown
# Stingr Scout

Offline scouting for FRC Team 5098: Android tablets run a web app that syncs over USB to a hub on a Linux laptop.

Design: `docs/superpowers/specs/2026-10-15-stingr-scout-design.md`

## Development

Requires Node.js 22.13 or newer.

```bash
npm install
npm test            # all unit and API tests
npm run typecheck
npm run hub         # start the hub at http://localhost:5098/hub/ (add `-- --no-open` to skip the browser)
```

Environment overrides for the hub: `STINGR_PORT`, `STINGR_DATA_DIR`, `STINGR_WEB_ROOT`, `STINGR_APP_BUILD`, `ADB`.

## Connecting a tablet

1. On the tablet: Settings → About tablet → tap **Build number** 7 times, then Developer options → **USB debugging** on.
2. Plug it into the hub laptop and accept "Allow USB debugging" (tick "Always allow").
3. With the hub running, the tablet can reach it at `http://localhost:5098/`.
````

- [ ] **Step 3: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: every test file passes; no type errors.

- [ ] **Step 4: Smoke-test the running hub**

```bash
export STINGR_DATA_DIR=$(mktemp -d)
STINGR_PORT=5099 npm run hub -- --no-open &
HUB_PID=$!
curl -s --retry 20 --retry-connrefused --retry-delay 1 http://127.0.0.1:5099/api/ping
curl -s -X POST -H 'content-type: application/json' -d '{"key":"2027smoke","name":"Smoke"}' http://127.0.0.1:5099/api/events
curl -s http://127.0.0.1:5099/api/devices
kill $HUB_PID
ls "$STINGR_DATA_DIR"
```

Expected:
- ping prints `{"hub":"stingr-scout","appBuild":"dev"}`
- events prints a JSON object with `"current":{"key":"2027smoke","name":"Smoke"}`
- devices prints `"available":true` (with the tablet listed and `"reversed":true` if it is plugged in) or the adb install hint
- the data directory contains `stingr.db`

- [ ] **Step 5: Verify the tablet reaches the hub over USB (tablet plugged in)**

```bash
STINGR_PORT=5098 npm run hub -- --no-open &
HUB_PID=$!
curl -s --retry 20 --retry-connrefused --retry-delay 1 http://127.0.0.1:5098/api/ping
adb reverse --list
adb shell am start -a android.intent.action.VIEW -d http://localhost:5098/api/ping
kill $HUB_PID
```

Expected: `adb reverse --list` shows `tcp:5098 tcp:5098` (set by the watcher, not by hand); Chrome on the tablet shows `{"hub":"stingr-scout","appBuild":"dev"}`.

- [ ] **Step 6: Commit**

```bash
git add hub/server/src/main.ts README.md
git commit -m "feat(hub): runnable hub entry point and README"
```
