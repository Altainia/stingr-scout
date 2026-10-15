# Tablet app — device check on the ZenPad 10 (P00C, Android 7.0, Chrome 119)

Date: 2026-10-15. Hub on the dev laptop with `scripts/seed-demo.ts` data ("Demo Event", 12 matches); tablet over USB via the hub's adb watcher.

| # | Check | Result |
|---|---|---|
| 1 | Install from Chrome (⋮ → Install app), open from icon | Passed — runs standalone (no address bar). The old probe's service worker had to be released first by closing Chrome (`am force-stop com.android.chrome`); a one-time leftover of the probe, not something real deployments hit. |
| 2 | First sync, tablet setup, scout name | Passed — green "safe to unplug" screen; event and team filled in. |
| 3 | Scout Qual 1 (counter, field map, timer, choice, missed, comment) and submit | Passed — hub record: Qual 1, Red 2, Team 254, coral 2, one field point, climb deep, timer 2.1 s, `defense` missed, comment. |
| 4 | Pit scouting with a camera photo | Passed — photo uploaded on sync; hub serves a 1600×900 JPEG (70 KB). |
| 5 | Reboot mid-form | Passed — Qual 2 draft reopened with its value after `adb reboot`. |
| 6 | Scout unplugged, then replug | Passed — badge "1 unsynced"; synced automatically within seconds of replugging. |
| 7 | Show QR | Passed — QR code shown full screen. |
| 8 | App update after rebuilding and restarting the hub | Passed — tablet picked up the new build on the home screen. |

## Problems found and fixed during the check

- **Field map orientation:** the image was never rotated for Red scouts while taps were mirrored, so Red scouts' points landed on the wrong side. Replaced by venue orientation (Plan 2 Task 16): event setting "Red seen from the stands" on the hub plus a tablet override; checked on the device both ways.
- **ASUS "Use USB for file transfer?" dialog** (`com.android.settings/.usb.USBChangeConfigDialog`) covered the app on every plug-in. Android's "Select USB configuration → Charging" does not stick on this build, and no setting disables the dialog. The hub's adb watcher now dismisses exactly that window with Back (Plan 2 Task 17); checked on the device.

## Other observations

- After the probe's earlier reboot the tablet clock had reset to Jan 1; record timestamps come from the tablet clock, so check the date on each tablet before an event (it does not affect sync, only ordering in lists).
- `adb shell am start` is ignored while the screen is off; wake it first.
