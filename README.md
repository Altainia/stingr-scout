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
