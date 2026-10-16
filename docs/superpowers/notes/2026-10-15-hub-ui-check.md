# Hub screens — hands-on check

Date: 2026-10-15. Hub on the dev laptop (fresh data folder), ZenPad 10 over USB, laptop webcam.

| # | Check | Result |
|---|---|---|
| 1 | Settings: TBA key | Passed |
| 2 | Event setup: create event, Red side, schedule, extra team | Passed (after round-1 changes below) |
| 3 | Match form: build, drag to reorder, preview, publish | Passed (after round-1 and round-2 changes) |
| 4 | Pit form | Passed |
| 5 | Tablet connected on the Dashboard; sync, scout a match and a pit visit with a photo | Passed |
| 6 | Coverage, Teams, team page (answers, comment, field-map plot, pit photo) | Passed |
| 7 | QR scanner with the webcam | Passed |
| 8 | Export (three CSVs) and backup | Passed |
| — | Themes (Stingr, Light, Dark) on laptop and tablet | Passed |

## Changes made from the partner's feedback

Round 1:
- Event setup: field diagram showing which side Red is on from the stands; removing a team that is in the schedule asks first and explains.
- Form editor: preview note "Preview only. Nothing here is saved."; Publish disabled when there is nothing to publish or the draft has problems, with "N problems / Show problems" (problems listed only on request, updating live); question type chosen only in the settings panel; Key beside Label and Type; "Default", "Min", "Max" used consistently in fields and problem messages (which now name questions by label); Max must be greater than Min for counters and numbers (also enforced by the hub); small settings no longer stretch.
- Themes: Stingr (purple and gold, default), Light (original), Dark — chosen per device in Settings on the hub and the tablets.

Round 2:
- Option reorder/remove buttons side by side; narrower Points box.

Also found by the end-to-end tests during this plan: the Teams panel did not refresh after a schedule import (fixed with a test).
