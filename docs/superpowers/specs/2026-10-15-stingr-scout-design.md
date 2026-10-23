# Stingr Scout — Design

Date: 2026-10-15
Status: Draft for review

## 1. Purpose

FRC Team 5098 needs a scouting system that:

- works fully **offline** at events (no internet, and no team Wi-Fi networks — FRC events prohibit them);
- lets the team **define its own questions**, with enough question types to handle an unknown 2027 game;
- runs on the team's existing **Android tablets**, installed **without Google Play**;
- collects all data on a **central Linux laptop** ("the hub") for analysis and export.

Success looks like: before an event, a mentor builds the match and pit forms on the hub, plugs each tablet in once to load forms and the schedule; during the event, scouts fill forms on tablets and sync by plugging into the hub (or via QR codes); the hub shows coverage gaps, per-team summaries with estimated points, and exports CSV for deeper analysis.

## 2. Target hardware (measured)

Tablets — Asus ZenPad 10 (model P00C):

| | |
|---|---|
| Android | 7.0 (API 24), firmware Dec 2017 |
| Chrome | 119 — the final Chrome release for Android 7; will never update |
| System WebView | 61 (not used) |
| Screen | 1280×800 @ 160 dpi (10") |
| CPU | arm64-v8a |
| Camera | yes, autofocus |
| Free storage | ~5.7 GB |

Hub — a Linux laptop running Ubuntu/Debian (not the development machine). Development machine: Ubuntu 26.04, Node 22.22, has webcam.

## 3. Architecture

```
┌─────────────── Linux laptop (hub) ───────────────┐
│  hub server (Node + node:sqlite)                  │
│   ├─ serves the tablet app (PWA)                  │
│   ├─ sync API  (/api/*)                           │
│   ├─ hub UI (/hub): forms editor, event setup,    │
│   │   coverage, team summaries, CSV export,       │
│   │   QR scanner (webcam), backup                 │
│   └─ USB watcher: tablet plugged in → adb reverse │
└──────────────▲────────────────────────────────────┘
               │ USB cable; adb reverse tcp:5098 → tablet's localhost:5098
┌──────────────┴──── Tablet (Chrome 119, home-screen app) ┐
│  service worker (offline cache) + IndexedDB             │
│  scout picks match & slot → fills form → saved locally  │
│  syncs automatically whenever hub reachable; QR fallback│
└─────────────────────────────────────────────────────────┘
```

The hub server listens **only on 127.0.0.1:5098**. Tablets reach it through `adb reverse`, which maps the tablet's `localhost:5098` to the hub over USB. Nothing is exposed on any network. `localhost` is a secure context, so service workers, IndexedDB persistence, camera and Wake Lock all work over plain HTTP.

### 3.1 Repository layout

```
stingr-scout/
  shared/   form/record types, validation, scoring, QR codec (used by app and hub)
  app/      tablet PWA (Svelte + Vite)
  hub/
    server/ Node/Fastify server, SQLite, sync API, TBA client, adb watcher, CSV export
    ui/     hub web UI (Svelte + Vite)
  scripts/  release packaging, install.sh
  docs/
```

TypeScript throughout. npm workspaces.

### 3.2 Key technology choices

- **Tablet app:** Svelte + Vite, a PWA with a service worker and IndexedDB. Svelte keeps the bundle small for old tablets. The target is Chrome 119, so modern JS works without legacy transpilation.
- **Hub server:** Node, Fastify, and the **built-in `node:sqlite`** (Node ≥ 22.13). No native modules, so nothing needs compiling on the target machine.
- **QR:** `qrcode` (generating on the tablet) and `jsQR` (scanning in the hub UI from the webcam).
- **Tests:** Vitest for units, Playwright for end-to-end.

## 4. Data model

### 4.1 Forms

There are two form kinds: `match` and `pit`. Each kind has a sequence of **published versions**. A version is immutable once published, and editing a form creates a new draft that becomes the next version when published.

```ts
type FormDef = {
  kind: 'match' | 'pit';
  version: number;
  sections: Section[];          // e.g. Auto, Teleop, Endgame, Notes
  assets: Record<string, string>; // assetId → image data (field map images)
};
type Section = { id: string; title: string; questions: Question[] };
type QuestionBase = {
  key: string;        // stable identifier, CSV column name, e.g. "auto_coral_l4"
  label: string;
  help?: string;
  required: boolean;
  summary?: 'avg' | 'pct' | 'distribution' | 'list' | 'scatter' | 'none'; // default by type
};
type Question = QuestionBase & (
  | { type: 'counter';  min: number; max?: number; step: number; default: number; points?: number }
  | { type: 'toggle';   default: boolean; points?: number }
  | { type: 'choice';   options: { value: string; label: string; points?: number }[]; display: 'buttons' | 'dropdown' }
  | { type: 'multi';    options: { value: string; label: string }[] }
  | { type: 'number';   min?: number; max?: number; integer: boolean }
  | { type: 'text';     multiline: boolean }
  | { type: 'rating';   max: number }                 // 1..max, default max 5
  | { type: 'timer' }                                 // value: seconds, 0.1 s precision
  | { type: 'fieldmap'; assetId: string; maxPoints: number; redSide: 'left' | 'right' } // where Red is in the image
  | { type: 'dimensions'; parts: ('length' | 'width' | 'height')[] } // value: { length?, width?, height? } in inches
);
```

Question keys must be unique within a form kind across all versions, with the same meaning. The editor warns if a key is reused with a different type.

**Initial values:**
- **Counters and toggles** start at their `default`, which counts as an answer.
- **All other types** start empty (`null`).

**Dimensions:** a robot's size. The form designer ticks which of length, width and height the question asks. Scouts enter each in feet and inches (decimals allowed); inches past a foot are tidied into feet when they leave the box. The answer keeps each measurement in inches. A required dimensions question needs every measurement it asks; otherwise some can be left blank. Measurements show as feet and inches (2′ 6½″; quarters as fractions), several as length × width × height. Summary "Each measurement": the average of each, and on Teams a column per measurement of a pit dimensions question, from the team's newest pit record, sortable by size. The CSV exports have a column per measurement in inches (`<key>_length_in`).

**Field map:** points are stored as `{x, y}` normalized 0..1 in the image's own coordinate frame. Each field map question records which side of its image Red is on (`redSide`). Each venue has a "Red is on our left/right, seen from the stands" setting (§6.3), which a tablet can override (§5.1). When the venue side differs from the image's side, every scout (Red or Blue) sees the image rotated 180°, so the field looks as it does from their seat. Taps are converted back to the image's frame before saving, so stored points mean the same thing at every venue.

**Timer:** start and stop accumulate time. The scout can tap the value to correct it by hand.

### 4.2 Records

A record is one scout's observation: one robot in one match, or one team's pit interview. Records are revisioned, never mutated.

```ts
type ScoutRecord = {
  id: string;            // UUID, stable across revisions
  revision: number;      // 1, 2, ... — highest revision wins
  kind: 'match' | 'pit';
  eventKey: string;      // e.g. "2027ohcl"
  formVersion: number;
  matchKey?: string;     // TBA-style: "qm12", "sf3m1", "f1m2" (match records only)
  slot?: 'red1'|'red2'|'red3'|'blue1'|'blue2'|'blue3'; // match records only
  team: number;
  scout: string;
  deviceId: string;
  noShow: boolean;
  answers: Record<string, unknown>; // key → value (null = unanswered)
  missed: string[];      // keys the scout explicitly marked or confirmed as missed
  photoIds: string[];    // pit records only
  createdAt: string; updatedAt: string; // ISO timestamps from the tablet
};
```

**Missed versus answered:**
- **Answered:** a question is answered when its value is non-null.
- **Marking missed:** "I missed this" sets the value to `null` and adds the key to `missed`. Undoing it restores the initial value.
- **At submit:**
  - Optional questions left empty are recorded as empty, with no prompt and not added to `missed`.
  - Required questions left empty are listed for the scout. Confirming adds them to `missed` and submits.
- **In analysis:** missed and empty answers are **excluded** from averages, percentages and point estimates, and are never treated as 0.

**No-show:**
- **Marking:** a record with `noShow: true` has empty `answers`. Both match and pit forms offer "Robot/Team not present" behind a confirmation dialog.
- **Undo:** "Undo / scout anyway" reopens the form as a new revision with `noShow: false`.
- **In analysis:** no-shows are excluded from averages and counted separately (match no-show % per team, and "no-show (pit)").

**Photos:**
- **Capture:** pit photos are taken through the camera with `<input type="file" accept="image/*" capture>`, resized on the tablet to a longest edge of 1600 px as JPEG (quality 0.8), and stored as IndexedDB blobs keyed by photo ID.
- **Transfer:** photos travel by USB sync only, never by QR.

### 4.3 Hub database (SQLite)

Tables:
- `events`
- `matches` (schedule)
- `teams`
- `forms` (kind, version, JSON, published_at)
- `form_drafts`
- `records` (id, revision, JSON, received_at, via: usb|qr; PK (id, revision))
- `photos` (id, record_id, blob)
- `devices` (deviceId, name, adb serial, last_sync_at)
- `settings` (TBA key, current event, …)

The "current" view of a record is its highest revision.

## 5. Tablet app

### 5.1 First-time setup (once per tablet, at the hub)

1. **Turn on USB debugging** on the tablet (Settings → About → tap Build number 7×; Developer options → USB debugging).
2. **Plug into the hub** and accept the "Allow USB debugging" prompt with "Always allow" ticked. The hub runs `adb reverse` automatically.
3. **Open the app** at `http://localhost:5098/` in Chrome, then use Chrome's menu → *Add to Home screen*.
4. **Name the tablet and pick its slot.** In the app, set the tablet name (e.g. "Tablet 3") and its default slot (e.g. Red 1). Settings also has "Red alliance, seen from the stands": use the event's setting (default) or override it with left/right, for scouts seated on the other side.

The app generates a `deviceId` on first launch and calls `navigator.storage.persist()`. If persistence is refused, it shows a persistent warning banner.

### 5.2 Match scouting flow

1. **Start screen**
   - Shows the scout name, which is remembered until changed, the current event, and the slot selector (defaults to the tablet's slot; can be changed per match or permanently).
   - Picks the **next unscouted match** for this tablet, and the scout can change the match.
   - Fills in the team number from the schedule. The scout can type over it, and it can be entered manually when there's no schedule.
   - Has a "Robot not present" button (confirm → no-show record).
2. **Form**
   - One screen per section, with big tabs plus Prev/Next.
   - Touch targets are at least 48 dp, and counters have large +/− buttons.
   - Every change is **saved to IndexedDB immediately**, as a draft.
   - Every question has an "I missed this" action.
   - Wake Lock keeps the screen on while a form is open.
3. **Submit screen**
   - Summarizes the answers, lists any unanswered required questions with a "Submit and mark as missed?" confirmation, then submits.
   - On submit the draft becomes a record ready to sync, and the app advances to the next match.
4. **Past records**
   - Lists this tablet's records for the event, each showing synced or unsynced.
   - Opening a record lets the scout **edit** it (creating a new revision) or **show its QR**.

Drafts survive closing Chrome, rebooting and power loss. When the app opens with a draft in progress, it reopens that draft.

### 5.3 Pit scouting flow

- **Team list:** comes from the hub (schedule-derived plus teams added by hand), with a way to add a team by hand on the tablet. Each team shows not started / done / no-show.
- **Pit form:** the same form engine, plus photo capture.
- **No-show:** "Team not present" (with confirmation) marks the team, and "Undo / scout anyway" reverses it.

### 5.4 USB sync

**Detecting the hub**
- The app polls `GET http://localhost:5098/api/ping` every 3 s while open.
- A refused connection means the hub isn't there, and is handled quietly.

**When the hub responds, the sync runs:**
1. **Send records:** `POST /api/sync` with this device's info and all record revisions the hub hasn't acknowledged, in batches.
2. **Send photos:** upload photos the hub doesn't have (`PUT /api/photos/:id`).
3. **Receive config:** the response includes the current event, published forms (with assets), schedule, team list, and the hub's app build ID.
4. **Mark acknowledged:** the tablet marks the acknowledged revisions as synced.

**Sync screen**
- **During sync:** a **full-screen overlay** says "Syncing — do not unplug" with a progress bar ("12 of 30 items").
- **When finished:** a large green **"✓ Sync complete — safe to unplug"** stays up until it's tapped or the hub becomes unreachable.
- **On error:** a red error with **Retry** appears, and unacknowledged items stay queued.
- **After syncing:** a new sync isn't triggered again until the hub has disappeared and come back, or new records exist.

**Status badge:** a badge is always visible on the start screen showing "N unsynced" or "All synced ✓".

**App updates**
- **Download:** when the hub's app build ID differs from the running one, the service worker fetches the new version.
- **Activation:** the new version activates only when no form is open, from the start screen, by reloading.
- **Old form versions:** records submitted against an older form version are always accepted.

### 5.5 QR fallback

**Payload**
- Contains one record revision: `[formatVersion, kind, formVersion, eventKey, matchKey, slot, team, scout, id, revision, noShow, deviceId, values in form question order, missed bitmap]`.
- It is JSON-serialized, compressed with `CompressionStream('deflate-raw')`, then **base45**-encoded and rendered as an alphanumeric-mode QR code at error-correction level M.
- If the result is too big for one comfortably scannable code (over about 1,000 characters), it's split into numbered parts with a header `ST1:<id>:<part>/<total>:`. The hub reassembles the parts.

**Scanning**
- The hub's QR page uses the webcam (getUserMedia + jsQR) and shows each record with a ✓ as it arrives, plus progress for multi-part codes.
- Duplicates are harmless, because the hub stores by (id, revision).
- To decode, the hub has to know the form version, so a record can only be scanned if its form version is published on that hub, which it always is because forms only come from the hub.

**Limits:** QR carries data from tablet to hub only. Photos are never sent this way.

## 6. Hub

### 6.1 Running

`stingr-hub` starts the server on 127.0.0.1:5098 and opens `http://localhost:5098/hub` in the default browser. The tablet app is served at `/`.

### 6.2 USB watcher

- **Polling:** runs `adb devices` every 2 s. For each device newly in state `device`, it runs `adb -s <serial> reverse tcp:5098 tcp:5098`.
- **USB prompt:** some tablets (the ASUS ZenPad included) pop up "Use USB for file transfer?" on every plug-in, covering the app, and offer no setting to stop it. While polling, the watcher checks each tablet's frontmost window; if it is that prompt (ASUS `USBChangeConfigDialog`, or Android's `UsbModeChooserActivity`), it presses Back to dismiss it. No other window is touched.
- **Problems:** devices in the `unauthorized` state appear in the UI with the hint "Accept the USB debugging prompt on the tablet". If adb is missing, a clear banner says so.
- **Dashboard:** lists connected tablets and their sync status (from sync requests, linked by deviceId) live.

### 6.3 Event setup

- **Events:** create or select the current event (event key and name), and set which side Red is on as seen from the scouting stands (`redSide`, default left). Tablets receive it with the event.
- **Schedule**
  - **Fetch from The Blue Alliance:** uses TBA API v3 `/event/{key}/matches/simple` and `/event/{key}/teams/simple`. It needs internet and a TBA read key entered once in Settings.
  - **Import CSV:** columns `match,red1,red2,red3,blue1,blue2,blue3`, where `match` is a TBA-style key (e.g. `qm1`) or a plain number (treated as `qm<n>`).
  - **Manual entry/edit** of matches.
  - Re-importing replaces the schedule and never deletes records.
- **Teams:** derived from the schedule, and teams can be added or removed by hand.

### 6.4 Forms editor

- **Editing:** add, reorder and configure sections and questions of every type in §4.1, including points per counter, toggle and choice option. Field map images are uploaded here.
- **Preview:** a live preview at tablet size (1280×800).
- **Draft and publish:** changes save as a draft, and **Publish** creates the next immutable version, which tablets receive on their next sync.
- **JSON import/export** of a form, for sharing and backup.

### 6.5 Coverage

- **Grid:** one row per match, with six slot cells:
  - ✓ have a record
  - ⚠ has missed answers
  - ✗ no-show
  - "2×" more than one record for the slot (all kept, all listed)
  - empty
- **Tablets list:** each tablet's last sync time.

### 6.6 Team summaries

**Teams table**
- Sortable columns: matches scouted, match no-show %, estimated points (total and per section), and each question's summary statistic.

**Per-question statistic** (by summary type, with missed, empty and no-show excluded)
- `avg`: average and max
- `pct`: percentage true
- `distribution`: percentage per option
- `list`: comments
- `scatter`: combined field-map plot

**Estimated points:** for each question with points, take the per-question average contribution (counter average × points; toggle percentage × points; choice expected points over the option distribution) and add them up. This stays meaningful when some records have missed answers.

**Team page**
- Each match record, with its revision history available.
- Small line charts of key numbers by match, and all comments.
- The field-map scatter.
- Pit answers and photos.

### 6.7 Export and backup

**CSV export** for the current event:
- `matches.csv`: one row per current record. Columns are `event, match, slot, team, scout, device, no_show, est_points, missed`, then one column per question key (the union across form versions). Missed and empty values are blank. Multi-select values are joined with `;`, and field map values are serialized as `x,y;x,y`.
- `pit.csv`: the same structure for pit records, plus photo count.
- `teams.csv`: the team summary table.

**Backup:** downloads a consistent copy of the SQLite database (`VACUUM INTO`). **Restore** replaces the database from a backup file after confirmation.

### 6.8 Clearing data

For moving to a new event or a new season (new game, new forms), and for clearing out tests and demos. Both actions are under **Export & backup → Clear data**.

- **Delete an event** removes that event and everything belonging to it: its schedule, team list, records (match and pit, every revision), their photos and its alliance results. If it was the current event, no event is current afterwards. Forms are kept.
- **Start a new season** removes every event (with all of the above), every form (published versions and drafts), the alliance fields and the list of tablets that have synced. The confirmation counts alliance results (and, for a new season, alliance fields) when there are any. Hub settings (the TBA key) are kept.

Safety:
- **Confirmation:** a dialog states exactly what will be removed, for example "2027demo: 12 matches, 48 records, 3 photos". The button only works once the event key (or `NEW SEASON`) is typed in.
- **Automatic backup:** before removing anything, the hub writes a backup (`VACUUM INTO`) to `<data folder>/backups/stingr-<time>.db` and names the file in its result. Restore (§6.7) can bring everything back.
- **Form version numbers never restart.** After a new season the next published form continues the numbering, so a record made with an old form can never be taken for one made with a new form. The hub remembers the highest version it has published of each form kind (settings, not the forms table).

The hub refuses records it can't place:
- **Unknown event:** sync and QR import refuse a record whose event isn't on the hub. The reason given is "Event <key> isn't on the hub (it may have been deleted)". This prevents an unsynced tablet record from bringing a deleted event's data back.
- **Unknown form version:** the existing rule that refuses unknown form versions also covers records from before a new season.

**Hub identity.** The hub keeps a `hubId`, created once per database, and a `seasonId`, created afresh by each new season. Both are sent to tablets in the sync config, together with the list of event keys on the hub (`eventKeys`).

### 6.9 Tablets following the hub

After each sync with the same hub (same `hubId` as the tablet's previous config):
- **Deleted events:** synced records (and their photos) for events no longer in `eventKeys` are removed from the tablet.
- **New season:** if `seasonId` changed, all synced records and their photos from before are removed. The new config replaces the old forms, event and schedule as usual.
- **Unsynced records are never removed silently.** Records the hub refused stay on the tablet, marked with the hub's reason, in Past records. From there the scout can delete them, all at once ("Delete refused records…", confirmed).

A tablet syncing with a different hub (different `hubId`) removes nothing.

### 6.10 Tidying a tablet by hand

- **Past records → Remove synced records from other events…** removes synced records and photos whose event isn't the tablet's current event. Unsynced ones are kept. It is confirmed with a count.
- **Settings → Reset this tablet…** removes all records, photos, any unfinished form, and the loaded event, forms and schedule. It keeps the tablet's identity (device ID, name, default slot) and theme.
  - It is confirmed with a count.
  - If anything is unsynced, the dialog says how many records would be lost, and a second confirmation is needed.
  - The next sync loads the hub's current event and forms again.

### 6.11 Alliance results

*Added October 2026. These are the builder's calls, made without a design conversation; review them with the feature.*

Some scoring can't be attributed to one robot: for example, balls thrown into a shared hopper by several robots at once. The hub records **alliance results**, per match and per alliance (red and blue), and estimates each team's share from them.

**What is recorded:** for each match in the current event's schedule (and any match a record mentions), per alliance:
- the **final score** (a number, or blank);
- a value for each **alliance field**. Fields are numeric items defined on the hub for this year's game (for example "Balls in hopper"). Each has a label, a key, and optionally the name of a The Blue Alliance score-breakdown item it is filled from.
- where the values came from: typed on the hub, or The Blue Alliance.

Alliance fields belong to the season: they are kept across events and removed by Start a new season (§6.8). Results belong to their event and are removed with it.

**Entering results:** the hub's **Alliance results** page lists the matches with a red and a blue row each; scores and field values are edited in place and saved as they change. Results are entered on the hub only (tablets don't collect them in this version).

**From The Blue Alliance:** **Fetch from TBA** (the TBA key from Settings) reads the event's matches with their score breakdowns. For every played match it fills:
- each alliance's score;
- each field linked to a score-breakdown item (numbers only; `true`/`false` become 1/0).

Values typed on the hub are never overwritten by a fetch; clearing a typed value lets the next fetch fill it again. A value from TBA is replaced by a newer fetch, and is removed when its field's TBA link is changed or removed. The page lists the score-breakdown items TBA reported, so a field can be linked to one; a fetch that finds no played matches keeps the list from the last one. Values are kept only between -9999 and 9999: a bigger typed value is refused with a message, and a bigger value from TBA is left out. Without internet the fetch fails with a clear message and nothing changes.

**Estimated share (OPR):** for the score and for each field, the hub estimates each team's contribution: the per-team values `x` that best explain every alliance result (least squares: each alliance's value ≈ the sum of its three teams' `x`).
- Only qualification matches count, as in The Blue Alliance's own OPR (playoff alliances aren't drawn at random), and only alliances with three different known teams.
- A small ridge term keeps the estimate defined early in an event.
- A team's estimate is shown only once at least 3 of its alliances have a result; before that it shows "—".
- It appears on the Teams table (a column for the score's estimate, sortable) and on the team page (the score and each field). The teams CSV export gets a column for each.

**Exports:** a new `alliance.csv` has one row per match and alliance: score, each field, and source.

## 7. Packaging and installation

**Release build**
- A GitHub Actions workflow runs on version tags (`v*`): it installs, tests and builds, bundles the hub server into a single JS file with esbuild, and copies in the built `app` and `hub/ui` assets.
- It adds the official Node.js linux-x64 binary (pinned LTS ≥ 22.13), plus `install.sh` and a `.desktop` file.
- The result is published as `stingr-scout-hub-linux-x64.tar.gz` on the GitHub Release.

**Installing on the hub laptop (Ubuntu/Debian)**
1. **Download the release tarball.** The repo is private, so download it from the Releases page while logged into GitHub, or with `gh release download -R CSP-North-KC-High/stingr-scout`.
2. **Unpack it and run `./install.sh`**, which:
   - installs `adb` with `sudo apt install -y adb` if it's not present (Ubuntu's package includes the USB udev rules);
   - copies the release to `~/.local/share/stingr-scout/app/`, replacing any previous version;
   - creates `~/.local/bin/stingr-hub` and an app-menu launcher (`~/.local/share/applications/stingr-scout.desktop`).
3. **Data location:** data lives in `~/.local/share/stingr-scout/data/` and is never touched by install or upgrade. Upgrading is the same steps with a newer tarball.

**Running from source** for development: `npm install && npm run dev`.

## 8. Error handling summary

| Situation | Behavior |
|---|---|
| Hub not reachable | Records queue on tablet; badge shows unsynced count |
| Unplugged mid-sync | Unacknowledged items stay queued; sync resumes next plug-in; hub dedupes by (id, revision) |
| Tablet powered off / Chrome closed mid-form | Draft restored from IndexedDB on next open |
| Storage persistence refused / low storage | Warning banner on tablet |
| Tablet on older form version | Records accepted and interpreted with their own form version |
| adb missing / device unauthorized | Clear banner / hint in hub UI |
| TBA unreachable or bad key | Error message; CSV/manual entry still available |
| Same slot scouted twice | Both kept; flagged "2×" in coverage; both count in summaries |
| Corrupt or unknown QR | Rejected with a message; nothing stored |

## 9. Testing

**Unit (Vitest)**
- **shared/:** validation (required, missed, no-show), scoring and estimated points with missed answers, QR encode/decode round-trips including multi-part, and field-map mirroring.
- **hub:** sync deduplication and revision handling, CSV export columns across form versions, schedule CSV import, and the TBA response mapping (with recorded fixtures).

**End-to-end (Playwright)**
- Run the hub and the app. Publish a form, fill and submit a match record (including a missed required question and a no-show), sync, then verify the coverage grid, team summary and CSV export.
- Encode a QR in the app and run it through the hub's decode path.

**Manual on device:** install on the ZenPad over adb reverse, then test offline after unplugging, the reboot-mid-form draft restore, USB sync progress and completion, and camera photo capture.

## 10. Risks to verify first

1. **Installing on the home screen without internet.** Chrome 119's full PWA install (WebAPK) may need Google's servers and may not support `localhost` origins. The fallback is Chrome's classic home-screen shortcut, which still opens the cached app offline. The first implementation task is a throwaway probe on the real ZenPad: serve a minimal PWA over `adb reverse`, add it to the home screen, then unplug, reboot, and confirm it opens offline and keeps its IndexedDB data.
2. **`navigator.storage.persist()` grant** on that tablet, which the same probe checks.
3. **Webcam QR scanning reliability** at the hub. If the webcam struggles, the fallback is a phone running any QR scanner app pasting text into the hub's "paste QR text" box, which the hub provides anyway.

## 11. Out of scope

- Wi-Fi or cloud sync
- Merging data between multiple hubs
- User accounts and authentication
- Pick list builder
- iOS
- Google Play distribution
- Tablet-to-tablet transfer
