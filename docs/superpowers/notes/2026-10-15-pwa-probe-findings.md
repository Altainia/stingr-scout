# PWA probe findings — Asus ZenPad 10 (P00C), Android 7.0, Chrome 119

Date: 2026-10-15. Probe served by the laptop at `127.0.0.1:5098`, reached from the tablet via `adb reverse tcp:5098 tcp:5098`. Tablet had no internet connection.

| Check | Result |
|---|---|
| Opening a URL via `adb shell am start` | Works only while the screen is awake; with the screen off the intent is dropped. Add `-p com.android.chrome` to force Chrome. |
| Browser tab, before install | Service worker ready; `storage.persist()` → **false**; hub reachable |
| Chrome menu wording | **"Install app"**, followed by a confirmation popup; then "added to home screen". No WebAPK package was created (`pm list packages` shows none) — it is Chrome's offline shortcut install. |
| Opened from home-screen icon | Display mode **standalone**; `storage.persist()` → **true**; counter 3 |
| After stopping the server, removing `adb reverse`, rebooting | Opened from icon **offline**, standalone, persisted **true**, counter still **3**, hub reachable **no** |

## Decision: GO

The PWA-over-`adb reverse` approach works offline on the real tablet.

Notes for Plan 2 (tablet app):
- Request `navigator.storage.persist()` again after install/at start-up; it is only granted once installed.
- Expect standalone display mode when launched from the icon.
- When opening the app via adb for setup, wake the screen first (`adb shell input keyevent KEYCODE_WAKEUP`).
