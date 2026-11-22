# First-run onboarding

Shown once per hospital the first time it reaches the dashboard (`/app`): demo videos, then a spotlight tour of the
real dashboard, then a completion screen. It can be replayed from the hospital menu ("Take a tour") or the command
palette (Ctrl/⌘ K, "Take a tour"); a replay never changes the saved status.

## Who counts as "a user"

The app has no personal accounts: you sign in to a hospital with its code and dashboard key. So "seen the tour" is saved
on the hospital, in the database (`hospitals.onboarding_status`, `onboarding_completed_at`, `onboarding_version`). That
makes it the same on every device and browser, and each hospital has its own. Finishing and skipping are both saved.

The browser also keeps a copy (`localStorage`, key `onboarding:v<version>:<hospital id>`). It only matters if the
backend hasn't been updated yet or a save failed; a failed save is sent again on the next page load.

## Files

| File | What it does |
| --- | --- |
| `config.ts` | All copy, the video list and the tour steps. Edit here to change the content. |
| `store.ts` | The per-browser copy of the status (see above). |
| `onboarding-provider.tsx` | State machine (videos, tour, done), auto-start from the database status, saving, replay (`useOnboarding().startTour`). |
| `video-modal.tsx` | Blurred overlay with the demo videos (Skip tour / Back / Next, "1 of N"). |
| `tour-overlay.tsx` | Spotlight, tooltip placement, scroll-into-view, skips steps whose target isn't on screen. |
| `completion-screen.tsx` | Final screen ("Get Started"). |
| `use-dialog-keys.ts` | Focus trap, Esc to skip, arrow keys for Back/Next. |

Styles are the `.onb-*` block at the end of `app/globals.css`. Tour targets are `data-tour="..."` attributes in
`components/app/shell.tsx`, `components/app/live-panels.tsx`, `components/hospital-menu.tsx` and `app/app/view.tsx`.

## Changing the tour

- **Add or reorder a tour step:** add an entry to `TOUR_STEPS` and put `data-tour="<target>"` on the element.
- **Add a video:** drop the file in `public/onboarding/` and add an entry to `VIDEO_STEPS` (`src: '/onboarding/<file>.mp4'`).
  Optional `poster` is a still image shown before it plays.
- **Show everyone the tour again** (for example after a redesign): bump `ONBOARDING_VERSION` in `config.ts`. Hospitals
  that saw an older version are treated as new.
- **Reset it for one hospital:** in the database, `UPDATE hospitals SET onboarding_status = NULL WHERE hospital_id = <id>;`, then
  in that browser's console `Object.keys(localStorage).filter(k => k.startsWith('onboarding:')).forEach(k => localStorage.removeItem(k))`
  and reload.

## Backend

- Migration: `backend/migrations/2026_11_17_onboarding_up.sql` (rollback: `..._down.sql`). Three nullable columns, so
  existing hospitals keep working and are shown the tour once. Apply it before deploying the new backend:
  `cd backend && ../venv/bin/python scripts/run_migration.py up 2026_11_17_onboarding`
- `GET /hospital` now includes `onboarding: {status, completed_at, version}`.
- `PATCH /hospital/onboarding` with `{status: "completed" | "skipped", version}` saves it. Needs the dashboard key
  (admin), like the dashboard's other changes. Safe to repeat.

If a video file is missing or fails to play, the modal shows "Demo video coming soon" and the flow still works.

## Video recording checklist

Save all files in `frontend/public/onboarding/`. Videos play muted and on a loop, so don't rely on audio.

| Filename | Feature | What to record | Format / resolution / length |
| --- | --- | --- | --- |
| `recalculate.mp4` | Recalculate staging | On the Live map with units in service: press **Recalculate staging**; show the "Running the planner" state, then the "New plan for {hour}, not applied yet" panel with the KPI changes; click **Review moves** so the Moves list is visible; click **Apply plan** and let the toast appear. | MP4 (H.264, no audio needed), 1280x720 (16:9), 20 to 30 s, under 5 MB |
| `what-if.mp4` | What if… | Click **What if…**; pick the **Monsoon evening** preset, then change **Ambulances available** and **Road speed**; show the numbers updating; hold **Space** to compare with the current plan; finish with **Use as staging plan** or **Close**. | MP4 (H.264, no audio needed), 1280x720 (16:9), 25 to 40 s, under 5 MB |
| `recalculate.jpg`, `what-if.jpg` (optional) | Poster frames | A still from the first second of each video. Only used if you also add `poster: '/onboarding/<file>.jpg'` in `config.ts`. | JPG, 1280x720, under 200 KB |

Recording tips: use a browser window about 1280x720, hide bookmarks and extensions, use the default light or dark theme
consistently across both videos, and keep the cursor movement slow and deliberate. Use a registered hospital with 3 or
more units so the plan has visible moves.

## Test scenarios

| Scenario | Expected |
| --- | --- |
| New hospital registers, or an existing hospital opens `/app` for the first time | Video modal appears once the dashboard has loaded |
| Click through to the end | Status saved as `completed` in the database; overlay gone after Get Started |
| Press Skip tour at any point | Status saved as `skipped`; it doesn't appear again |
| Same hospital signs in again, or from another browser or device | Dashboard opens normally (the database decides) |
| A different hospital signs in on the same browser | It gets its own tour |
| Reload in the middle of the tour | Starts again from the first video (nothing was saved yet) |
| Hospital menu or palette: Take a tour | Runs again; saved status unchanged |
| Narrow phone width | Bottom tab bar is highlighted instead of the top nav; steps whose target is hidden are skipped |
