# Stingr Scout

Offline scouting for FRC Team 5098: Android tablets run a web app that syncs over a USB cable to a hub on a Linux laptop. No internet or Wi-Fi is needed at events.

## Installing the hub laptop

Needs 64-bit Ubuntu or Debian (or a derivative such as Mint or Pop!_OS).

1. Download `stingr-scout-hub-linux-x64.tar.gz` from the repository's **Releases** page (you must be signed in to GitHub, since the repository is private), or with the GitHub CLI:

   ```bash
   gh release download -R Altainia/stingr-scout --pattern 'stingr-scout-hub-linux-x64.tar.gz'
   ```

2. Unpack it and run the installer:

   ```bash
   tar -xzf stingr-scout-hub-linux-x64.tar.gz
   cd stingr-scout-hub
   ./install.sh
   ```

   It installs `adb` if needed (it may ask for your password), adds **Stingr Scout Hub** to the applications menu and a `stingr-hub` command.

3. Start **Stingr Scout Hub** from the applications menu. A terminal window shows the hub's messages and the hub opens in your browser at http://localhost:5098/hub/. Close the terminal window to stop the hub.

**Updating:** download the newer release and run its `./install.sh` the same way. Your scouting data stays in `~/.local/share/stingr-scout/data` and is never touched by installing or updating. Tablets pick up the new tablet app the next time they sync.

**Backing up:** use **Export & backup → Download backup** in the hub, and keep the file on a USB drive during events.

**Removing:** `~/.local/share/stingr-scout/app/install.sh --uninstall` (your data is kept).

## Setting up a tablet

1. On the tablet: Settings → About tablet → tap **Build number** 7 times, then Settings → Developer options → turn on **USB debugging**.
2. Start the hub and plug the tablet into the laptop. Accept **Allow USB debugging** on the tablet (tick "Always allow from this computer").
3. On the tablet open Chrome and go to `http://localhost:5098/`, then Chrome menu (⋮) → **Install app**.
4. Open **Stingr Scout** from the home screen, name the tablet and choose its usual position.

Each time a tablet is plugged in it syncs automatically: wait for the green **"Sync complete — safe to unplug"** screen.

## Development

Requires Node.js 22.13 or newer.

```bash
npm install
npm test            # unit, component and API tests
npm run typecheck
npm run build       # build the tablet app and hub screens
npm run hub         # start the hub at http://localhost:5098/hub/ (add `-- --no-open` to skip the browser)
npm run dev:app     # tablet app with live reload at http://localhost:5173 (talks to a hub on 5098)
npm run dev:hub-ui  # hub screens with live reload at http://localhost:5174/hub/ (talks to a hub on 5098)
npm run e2e         # end-to-end tests: real hub + Chromium
npm run package     # build release/stingr-scout-hub-linux-x64.tar.gz
npm run test:package  # build, install, run, upgrade and uninstall a release in a temporary home folder
```

Environment overrides for the hub: `STINGR_PORT`, `STINGR_DATA_DIR`, `STINGR_WEB_ROOT`, `STINGR_APP_BUILD`, `ADB`.

**Releasing:** push a tag such as `v0.2.0` (`git tag v0.2.0 && git push origin v0.2.0`). GitHub Actions tests it, builds the release and publishes it on the Releases page.

Design: `docs/superpowers/specs/2026-10-15-stingr-scout-design.md`
