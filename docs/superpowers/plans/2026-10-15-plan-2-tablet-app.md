# Plan 2 — Tablet App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the offline tablet app that scouts use: tablet setup, match and pit scouting with every question type, missed answers and no-shows, editing, QR codes, and automatic USB sync with a full-screen progress display — served by the hub and installed to the home screen.

**Architecture:** A Svelte 5 single-page app in a new `app/` workspace, built by Vite into `app/dist`, which the hub (Plan 1) serves at `/`. Data lives in IndexedDB (via `idb`). Logic sits in plain TypeScript modules under `app/src/lib/` (database, sync engine, sync state machine, session helpers) plus one reactive store class (`store.svelte.ts`); screens and question components are thin Svelte files that call the store. A small Vite plugin writes a service worker that precaches the built files, plus `build.json` with the build id the hub reports so tablets notice updates.

**Tech Stack:** Svelte 5.57.2, Vite 8.3.4, @sveltejs/vite-plugin-svelte 7.3.1, idb 8.0.4, qrcode 1.5.4; tests: Vitest 5.0.5 (jsdom 30.1.3, @testing-library/svelte 5.4.2, fake-indexeddb 6.2.5), Playwright 1.64.1.

**Spec:** `docs/superpowers/specs/2026-10-15-stingr-scout-design.md` (§5 is the tablet app). Probe findings: `docs/superpowers/notes/2026-10-15-pwa-probe-findings.md`.

**Builds on:** Plan 1 (merged): `@stingr/shared` (types, `newRecord`, `setAnswer`, `markMissed`, `unmarkMissed`, `finalizeSubmit`, `markNoShow`, `undoNoShow`, `reviseRecord`, `unansweredRequired`, `encodeRecordQr`, match-key and field-map helpers) and the hub API (`/api/ping`, `/api/sync`, `/api/photos/:id`, `/api/qr`, `/api/records`).

## Global Constraints

- Runtime target: **Chrome 119 on Android 7** (ZenPad 10, 1280×800). Vite `build.target: 'chrome119'`.
- The app is served by the hub at `http://localhost:5098/` (tablet reaches it through `adb reverse`); all API calls are same-origin relative URLs (`/api/...`).
- `svelte-check` is **not** used (it does not support TypeScript 7). Type checking: `tsc` with `"types": ["node", "svelte"]` covers `.ts` and `.svelte.ts`; `.svelte` files are checked by the Svelte compiler (build/tests).
- Anything written to IndexedDB from reactive state goes through `$state.snapshot(...)` first (Svelte proxies cannot be structured-cloned).
- Never pass the global `fetch` unbound (Chrome throws "Illegal invocation"); wrap it: `(input, init) => fetch(input, init)`.
- Photos are stored as `ArrayBuffer` + MIME type (not `Blob`) in IndexedDB.
- Touch targets at least 48 px; primary actions 64 px tall.
- Form controls carry an `aria-label` matching their visible label (tests and Playwright find them by label).
- Missed and unanswered values are `null`, never 0; "I missed this" is available on every question.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (add to every `git commit` in this plan).

## Review Focus

1. The tablet dies or Chrome is closed mid-form → on the next launch the unfinished form reopens with every answer entered so far (Task 7, `store.test.ts` "restores an unfinished draft after a restart").
2. A scout edits a record while the hub is still acknowledging the previous revision → the acknowledgement must not mark the newer revision as synced (Task 3, `db.test.ts` "marks a record synced only if the acked revision is still the latest").
3. The cable is pulled during photo upload → the photo stays queued and is uploaded on the next connection; nothing is marked uploaded that wasn't (Task 5, `sync.test.ts` "keeps photos queued when the connection drops mid-upload").
4. The schedule has no team for the chosen slot (team 0) or there is no schedule at all → the team box is empty, the scout types it, and Start stays disabled until it is a valid number (Task 10, `home.test.ts` "lets the scout type a team the schedule doesn't have").
5. The app is opened with no hub after it was installed → it loads from the service-worker cache with its stored event, forms and records (Task 14, `tablet.spec.ts` "keeps working offline").

---

## File Structure

```
package.json                    + "app" workspace, build/dev:app/e2e scripts, @playwright/test
tsconfig.json                   + app/src, app/test, e2e; types ["node", "svelte"]
vitest.config.ts                projects: node (shared + hub) and app (jsdom)
playwright.config.ts            e2e against a real hub on port 5199
e2e/tablet.spec.ts
shared/src/qr.ts                (modify) compression via Response instead of Blob.stream
hub/server/src/appBuild.ts      read app/dist/build.json for the build id
hub/server/src/app.ts           (modify) no-cache headers for the app shell
hub/server/src/main.ts          (modify) use resolveAppBuild
app/
  package.json                  @stingr/app
  vite.config.ts                Svelte, Chrome 119 target, service-worker plugin, dev proxy, vitest project "app"
  index.html
  sw/sw.js                      service-worker template (precache list and build id filled in at build)
  scripts/make-icons.mjs        writes public/icon-192.png and icon-512.png
  public/manifest.webmanifest, public/icon-192.png, public/icon-512.png
  src/
    main.ts                     open DB, load store, start sync, mount App, watch for updates
    env.d.ts                    declare __BUILD_ID__
    app.css                     global styles
    App.svelte                  top bar, banners, screen switch, sync overlay
    lib/
      db.ts                     IndexedDB access (kv, records, photos)
      session.ts                pure helpers: next match, team for slot, latest form, pit status, titles
      sync.ts                   pingHub, runSync
      syncController.ts         polling state machine behind the sync overlay
      store.svelte.ts           AppStore: reactive app state + all user actions
      fieldmap.ts               tap position → normalized point
      photos.ts                 resize camera photos to JPEG
      wakeLock.ts               keep the screen on while a form is open
      swUpdate.ts               register the service worker, apply updates when safe
    components/
      ConfirmDialog.svelte
      QuestionCard.svelte       label, required mark, "I missed this", the right input
      Photos.svelte             pit photo capture and thumbnails
      SyncOverlay.svelte
      questions/Counter.svelte Toggle.svelte Choice.svelte Multi.svelte NumberField.svelte
                TextField.svelte Rating.svelte Timer.svelte FieldMap.svelte
    screens/
      Setup.svelte Home.svelte FormScreen.svelte PitList.svelte PastRecords.svelte QrView.svelte Settings.svelte
  test/
    helpers.ts                  CONFIG fixture, makeStore()
    *.test.ts
```

---

### Task 1: App workspace scaffold, build pipeline and service-worker generation

**Files:**
- Modify: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `app/package.json`, `app/vite.config.ts`, `app/index.html`, `app/sw/sw.js`, `app/scripts/make-icons.mjs`, `app/public/manifest.webmanifest`, `app/public/icon-192.png`, `app/public/icon-512.png` (generated), `app/src/env.d.ts`, `app/src/app.css`, `app/src/App.svelte` (placeholder), `app/src/main.ts` (placeholder)
- Test: `app/test/scaffold.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `npm run build` → `app/dist/` containing `index.html`, `assets/*`, `manifest.webmanifest`, icons, `sw.js` (precache list + build id) and `build.json` (`{ "build": "<id>" }`).
  - Global constant `__BUILD_ID__: string` (Vite `define`; `STINGR_APP_BUILD` env overrides the generated timestamp id).
  - `npm test` runs two Vitest projects: `node` (shared + hub) and `app` (jsdom, fake IndexedDB, Svelte).

- [ ] **Step 1: Update the root workspace files**

`package.json` (full file):

```json
{
  "name": "stingr-scout",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.13" },
  "workspaces": ["shared", "hub/*", "app"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json",
    "build": "npm run build -w @stingr/app",
    "dev:app": "npm run dev -w @stingr/app",
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

`tsconfig.json` (full file):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "preserve",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM"],
    "types": ["node", "svelte"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["shared", "hub/server", "app/src", "app/test", "app/vite.config.ts", "vitest.config.ts"]
}
```

`vitest.config.ts` (full file):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', include: ['shared/**/*.test.ts', 'hub/server/**/*.test.ts'] } },
      './app/vite.config.ts',
    ],
  },
});
```

- [ ] **Step 2: Create the app package**

`app/package.json`:

```json
{
  "name": "@stingr/app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite"
  },
  "dependencies": {
    "@stingr/shared": "*",
    "idb": "8.0.4",
    "qrcode": "1.5.4"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "7.3.1",
    "@testing-library/svelte": "5.4.2",
    "@types/qrcode": "1.5.6",
    "fake-indexeddb": "6.2.5",
    "jsdom": "30.1.3",
    "svelte": "5.57.2",
    "vite": "8.3.4"
  }
}
```

Run: `npm install`
Expected: completes; `node_modules/@stingr/app` symlink exists.

`app/vite.config.ts`:

```ts
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const BUILD_ID = process.env.STINGR_APP_BUILD ?? new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** After a build: write build.json and a service worker that precaches every built file. */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'stingr-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map(f => relative(outDir, f).split('\\').join('/'))
        .filter(f => f !== 'sw.js' && f !== 'build.json')
        .sort();
      const template = readFileSync(new URL('./sw/sw.js', import.meta.url), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), template.replace('__BUILD_ID__', BUILD_ID).replace('__PRECACHE__', JSON.stringify(['./', ...files])));
      writeFileSync(join(outDir, 'build.json'), JSON.stringify({ build: BUILD_ID }));
    },
  };
}

export default defineConfig({
  plugins: [svelte(), serviceWorker()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  build: { target: 'chrome119' },
  server: { proxy: { '/api': 'http://127.0.0.1:5098' } },
  test: {
    name: 'app',
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
  },
});
```

`app/sw/sw.js` (template; `__BUILD_ID__` and `__PRECACHE__` are replaced at build time):

```js
const BUILD = '__BUILD_ID__';
const PRECACHE = __PRECACHE__;
const CACHE = `stingr-${BUILD}`;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
  // No skipWaiting here: a new version waits until the app says no form is open.
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/hub')) return; // always network
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then(r => r || fetch(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(r => r || fetch(event.request)));
});
```

`app/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#f5b400">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icon-192.png">
  <title>Stingr Scout</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

`app/public/manifest.webmanifest`:

```json
{
  "name": "Stingr Scout",
  "short_name": "Stingr",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#fafafa",
  "theme_color": "#f5b400",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`app/scripts/make-icons.mjs` (yellow icon with black stripes; no dependencies):

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
function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const stripe = y > size * 0.3 && y < size * 0.7 && Math.floor(y / (size / 10)) % 2 === 1;
    const [r, g, b] = stripe ? [26, 26, 26] : [245, 180, 0];
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [192, 512]) writeFileSync(new URL(`../public/icon-${s}.png`, import.meta.url), png(s));
```

Run: `node app/scripts/make-icons.mjs && file app/public/icon-512.png`
Expected: `PNG image data, 512 x 512, 8-bit/color RGB`.

`app/src/env.d.ts`:

```ts
declare const __BUILD_ID__: string;
```

`app/src/app.css`:

```css
:root {
  --yellow: #f5b400; --black: #1a1a1a; --red: #c62828; --blue: #1565c0; --green: #2e7d32; --grey: #666; --bg: #fafafa;
  font-family: system-ui, Roboto, sans-serif; font-size: 18px; color: var(--black); background: var(--bg);
}
* { box-sizing: border-box; }
body { margin: 0; }
button, select, input, textarea { font: inherit; }
button { min-height: 48px; min-width: 48px; padding: 0 16px; border: 2px solid var(--black); border-radius: 8px; background: #fff; color: var(--black); }
button:disabled { opacity: 0.4; }
button.primary { background: var(--yellow); }
button.big { min-height: 64px; font-size: 1.3rem; }
button[aria-pressed='true'] { background: var(--black); color: #fff; }
button.link { border: none; background: none; text-decoration: underline; color: var(--grey); }
input, select, textarea { min-height: 48px; padding: 8px; border: 2px solid #999; border-radius: 8px; background: #fff; }
textarea { width: 100%; }
label { display: flex; flex-direction: column; gap: 4px; font-weight: 600; }
.topbar { display: flex; align-items: center; gap: 16px; padding: 8px 16px; background: var(--black); color: #fff; }
.topbar .brand { color: var(--yellow); font-weight: 700; }
.topbar .event { flex: 1; }
.badge { padding: 4px 12px; border-radius: 999px; background: var(--red); }
.badge.ok { background: var(--green); }
main { padding: 16px; max-width: 1100px; margin: 0 auto; }
.banner { margin: 0 0 12px; padding: 8px 16px; border-radius: 8px; }
.warn { background: #fff3cd; }
.error { color: var(--red); }
.hint { color: var(--grey); }
.row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end; margin: 12px 0; }
.choices { display: flex; flex-wrap: wrap; gap: 8px; }
.question { background: #fff; border: 1px solid #ddd; border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; }
.question header { display: flex; justify-content: space-between; align-items: center; }
.question h3 { margin: 0; font-size: 1.1rem; }
.question.missed { opacity: 0.7; border-style: dashed; }
.req { color: var(--red); }
.counter { display: flex; align-items: center; gap: 16px; }
.counter output { font-size: 2rem; min-width: 3ch; text-align: center; }
.counter button { width: 80px; height: 64px; font-size: 2rem; }
.tabs { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.nav { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
.bar { display: flex; align-items: center; gap: 12px; }
.bar h1 { flex: 1; font-size: 1.3rem; }
.tag { background: var(--yellow); padding: 2px 8px; border-radius: 6px; }
.fieldmap { position: relative; max-width: 640px; }
.fieldmap img { width: 100%; display: block; user-select: none; }
.fieldmap .dot { position: absolute; width: 28px; height: 28px; min-width: 0; min-height: 0; padding: 0; margin: -14px 0 0 -14px; border-radius: 50%; background: var(--yellow); }
.timer { display: flex; gap: 12px; align-items: center; }
.timer .readout { font-size: 1.8rem; border: none; }
.backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 10; }
.dialog { background: #fff; border-radius: 12px; padding: 24px; max-width: 560px; width: 90%; }
.dialog .actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; }
.sync-overlay { position: fixed; inset: 0; z-index: 20; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: #fff; text-align: center; padding: 32px; }
.sync-overlay.syncing { background: var(--blue); }
.sync-overlay.done { background: var(--green); }
.sync-overlay.error { background: var(--red); }
.sync-overlay h2 { font-size: 2.4rem; margin: 0; }
.sync-overlay progress { width: 60%; height: 32px; }
.list { list-style: none; padding: 0; }
.list li { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid #ddd; }
.list li .grow { flex: 1; }
.status.done, .synced { color: var(--green); }
.status.noshow, .rejected { color: var(--red); }
.qr { width: min(70vh, 90vw); margin: 0 auto; }
.qr svg { width: 100%; height: auto; }
.thumbs { display: flex; gap: 12px; flex-wrap: wrap; }
.thumbs img { width: 160px; height: 120px; object-fit: cover; border-radius: 8px; }
```

`app/src/main.ts` (placeholder; replaced in Task 12):

```ts
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
```

- [ ] **Step 3: Write the failing test**

`app/test/scaffold.test.ts`:

```ts
import { render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import App from '../src/App.svelte';

it('renders the app shell', () => {
  render(App);
  expect(screen.getByRole('heading', { name: 'Stingr Scout' })).toBeTruthy();
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run --project app`
Expected: FAIL — cannot resolve `../src/App.svelte`.

- [ ] **Step 5: Add the placeholder App**

`app/src/App.svelte` (placeholder; replaced in Task 12):

```svelte
<h1>Stingr Scout</h1>
```

- [ ] **Step 6: Run all tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build && ls app/dist && head -c 300 app/dist/sw.js && cat app/dist/build.json`
Expected: both projects pass (`node` and `app`); no type errors; `app/dist` lists `assets build.json icon-192.png icon-512.png index.html manifest.webmanifest sw.js`; `sw.js` starts with `const BUILD = '<14 digits>'` and its `PRECACHE` array contains `"./"`, `"index.html"` and `"assets/..."`; `build.json` holds the same id.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts app
git commit -m "feat(app): scaffold Svelte tablet app with service-worker build"
```

---

### Task 2: QR codec works without `Blob.stream`

The shared QR codec pipes bytes through `Blob.stream()`, which jsdom lacks (and older WebViews may too). `Response` bodies give the same stream everywhere.

**Files:**
- Modify: `shared/src/qr.ts` (`pipeBytes`)
- Test: `app/test/qr-env.test.ts`

**Interfaces:**
- Consumes/Produces: unchanged `encodeRecordQr`, `decodeRecordData`, `QrAssembler` from `@stingr/shared`.

- [ ] **Step 1: Write the failing test**

`app/test/qr-env.test.ts`:

```ts
import { decodeRecordData, encodeRecordQr, type FormKind, QrAssembler } from '@stingr/shared';
import { expect, it } from 'vitest';
import { matchForm, record } from '../../shared/test/fixtures';

it('encodes and decodes QR codes in a browser-like environment', async () => {
  const f = matchForm();
  const r = record(f);
  const [code] = await encodeRecordQr(f, r);
  const res = new QrAssembler().add(code);
  if (res.status !== 'complete') throw new Error('expected one complete code');
  expect(await decodeRecordData(res.data, (kind: FormKind, v: number) => (kind === 'match' && v === 1 ? f : undefined))).toEqual(r);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project app app/test/qr-env.test.ts`
Expected: FAIL — `stream is not a function` (jsdom's `Blob` has no `stream()`).

- [ ] **Step 3: Change `pipeBytes` in `shared/src/qr.ts`**

Replace the existing `pipeBytes` function with:

```ts
async function pipeBytes(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  // A Response body rather than Blob.stream(): it exists everywhere this code runs, including jsdom in tests.
  const stream = new Response(bytes.slice()).body!.pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
```

- [ ] **Step 4: Run all tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS in both projects (the existing `shared/test/qr.test.ts` still passes), no type errors.

- [ ] **Step 5: Commit**

```bash
git add shared/src/qr.ts app/test/qr-env.test.ts
git commit -m "fix(shared): QR compression via Response so it runs without Blob.stream"
```

---

### Task 3: IndexedDB layer

**Files:**
- Create: `app/src/lib/db.ts`
- Test: `app/test/db.test.ts`

**Interfaces:**
- Consumes: `HubConfig`, `RecordRef`, `ScoutRecord`, `Slot` from `@stingr/shared`.
- Produces:
  - `type SyncState = 'pending' | 'synced' | 'rejected'`
  - `interface LocalRecord { id: string; rec: ScoutRecord; sync: SyncState; reason?: string }` — one row per record id, holding its latest local revision
  - `interface LocalPhoto { id: string; recordId: string; mime: string; data: ArrayBuffer; uploaded: boolean; createdAt: string }`
  - `interface Settings { deviceId: string; deviceName: string; defaultSlot: Slot; scout: string }`
  - `interface Draft { rec: ScoutRecord; isEdit: boolean }`
  - `interface KvMap { settings: Settings; config: HubConfig; draft: Draft; extraTeams: number[]; lastSyncAt: string }`
  - `interface StingrDb { getKv<K extends keyof KvMap>(key: K): Promise<KvMap[K] | undefined>; setKv<K extends keyof KvMap>(key: K, value: KvMap[K]): Promise<void>; deleteKv(key: keyof KvMap): Promise<void>; listRecords(): Promise<LocalRecord[]>; putRecord(rec: ScoutRecord): Promise<void>; markSynced(refs: RecordRef[]): Promise<void>; markRejected(ref: RecordRef, reason: string): Promise<void>; listPhotos(): Promise<LocalPhoto[]>; putPhoto(photo: LocalPhoto): Promise<void>; deletePhoto(id: string): Promise<void>; markPhotoUploaded(id: string): Promise<void> }`
  - `openStingrDb(name?: string): Promise<StingrDb>` (default name `'stingr'`)

- [ ] **Step 1: Write the failing tests**

`app/test/db.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchForm, record } from '../../shared/test/fixtures';
import { openStingrDb } from '../src/lib/db';

const fresh = () => openStingrDb(`db-test-${Math.random()}`);

describe('key/value settings', () => {
  it('stores, reads and deletes values', async () => {
    const db = await fresh();
    expect(await db.getKv('lastSyncAt')).toBeUndefined();
    await db.setKv('lastSyncAt', '2027-03-01T10:00:00.000Z');
    expect(await db.getKv('lastSyncAt')).toBe('2027-03-01T10:00:00.000Z');
    await db.deleteKv('lastSyncAt');
    expect(await db.getKv('lastSyncAt')).toBeUndefined();
  });
});

describe('records', () => {
  it('stores a submitted record as pending', async () => {
    const db = await fresh();
    const r = record(matchForm());
    await db.putRecord(r);
    expect(await db.listRecords()).toEqual([{ id: r.id, rec: r, sync: 'pending' }]);
  });

  it('marks a record synced only if the acked revision is still the latest', async () => {
    const db = await fresh();
    const r1 = record(matchForm());
    await db.putRecord(r1);
    await db.putRecord({ ...r1, revision: 2 });
    await db.markSynced([{ id: r1.id, revision: 1 }]);
    expect((await db.listRecords())[0].sync).toBe('pending');
    await db.markSynced([{ id: r1.id, revision: 2 }]);
    expect((await db.listRecords())[0].sync).toBe('synced');
  });

  it('records why the hub rejected a record', async () => {
    const db = await fresh();
    const r = record(matchForm());
    await db.putRecord(r);
    await db.markRejected({ id: r.id, revision: 1 }, 'Unknown match form version 1');
    expect((await db.listRecords())[0]).toMatchObject({ sync: 'rejected', reason: 'Unknown match form version 1' });
  });
});

describe('photos', () => {
  it('stores image bytes and upload state', async () => {
    const db = await fresh();
    const data = new Uint8Array([1, 2, 3]).buffer;
    await db.putPhoto({ id: 'p1', recordId: 'r1', mime: 'image/jpeg', data, uploaded: false, createdAt: 't' });
    const [p] = await db.listPhotos();
    expect(new Uint8Array(p.data)).toEqual(new Uint8Array([1, 2, 3]));
    await db.markPhotoUploaded('p1');
    expect((await db.listPhotos())[0].uploaded).toBe(true);
    await db.deletePhoto('p1');
    expect(await db.listPhotos()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project app app/test/db.test.ts`
Expected: FAIL — cannot resolve `../src/lib/db`.

- [ ] **Step 3: Implement `app/src/lib/db.ts`**

```ts
import type { HubConfig, RecordRef, ScoutRecord, Slot } from '@stingr/shared';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

export type SyncState = 'pending' | 'synced' | 'rejected';
export interface LocalRecord { id: string; rec: ScoutRecord; sync: SyncState; reason?: string }
export interface LocalPhoto { id: string; recordId: string; mime: string; data: ArrayBuffer; uploaded: boolean; createdAt: string }
export interface Settings { deviceId: string; deviceName: string; defaultSlot: Slot; scout: string }
export interface Draft { rec: ScoutRecord; isEdit: boolean }
export interface KvMap { settings: Settings; config: HubConfig; draft: Draft; extraTeams: number[]; lastSyncAt: string }

interface Schema extends DBSchema {
  kv: { key: string; value: unknown };
  records: { key: string; value: LocalRecord };
  photos: { key: string; value: LocalPhoto };
}

export interface StingrDb {
  getKv<K extends keyof KvMap>(key: K): Promise<KvMap[K] | undefined>;
  setKv<K extends keyof KvMap>(key: K, value: KvMap[K]): Promise<void>;
  deleteKv(key: keyof KvMap): Promise<void>;
  listRecords(): Promise<LocalRecord[]>;
  putRecord(rec: ScoutRecord): Promise<void>;
  markSynced(refs: RecordRef[]): Promise<void>;
  markRejected(ref: RecordRef, reason: string): Promise<void>;
  listPhotos(): Promise<LocalPhoto[]>;
  putPhoto(photo: LocalPhoto): Promise<void>;
  deletePhoto(id: string): Promise<void>;
  markPhotoUploaded(id: string): Promise<void>;
}

export async function openStingrDb(name = 'stingr'): Promise<StingrDb> {
  const db = await openDB<Schema>(name, 1, {
    upgrade(d) {
      d.createObjectStore('kv');
      d.createObjectStore('records', { keyPath: 'id' });
      d.createObjectStore('photos', { keyPath: 'id' });
    },
  });
  return wrap(db);
}

function wrap(db: IDBPDatabase<Schema>): StingrDb {
  return {
    async getKv(key) {
      return (await db.get('kv', key)) as never;
    },
    async setKv(key, value) {
      await db.put('kv', value, key);
    },
    async deleteKv(key) {
      await db.delete('kv', key);
    },
    listRecords: () => db.getAll('records'),
    async putRecord(rec) {
      await db.put('records', { id: rec.id, rec, sync: 'pending' });
    },
    async markSynced(refs) {
      const tx = db.transaction('records', 'readwrite');
      for (const ref of refs) {
        const row = await tx.store.get(ref.id);
        // An edit may have replaced the revision the hub just acknowledged; that newer one is still unsynced.
        if (row && row.rec.revision === ref.revision) await tx.store.put({ id: row.id, rec: row.rec, sync: 'synced' });
      }
      await tx.done;
    },
    async markRejected(ref, reason) {
      const row = await db.get('records', ref.id);
      if (row && row.rec.revision === ref.revision) await db.put('records', { ...row, sync: 'rejected', reason });
    },
    listPhotos: () => db.getAll('photos'),
    async putPhoto(photo) {
      await db.put('photos', photo);
    },
    async deletePhoto(id) {
      await db.delete('photos', id);
    },
    async markPhotoUploaded(id) {
      const p = await db.get('photos', id);
      if (p) await db.put('photos', { ...p, uploaded: true });
    },
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run --project app && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/db.ts app/test/db.test.ts
git commit -m "feat(app): IndexedDB storage for settings, records and photos"
```

---

### Task 4: Session helpers

**Files:**
- Create: `app/src/lib/session.ts`
- Test: `app/test/session.test.ts`

**Interfaces:**
- Consumes: `compareMatchKeys`, `matchLabel`, `parseMatchKey`, `SLOTS` and types from `@stingr/shared`.
- Produces:
  - `slotLabel(slot: Slot): string` — `'red2'` → `'Red 2'`
  - `latestForm(forms: FormDef[], kind: FormKind): FormDef | null`
  - `formVersion(forms: FormDef[], kind: FormKind, version: number): FormDef | null`
  - `teamFor(schedule: ScheduleMatch[], matchKey: string, slot: Slot): number | null` — `null` when the match is unknown or the slot's team is 0
  - `nextMatchKey(schedule: ScheduleMatch[], records: ScoutRecord[]): string` — the first scheduled match after the latest match this tablet has a record for; with no schedule, the next qual number
  - `pitStatus(records: ScoutRecord[], team: number): 'none' | 'done' | 'noshow'`
  - `pitTeams(configTeams: number[], extra: number[], records: ScoutRecord[]): number[]`
  - `recordTitle(rec: ScoutRecord): string` — `'Qual 1 · Red 1 · Team 5098'` or `'Pit · Team 5098'`
  - `parseTeamInput(text: string): number | null`

- [ ] **Step 1: Write the failing tests**

`app/test/session.test.ts`:

```ts
import { markNoShow, type ScheduleMatch } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../shared/test/fixtures';
import {
  formVersion, latestForm, nextMatchKey, parseTeamInput, pitStatus, pitTeams, recordTitle, slotLabel, teamFor,
} from '../src/lib/session';

const schedule: ScheduleMatch[] = [
  { matchKey: 'qm2', red: [7, 8, 9], blue: [10, 11, 12] },
  { matchKey: 'qm1', red: [5098, 0, 3], blue: [4, 5, 6] },
  { matchKey: 'qm10', red: [1, 2, 3], blue: [4, 5, 6] },
];
const NOW = '2027-03-01T11:00:00.000Z';

describe('slots and teams', () => {
  it('labels slots', () => {
    expect(slotLabel('red2')).toBe('Red 2');
    expect(slotLabel('blue3')).toBe('Blue 3');
  });
  it('finds the scheduled team for a slot', () => {
    expect(teamFor(schedule, 'qm1', 'red1')).toBe(5098);
    expect(teamFor(schedule, 'qm1', 'blue2')).toBe(5);
    expect(teamFor(schedule, 'qm1', 'red2')).toBeNull(); // team 0 = unknown
    expect(teamFor(schedule, 'qm9', 'red1')).toBeNull();
  });
  it('parses typed team numbers', () => {
    expect(parseTeamInput(' frc254 ')).toBe(254);
    expect(parseTeamInput('5098')).toBe(5098);
    expect(parseTeamInput('0')).toBeNull();
    expect(parseTeamInput('abc')).toBeNull();
    expect(parseTeamInput('')).toBeNull();
  });
});

describe('nextMatchKey', () => {
  const at = (matchKey: string) => record(matchForm(), { matchKey });
  it('starts at the first scheduled match', () => {
    expect(nextMatchKey(schedule, [])).toBe('qm1');
  });
  it('moves past the latest match this tablet scouted, in match order', () => {
    expect(nextMatchKey(schedule, [at('qm1')])).toBe('qm2');
    expect(nextMatchKey(schedule, [at('qm1'), at('qm2')])).toBe('qm10');
    expect(nextMatchKey(schedule, [at('qm10')])).toBe('qm10');
  });
  it('counts up without a schedule', () => {
    expect(nextMatchKey([], [])).toBe('qm1');
    expect(nextMatchKey([], [at('qm7')])).toBe('qm8');
  });
  it('ignores pit records', () => {
    expect(nextMatchKey(schedule, [record(pitForm())])).toBe('qm1');
  });
});

describe('forms', () => {
  it('picks the latest or a specific version', () => {
    const forms = [matchForm(1), matchForm(3), pitForm(1)];
    expect(latestForm(forms, 'match')?.version).toBe(3);
    expect(latestForm(forms, 'pit')?.version).toBe(1);
    expect(latestForm([], 'pit')).toBeNull();
    expect(formVersion(forms, 'match', 1)?.version).toBe(1);
    expect(formVersion(forms, 'match', 2)).toBeNull();
  });
});

describe('pit scouting', () => {
  it("reports each team's pit status", () => {
    const recs = [record(pitForm(), { team: 1 }), markNoShow(record(pitForm(), { team: 2 }), NOW)];
    expect(pitStatus(recs, 1)).toBe('done');
    expect(pitStatus(recs, 2)).toBe('noshow');
    expect(pitStatus(recs, 3)).toBe('none');
  });
  it('lists event, added and already-scouted teams once each', () => {
    expect(pitTeams([3, 1], [9, 1], [record(pitForm(), { team: 7 })])).toEqual([1, 3, 7, 9]);
  });
});

describe('recordTitle', () => {
  it('describes match and pit records', () => {
    expect(recordTitle(record(matchForm()))).toBe('Qual 1 · Red 1 · Team 5098');
    expect(recordTitle(record(pitForm()))).toBe('Pit · Team 5098');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project app app/test/session.test.ts`
Expected: FAIL — cannot resolve `../src/lib/session`.

- [ ] **Step 3: Implement `app/src/lib/session.ts`**

```ts
import {
  compareMatchKeys, type FormDef, type FormKind, matchLabel, parseMatchKey, type ScheduleMatch,
  type ScoutRecord, type Slot, SLOTS,
} from '@stingr/shared';

export function slotLabel(slot: Slot): string {
  return `${slot.startsWith('red') ? 'Red' : 'Blue'} ${slot.slice(-1)}`;
}

export function latestForm(forms: FormDef[], kind: FormKind): FormDef | null {
  return forms.filter(f => f.kind === kind).reduce<FormDef | null>((best, f) => (!best || f.version > best.version ? f : best), null);
}

export function formVersion(forms: FormDef[], kind: FormKind, version: number): FormDef | null {
  return forms.find(f => f.kind === kind && f.version === version) ?? null;
}

export function teamFor(schedule: ScheduleMatch[], matchKey: string, slot: Slot): number | null {
  const m = schedule.find(x => x.matchKey === matchKey);
  if (!m) return null;
  const i = SLOTS.indexOf(slot);
  const team = i < 3 ? m.red[i] : m.blue[i - 3];
  return team > 0 ? team : null;
}

export function nextMatchKey(schedule: ScheduleMatch[], records: ScoutRecord[]): string {
  const done = records
    .filter(r => r.kind === 'match' && r.matchKey)
    .map(r => r.matchKey as string)
    .sort(compareMatchKeys);
  const last = done.at(-1);
  const keys = schedule.map(m => m.matchKey).sort(compareMatchKeys);
  if (keys.length) {
    if (!last) return keys[0];
    return keys.find(k => compareMatchKeys(k, last) > 0) ?? keys[keys.length - 1];
  }
  if (!last) return 'qm1';
  const p = parseMatchKey(last);
  return p?.level === 'qm' ? `qm${p.match + 1}` : last;
}

export function pitStatus(records: ScoutRecord[], team: number): 'none' | 'done' | 'noshow' {
  const recs = records.filter(r => r.kind === 'pit' && r.team === team);
  if (recs.length === 0) return 'none';
  return recs.some(r => !r.noShow) ? 'done' : 'noshow';
}

export function pitTeams(configTeams: number[], extra: number[], records: ScoutRecord[]): number[] {
  const pit = records.filter(r => r.kind === 'pit').map(r => r.team);
  return [...new Set([...configTeams, ...extra, ...pit])].sort((a, b) => a - b);
}

export function recordTitle(rec: ScoutRecord): string {
  if (rec.kind === 'pit') return `Pit · Team ${rec.team}`;
  return `${matchLabel(rec.matchKey ?? '')} · ${rec.slot ? slotLabel(rec.slot) : '?'} · Team ${rec.team}`;
}

export function parseTeamInput(text: string): number | null {
  const s = text.trim().replace(/^frc/i, '');
  if (!/^\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run --project app && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/session.ts app/test/session.test.ts
git commit -m "feat(app): session helpers for matches, teams, forms and pit status"
```

---

### Task 5: Sync engine

**Files:**
- Create: `app/src/lib/sync.ts`, `app/test/helpers.ts`
- Test: `app/test/sync.test.ts`

**Interfaces:**
- Consumes: `StingrDb` (Task 3); `HubConfig`, `ScoutRecord`, `SyncResponse` from `@stingr/shared`; hub API `/api/ping`, `/api/sync`, `/api/photos/:id?recordId=`.
- Produces:
  - `interface SyncProgress { done: number; total: number }`
  - `interface SyncResult { acked: number; rejected: number; photos: number; config: HubConfig }`
  - `interface SyncDeps { db: StingrDb; fetch: typeof fetch; device: { id: string; name: string }; now: () => string }`
  - `BATCH = 25`
  - `pingHub(fetchImpl: typeof fetch, timeoutMs?: number): Promise<{ appBuild: string } | null>`
  - `runSync(deps: SyncDeps, onProgress?: (p: SyncProgress) => void): Promise<SyncResult>` — sends every record not yet `synced` (rejected ones are retried), stores the hub config and `lastSyncAt`, then uploads every un-uploaded photo whose record is synced. Throws `Error` with a readable message; anything not acknowledged stays queued.
  - Test helper `CONFIG: HubConfig` in `app/test/helpers.ts` (event `2027test` "Test Event"; forms `matchForm()`, `pitForm()`; schedule `qm1` red `[5098, 0, 3]` blue `[4, 5, 6]`, `qm2` red `[7, 8, 9]` blue `[10, 11, 12]`; appBuild `hub-build`).

- [ ] **Step 1: Write the test helper and the failing tests**

`app/test/helpers.ts`:

```ts
import type { HubConfig } from '@stingr/shared';
import { matchForm, pitForm } from '../../shared/test/fixtures';

export const CONFIG: HubConfig = {
  event: { key: '2027test', name: 'Test Event' },
  forms: [matchForm(), pitForm()],
  schedule: [
    { matchKey: 'qm1', red: [5098, 0, 3], blue: [4, 5, 6] },
    { matchKey: 'qm2', red: [7, 8, 9], blue: [10, 11, 12] },
  ],
  teams: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 5098],
  appBuild: 'hub-build',
};
```

`app/test/sync.test.ts`:

```ts
import type { SyncRequest, SyncResponse } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { matchForm, pitForm, record } from '../../shared/test/fixtures';
import { openStingrDb, type StingrDb } from '../src/lib/db';
import { pingHub, runSync, type SyncProgress } from '../src/lib/sync';
import { CONFIG } from './helpers';

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function fakeHub(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const posted = (init?: RequestInit) => JSON.parse(String(init?.body)) as SyncRequest;

/** A hub that acknowledges every record except the ids in `reject`, and accepts photos. */
function okHub(reject: string[] = [], photo: Handler = () => new Response(null, { status: 204 })) {
  return fakeHub((url, init) => {
    if (url === '/api/sync') {
      const req = posted(init);
      const res: SyncResponse = {
        acked: req.records.filter(r => !reject.includes(r.id)).map(r => ({ id: r.id, revision: r.revision })),
        rejected: req.records.filter(r => reject.includes(r.id)).map(r => ({ id: r.id, revision: r.revision, reason: 'Unknown match form version 1' })),
        wantedPhotoIds: [],
        config: CONFIG,
      };
      return json(res);
    }
    if (url.startsWith('/api/photos/')) return photo(url, init);
    return json({ error: 'not found' }, 404);
  });
}

const device = { id: 'dev-1', name: 'Tablet 1' };
const NOW = '2027-03-01T12:00:00.000Z';
const fresh = () => openStingrDb(`sync-test-${Math.random()}`);
const deps = (db: StingrDb, fetchImpl: typeof fetch) => ({ db, fetch: fetchImpl, device, now: () => NOW });
const sorted = (ids: string[]) => [...ids].sort();

describe('pingHub', () => {
  it('returns the hub build id', async () => {
    expect(await pingHub(fakeHub(() => json({ hub: 'stingr-scout', appBuild: 'b7' })).fetchImpl)).toEqual({ appBuild: 'b7' });
  });
  it('returns null when the hub is unreachable or is not a Stingr hub', async () => {
    expect(await pingHub((async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch)).toBeNull();
    expect(await pingHub(fakeHub(() => json({ hub: 'something-else' })).fetchImpl)).toBeNull();
    expect(await pingHub(fakeHub(() => json({}, 500)).fetchImpl)).toBeNull();
  });
});

describe('runSync', () => {
  it('sends unsynced records, marks them synced and stores the hub config', async () => {
    const db = await fresh();
    const a = record(matchForm());
    const b = record(matchForm(), { slot: 'blue1' });
    const c = record(matchForm(), { slot: 'red3' });
    for (const r of [a, b, c]) await db.putRecord(r);
    await db.markSynced([{ id: c.id, revision: 1 }]);
    const hub = okHub();
    const progress: SyncProgress[] = [];

    const result = await runSync(deps(db, hub.fetchImpl), p => progress.push(p));

    const req = posted(hub.calls[0].init);
    expect(req.device).toEqual(device);
    expect(sorted(req.records.map(r => r.id))).toEqual(sorted([a.id, b.id]));
    expect((await db.listRecords()).every(r => r.sync === 'synced')).toBe(true);
    expect(await db.getKv('config')).toEqual(CONFIG);
    expect(await db.getKv('lastSyncAt')).toBe(NOW);
    expect(result).toEqual({ acked: 2, rejected: 0, photos: 0, config: CONFIG });
    expect(progress).toEqual([{ done: 0, total: 1 }, { done: 1, total: 1 }]);
  });

  it('still fetches the hub config when nothing is waiting', async () => {
    const db = await fresh();
    const hub = okHub();
    await runSync(deps(db, hub.fetchImpl));
    expect(hub.calls).toHaveLength(1);
    expect(posted(hub.calls[0].init).records).toEqual([]);
    expect(await db.getKv('config')).toEqual(CONFIG);
  });

  it('sends records in batches', async () => {
    const db = await fresh();
    for (let i = 0; i < 30; i++) await db.putRecord(record(matchForm()));
    const hub = okHub();
    await runSync(deps(db, hub.fetchImpl));
    expect(hub.calls.map(c => posted(c.init).records.length)).toEqual([25, 5]);
  });

  it('marks rejected records and tries them again next time', async () => {
    const db = await fresh();
    const a = record(matchForm());
    await db.putRecord(a);
    const first = await runSync(deps(db, okHub([a.id]).fetchImpl));
    expect(first.rejected).toBe(1);
    expect((await db.listRecords())[0]).toMatchObject({ sync: 'rejected', reason: 'Unknown match form version 1' });
    const hub = okHub();
    await runSync(deps(db, hub.fetchImpl));
    expect(posted(hub.calls[0].init).records.map(r => r.id)).toEqual([a.id]);
    expect((await db.listRecords())[0].sync).toBe('synced');
  });

  it('uploads photos of synced records and holds back the rest', async () => {
    const db = await fresh();
    const kept = record(pitForm(), { photoIds: ['p1'] });
    const refused = record(pitForm(), { team: 254, photoIds: ['p2'] });
    await db.putRecord(kept);
    await db.putRecord(refused);
    await db.putPhoto({ id: 'p1', recordId: kept.id, mime: 'image/jpeg', data: new Uint8Array([1, 2]).buffer, uploaded: false, createdAt: NOW });
    await db.putPhoto({ id: 'p2', recordId: refused.id, mime: 'image/jpeg', data: new Uint8Array([3]).buffer, uploaded: false, createdAt: NOW });
    const hub = okHub([refused.id]);

    const result = await runSync(deps(db, hub.fetchImpl));

    const puts = hub.calls.filter(c => c.init?.method === 'PUT');
    expect(puts.map(c => c.url)).toEqual([`/api/photos/p1?recordId=${kept.id}`]);
    expect(new Headers(puts[0].init?.headers).get('content-type')).toBe('image/jpeg');
    expect(result.photos).toBe(1);
    const photos = await db.listPhotos();
    expect(photos.find(p => p.id === 'p1')?.uploaded).toBe(true);
    expect(photos.find(p => p.id === 'p2')?.uploaded).toBe(false);
  });

  it('keeps photos queued when the connection drops mid-upload', async () => {
    const db = await fresh();
    const pit = record(pitForm(), { photoIds: ['p1', 'p2'] });
    await db.putRecord(pit);
    for (const id of ['p1', 'p2']) {
      await db.putPhoto({ id, recordId: pit.id, mime: 'image/jpeg', data: new Uint8Array([1]).buffer, uploaded: false, createdAt: NOW });
    }
    let puts = 0;
    const hub = okHub([], () => {
      puts++;
      if (puts === 2) throw new TypeError('Failed to fetch');
      return new Response(null, { status: 204 });
    });
    await expect(runSync(deps(db, hub.fetchImpl))).rejects.toThrow('Lost the connection to the hub');
    const photos = await db.listPhotos();
    expect(photos.find(p => p.id === 'p1')?.uploaded).toBe(true);
    expect(photos.find(p => p.id === 'p2')?.uploaded).toBe(false);
    expect((await db.listRecords())[0].sync).toBe('synced');
  });

  it("reports the hub's error message and leaves records waiting", async () => {
    const db = await fresh();
    await db.putRecord(record(matchForm()));
    const hub = fakeHub(() => json({ error: 'Disk full' }, 500));
    await expect(runSync(deps(db, hub.fetchImpl))).rejects.toThrow('Disk full');
    expect((await db.listRecords())[0].sync).toBe('pending');
  });

  it('explains a dropped connection', async () => {
    const db = await fresh();
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    await expect(runSync(deps(db, offline))).rejects.toThrow('Lost the connection to the hub');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project app app/test/sync.test.ts`
Expected: FAIL — cannot resolve `../src/lib/sync`.

- [ ] **Step 3: Implement `app/src/lib/sync.ts`**

```ts
import type { HubConfig, ScoutRecord, SyncResponse } from '@stingr/shared';
import type { StingrDb } from './db';

export interface SyncProgress { done: number; total: number }
export interface SyncResult { acked: number; rejected: number; photos: number; config: HubConfig }
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
  const waiting = (await db.listRecords()).filter(r => r.sync !== 'synced').map(r => r.rec);
  const batches: ScoutRecord[][] = [];
  for (let i = 0; i < waiting.length; i += BATCH) batches.push(waiting.slice(i, i + BATCH));
  if (batches.length === 0) batches.push([]); // still fetch the latest forms and schedule
  const photos = (await db.listPhotos()).filter(p => !p.uploaded);
  const progress: SyncProgress = { done: 0, total: batches.length + photos.length };
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
    progress.done++;
    onProgress({ ...progress });
  }
  if (config) await db.setKv('config', config);
  await db.setKv('lastSyncAt', deps.now());

  // Upload every waiting photo whose record the hub now has. PUT is idempotent on the hub.
  const synced = new Set((await db.listRecords()).filter(r => r.sync === 'synced').map(r => r.id));
  let uploaded = 0;
  for (const p of photos) {
    if (synced.has(p.recordId)) {
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
  return { acked, rejected, photos: uploaded, config: config as HubConfig };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run --project app && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/sync.ts app/test/helpers.ts app/test/sync.test.ts
git commit -m "feat(app): sync engine for records, photos and hub config"
```

---

### Task 6: Sync controller (connection state machine)

**Files:**
- Create: `app/src/lib/syncController.ts`
- Test: `app/test/syncController.test.ts`

**Interfaces:**
- Consumes: `SyncProgress`, `SyncResult` (Task 5).
- Produces:
  - `type SyncPhase = 'offline' | 'syncing' | 'done' | 'error'`
  - `interface SyncView { phase: SyncPhase; progress: SyncProgress; error: string | null; overlay: boolean; hubBuild: string | null }`
  - `interface SyncHandle { readonly view: SyncView; subscribe(listener: (view: SyncView) => void): () => void; retry(): Promise<void>; dismiss(): void }`
  - `interface SyncControllerDeps { ping(): Promise<{ appBuild: string } | null>; sync(onProgress: (p: SyncProgress) => void): Promise<SyncResult>; hasPending(): Promise<boolean>; onSynced(result: SyncResult): void | Promise<void> }`
  - `class SyncController implements SyncHandle { constructor(deps: SyncControllerDeps); tick(): Promise<void>; start(intervalMs?: number): void; stop(): void }`
  - Behavior (spec §5.4): syncs when the hub appears; after a sync the overlay stays on "done" until dismissed or the hub disappears; while connected it syncs again only when new records are pending; on error it waits for `retry()`; polls never overlap.

- [ ] **Step 1: Write the failing tests**

`app/test/syncController.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SyncResult } from '../src/lib/sync';
import { SyncController, type SyncControllerDeps, type SyncView } from '../src/lib/syncController';
import { CONFIG } from './helpers';

const RESULT: SyncResult = { acked: 1, rejected: 0, photos: 0, config: CONFIG };

function setup(syncImpl?: SyncControllerDeps['sync']) {
  const state = { online: true, pending: false };
  const sync = vi.fn<SyncControllerDeps['sync']>(syncImpl ?? (async onProgress => {
    onProgress({ done: 1, total: 1 });
    return RESULT;
  }));
  const onSynced = vi.fn();
  const c = new SyncController({
    ping: async () => (state.online ? { appBuild: 'b1' } : null),
    sync,
    hasPending: async () => state.pending,
    onSynced,
  });
  const views: SyncView[] = [];
  c.subscribe(v => views.push(v));
  return { c, state, sync, onSynced, views };
}

describe('SyncController', () => {
  it('syncs when the hub appears and then says it is safe to unplug', async () => {
    const { c, sync, onSynced, views } = setup();
    await c.tick();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(onSynced).toHaveBeenCalledWith(RESULT);
    expect(views.some(v => v.phase === 'syncing' && v.overlay && v.progress.done === 1)).toBe(true);
    expect(c.view).toMatchObject({ phase: 'done', overlay: true, hubBuild: 'b1', error: null });
  });

  it('stays put while connected unless new records are waiting', async () => {
    const { c, state, sync } = setup();
    await c.tick();
    await c.tick();
    expect(sync).toHaveBeenCalledTimes(1);
    state.pending = true;
    await c.tick();
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('clears the overlay when unplugged and syncs again on the next plug-in', async () => {
    const { c, state, sync } = setup();
    await c.tick();
    state.online = false;
    await c.tick();
    expect(c.view).toMatchObject({ phase: 'offline', overlay: false });
    state.online = true;
    await c.tick();
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('shows an error and waits for Retry', async () => {
    const s = setup(async () => { throw new Error('Disk full'); });
    await s.c.tick();
    expect(s.c.view).toMatchObject({ phase: 'error', overlay: true, error: 'Disk full' });
    await s.c.tick();
    expect(s.sync).toHaveBeenCalledTimes(1);
    await s.c.retry();
    expect(s.sync).toHaveBeenCalledTimes(2);
  });

  it('lets the scout dismiss the finished overlay', async () => {
    const { c } = setup();
    await c.tick();
    c.dismiss();
    expect(c.view).toMatchObject({ phase: 'done', overlay: false });
  });

  it('never runs two polls at once', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const s = setup(async () => { await gate; return RESULT; });
    const first = s.c.tick();
    await s.c.tick();
    release();
    await first;
    expect(s.sync).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project app app/test/syncController.test.ts`
Expected: FAIL — cannot resolve `../src/lib/syncController`.

- [ ] **Step 3: Implement `app/src/lib/syncController.ts`**

```ts
import type { SyncProgress, SyncResult } from './sync';

export type SyncPhase = 'offline' | 'syncing' | 'done' | 'error';

export interface SyncView {
  phase: SyncPhase;
  progress: SyncProgress;
  error: string | null;
  overlay: boolean;
  hubBuild: string | null;
}

export interface SyncHandle {
  readonly view: SyncView;
  subscribe(listener: (view: SyncView) => void): () => void;
  retry(): Promise<void>;
  dismiss(): void;
}

export interface SyncControllerDeps {
  ping(): Promise<{ appBuild: string } | null>;
  sync(onProgress: (p: SyncProgress) => void): Promise<SyncResult>;
  hasPending(): Promise<boolean>;
  onSynced(result: SyncResult): void | Promise<void>;
}

export class SyncController implements SyncHandle {
  view: SyncView = { phase: 'offline', progress: { done: 0, total: 0 }, error: null, overlay: false, hubBuild: null };
  private readonly deps: SyncControllerDeps;
  private readonly listeners = new Set<(view: SyncView) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(deps: SyncControllerDeps) {
    this.deps = deps;
  }

  subscribe(listener: (view: SyncView) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** One poll: notice the hub arriving or leaving, and sync when appropriate. */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const hub = await this.deps.ping();
      if (!hub) {
        if (this.view.phase !== 'offline' || this.view.overlay) this.set({ phase: 'offline', overlay: false, error: null });
        return;
      }
      if (hub.appBuild !== this.view.hubBuild) this.set({ hubBuild: hub.appBuild });
      if (this.view.phase === 'offline' || (this.view.phase === 'done' && (await this.deps.hasPending()))) await this.run();
    } finally {
      this.busy = false;
    }
  }

  async retry(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.run();
    } finally {
      this.busy = false;
    }
  }

  dismiss(): void {
    if (this.view.phase !== 'syncing') this.set({ overlay: false });
  }

  start(intervalMs = 3000): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private set(patch: Partial<SyncView>): void {
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener(this.view);
  }

  private async run(): Promise<void> {
    this.set({ phase: 'syncing', overlay: true, error: null, progress: { done: 0, total: 0 } });
    try {
      const result = await this.deps.sync(p => this.set({ progress: p }));
      await this.deps.onSynced(result);
      this.set({ phase: 'done' });
    } catch (e) {
      this.set({ phase: 'error', error: (e as Error).message });
    }
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run --project app && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/syncController.ts app/test/syncController.test.ts
git commit -m "feat(app): sync state machine behind the sync overlay"
```

---

### Task 7: App store — state and every scouting action

**Files:**
- Create: `app/src/lib/store.svelte.ts`
- Modify: `app/test/helpers.ts` (add `makeStore`)
- Test: `app/test/store.test.ts`

**Interfaces:**
- Consumes: `StingrDb`, `Draft`, `LocalPhoto`, `LocalRecord`, `Settings` (Task 3); `latestForm`, `formVersion` (Task 4); shared `newRecord`, `finalizeSubmit`, `markNoShow`, `reviseRecord`, `undoNoShow`.
- Produces:
  - `type Screen = { name: 'setup' } | { name: 'home' } | { name: 'form' } | { name: 'pit' } | { name: 'records' } | { name: 'qr'; id: string } | { name: 'settings' }`
  - `interface StoreDeps { db: StingrDb; now?: () => string; newId?: () => string }`
  - `interface MatchStart { matchKey: string; slot: Slot; team: number }`
  - `class AppStore` with reactive fields `settings: Settings`, `config: HubConfig | null`, `records: LocalRecord[]`, `photos: LocalPhoto[]`, `draft: Draft | null`, `extraTeams: number[]`, `screen: Screen`; `readonly db: StingrDb`; getters `event: EventInfo | null`, `eventRecords: ScoutRecord[]`, `pendingCount: number`; methods `load()`, `reload()`, `form(kind): FormDef | null`, `formOf(rec): FormDef | null`, `go(screen)`, `saveSettings(patch)`, `addExtraTeam(team)`, `startMatch(p: MatchStart)`, `matchNoShow(p: MatchStart)`, `startPit(team)`, `pitNoShow(team)`, `updateDraft(rec)`, `submitDraft()`, `discardDraft()`, `editRecord(id)`, `undoNoShow(id)`, `addPhoto(data: ArrayBuffer, mime: string)`, `removePhoto(id)` — all async except getters, `form`, `formOf`, `go`.
  - `load()` shows `setup` when the tablet has no name, otherwise reopens an unfinished draft (`form`) or `home`.
  - Test helper `makeStore(opts?: { config?: HubConfig | null; settings?: Partial<Settings> }): Promise<{ store: AppStore; db: StingrDb }>` — fresh DB, settings `{ deviceId: 'dev-1', deviceName: 'Tablet 1', defaultSlot: 'red1', scout: 'Ada' }`, `CONFIG` (unless `config: null`), clock `2027-03-01T10:00:00.000Z`, ids `id-1`, `id-2`, …

- [ ] **Step 1: Add `makeStore` to the test helpers**

`app/test/helpers.ts` (full file):

```ts
import type { HubConfig } from '@stingr/shared';
import { matchForm, pitForm } from '../../shared/test/fixtures';
import { openStingrDb, type Settings, type StingrDb } from '../src/lib/db';
import { AppStore } from '../src/lib/store.svelte';

export const CONFIG: HubConfig = {
  event: { key: '2027test', name: 'Test Event' },
  forms: [matchForm(), pitForm()],
  schedule: [
    { matchKey: 'qm1', red: [5098, 0, 3], blue: [4, 5, 6] },
    { matchKey: 'qm2', red: [7, 8, 9], blue: [10, 11, 12] },
  ],
  teams: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 5098],
  appBuild: 'hub-build',
};

let dbCount = 0;

export async function makeStore(opts: { config?: HubConfig | null; settings?: Partial<Settings> } = {}): Promise<{ store: AppStore; db: StingrDb }> {
  const db = await openStingrDb(`store-test-${++dbCount}-${Math.random()}`);
  const config = opts.config === undefined ? CONFIG : opts.config;
  if (config) await db.setKv('config', structuredClone(config));
  await db.setKv('settings', { deviceId: 'dev-1', deviceName: 'Tablet 1', defaultSlot: 'red1', scout: 'Ada', ...opts.settings });
  let id = 0;
  const store = new AppStore({ db, now: () => '2027-03-01T10:00:00.000Z', newId: () => `id-${++id}` });
  await store.load();
  return { store, db };
}
```

- [ ] **Step 2: Write the failing tests**

`app/test/store.test.ts`:

```ts
import { setAnswer } from '@stingr/shared';
import { describe, expect, it } from 'vitest';
import { openStingrDb } from '../src/lib/db';
import { AppStore } from '../src/lib/store.svelte';
import { makeStore } from './helpers';

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

  it('remembers teams added by hand', async () => {
    const { store, db } = await makeStore();
    await store.addExtraTeam(254);
    await store.addExtraTeam(254);
    expect(store.extraTeams).toEqual([254]);
    expect(await db.getKv('extraTeams')).toEqual([254]);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run --project app app/test/store.test.ts`
Expected: FAIL — cannot resolve `../src/lib/store.svelte`.

- [ ] **Step 4: Implement `app/src/lib/store.svelte.ts`**

```ts
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
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run --project app && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/store.svelte.ts app/test/helpers.ts app/test/store.test.ts
git commit -m "feat(app): reactive store with drafts, submit, no-shows, edits and photos"
```

---

### Task 8: Question components, question card and confirm dialog

**Files:**
- Create: `app/src/lib/fieldmap.ts`, `app/src/components/ConfirmDialog.svelte`, `app/src/components/QuestionCard.svelte`, `app/src/components/questions/{Counter,Toggle,Choice,Multi,NumberField,TextField,Rating,Timer,FieldMap}.svelte`
- Test: `app/test/questions.test.ts`

**Interfaces:**
- Consumes: question types, `toCanonical`, `toDisplay` from `@stingr/shared`.
- Produces:
  - `tapToPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Point` — normalized 0..1, clamped, 3 decimals
  - Every question component takes props `{ question: <its question type>; value: AnswerValue; onchange: (v: AnswerValue) => void }`; `FieldMap` also takes `slot?: Slot` and `image?: string`. Components are controlled: they never store the answer themselves.
  - Value rules: counter → number (starts at `default`); toggle → boolean; choice → option value or `null` (tapping the selected option clears it); multi → `string[]`; number → number or `null` when blank; text → string; rating → 1..max or `null` (tap again clears); timer → seconds rounded to 0.1 or `null` after Reset; fieldmap → `Point[]` in canonical (blue-side) coordinates.
  - `QuestionCard` props `{ question: Question; value: AnswerValue; missed: boolean; onchange(v); onmissed(missed: boolean); slot?: Slot; assets: Record<string, string> }`; it is a `<section aria-label={label}>` (role "region") with an "I missed this" / "Undo" button.
  - `ConfirmDialog` props `{ title: string; confirmLabel?: string; cancelLabel?: string; onconfirm(): void; oncancel(): void; children?: Snippet }`.

- [ ] **Step 1: Write the failing tests**

`app/test/questions.test.ts`:

```ts
import type {
  ChoiceQuestion, CounterQuestion, FieldMapQuestion, MultiQuestion, NumberQuestion, RatingQuestion,
  TextQuestion, TimerQuestion, ToggleQuestion,
} from '@stingr/shared';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfirmDialog from '../src/components/ConfirmDialog.svelte';
import QuestionCard from '../src/components/QuestionCard.svelte';
import Choice from '../src/components/questions/Choice.svelte';
import Counter from '../src/components/questions/Counter.svelte';
import FieldMap from '../src/components/questions/FieldMap.svelte';
import Multi from '../src/components/questions/Multi.svelte';
import NumberField from '../src/components/questions/NumberField.svelte';
import Rating from '../src/components/questions/Rating.svelte';
import TextField from '../src/components/questions/TextField.svelte';
import Timer from '../src/components/questions/Timer.svelte';
import Toggle from '../src/components/questions/Toggle.svelte';
import { tapToPoint } from '../src/lib/fieldmap';

const counter: CounterQuestion = { key: 'coral', label: 'Coral scored', type: 'counter', required: true, min: 0, max: 3, step: 1, default: 0 };
const toggle: ToggleQuestion = { key: 'leave', label: 'Left zone', type: 'toggle', required: true, default: false };
const choice: ChoiceQuestion = { key: 'climb', label: 'Climb', type: 'choice', required: true, display: 'buttons', options: [{ value: 'none', label: 'None' }, { value: 'deep', label: 'Deep' }] };
const dropdown: ChoiceQuestion = { ...choice, key: 'drive', label: 'Drivetrain', display: 'dropdown', options: [{ value: 'swerve', label: 'Swerve' }, { value: 'tank', label: 'Tank' }] };
const multi: MultiQuestion = { key: 'zones', label: 'Zones', type: 'multi', required: false, options: [{ value: 'near', label: 'Near' }, { value: 'far', label: 'Far' }] };
const number: NumberQuestion = { key: 'weight', label: 'Weight', type: 'number', required: false, integer: false, min: 0, max: 200 };
const text: TextQuestion = { key: 'notes', label: 'Notes', type: 'text', required: false, multiline: true };
const rating: RatingQuestion = { key: 'defense', label: 'Defense', type: 'rating', required: false, max: 5 };
const timer: TimerQuestion = { key: 'climb_time', label: 'Climb time', type: 'timer', required: false };
const map: FieldMapQuestion = { key: 'start', label: 'Start', type: 'fieldmap', required: false, assetId: 'field', maxPoints: 2, mirrorForRed: true };

const stubRect = (el: Element) => {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
};

describe('Counter', () => {
  it('steps within its limits', async () => {
    const onchange = vi.fn();
    render(Counter, { question: counter, value: 3, onchange });
    expect(screen.getByLabelText('value').textContent).toBe('3');
    expect((screen.getByLabelText('plus') as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(screen.getByLabelText('minus'));
    expect(onchange).toHaveBeenCalledWith(2);
  });
  it('starts from its default', async () => {
    const onchange = vi.fn();
    render(Counter, { question: counter, value: null, onchange });
    expect(screen.getByLabelText('value').textContent).toBe('0');
    expect((screen.getByLabelText('minus') as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(screen.getByLabelText('plus'));
    expect(onchange).toHaveBeenCalledWith(1);
  });
});

describe('Toggle', () => {
  it('shows and sets yes or no', async () => {
    const onchange = vi.fn();
    render(Toggle, { question: toggle, value: false, onchange });
    expect(screen.getByRole('button', { name: 'No' }).getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onchange).toHaveBeenCalledWith(true);
  });
});

describe('Choice', () => {
  it('picks an option and clears it when tapped again', async () => {
    const onchange = vi.fn();
    render(Choice, { question: choice, value: 'deep', onchange });
    expect(screen.getByRole('button', { name: 'Deep' }).getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(onchange).toHaveBeenLastCalledWith('none');
    await fireEvent.click(screen.getByRole('button', { name: 'Deep' }));
    expect(onchange).toHaveBeenLastCalledWith(null);
  });
  it('can be a dropdown', async () => {
    const onchange = vi.fn();
    render(Choice, { question: dropdown, value: null, onchange });
    const select = screen.getByLabelText('Drivetrain');
    await fireEvent.change(select, { target: { value: 'tank' } });
    expect(onchange).toHaveBeenLastCalledWith('tank');
    await fireEvent.change(select, { target: { value: '' } });
    expect(onchange).toHaveBeenLastCalledWith(null);
  });
});

describe('Multi', () => {
  it('toggles options in and out of the list', async () => {
    const onchange = vi.fn();
    render(Multi, { question: multi, value: ['near'], onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Far' }));
    expect(onchange).toHaveBeenLastCalledWith(['near', 'far']);
    await fireEvent.click(screen.getByRole('button', { name: 'Near' }));
    expect(onchange).toHaveBeenLastCalledWith([]);
  });
});

describe('NumberField', () => {
  it('reports numbers and blanks', async () => {
    const onchange = vi.fn();
    render(NumberField, { question: number, value: null, onchange });
    const input = screen.getByLabelText('Weight');
    await fireEvent.input(input, { target: { value: '12.5' } });
    expect(onchange).toHaveBeenLastCalledWith(12.5);
    await fireEvent.input(input, { target: { value: '' } });
    expect(onchange).toHaveBeenLastCalledWith(null);
  });
  it('warns about values outside the expected range', () => {
    render(NumberField, { question: number, value: 300, onchange: vi.fn() });
    expect(screen.getByText('Expected a number from 0 to 200')).toBeTruthy();
  });
});

describe('TextField', () => {
  it('reports what the scout types', async () => {
    const onchange = vi.fn();
    render(TextField, { question: text, value: null, onchange });
    await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'fast' } });
    expect(onchange).toHaveBeenLastCalledWith('fast');
  });
});

describe('Rating', () => {
  it('shows 1..max and clears when the chosen rating is tapped again', async () => {
    const onchange = vi.fn();
    render(Rating, { question: rating, value: 4, onchange });
    expect(screen.getAllByRole('button')).toHaveLength(5);
    await fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onchange).toHaveBeenLastCalledWith(2);
    await fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(onchange).toHaveBeenLastCalledWith(null);
  });
});

describe('Timer', () => {
  afterEach(() => vi.useRealTimers());

  it('adds up start/stop runs to a tenth of a second', async () => {
    vi.useFakeTimers();
    const onchange = vi.fn();
    const { rerender } = render(Timer, { question: timer, value: null, onchange });
    expect(screen.getByLabelText('Edit time').textContent).toBe('0.0 s');
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    vi.advanceTimersByTime(2500);
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onchange).toHaveBeenLastCalledWith(2.5);
    await rerender({ value: 2.5 });
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    vi.advanceTimersByTime(1000);
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onchange).toHaveBeenLastCalledWith(3.5);
  });

  it('resets and accepts a typed time', async () => {
    const onchange = vi.fn();
    render(Timer, { question: timer, value: 2.5, onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onchange).toHaveBeenLastCalledWith(null);
    await fireEvent.click(screen.getByLabelText('Edit time'));
    await fireEvent.change(screen.getByLabelText('Seconds'), { target: { value: '7' } });
    expect(onchange).toHaveBeenLastCalledWith(7);
  });
});

describe('FieldMap', () => {
  it('converts a tap position into field coordinates', () => {
    expect(tapToPoint(150, 80, { left: 100, top: 30, width: 200, height: 100 })).toEqual({ x: 0.25, y: 0.5 });
    expect(tapToPoint(500, -5, { left: 100, top: 30, width: 200, height: 100 })).toEqual({ x: 1, y: 0 });
    expect(tapToPoint(1, 1, { left: 0, top: 0, width: 3, height: 3 })).toEqual({ x: 0.333, y: 0.333 });
    expect(tapToPoint(5, 5, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('records taps for a blue scout as-is', async () => {
    const onchange = vi.fn();
    render(FieldMap, { question: map, value: null, onchange, slot: 'blue1', image: 'data:image/png;base64,x' });
    const img = screen.getByAltText('Field');
    stubRect(img);
    await fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(onchange).toHaveBeenLastCalledWith([{ x: 0.25, y: 0.25 }]);
  });

  it('mirrors taps for a red scout', async () => {
    const onchange = vi.fn();
    render(FieldMap, { question: map, value: null, onchange, slot: 'red1', image: 'data:image/png;base64,x' });
    const img = screen.getByAltText('Field');
    stubRect(img);
    await fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(onchange).toHaveBeenLastCalledWith([{ x: 0.75, y: 0.75 }]);
  });

  it('replaces the point when only one is allowed, and removes a tapped dot', async () => {
    const onchange = vi.fn();
    render(FieldMap, { question: { ...map, maxPoints: 1 }, value: [{ x: 0.1, y: 0.1 }], onchange, slot: 'blue1', image: 'x' });
    const img = screen.getByAltText('Field');
    stubRect(img);
    await fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(onchange).toHaveBeenLastCalledWith([{ x: 0.25, y: 0.25 }]);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove point 1' }));
    expect(onchange).toHaveBeenLastCalledWith([]);
  });

  it('ignores taps once the maximum is reached', async () => {
    const onchange = vi.fn();
    render(FieldMap, { question: map, value: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], onchange, slot: 'blue1', image: 'x' });
    const img = screen.getByAltText('Field');
    stubRect(img);
    await fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(onchange).not.toHaveBeenCalled();
  });
});

describe('QuestionCard', () => {
  it('shows the label, marks required questions and offers "I missed this"', async () => {
    const onmissed = vi.fn();
    render(QuestionCard, { question: counter, value: 1, missed: false, onchange: vi.fn(), onmissed, assets: {} });
    const card = screen.getByRole('region', { name: 'Coral scored' });
    expect(within(card).getByTitle('Required')).toBeTruthy();
    expect(within(card).getByLabelText('value').textContent).toBe('1');
    await fireEvent.click(within(card).getByRole('button', { name: 'I missed this' }));
    expect(onmissed).toHaveBeenCalledWith(true);
  });
  it('hides the input of a missed question and can undo', async () => {
    const onmissed = vi.fn();
    render(QuestionCard, { question: counter, value: null, missed: true, onchange: vi.fn(), onmissed, assets: {} });
    expect(screen.getByText('Marked as missed.')).toBeTruthy();
    expect(screen.queryByLabelText('plus')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onmissed).toHaveBeenCalledWith(false);
  });
});

describe('ConfirmDialog', () => {
  it('calls back for each choice', async () => {
    const onconfirm = vi.fn();
    const oncancel = vi.fn();
    render(ConfirmDialog, { title: 'Discard?', confirmLabel: 'Discard', cancelLabel: 'Keep', onconfirm, oncancel });
    expect(screen.getByRole('dialog', { name: 'Discard?' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(oncancel).toHaveBeenCalledTimes(1);
    expect(onconfirm).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project app app/test/questions.test.ts`
Expected: FAIL — cannot resolve `../src/components/ConfirmDialog.svelte`.

- [ ] **Step 3: Implement `app/src/lib/fieldmap.ts`**

```ts
import type { Point } from '@stingr/shared';

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function tapToPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return { x: round3(clamp((clientX - rect.left) / rect.width)), y: round3(clamp((clientY - rect.top) / rect.height)) };
}
```

- [ ] **Step 4: Implement the question components**

`app/src/components/questions/Counter.svelte`:

```svelte
<script lang="ts">
  import type { AnswerValue, CounterQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: CounterQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let current = $derived(typeof value === 'number' ? value : question.default);
  let canDown = $derived(current - question.step >= question.min);
  let canUp = $derived(question.max === undefined || current + question.step <= question.max);
</script>

<div class="counter">
  <button type="button" aria-label="minus" disabled={!canDown} onclick={() => onchange(current - question.step)}>−</button>
  <output aria-label="value">{current}</output>
  <button type="button" aria-label="plus" disabled={!canUp} onclick={() => onchange(current + question.step)}>+</button>
</div>
```

`app/src/components/questions/Toggle.svelte`:

```svelte
<script lang="ts">
  import type { AnswerValue, ToggleQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: ToggleQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();
</script>

<div class="choices" role="group" aria-label={question.label}>
  <button type="button" aria-pressed={value === true} onclick={() => onchange(true)}>Yes</button>
  <button type="button" aria-pressed={value === false} onclick={() => onchange(false)}>No</button>
</div>
```

`app/src/components/questions/Choice.svelte`:

```svelte
<script lang="ts">
  import type { AnswerValue, ChoiceQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: ChoiceQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();
</script>

{#if question.display === 'dropdown'}
  <select aria-label={question.label} value={typeof value === 'string' ? value : ''} onchange={e => onchange(e.currentTarget.value || null)}>
    <option value="">Choose…</option>
    {#each question.options as o (o.value)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
{:else}
  <div class="choices">
    {#each question.options as o (o.value)}
      <button type="button" aria-pressed={value === o.value} onclick={() => onchange(value === o.value ? null : o.value)}>{o.label}</button>
    {/each}
  </div>
{/if}
```

`app/src/components/questions/Multi.svelte`:

```svelte
<script lang="ts">
  import type { AnswerValue, MultiQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: MultiQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let selected = $derived(Array.isArray(value) ? (value as string[]) : []);

  function toggle(v: string) {
    onchange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }
</script>

<div class="choices">
  {#each question.options as o (o.value)}
    <button type="button" aria-pressed={selected.includes(o.value)} onclick={() => toggle(o.value)}>{o.label}</button>
  {/each}
</div>
```

`app/src/components/questions/NumberField.svelte`:

```svelte
<script lang="ts">
  import type { AnswerValue, NumberQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: NumberQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let n = $derived(typeof value === 'number' ? value : null);
  let range = $derived(
    question.min !== undefined && question.max !== undefined ? ` from ${question.min} to ${question.max}`
      : question.min !== undefined ? ` of at least ${question.min}`
        : question.max !== undefined ? ` of at most ${question.max}` : '',
  );
  let outOfRange = $derived(
    n !== null && ((question.min !== undefined && n < question.min) || (question.max !== undefined && n > question.max) || (question.integer && !Number.isInteger(n))),
  );
</script>

<input
  type="number"
  aria-label={question.label}
  inputmode={question.integer ? 'numeric' : 'decimal'}
  step={question.integer ? 1 : 'any'}
  min={question.min}
  max={question.max}
  value={n ?? ''}
  oninput={e => { const t = e.currentTarget.value; onchange(t === '' ? null : Number(t)); }}
/>
{#if outOfRange}
  <p class="hint warn">Expected {question.integer ? 'a whole number' : 'a number'}{range}</p>
{/if}
```

`app/src/components/questions/TextField.svelte`:

```svelte
<script lang="ts">
  import type { AnswerValue, TextQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: TextQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let text = $derived(typeof value === 'string' ? value : '');
</script>

{#if question.multiline}
  <textarea aria-label={question.label} rows="4" value={text} oninput={e => onchange(e.currentTarget.value)}></textarea>
{:else}
  <input type="text" aria-label={question.label} value={text} oninput={e => onchange(e.currentTarget.value)} />
{/if}
```

`app/src/components/questions/Rating.svelte`:

```svelte
<script lang="ts">
  import type { AnswerValue, RatingQuestion } from '@stingr/shared';

  let { question, value, onchange }: { question: RatingQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  let levels = $derived(Array.from({ length: question.max }, (_, i) => i + 1));
</script>

<div class="choices" role="group" aria-label={question.label}>
  {#each levels as n (n)}
    <button type="button" aria-pressed={value === n} onclick={() => onchange(value === n ? null : n)}>{n}</button>
  {/each}
</div>
```

`app/src/components/questions/Timer.svelte`:

```svelte
<script lang="ts">
  import type { AnswerValue, TimerQuestion } from '@stingr/shared';
  import { onDestroy } from 'svelte';

  let { question, value, onchange }: { question: TimerQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void } = $props();

  const round = (s: number) => Math.round(s * 10) / 10;
  let base = $derived(typeof value === 'number' ? value : 0);
  let startedAt = $state<number | null>(null);
  let now = $state(0);
  let editing = $state(false);
  let ticker: ReturnType<typeof setInterval> | null = null;
  let shown = $derived(startedAt === null ? base : base + (now - startedAt) / 1000);

  function start() {
    startedAt = Date.now();
    now = startedAt;
    ticker = setInterval(() => { now = Date.now(); }, 100);
  }

  function stop() {
    if (startedAt === null) return;
    const total = round(base + (Date.now() - startedAt) / 1000);
    startedAt = null;
    if (ticker) clearInterval(ticker);
    ticker = null;
    onchange(total);
  }

  function reset() {
    if (ticker) clearInterval(ticker);
    ticker = null;
    startedAt = null;
    onchange(null);
  }

  // Leaving the section while the timer runs keeps the time counted so far.
  onDestroy(stop);
</script>

<div class="timer" role="group" aria-label={question.label}>
  {#if editing}
    <input
      type="number" step="0.1" min="0" aria-label="Seconds" value={base}
      onchange={e => { const t = e.currentTarget.value; onchange(t === '' ? null : round(Number(t))); editing = false; }}
    />
  {:else}
    <button type="button" class="readout" aria-label="Edit time" onclick={() => { if (startedAt === null) editing = true; }}>{shown.toFixed(1)} s</button>
  {/if}
  {#if startedAt === null}
    <button type="button" class="big" onclick={start}>Start</button>
  {:else}
    <button type="button" class="big" onclick={stop}>Stop</button>
  {/if}
  <button type="button" onclick={reset}>Reset</button>
</div>
```

`app/src/components/questions/FieldMap.svelte`:

```svelte
<script lang="ts">
  import { type AnswerValue, type FieldMapQuestion, type Point, type Slot, toCanonical, toDisplay } from '@stingr/shared';
  import { tapToPoint } from '../../lib/fieldmap';

  let { question, value, onchange, slot, image }: {
    question: FieldMapQuestion; value: AnswerValue; onchange: (v: AnswerValue) => void; slot?: Slot; image?: string;
  } = $props();

  let points = $derived(Array.isArray(value) ? (value as Point[]) : []);
  let shown = $derived(points.map(p => toDisplay(p, slot, question.mirrorForRed)));

  function tap(e: MouseEvent & { currentTarget: HTMLImageElement }) {
    const p = toCanonical(tapToPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()), slot, question.mirrorForRed);
    if (question.maxPoints === 1) onchange([p]);
    else if (points.length < question.maxPoints) onchange([...points, p]);
  }
</script>

<div class="fieldmap">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <img src={image} alt="Field" draggable="false" onclick={tap} />
  {#each shown as p, i (i)}
    <button
      type="button" class="dot" aria-label="Remove point {i + 1}" style:left="{p.x * 100}%" style:top="{p.y * 100}%"
      onclick={() => onchange(points.filter((_, j) => j !== i))}
    ></button>
  {/each}
</div>
<p class="hint">{points.length} of {question.maxPoints} marked. Tap a dot to remove it.</p>
```

- [ ] **Step 5: Implement `QuestionCard` and `ConfirmDialog`**

`app/src/components/QuestionCard.svelte`:

```svelte
<script lang="ts">
  import type { AnswerValue, Question, Slot } from '@stingr/shared';
  import Choice from './questions/Choice.svelte';
  import Counter from './questions/Counter.svelte';
  import FieldMap from './questions/FieldMap.svelte';
  import Multi from './questions/Multi.svelte';
  import NumberField from './questions/NumberField.svelte';
  import Rating from './questions/Rating.svelte';
  import TextField from './questions/TextField.svelte';
  import Timer from './questions/Timer.svelte';
  import Toggle from './questions/Toggle.svelte';

  let { question, value, missed, onchange, onmissed, slot, assets }: {
    question: Question;
    value: AnswerValue;
    missed: boolean;
    onchange: (v: AnswerValue) => void;
    onmissed: (missed: boolean) => void;
    slot?: Slot;
    assets: Record<string, string>;
  } = $props();
</script>

<section class="question" class:missed aria-label={question.label}>
  <header>
    <h3>{question.label}{#if question.required}<span class="req" title="Required"> *</span>{/if}</h3>
    {#if missed}
      <button type="button" class="link" onclick={() => onmissed(false)}>Undo</button>
    {:else}
      <button type="button" class="link" onclick={() => onmissed(true)}>I missed this</button>
    {/if}
  </header>
  {#if question.help}<p class="hint">{question.help}</p>{/if}
  {#if missed}
    <p class="hint">Marked as missed.</p>
  {:else if question.type === 'counter'}
    <Counter {question} {value} {onchange} />
  {:else if question.type === 'toggle'}
    <Toggle {question} {value} {onchange} />
  {:else if question.type === 'choice'}
    <Choice {question} {value} {onchange} />
  {:else if question.type === 'multi'}
    <Multi {question} {value} {onchange} />
  {:else if question.type === 'number'}
    <NumberField {question} {value} {onchange} />
  {:else if question.type === 'text'}
    <TextField {question} {value} {onchange} />
  {:else if question.type === 'rating'}
    <Rating {question} {value} {onchange} />
  {:else if question.type === 'timer'}
    <Timer {question} {value} {onchange} />
  {:else if question.type === 'fieldmap'}
    <FieldMap {question} {value} {onchange} {slot} image={assets[question.assetId]} />
  {/if}
</section>
```

`app/src/components/ConfirmDialog.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, confirmLabel = 'Yes', cancelLabel = 'Cancel', onconfirm, oncancel, children }: {
    title: string; confirmLabel?: string; cancelLabel?: string; onconfirm: () => void; oncancel: () => void; children?: Snippet;
  } = $props();
</script>

<div class="backdrop">
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
    <h2>{title}</h2>
    {@render children?.()}
    <div class="actions">
      <button type="button" onclick={oncancel}>{cancelLabel}</button>
      <button type="button" class="primary" onclick={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run --project app && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/fieldmap.ts app/src/components app/test/questions.test.ts
git commit -m "feat(app): question components, question card and confirm dialog"
```

---

### Task 9: Form screen, pit photos and keeping the screen on

**Files:**
- Create: `app/src/lib/photos.ts`, `app/src/lib/wakeLock.ts`, `app/src/components/Photos.svelte`, `app/src/screens/FormScreen.svelte`
- Test: `app/test/formscreen.test.ts`, `app/test/photos.test.ts`

**Interfaces:**
- Consumes: `AppStore` (Task 7), `QuestionCard`, `ConfirmDialog` (Task 8), `recordTitle` (Task 4); shared `setAnswer`, `markMissed`, `unmarkMissed`, `unansweredRequired`, `findQuestion`.
- Produces:
  - `MAX_EDGE = 1600`; `fitWithin(width: number, height: number, max?: number): { width: number; height: number }`; `resizeImage(file: Blob): Promise<Blob>` (JPEG, quality 0.8, EXIF orientation applied)
  - `keepScreenOn(): () => void` — holds a screen wake lock (re-acquired when the page becomes visible again); the returned function releases it; does nothing where the API is missing
  - `FormScreen` props `{ store: AppStore }` — one tab per section plus "Review"; every change saved through `store.updateDraft`; Submit asks for confirmation when required questions are unanswered; Cancel asks before discarding. Rendered only while `store.draft` is set.
  - `Photos` props `{ store: AppStore }` — shown on the Review tab of pit forms.

- [ ] **Step 1: Write the failing tests**

`app/test/photos.test.ts`:

```ts
import { expect, it } from 'vitest';
import { fitWithin } from '../src/lib/photos';

it('shrinks photos so the longest edge is at most 1600 px', () => {
  expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  expect(fitWithin(1000, 3000)).toEqual({ width: 533, height: 1600 });
  expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
});
```

`app/test/formscreen.test.ts`:

```ts
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import FormScreen from '../src/screens/FormScreen.svelte';
import { makeStore } from './helpers';

async function openMatchForm() {
  const ctx = await makeStore();
  await ctx.store.startMatch({ matchKey: 'qm1', slot: 'red1', team: 5098 });
  render(FormScreen, { store: ctx.store });
  return ctx;
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('FormScreen', () => {
  it('shows the first section and saves every change', async () => {
    const { store, db } = await openMatchForm();
    expect(screen.getByRole('heading', { name: 'Qual 1 · Red 1 · Team 5098' })).toBeTruthy();
    const coral = screen.getByRole('region', { name: 'Coral scored' });
    await fireEvent.click(within(coral).getByLabelText('plus'));
    expect(store.draft?.rec.answers.auto_coral).toBe(1);
    await waitFor(async () => expect((await db.getKv('draft'))?.rec.answers.auto_coral).toBe(1));
  });

  it('lets the scout mark a question as missed', async () => {
    const { store } = await openMatchForm();
    const coral = screen.getByRole('region', { name: 'Coral scored' });
    await fireEvent.click(within(coral).getByRole('button', { name: 'I missed this' }));
    expect(within(coral).getByText('Marked as missed.')).toBeTruthy();
    expect(store.draft?.rec.missed).toEqual(['auto_coral']);
    expect(store.draft?.rec.answers.auto_coral).toBeNull();
  });

  it('asks before submitting with unanswered required questions', async () => {
    const { store } = await openMatchForm();
    await click('Review');
    expect(screen.getByText('Not answered yet: Climb')).toBeTruthy();
    await click('Submit');
    const dialog = screen.getByRole('dialog', { name: 'Submit with missing answers?' });
    expect(within(dialog).getByText("You didn't answer: Climb.")).toBeTruthy();
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Submit and mark as missed' }));
    await waitFor(() => expect(store.screen).toEqual({ name: 'home' }));
    expect(store.records[0]).toMatchObject({ sync: 'pending', rec: { missed: ['climb'] } });
  });

  it('submits straight away when everything required is answered', async () => {
    const { store } = await openMatchForm();
    await click('Endgame');
    await fireEvent.click(within(screen.getByRole('region', { name: 'Climb' })).getByRole('button', { name: 'Deep' }));
    await click('Review');
    await click('Submit');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(store.screen).toEqual({ name: 'home' }));
    expect(store.records[0].rec).toMatchObject({ missed: [], answers: { climb: 'deep' } });
  });

  it('moves between sections with Next and Back', async () => {
    await openMatchForm();
    await click('Next ›');
    expect(screen.getByRole('region', { name: 'Climb' })).toBeTruthy();
    await click('‹ Back');
    expect(screen.getByRole('region', { name: 'Coral scored' })).toBeTruthy();
  });

  it('discards only after confirmation', async () => {
    const { store } = await openMatchForm();
    await click('Cancel');
    await click('Keep editing');
    expect(store.draft).not.toBeNull();
    await click('Cancel');
    await click('Discard');
    await waitFor(() => expect(store.draft).toBeNull());
    expect(store.records).toEqual([]);
  });

  it('shows and removes robot photos on a pit form', async () => {
    const { store } = await makeStore();
    await store.startPit(5098);
    await store.addPhoto(new Uint8Array([1]).buffer, 'image/jpeg');
    render(FormScreen, { store });
    await click('Review');
    expect(screen.getByAltText('Robot photo')).toBeTruthy();
    await click('Remove');
    await waitFor(() => expect(store.draft?.rec.photoIds).toEqual([]));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project app app/test/formscreen.test.ts app/test/photos.test.ts`
Expected: FAIL — cannot resolve `../src/screens/FormScreen.svelte` and `../src/lib/photos`.

- [ ] **Step 3: Implement the helpers**

`app/src/lib/photos.ts`:

```ts
export const MAX_EDGE = 1600;

export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Shrink a camera photo to at most MAX_EDGE pixels on its longest side and re-encode it as JPEG. */
export async function resizeImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode the photo'))), 'image/jpeg', 0.8);
  });
}
```

`app/src/lib/wakeLock.ts`:

```ts
/** Keep the screen on while a form is open. Returns a function that lets it sleep again. */
export function keepScreenOn(): () => void {
  let lock: WakeLockSentinel | null = null;
  let active = true;
  const acquire = async () => {
    if (!active || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
    } catch {
      // Not allowed right now (e.g. battery saver); the screen may sleep.
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void acquire();
  };
  void acquire();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release();
  };
}
```

- [ ] **Step 4: Implement `app/src/components/Photos.svelte`**

```svelte
<script lang="ts">
  import { resizeImage } from '../lib/photos';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();
  let busy = $state(false);
  let error = $state<string | null>(null);

  let thumbs = $derived(
    (store.draft?.rec.photoIds ?? []).flatMap(id => {
      const p = store.photos.find(x => x.id === id);
      return p ? [{ id, url: URL.createObjectURL(new Blob([p.data], { type: p.mime })) }] : [];
    }),
  );

  $effect(() => {
    const list = thumbs;
    return () => list.forEach(t => URL.revokeObjectURL(t.url));
  });

  async function picked(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    busy = true;
    error = null;
    try {
      const blob = await resizeImage(file);
      await store.addPhoto(await blob.arrayBuffer(), blob.type || 'image/jpeg');
    } catch {
      error = "Couldn't save that photo. Please try again.";
    } finally {
      busy = false;
    }
  }
</script>

<section class="photos" aria-label="Robot photos">
  <h3>Robot photos</h3>
  <div class="thumbs">
    {#each thumbs as t (t.id)}
      <figure>
        <img src={t.url} alt="Robot photo" />
        <button type="button" onclick={() => store.removePhoto(t.id)}>Remove</button>
      </figure>
    {/each}
  </div>
  <label class="camera">
    <span>{busy ? 'Saving photo…' : 'Take photo'}</span>
    <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onchange={picked} />
  </label>
  {#if error}<p class="error">{error}</p>{/if}
</section>

<style>
  .camera {
    display: inline-flex; flex-direction: row; align-items: center; justify-content: center;
    min-height: 64px; padding: 0 24px; border: 2px solid var(--black); border-radius: 8px;
    background: var(--yellow); font-size: 1.3rem; cursor: pointer;
  }
</style>
```

- [ ] **Step 5: Implement `app/src/screens/FormScreen.svelte`**

```svelte
<script lang="ts">
  import { type AnswerValue, findQuestion, markMissed, setAnswer, unansweredRequired, unmarkMissed } from '@stingr/shared';
  import { onMount } from 'svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import Photos from '../components/Photos.svelte';
  import QuestionCard from '../components/QuestionCard.svelte';
  import { recordTitle } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';
  import { keepScreenOn } from '../lib/wakeLock';

  let { store }: { store: AppStore } = $props();

  // The draft disappears the moment it is submitted or discarded, so everything here tolerates null.
  let draft = $derived(store.draft);
  let rec = $derived(draft?.rec ?? null);
  let form = $derived(rec ? store.formOf(rec) : null);
  let sections = $derived(form?.sections ?? []);
  let unanswered = $derived(form && rec ? unansweredRequired(form, rec) : []);
  let tab = $state(0);
  let confirming = $state<'submit' | 'discard' | null>(null);
  let saving = $state(false);

  const label = (key: string) => (form ? findQuestion(form, key)?.label : undefined) ?? key;

  onMount(() => keepScreenOn());

  function show(i: number) {
    tab = i;
    document.documentElement.scrollTop = 0;
  }

  function change(key: string, v: AnswerValue) {
    if (store.draft) void store.updateDraft(setAnswer(store.draft.rec, key, v));
  }

  function setMissed(key: string, missed: boolean) {
    if (!store.draft || !form) return;
    const r = store.draft.rec;
    void store.updateDraft(missed ? markMissed(r, key) : unmarkMissed(form, r, key));
  }

  async function submit() {
    confirming = null;
    saving = true;
    try {
      await store.submitDraft();
    } finally {
      saving = false;
    }
  }
</script>

{#if !draft || !rec}
  <!-- nothing to show: the form was just submitted or discarded -->
{:else if !form}
  <p class="banner warn">This record's form (version {rec.formVersion}) isn't on this tablet. Plug into the hub to sync, then try again.</p>
  <button type="button" onclick={() => store.discardDraft()}>Back</button>
{:else}
  <header class="bar">
    <h1>{recordTitle(rec)}</h1>
    {#if draft.isEdit}<span class="tag">Editing</span>{/if}
    <button type="button" onclick={() => (confirming = 'discard')}>Cancel</button>
  </header>

  <nav class="tabs">
    {#each sections as s, i (s.id)}
      <button type="button" aria-pressed={tab === i} onclick={() => show(i)}>{s.title}</button>
    {/each}
    <button type="button" aria-pressed={tab === sections.length} onclick={() => show(sections.length)}>Review</button>
  </nav>

  {#if tab < sections.length}
    {#each sections[tab].questions as q (q.key)}
      <QuestionCard
        question={q}
        value={rec.answers[q.key] ?? null}
        missed={rec.missed.includes(q.key)}
        onchange={v => change(q.key, v)}
        onmissed={m => setMissed(q.key, m)}
        slot={rec.slot}
        assets={form.assets}
      />
    {/each}
    <div class="nav">
      <button type="button" disabled={tab === 0} onclick={() => show(tab - 1)}>‹ Back</button>
      <button type="button" class="primary" onclick={() => show(tab + 1)}>Next ›</button>
    </div>
  {:else}
    <section class="review">
      {#if rec.kind === 'pit'}<Photos {store} />{/if}
      {#if unanswered.length}<p class="banner warn">Not answered yet: {unanswered.map(label).join(', ')}</p>{/if}
      {#if rec.missed.length}<p>Marked as missed: {rec.missed.map(label).join(', ')}</p>{/if}
      <div class="nav">
        <button type="button" onclick={() => show(tab - 1)}>‹ Back</button>
        <button type="button" class="primary big" disabled={saving} onclick={() => (unanswered.length ? (confirming = 'submit') : submit())}>Submit</button>
      </div>
    </section>
  {/if}
{/if}

{#if confirming === 'submit'}
  <ConfirmDialog
    title="Submit with missing answers?"
    confirmLabel="Submit and mark as missed"
    cancelLabel="Go back"
    onconfirm={submit}
    oncancel={() => (confirming = null)}
  >
    <p>You didn't answer: {unanswered.map(label).join(', ')}.</p>
    <p>It's fine to say you missed something. That's better than guessing.</p>
  </ConfirmDialog>
{/if}

{#if confirming === 'discard'}
  <ConfirmDialog
    title={draft?.isEdit ? 'Discard your changes?' : 'Discard this form?'}
    confirmLabel="Discard"
    cancelLabel="Keep editing"
    onconfirm={() => { confirming = null; void store.discardDraft(); }}
    oncancel={() => (confirming = null)}
  />
{/if}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run --project app && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/photos.ts app/src/lib/wakeLock.ts app/src/components/Photos.svelte app/src/screens/FormScreen.svelte app/test/formscreen.test.ts app/test/photos.test.ts
git commit -m "feat(app): form screen with review, missed confirmation, discard and pit photos"
```

---

### Task 10: Home, Setup and Settings screens

**Files:**
- Create: `app/src/screens/Home.svelte`, `app/src/screens/Setup.svelte`, `app/src/screens/Settings.svelte`
- Test: `app/test/home.test.ts`, `app/test/setup.test.ts`

**Interfaces:**
- Consumes: `AppStore` (Task 7); `nextMatchKey`, `teamFor`, `slotLabel`, `parseTeamInput` (Task 4); `ConfirmDialog` (Task 8); shared `matchLabel`, `normalizeMatchKey`, `SLOTS`.
- Produces (all take props `{ store: AppStore }`):
  - `Home` — controls labelled "Your name", "Slot", "Match" (when there is a schedule), "Match number" (no schedule, or "Other…"), "Team"; buttons "Start scouting", "Robot not present", "Pit scouting", "Past records", "Settings", and "Make <slot> this tablet's default" when the slot differs from the default.
  - `Setup` — heading "Set up this tablet"; controls "Tablet name", "Default slot"; button "Save" → `home`.
  - `Settings` — heading "Settings"; "Tablet name", "Default slot", "Save", "Back"; shows device id, app version (`__BUILD_ID__`), last sync time, record counts.

- [ ] **Step 1: Write the failing tests**

`app/test/home.test.ts`:

```ts
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Home from '../src/screens/Home.svelte';
import { CONFIG, makeStore } from './helpers';

const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement).value;
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('Home', () => {
  it("fills in the next match and the team for this tablet's slot", async () => {
    const { store } = await makeStore();
    render(Home, { store });
    expect(value('Match')).toBe('qm1');
    expect(value('Slot')).toBe('red1');
    expect(value('Team')).toBe('5098');
    await fireEvent.change(screen.getByLabelText('Slot'), { target: { value: 'blue1' } });
    expect(value('Team')).toBe('4');
  });

  it('starts scouting the chosen match, slot and team', async () => {
    const { store } = await makeStore();
    render(Home, { store });
    await fireEvent.click(button('Start scouting'));
    await waitFor(() => expect(store.screen).toEqual({ name: 'form' }));
    expect(store.draft?.rec).toMatchObject({ matchKey: 'qm1', slot: 'red1', team: 5098 });
  });

  it("needs the scout's name before starting", async () => {
    const { store } = await makeStore({ settings: { scout: '' } });
    render(Home, { store });
    expect(button('Start scouting').disabled).toBe(true);
    const name = screen.getByLabelText('Your name');
    await fireEvent.input(name, { target: { value: 'Bo' } });
    expect(button('Start scouting').disabled).toBe(false);
    await fireEvent.change(name);
    await waitFor(() => expect(store.settings.scout).toBe('Bo'));
  });

  it("lets the scout type a team the schedule doesn't have", async () => {
    const { store } = await makeStore();
    render(Home, { store });
    await fireEvent.change(screen.getByLabelText('Slot'), { target: { value: 'red2' } });
    expect(value('Team')).toBe('');
    expect(button('Start scouting').disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText('Team'), { target: { value: 'abc' } });
    expect(button('Start scouting').disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText('Team'), { target: { value: '254' } });
    expect(button('Start scouting').disabled).toBe(false);
    await fireEvent.click(button('Start scouting'));
    await waitFor(() => expect(store.draft?.rec).toMatchObject({ slot: 'red2', team: 254 }));
  });

  it('records a robot that is not present and moves to the next match', async () => {
    const { store } = await makeStore();
    render(Home, { store });
    await fireEvent.click(button('Robot not present'));
    const dialog = screen.getByRole('dialog', { name: 'Robot not present?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, mark as not present' }));
    await waitFor(() => expect(store.records).toHaveLength(1));
    expect(store.records[0].rec).toMatchObject({ noShow: true, matchKey: 'qm1', team: 5098 });
    await waitFor(() => expect(value('Match')).toBe('qm2'));
  });

  it('works without a schedule', async () => {
    const { store } = await makeStore({ config: { ...CONFIG, schedule: [] } });
    render(Home, { store });
    expect(value('Match number')).toBe('1');
    await fireEvent.input(screen.getByLabelText('Match number'), { target: { value: '12' } });
    await fireEvent.input(screen.getByLabelText('Team'), { target: { value: '254' } });
    await fireEvent.click(button('Start scouting'));
    await waitFor(() => expect(store.draft?.rec).toMatchObject({ matchKey: 'qm12', team: 254 }));
  });

  it('explains when nothing has been loaded from the hub', async () => {
    const { store } = await makeStore({ config: null });
    render(Home, { store });
    expect(screen.getByText(/Plug this tablet into the hub/)).toBeTruthy();
    expect(button('Start scouting').disabled).toBe(true);
  });

  it("can make the chosen slot this tablet's default", async () => {
    const { store } = await makeStore();
    render(Home, { store });
    await fireEvent.change(screen.getByLabelText('Slot'), { target: { value: 'blue3' } });
    await fireEvent.click(button("Make Blue 3 this tablet's default"));
    await waitFor(() => expect(store.settings.defaultSlot).toBe('blue3'));
  });
});
```

`app/test/setup.test.ts`:

```ts
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Settings from '../src/screens/Settings.svelte';
import Setup from '../src/screens/Setup.svelte';
import { makeStore } from './helpers';

describe('Setup', () => {
  it('names the tablet and picks its usual slot', async () => {
    const { store } = await makeStore({ settings: { deviceName: '' } });
    expect(store.screen).toEqual({ name: 'setup' });
    render(Setup, { store });
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText('Tablet name'), { target: { value: 'Tablet 2' } });
    await fireEvent.change(screen.getByLabelText('Default slot'), { target: { value: 'blue2' } });
    await fireEvent.click(save);
    await waitFor(() => expect(store.screen).toEqual({ name: 'home' }));
    expect(store.settings).toMatchObject({ deviceName: 'Tablet 2', defaultSlot: 'blue2' });
  });
});

describe('Settings', () => {
  it('shows tablet details and saves changes', async () => {
    const { store } = await makeStore();
    render(Settings, { store });
    expect(screen.getByText('dev-1')).toBeTruthy();
    await fireEvent.input(screen.getByLabelText('Tablet name'), { target: { value: 'Tablet 9' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.settings.deviceName).toBe('Tablet 9'));
    expect(screen.getByText('Saved ✓')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(store.screen).toEqual({ name: 'home' });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project app app/test/home.test.ts app/test/setup.test.ts`
Expected: FAIL — cannot resolve the screen components.

- [ ] **Step 3: Implement `app/src/screens/Home.svelte`**

```svelte
<script lang="ts">
  import { matchLabel, normalizeMatchKey, SLOTS, type Slot } from '@stingr/shared';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import { nextMatchKey, parseTeamInput, slotLabel, teamFor } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();

  const OTHER = '__other';
  let schedule = $derived(store.config?.schedule ?? []);
  let scout = $state(store.settings.scout);
  let slot = $state<Slot>(store.settings.defaultSlot);
  let matchChoice = $state('');
  let otherMatch = $state('');
  let teamOverride = $state<string | null>(null);
  let confirmNoShow = $state(false);
  let busy = $state(false);

  /** Pick the next match for this tablet; called on open and after recording a no-show. */
  function suggestMatch() {
    const sched = store.config?.schedule ?? [];
    const next = nextMatchKey(sched, store.eventRecords);
    const scheduled = sched.some(m => m.matchKey === next);
    matchChoice = scheduled ? next : OTHER;
    otherMatch = scheduled ? '' : next.startsWith('qm') ? next.slice(2) : next;
    teamOverride = null;
  }
  suggestMatch();

  let matchKey = $derived(schedule.length && matchChoice !== OTHER ? matchChoice : normalizeMatchKey(otherMatch));
  let scheduledTeam = $derived(matchKey ? teamFor(schedule, matchKey, slot) : null);
  let teamText = $derived(teamOverride ?? (scheduledTeam === null ? '' : String(scheduledTeam)));
  let team = $derived(parseTeamInput(teamText));
  let matchForm = $derived(store.form('match'));
  let canStart = $derived(!!matchForm && !!store.event && scout.trim() !== '' && !!matchKey && team !== null && !busy);

  async function saveScout() {
    if (scout.trim() !== store.settings.scout) await store.saveSettings({ scout: scout.trim() });
  }

  async function start() {
    if (!canStart || !matchKey || team === null) return;
    busy = true;
    try {
      await saveScout();
      await store.startMatch({ matchKey, slot, team });
    } finally {
      busy = false;
    }
  }

  async function noShow() {
    confirmNoShow = false;
    if (!matchKey || team === null) return;
    busy = true;
    try {
      await saveScout();
      await store.matchNoShow({ matchKey, slot, team });
      suggestMatch();
    } finally {
      busy = false;
    }
  }
</script>

<section class="home">
  {#if !store.event}
    <p class="banner warn">No event loaded yet. Plug this tablet into the hub to load the event, forms and schedule.</p>
  {:else if !matchForm}
    <p class="banner warn">The hub hasn't published a match form yet.</p>
  {/if}

  <div class="row">
    <label>Your name
      <input aria-label="Your name" value={scout} autocomplete="off" oninput={e => (scout = e.currentTarget.value)} onchange={saveScout} />
    </label>
    <label>Slot
      <select aria-label="Slot" value={slot} onchange={e => { slot = e.currentTarget.value as Slot; teamOverride = null; }}>
        {#each SLOTS as s (s)}<option value={s}>{slotLabel(s)}</option>{/each}
      </select>
    </label>
    {#if slot !== store.settings.defaultSlot}
      <button type="button" class="link" onclick={() => store.saveSettings({ defaultSlot: slot })}>Make {slotLabel(slot)} this tablet's default</button>
    {/if}
  </div>

  <div class="row">
    {#if schedule.length}
      <label>Match
        <select aria-label="Match" value={matchChoice} onchange={e => { matchChoice = e.currentTarget.value; teamOverride = null; }}>
          {#each schedule as m (m.matchKey)}<option value={m.matchKey}>{matchLabel(m.matchKey)}</option>{/each}
          <option value={OTHER}>Other…</option>
        </select>
      </label>
    {/if}
    {#if !schedule.length || matchChoice === OTHER}
      <label>Match number
        <input aria-label="Match number" value={otherMatch} inputmode="numeric" placeholder="e.g. 12 or sf3m1"
          oninput={e => { otherMatch = e.currentTarget.value; teamOverride = null; }} />
      </label>
    {/if}
    <label>Team
      <input aria-label="Team" value={teamText} inputmode="numeric" oninput={e => (teamOverride = e.currentTarget.value)} />
    </label>
  </div>

  {#if !scout.trim()}<p class="hint">Enter your name to start.</p>{/if}

  <div class="row">
    <button type="button" class="primary big" disabled={!canStart} onclick={start}>Start scouting</button>
    <button type="button" class="big" disabled={!canStart} onclick={() => (confirmNoShow = true)}>Robot not present</button>
  </div>

  <nav class="row">
    <button type="button" onclick={() => store.go({ name: 'pit' })}>Pit scouting</button>
    <button type="button" onclick={() => store.go({ name: 'records' })}>Past records</button>
    <button type="button" onclick={() => store.go({ name: 'settings' })}>Settings</button>
  </nav>
</section>

{#if confirmNoShow}
  <ConfirmDialog
    title="Robot not present?"
    confirmLabel="Yes, mark as not present"
    cancelLabel="Go back"
    onconfirm={noShow}
    oncancel={() => (confirmNoShow = false)}
  >
    <p>Team {team} in {matchKey ? matchLabel(matchKey) : ''} ({slotLabel(slot)}) will be recorded as not present. You can undo this from Past records.</p>
  </ConfirmDialog>
{/if}
```

- [ ] **Step 4: Implement `Setup` and `Settings`**

`app/src/screens/Setup.svelte`:

```svelte
<script lang="ts">
  import { SLOTS, type Slot } from '@stingr/shared';
  import { slotLabel } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();
  let name = $state(store.settings.deviceName);
  let slot = $state<Slot>(store.settings.defaultSlot);

  async function save() {
    if (!name.trim()) return;
    await store.saveSettings({ deviceName: name.trim(), defaultSlot: slot });
    store.go({ name: 'home' });
  }
</script>

<section>
  <h1>Set up this tablet</h1>
  <p>Give this tablet a name the hub will show (for example "Tablet 3") and the robot position it usually scouts.</p>
  <div class="row">
    <label>Tablet name <input aria-label="Tablet name" value={name} oninput={e => (name = e.currentTarget.value)} /></label>
    <label>Default slot
      <select aria-label="Default slot" value={slot} onchange={e => (slot = e.currentTarget.value as Slot)}>
        {#each SLOTS as s (s)}<option value={s}>{slotLabel(s)}</option>{/each}
      </select>
    </label>
  </div>
  <button type="button" class="primary big" disabled={!name.trim()} onclick={save}>Save</button>
</section>
```

`app/src/screens/Settings.svelte`:

```svelte
<script lang="ts">
  import { SLOTS, type Slot } from '@stingr/shared';
  import { onMount } from 'svelte';
  import { slotLabel } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();
  let name = $state(store.settings.deviceName);
  let slot = $state<Slot>(store.settings.defaultSlot);
  let saved = $state(false);
  let lastSync = $state<string | null>(null);

  onMount(async () => {
    lastSync = (await store.db.getKv('lastSyncAt')) ?? null;
  });

  async function save() {
    await store.saveSettings({ deviceName: name.trim() || store.settings.deviceName, defaultSlot: slot });
    saved = true;
  }
</script>

<section>
  <header class="bar">
    <h1>Settings</h1>
    <button type="button" onclick={() => store.go({ name: 'home' })}>Back</button>
  </header>
  <div class="row">
    <label>Tablet name <input aria-label="Tablet name" value={name} oninput={e => { name = e.currentTarget.value; saved = false; }} /></label>
    <label>Default slot
      <select aria-label="Default slot" value={slot} onchange={e => { slot = e.currentTarget.value as Slot; saved = false; }}>
        {#each SLOTS as s (s)}<option value={s}>{slotLabel(s)}</option>{/each}
      </select>
    </label>
    <button type="button" class="primary" onclick={save}>Save</button>
    {#if saved}<span>Saved ✓</span>{/if}
  </div>
  <dl>
    <dt>Device ID</dt><dd>{store.settings.deviceId}</dd>
    <dt>App version</dt><dd>{__BUILD_ID__}</dd>
    <dt>Last sync</dt><dd>{lastSync ? new Date(lastSync).toLocaleString() : 'Never'}</dd>
    <dt>Records on this tablet</dt><dd>{store.records.length} ({store.pendingCount} not synced)</dd>
  </dl>
</section>
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run --project app && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/Home.svelte app/src/screens/Setup.svelte app/src/screens/Settings.svelte app/test/home.test.ts app/test/setup.test.ts
git commit -m "feat(app): home, setup and settings screens"
```

---

### Task 11: Pit list, past records and QR view

**Files:**
- Create: `app/src/screens/PitList.svelte`, `app/src/screens/PastRecords.svelte`, `app/src/screens/QrView.svelte`
- Test: `app/test/pit.test.ts`, `app/test/records.test.ts`

**Interfaces:**
- Consumes: `AppStore` (Task 7); `pitTeams`, `pitStatus`, `parseTeamInput`, `recordTitle` (Task 4); `ConfirmDialog` (Task 8); shared `encodeRecordQr`; `qrcode` (`toString(text, { type: 'svg' })`).
- Produces:
  - `PitList` props `{ store }` — one `<li aria-label="Team N">` per team with status "Not scouted" / "Done ✓" / "Team not present" and buttons "Scout", "Not present" (confirm), "Undo / scout anyway", "Edit"; "Add a team" input + "Add"; "Back".
  - `PastRecords` props `{ store }` — one `<li aria-label={recordTitle}>` per record of the current event, newest first, with "Synced ✓" / "Not synced" / "Rejected: <reason>", "Edit" or "Undo / scout anyway", and "Show QR".
  - `QrView` props `{ store; id: string }` — renders the record's QR code(s) as SVG inside an element with `data-qr-text` holding the code's text; "Code n of N" with Previous/Next for multi-part codes; "Back" → records.

- [ ] **Step 1: Write the failing tests**

`app/test/pit.test.ts`:

```ts
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PitList from '../src/screens/PitList.svelte';
import { makeStore } from './helpers';

const row = (team: number) => screen.getByRole('listitem', { name: `Team ${team}` });

describe('PitList', () => {
  it('lists teams with their pit status and starts scouting one', async () => {
    const { store } = await makeStore();
    render(PitList, { store });
    expect(screen.getAllByRole('listitem')).toHaveLength(11);
    expect(within(row(5098)).getByText('Not scouted')).toBeTruthy();
    await fireEvent.click(within(row(5098)).getByRole('button', { name: 'Scout' }));
    await waitFor(() => expect(store.screen).toEqual({ name: 'form' }));
    expect(store.draft?.rec).toMatchObject({ kind: 'pit', team: 5098 });
  });

  it('marks a team not present after confirming, and can undo it', async () => {
    const { store } = await makeStore();
    render(PitList, { store });
    await fireEvent.click(within(row(5098)).getByRole('button', { name: 'Not present' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Yes, not present' }));
    await waitFor(() => expect(within(row(5098)).getByText('Team not present')).toBeTruthy());
    await fireEvent.click(within(row(5098)).getByRole('button', { name: 'Undo / scout anyway' }));
    await waitFor(() => expect(store.draft?.rec).toMatchObject({ kind: 'pit', team: 5098, revision: 2, noShow: false }));
  });

  it('adds a team by hand', async () => {
    const { store } = await makeStore();
    render(PitList, { store });
    await fireEvent.input(screen.getByLabelText('Add a team'), { target: { value: '254' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(row(254)).toBeTruthy());
  });

  it("asks for the scout's name first", async () => {
    const { store } = await makeStore({ settings: { scout: '' } });
    render(PitList, { store });
    expect(screen.getByText('Enter your name on the home screen first.')).toBeTruthy();
    expect((within(row(5098)).getByRole('button', { name: 'Scout' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

`app/test/records.test.ts`:

```ts
import { decodeRecordData, type FormKind, QrAssembler } from '@stingr/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PastRecords from '../src/screens/PastRecords.svelte';
import QrView from '../src/screens/QrView.svelte';
import { CONFIG, makeStore } from './helpers';

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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project app app/test/pit.test.ts app/test/records.test.ts`
Expected: FAIL — cannot resolve the screen components.

- [ ] **Step 3: Implement `app/src/screens/PitList.svelte`**

```svelte
<script lang="ts">
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import { parseTeamInput, pitStatus, pitTeams } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();

  const LABELS = { none: 'Not scouted', done: 'Done ✓', noshow: 'Team not present' } as const;
  let teams = $derived(pitTeams(store.config?.teams ?? [], store.extraTeams, store.eventRecords));
  let pitForm = $derived(store.form('pit'));
  let canScout = $derived(!!pitForm && !!store.event && store.settings.scout.trim() !== '');
  let addText = $state('');
  let confirmTeam = $state<number | null>(null);

  function latestPit(team: number, noShow: boolean) {
    return store.records
      .filter(r => r.rec.kind === 'pit' && r.rec.team === team && r.rec.noShow === noShow && (!store.event || r.rec.eventKey === store.event.key))
      .sort((a, b) => b.rec.updatedAt.localeCompare(a.rec.updatedAt))[0];
  }

  async function add() {
    const team = parseTeamInput(addText);
    if (team === null) return;
    await store.addExtraTeam(team);
    addText = '';
  }

  async function markAbsent() {
    const team = confirmTeam;
    confirmTeam = null;
    if (team !== null) await store.pitNoShow(team);
  }
</script>

<section>
  <header class="bar">
    <h1>Pit scouting</h1>
    <button type="button" onclick={() => store.go({ name: 'home' })}>Back</button>
  </header>
  {#if !pitForm}
    <p class="banner warn">The hub hasn't published a pit form yet.</p>
  {:else if !store.settings.scout.trim()}
    <p class="banner warn">Enter your name on the home screen first.</p>
  {/if}

  <ul class="list">
    {#each teams as t (t)}
      {@const status = pitStatus(store.eventRecords, t)}
      <li aria-label="Team {t}">
        <strong>{t}</strong>
        <span class="grow status {status}">{LABELS[status]}</span>
        {#if status === 'none'}
          <button type="button" class="primary" disabled={!canScout} onclick={() => store.startPit(t)}>Scout</button>
          <button type="button" disabled={!canScout} onclick={() => (confirmTeam = t)}>Not present</button>
        {:else if status === 'noshow'}
          <button type="button" disabled={!canScout} onclick={() => { const r = latestPit(t, true); if (r) void store.undoNoShow(r.id); }}>Undo / scout anyway</button>
        {:else}
          <button type="button" onclick={() => { const r = latestPit(t, false); if (r) void store.editRecord(r.id); }}>Edit</button>
        {/if}
      </li>
    {/each}
  </ul>

  <div class="row">
    <label>Add a team <input aria-label="Add a team" value={addText} inputmode="numeric" oninput={e => (addText = e.currentTarget.value)} /></label>
    <button type="button" onclick={add}>Add</button>
  </div>
</section>

{#if confirmTeam !== null}
  <ConfirmDialog
    title="Team {confirmTeam} not present?"
    confirmLabel="Yes, not present"
    cancelLabel="Go back"
    onconfirm={markAbsent}
    oncancel={() => (confirmTeam = null)}
  >
    <p>You won't need to answer pit questions for this team. You can undo this.</p>
  </ConfirmDialog>
{/if}
```

- [ ] **Step 4: Implement `PastRecords` and `QrView`**

`app/src/screens/PastRecords.svelte`:

```svelte
<script lang="ts">
  import { recordTitle } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store }: { store: AppStore } = $props();

  let list = $derived(
    store.records
      .filter(r => !store.event || r.rec.eventKey === store.event.key)
      .toSorted((a, b) => b.rec.updatedAt.localeCompare(a.rec.updatedAt)),
  );
</script>

<section>
  <header class="bar">
    <h1>Past records</h1>
    <button type="button" onclick={() => store.go({ name: 'home' })}>Back</button>
  </header>
  {#if list.length === 0}<p>No records yet.</p>{/if}
  <ul class="list">
    {#each list as r (r.id)}
      <li aria-label={recordTitle(r.rec)}>
        <span class="grow">
          {recordTitle(r.rec)}{#if r.rec.noShow} · <em>not present</em>{/if}{#if r.rec.missed.length} · {r.rec.missed.length} missed{/if}
        </span>
        <span class={r.sync}>{r.sync === 'synced' ? 'Synced ✓' : r.sync === 'rejected' ? `Rejected: ${r.reason ?? ''}` : 'Not synced'}</span>
        {#if r.rec.noShow}
          <button type="button" onclick={() => store.undoNoShow(r.id)}>Undo / scout anyway</button>
        {:else}
          <button type="button" onclick={() => store.editRecord(r.id)}>Edit</button>
        {/if}
        <button type="button" onclick={() => store.go({ name: 'qr', id: r.id })}>Show QR</button>
      </li>
    {/each}
  </ul>
</section>
```

`app/src/screens/QrView.svelte`:

```svelte
<script lang="ts">
  import { encodeRecordQr, type FormDef, type ScoutRecord } from '@stingr/shared';
  import QRCode from 'qrcode';
  import { recordTitle } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store, id }: { store: AppStore; id: string } = $props();

  let local = $derived(store.records.find(r => r.id === id) ?? null);
  let codes = $state<{ text: string; svg: string }[]>([]);
  let part = $state(0);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!local) return;
    const rec = $state.snapshot(local.rec) as ScoutRecord;
    const form = store.formOf(rec);
    if (!form) {
      error = `Form version ${rec.formVersion} isn't on this tablet, so this record can't be shown as a QR code.`;
      return;
    }
    let cancelled = false;
    encodeRecordQr($state.snapshot(form) as FormDef, rec)
      .then(chunks => Promise.all(chunks.map(async text => ({ text, svg: await QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 }) }))))
      .then(
        made => { if (!cancelled) { codes = made; part = 0; } },
        e => { if (!cancelled) error = (e as Error).message; },
      );
    return () => { cancelled = true; };
  });
</script>

<section>
  <header class="bar">
    <h1>{local ? recordTitle(local.rec) : 'Record'}</h1>
    <button type="button" onclick={() => store.go({ name: 'records' })}>Back</button>
  </header>
  {#if error}
    <p class="error">{error}</p>
  {:else if codes.length}
    <div class="qr" data-qr-text={codes[part].text}>{@html codes[part].svg}</div>
    {#if codes.length > 1}
      <div class="nav">
        <button type="button" disabled={part === 0} onclick={() => part--}>‹ Previous</button>
        <span>Code {part + 1} of {codes.length}</span>
        <button type="button" disabled={part === codes.length - 1} onclick={() => part++}>Next ›</button>
      </div>
    {/if}
    <p>Scan {codes.length > 1 ? 'each code' : 'this code'} with the hub's QR scanner.</p>
  {:else}
    <p>Making QR code…</p>
  {/if}
</section>
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run --project app && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/PitList.svelte app/src/screens/PastRecords.svelte app/src/screens/QrView.svelte app/test/pit.test.ts app/test/records.test.ts
git commit -m "feat(app): pit list, past records and QR view"
```

---

### Task 12: App shell, sync overlay, start-up and updates

**Files:**
- Create: `app/src/components/SyncOverlay.svelte`, `app/src/lib/swUpdate.ts`
- Modify (replace placeholders): `app/src/App.svelte`, `app/src/main.ts`
- Delete: `app/test/scaffold.test.ts` (superseded by `app.test.ts`)
- Test: `app/test/app.test.ts`

**Interfaces:**
- Consumes: everything above; `SyncController`, `SyncHandle`, `SyncView` (Task 6); `pingHub`, `runSync` (Task 5); `openStingrDb` (Task 3).
- Produces:
  - `App` props `{ store: AppStore; sync: SyncHandle }` — top bar (brand, event name, "All synced ✓" / "N unsynced"), banners when storage isn't persistent or has under 50 MB free, current screen, sync overlay.
  - `SyncOverlay` props `{ view: SyncView; onretry(): void; ondismiss(): void }` — "Syncing — do not unplug" with progress and "n of N items"; "✓ Sync complete — safe to unplug" + "OK"; "Sync failed" + message + "Retry" / "Close".
  - `watchForUpdates(o: { currentBuild: string; sync: Pick<SyncHandle, 'subscribe'>; isSafe(): boolean; intervalMs?: number }): Promise<void>` — registers `./sw.js`; when the hub reports a different build, asks the browser to fetch the new worker; activates it (and reloads) only when `isSafe()`.
  - `main.ts` wires it together: open DB → `store.load()` → `SyncController` (ping every 3 s) → mount → `watchForUpdates` (safe = home screen, no draft, not syncing).

- [ ] **Step 1: Write the failing tests**

`app/test/app.test.ts`:

```ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App.svelte';
import type { SyncView } from '../src/lib/syncController';
import { makeStore } from './helpers';

function fakeSync() {
  const listeners = new Set<(v: SyncView) => void>();
  let view: SyncView = { phase: 'offline', progress: { done: 0, total: 0 }, error: null, overlay: false, hubBuild: null };
  return {
    get view() { return view; },
    subscribe(fn: (v: SyncView) => void) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    retry: vi.fn(async () => {}),
    dismiss: vi.fn(),
    emit(patch: Partial<SyncView>) {
      view = { ...view, ...patch };
      for (const l of listeners) l(view);
    },
  };
}

describe('App', () => {
  it('shows the home screen with the event and sync status', async () => {
    const { store } = await makeStore();
    render(App, { store, sync: fakeSync() });
    expect(screen.getByText('Test Event')).toBeTruthy();
    expect(screen.getByText('All synced ✓')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start scouting' })).toBeTruthy();
  });

  it('counts records waiting to sync', async () => {
    const { store } = await makeStore();
    await store.matchNoShow({ matchKey: 'qm1', slot: 'red1', team: 5098 });
    render(App, { store, sync: fakeSync() });
    expect(screen.getByText('1 unsynced')).toBeTruthy();
  });

  it('asks for setup on a new tablet', async () => {
    const { store } = await makeStore({ settings: { deviceName: '' } });
    render(App, { store, sync: fakeSync() });
    expect(screen.getByRole('heading', { name: 'Set up this tablet' })).toBeTruthy();
  });

  it('reopens an unfinished form', async () => {
    const { store } = await makeStore();
    await store.startMatch({ matchKey: 'qm1', slot: 'red1', team: 5098 });
    render(App, { store, sync: fakeSync() });
    expect(screen.getByRole('heading', { name: 'Qual 1 · Red 1 · Team 5098' })).toBeTruthy();
  });

  it('warns when storage is not protected or nearly full', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: async () => false, estimate: async () => ({ quota: 100 * 1024 * 1024, usage: 90 * 1024 * 1024 }) },
    });
    try {
      const { store } = await makeStore();
      render(App, { store, sync: fakeSync() });
      expect(await screen.findByText(/hasn't protected the app's storage/)).toBeTruthy();
      expect(await screen.findByText(/almost out of storage space/)).toBeTruthy();
    } finally {
      delete (navigator as { storage?: unknown }).storage;
    }
  });

  it('shows sync progress, completion and errors', async () => {
    const { store } = await makeStore();
    const sync = fakeSync();
    render(App, { store, sync });

    sync.emit({ phase: 'syncing', overlay: true, progress: { done: 1, total: 3 } });
    await tick();
    expect(screen.getByText('Syncing — do not unplug')).toBeTruthy();
    expect(screen.getByText('1 of 3 items')).toBeTruthy();

    sync.emit({ phase: 'done' });
    await tick();
    expect(screen.getByText('✓ Sync complete — safe to unplug')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(sync.dismiss).toHaveBeenCalled();

    sync.emit({ phase: 'error', error: 'Disk full' });
    await tick();
    expect(screen.getByText('Disk full')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(sync.retry).toHaveBeenCalled();
  });
});
```

Then delete the placeholder test: `git rm app/test/scaffold.test.ts`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project app app/test/app.test.ts`
Expected: FAIL — the placeholder `App.svelte` renders only a heading, so "Test Event" is not found.

- [ ] **Step 3: Implement `app/src/components/SyncOverlay.svelte`**

```svelte
<script lang="ts">
  import type { SyncView } from '../lib/syncController';

  let { view, onretry, ondismiss }: { view: SyncView; onretry: () => void; ondismiss: () => void } = $props();
</script>

{#if view.overlay}
  <div class="sync-overlay {view.phase}" role="alertdialog" aria-label="Sync">
    {#if view.phase === 'syncing'}
      <h2>Syncing — do not unplug</h2>
      <progress max={view.progress.total || 1} value={view.progress.done}></progress>
      <p>{view.progress.done} of {view.progress.total} items</p>
    {:else if view.phase === 'done'}
      <h2>✓ Sync complete — safe to unplug</h2>
      <button type="button" class="big" onclick={ondismiss}>OK</button>
    {:else if view.phase === 'error'}
      <h2>Sync failed</h2>
      <p>{view.error}</p>
      <p>Nothing was lost. Records that didn't sync stay on this tablet.</p>
      <div class="row">
        <button type="button" class="big" onclick={onretry}>Retry</button>
        <button type="button" onclick={ondismiss}>Close</button>
      </div>
    {/if}
  </div>
{/if}
```

- [ ] **Step 4: Replace `app/src/App.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import SyncOverlay from './components/SyncOverlay.svelte';
  import type { AppStore } from './lib/store.svelte';
  import type { SyncHandle, SyncView } from './lib/syncController';
  import FormScreen from './screens/FormScreen.svelte';
  import Home from './screens/Home.svelte';
  import PastRecords from './screens/PastRecords.svelte';
  import PitList from './screens/PitList.svelte';
  import QrView from './screens/QrView.svelte';
  import Settings from './screens/Settings.svelte';
  import Setup from './screens/Setup.svelte';

  let { store, sync }: { store: AppStore; sync: SyncHandle } = $props();
  let view = $state<SyncView>(sync.view);
  let persisted = $state<boolean | null>(null);
  let lowStorage = $state(false);

  onMount(() => sync.subscribe(v => { view = v; }));
  onMount(() => {
    navigator.storage?.persist?.().then(p => { persisted = p; }, () => { persisted = false; });
    navigator.storage?.estimate?.().then(e => {
      lowStorage = e.quota !== undefined && e.usage !== undefined && e.quota - e.usage < 50 * 1024 * 1024;
    }, () => {});
  });
</script>

<header class="topbar">
  <span class="brand">Stingr Scout</span>
  <span class="event">{store.event?.name ?? 'No event loaded'}</span>
  <span class="badge" class:ok={store.pendingCount === 0}>
    {store.pendingCount === 0 ? 'All synced ✓' : `${store.pendingCount} unsynced`}
  </span>
</header>

{#if persisted === false}
  <p class="banner warn">This tablet hasn't protected the app's storage. Don't clear Chrome's data until everything is synced.</p>
{/if}
{#if lowStorage}
  <p class="banner warn">This tablet is almost out of storage space. Sync soon, and avoid taking more photos.</p>
{/if}

<main>
  {#if store.screen.name === 'setup'}
    <Setup {store} />
  {:else if store.screen.name === 'form' && store.draft}
    <FormScreen {store} />
  {:else if store.screen.name === 'pit'}
    <PitList {store} />
  {:else if store.screen.name === 'records'}
    <PastRecords {store} />
  {:else if store.screen.name === 'qr'}
    <QrView {store} id={store.screen.id} />
  {:else if store.screen.name === 'settings'}
    <Settings {store} />
  {:else}
    <Home {store} />
  {/if}
</main>

<SyncOverlay {view} onretry={() => void sync.retry()} ondismiss={() => sync.dismiss()} />
```

- [ ] **Step 5: Implement `app/src/lib/swUpdate.ts` and replace `app/src/main.ts`**

`app/src/lib/swUpdate.ts`:

```ts
import type { SyncHandle } from './syncController';

export interface UpdateOptions {
  currentBuild: string;
  sync: Pick<SyncHandle, 'subscribe'>;
  isSafe: () => boolean;
  intervalMs?: number;
}

/**
 * Register the service worker. When the hub reports a different app build, fetch the new worker;
 * once it has installed, switch to it only while nobody is filling in a form.
 */
export async function watchForUpdates(o: UpdateOptions): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register('./sw.js');
  } catch {
    return; // e.g. the Vite dev server, which has no sw.js
  }

  let lastSeen: string | null = null;
  o.sync.subscribe(view => {
    if (!view.hubBuild || view.hubBuild === lastSeen) return;
    lastSeen = view.hubBuild;
    if (view.hubBuild !== o.currentBuild) void reg.update().catch(() => {});
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // the very first install needs no reload
    reloading = true;
    location.reload();
  });

  setInterval(() => {
    if (reg.waiting && o.isSafe()) reg.waiting.postMessage('skipWaiting');
  }, o.intervalMs ?? 2000);
}
```

`app/src/main.ts` (full file):

```ts
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { openStingrDb } from './lib/db';
import { AppStore } from './lib/store.svelte';
import { watchForUpdates } from './lib/swUpdate';
import { pingHub, runSync } from './lib/sync';
import { SyncController } from './lib/syncController';

// Calling the global fetch through a wrapper keeps it bound (Chrome throws "Illegal invocation" otherwise).
const http: typeof fetch = (input, init) => fetch(input, init);

const db = await openStingrDb();
const store = new AppStore({ db });
await store.load();

const sync = new SyncController({
  ping: () => pingHub(http),
  sync: onProgress =>
    runSync(
      { db, fetch: http, device: { id: store.settings.deviceId, name: store.settings.deviceName }, now: () => new Date().toISOString() },
      onProgress,
    ),
  hasPending: async () => (await db.listRecords()).some(r => r.sync === 'pending'),
  onSynced: () => store.reload(),
});

mount(App, { target: document.getElementById('app')!, props: { store, sync } });
sync.start();

void watchForUpdates({
  currentBuild: __BUILD_ID__,
  sync,
  isSafe: () => store.screen.name === 'home' && !store.draft && sync.view.phase !== 'syncing',
});
```

`swUpdate.ts` and `main.ts` are browser start-up glue with no unit tests; Task 14 (Playwright, real service worker) and Task 15 (real tablet, including an update) exercise them.

- [ ] **Step 6: Run tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests PASS in both projects (no `scaffold.test.ts` any more); no type errors; build succeeds and writes `app/dist/sw.js`.

- [ ] **Step 7: Commit**

```bash
git add -A app
git commit -m "feat(app): app shell with sync overlay, start-up wiring and safe updates"
```

---

### Task 13: Hub serves the app with the right build id and cache headers

**Files:**
- Create: `hub/server/src/appBuild.ts`
- Modify: `hub/server/src/app.ts` (`registerStatic`), `hub/server/src/main.ts`
- Test: `hub/server/test/static.test.ts`

**Interfaces:**
- Consumes: `buildApp`, `makeApp` (Plan 1); `app/dist/build.json` (Task 1).
- Produces:
  - `resolveAppBuild(appDist: string, fromEnv?: string): string` — `fromEnv` (defaults to `process.env.STINGR_APP_BUILD`) if set, else `build` from `<appDist>/build.json`, else `'dev'`
  - `index.html`, `sw.js`, `build.json` and `manifest.webmanifest` are served with `cache-control: no-cache`; hashed assets keep the default caching.

- [ ] **Step 1: Write the failing tests**

`hub/server/test/static.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveAppBuild } from '../src/appBuild';
import { makeApp } from './helpers';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function builtApp() {
  const dir = mkdtempSync(join(tmpdir(), 'stingr-dist-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'index.html'), '<h1>app</h1>');
  writeFileSync(join(dir, 'sw.js'), '// worker');
  writeFileSync(join(dir, 'build.json'), JSON.stringify({ build: '20271015120000' }));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), '// code');
  return dir;
}

describe('resolveAppBuild', () => {
  it('prefers the environment, then build.json, then "dev"', () => {
    const dir = builtApp();
    expect(resolveAppBuild(dir, 'from-env')).toBe('from-env');
    expect(resolveAppBuild(dir, undefined)).toBe('20271015120000');
    expect(resolveAppBuild(join(dir, 'missing'), undefined)).toBe('dev');
  });
});

describe('serving the tablet app', () => {
  it('asks browsers to re-check the app shell but not hashed assets', async () => {
    const app = await makeApp({ staticRoots: { app: builtApp() } });
    for (const url of ['/', '/sw.js', '/build.json']) {
      const res = await app.inject({ url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-cache');
    }
    const asset = await app.inject({ url: '/assets/index-abc123.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).not.toBe('no-cache');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project node hub/server/test/static.test.ts`
Expected: FAIL — cannot resolve `../src/appBuild`.

- [ ] **Step 3: Implement**

`hub/server/src/appBuild.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The tablet app's build id: what tablets compare against to notice an update. */
export function resolveAppBuild(appDist: string, fromEnv: string | undefined = process.env.STINGR_APP_BUILD): string {
  if (fromEnv) return fromEnv;
  try {
    const parsed = JSON.parse(readFileSync(join(appDist, 'build.json'), 'utf8')) as { build?: unknown };
    if (typeof parsed.build === 'string' && parsed.build) return parsed.build;
  } catch {
    // not built yet
  }
  return 'dev';
}
```

In `hub/server/src/app.ts`, replace the first `if` block of `registerStatic` (the one registering `roots.app`) with:

```ts
  if (roots.app && existsSync(roots.app)) {
    await app.register(fastifyStatic, {
      root: roots.app,
      prefix: '/',
      // The app shell must be re-checked on every load so tablets notice a new version.
      setHeaders: (res, path) => {
        if (/(^|[\\/])(index\.html|sw\.js|build\.json|manifest\.webmanifest)$/.test(path)) res.setHeader('cache-control', 'no-cache');
      },
    });
  } else {
```

(the existing `else` branch with the "not been built yet" route stays unchanged).

In `hub/server/src/main.ts`, add `import { resolveAppBuild } from './appBuild';` and replace the line `appBuild: process.env.STINGR_APP_BUILD ?? 'dev',` with:

```ts
  appBuild: resolveAppBuild(join(webRoot, 'app', 'dist')),
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add hub/server
git commit -m "feat(hub): serve the tablet app with its build id and no-cache app shell"
```

---

### Task 14: End-to-end tests with a real hub and browser

**Files:**
- Modify: `package.json` (dev dependency + `e2e` script), `tsconfig.json` (include `e2e`, `playwright.config.ts`), `README.md`
- Create: `playwright.config.ts`, `e2e/tablet.spec.ts`

**Interfaces:**
- Consumes: the built app (Task 12), the hub with Task 13's changes, shared fixtures.
- Produces: `npm run e2e` — builds the app, starts a hub on port 5199 with a temporary data folder and `ADB=false`, and drives Chromium at 1280×800.

- [ ] **Step 1: Install Playwright and wire the script**

```bash
npm install -D --save-exact @playwright/test@1.64.1
npm pkg set scripts.e2e="playwright test"
npx playwright install chromium
```

Expected: `package.json` lists `"@playwright/test": "1.64.1"` and `"e2e": "playwright test"`; the browser download completes.

In `tsconfig.json`, extend `include` to:

```json
  "include": ["shared", "hub/server", "app/src", "app/test", "app/vite.config.ts", "vitest.config.ts", "e2e", "playwright.config.ts"]
```

`playwright.config.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const PORT = 5199;
const dataDir = mkdtempSync(join(tmpdir(), 'stingr-e2e-'));

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'npm run build && npx tsx hub/server/src/main.ts --no-open',
    url: `http://127.0.0.1:${PORT}/api/ping`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...(process.env as Record<string, string>),
      STINGR_PORT: String(PORT),
      STINGR_DATA_DIR: dataDir,
      STINGR_APP_BUILD: 'e2e',
      ADB: 'false', // never touch a real tablet from tests
    },
  },
});
```

- [ ] **Step 2: Write the end-to-end tests**

`e2e/tablet.spec.ts`:

```ts
import { type APIRequestContext, expect, type Page, request, test } from '@playwright/test';
import { matchForm, pitForm } from '../shared/test/fixtures';

let api: APIRequestContext;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  api = await request.newContext({ baseURL: 'http://localhost:5199' });
  expect((await api.post('/api/events', { data: { key: '2027e2e', name: 'E2E Regional' } })).ok()).toBe(true);
  for (const form of [matchForm(), pitForm()]) {
    expect((await api.put(`/api/forms/${form.kind}/draft`, { data: form })).ok()).toBe(true);
    expect((await api.post(`/api/forms/${form.kind}/publish`)).ok()).toBe(true);
  }
  const csv = '1,5098,2,3,4,5,6\n2,7,8,9,10,11,12';
  expect((await api.post('/api/schedule/csv', { headers: { 'content-type': 'text/csv' }, data: csv })).ok()).toBe(true);
});

test.afterAll(async () => {
  await api.dispose();
});

async function dismissSync(page: Page) {
  await expect(page.getByText('Sync complete — safe to unplug')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'OK' }).click();
}

/** A brand-new tablet: first sync, name it, enter the scout's name. */
async function firstLaunch(page: Page) {
  await page.goto('/');
  await dismissSync(page);
  await page.getByLabel('Tablet name').fill('Tablet 1');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByLabel('Your name').fill('Ada');
  await page.getByLabel('Your name').blur();
}

test('scouts a match and syncs it to the hub', async ({ page }) => {
  await firstLaunch(page);
  await expect(page.getByText('E2E Regional')).toBeVisible();
  await expect(page.getByLabel('Team')).toHaveValue('5098');
  await page.getByRole('button', { name: 'Start scouting' }).click();

  const coral = page.getByRole('region', { name: 'Coral scored' });
  await coral.getByRole('button', { name: 'plus' }).click();
  await coral.getByRole('button', { name: 'plus' }).click();
  await page.getByRole('button', { name: 'Endgame' }).click();
  await page.getByRole('region', { name: 'Climb' }).getByRole('button', { name: 'Deep' }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();

  await dismissSync(page);
  await expect(page.getByText('All synced ✓')).toBeVisible();
  const records = await (await api.get('/api/records?kind=match')).json();
  expect(records).toContainEqual(expect.objectContaining({
    team: 5098, matchKey: 'qm1', slot: 'red1', scout: 'Ada',
    answers: expect.objectContaining({ auto_coral: 2, climb: 'deep' }),
  }));
});

test('keeps working offline', async ({ page, context }) => {
  await firstLaunch(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // now controlled by the service worker
  await expect(page.getByRole('button', { name: 'Start scouting' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start scouting' })).toBeVisible();
  await expect(page.getByText('E2E Regional')).toBeVisible();
  await expect(page.getByLabel('Your name')).toHaveValue('Ada');
  await context.setOffline(false);
});

test('QR codes made on the tablet decode on the hub', async ({ page }) => {
  await firstLaunch(page);
  await page.getByRole('button', { name: 'Start scouting' }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('button', { name: 'Submit and mark as missed' }).click();
  await dismissSync(page);

  await page.getByRole('button', { name: 'Past records' }).click();
  await page.getByRole('button', { name: 'Show QR' }).first().click();
  const qr = page.locator('[data-qr-text]');
  await expect(qr.locator('svg')).toBeVisible();
  const text = await qr.getAttribute('data-qr-text');
  const res = await (await api.post('/api/qr', { data: { text } })).json();
  expect(res.status).toBe('duplicate'); // the same record already arrived over USB
});
```

- [ ] **Step 3: Run the end-to-end tests**

Run: `npm run e2e`
Expected: 3 passed. (If one fails, open the trace with `npx playwright show-report` and fix the app, not the test, unless the test contradicts the spec.)

- [ ] **Step 4: Document the commands**

In `README.md`, replace the Development code block with:

````markdown
```bash
npm install
npm test            # unit, component and API tests
npm run typecheck
npm run build       # build the tablet app into app/dist (the hub serves it)
npm run hub         # start the hub at http://localhost:5098/hub/ (add `-- --no-open` to skip the browser)
npm run dev:app     # tablet app with live reload at http://localhost:5173 (talks to a hub on 5098)
npm run e2e         # end-to-end tests: real hub + Chromium
```
````

- [ ] **Step 5: Run everything and commit**

Run: `npm test && npm run typecheck && npm run e2e`
Expected: all green.

```bash
git add package.json package-lock.json tsconfig.json playwright.config.ts e2e README.md
git commit -m "test: end-to-end tablet flows against a real hub"
```

---

### Task 15: Real-tablet check on the ZenPad

**This task needs the human partner at the tablet.** It uses a small dev script to load demo data into a running hub.

**Files:**
- Create: `scripts/seed-demo.ts`, `docs/superpowers/notes/2026-10-15-tablet-app-device-check.md`

**Interfaces:**
- Consumes: the built app and hub; shared fixtures.
- Produces: `npx tsx scripts/seed-demo.ts [port]` — creates event `2027demo` "Demo Event", publishes the fixture match form (with a real field image) and pit form, and imports a 12-match schedule with team 5098 in Qual 1 Red 1.

- [ ] **Step 1: Write the seeding script**

`scripts/seed-demo.ts`:

```ts
// Dev helper: load a demo event, forms and schedule into a running hub.
// Usage: npx tsx scripts/seed-demo.ts [port]
import { deflateSync } from 'node:zlib';
import { matchForm, pitForm } from '../shared/test/fixtures';

const base = `http://127.0.0.1:${process.argv[2] ?? 5098}`;

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A green field with a white centre line, red end on the left and blue on the right. */
function fieldPng(w: number, h: number): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const [r, g, b] = Math.abs(x - w / 2) < 2 ? [255, 255, 255] : x < w * 0.08 ? [198, 40, 40] : x > w * 0.92 ? [21, 101, 192] : [46, 125, 50];
      row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function call(method: string, path: string, body?: unknown, type = 'application/json'): Promise<unknown> {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': type },
    body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : String(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

await call('POST', '/api/events', { key: '2027demo', name: 'Demo Event' });
await call('PUT', '/api/events/current', { key: '2027demo' });
const match = matchForm();
match.assets.field = fieldPng(600, 300);
for (const form of [match, pitForm()]) {
  await call('PUT', `/api/forms/${form.kind}/draft`, form);
  await call('POST', `/api/forms/${form.kind}/publish`);
}
const teams = [5098, 254, 1678, 118, 2056, 148, 971, 3476, 1323, 6328, 4414, 2910];
const rows = Array.from({ length: 12 }, (_, i) => [i + 1, ...[0, 1, 2, 3, 4, 5].map(j => teams[(i * 5 + j) % teams.length])].join(','));
await call('POST', '/api/schedule/csv', rows.join('\n'), 'text/csv');
console.log('Demo event loaded: 12 matches, match and pit forms.');
```

- [ ] **Step 2: Start the hub with the built app and seed it**

```bash
npm run build
STINGR_DATA_DIR=$(mktemp -d) npm run hub -- --no-open &
curl -s --retry 20 --retry-connrefused --retry-delay 1 http://127.0.0.1:5098/api/ping
npx tsx scripts/seed-demo.ts
adb reverse --list
adb shell input keyevent KEYCODE_WAKEUP
adb shell am start -a android.intent.action.VIEW -d http://localhost:5098/ -p com.android.chrome
```

Expected: ping returns the build id from `app/dist/build.json`; the seed prints its message; `adb reverse --list` shows `tcp:5098`; Chrome opens Stingr Scout on the tablet with the green "Sync complete" screen.

- [ ] **Step 3: Human partner runs the checklist on the tablet**

Ask the human partner to do each item and report what happened (take screenshots with `adb exec-out screencap -p > file.png` to check):
1. Remove the old **Probe** icon from the home screen. In Chrome: ⋮ → **Install app**; open **Stingr Scout** from its icon.
2. Tap OK on the sync screen, name the tablet, enter a scout name. The event shows "Demo Event" and Team 5098 for Qual 1 / Red 1.
3. Scout Qual 1: tap + on Coral twice, tap the field map (dot appears where tapped), start and stop the climb timer, pick a climb, mark Defense as missed, type a comment. Submit. The blue "Syncing — do not unplug" screen then the green "safe to unplug" screen appear.
4. Pit scouting → Team 254 → Scout → Review → **Take photo** (camera opens; take a picture; thumbnail appears) → Submit. A sync uploads it.
5. Start Qual 2, enter one value, then on the laptop run `adb reboot`. After restart, open the app from its icon: the Qual 2 form reopens with the value still there. Discard it.
6. Unplug the cable, scout and submit Qual 2: the badge shows "1 unsynced" and no sync screen appears. Plug back in: it syncs automatically within a few seconds.
7. Past records → Show QR on any record: a QR code fills the screen.
8. Update check: on the laptop, stop the hub, run `npm run build`, start the hub again (same `STINGR_DATA_DIR`). With the tablet on the home screen and plugged in, within a few seconds the app reloads; Settings → App version shows the new build id.

Then verify on the laptop:

```bash
curl -s http://127.0.0.1:5098/api/records?kind=match | head -c 600; echo
curl -s http://127.0.0.1:5098/api/records?kind=pit | head -c 400; echo
```

Expected: the Qual 1 record with `auto_coral: 2`, `start_pos` with one point, `climb_time` > 0 and `missed` containing `defense`; the Team 254 pit record with one `photoIds` entry, and `curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:5098/api/photos/<that id>` prints `200 image/jpeg`.

- [ ] **Step 4: Record findings and commit**

Write `docs/superpowers/notes/2026-10-15-tablet-app-device-check.md` with a table of the eight checks (passed / what happened), any problems found, and screenshots' observations. Problems that block scouting get fixed before the plan is complete (each with a failing test first where it can be reproduced off-device).

```bash
git add scripts/seed-demo.ts docs/superpowers/notes/2026-10-15-tablet-app-device-check.md
git commit -m "docs: tablet app checked on the ZenPad; demo seeding script"
```
