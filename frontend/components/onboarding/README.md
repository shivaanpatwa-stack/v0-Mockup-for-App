# First-run onboarding

Shown once per browser the first time someone reaches the dashboard (`/app`): demo videos, then a spotlight tour of
the real dashboard, then a completion screen. It can be replayed from the hospital menu ("Take a tour") or the command
palette (Ctrl/⌘ K, "Take a tour"); a replay never changes the saved status.

## Files

| File | What it does |
| --- | --- |
| `config.ts` | All copy, the video list and the tour steps. Edit here to change the content. |
| `store.ts` | First-run status in `localStorage` (`onboarding:v1`, value `{version, status: completed or skipped, at}`). |
| `onboarding-provider.tsx` | State machine (videos, tour, done), auto-start, replay (`useOnboarding().startTour`). |
| `video-modal.tsx` | Blurred overlay with the demo videos (Back / Next / Skip, "1 of N"). |
| `tour-overlay.tsx` | Spotlight, tooltip placement, scroll-into-view, skips steps whose target isn't on screen. |
| `completion-screen.tsx` | Final screen ("Get Started"). |
| `use-dialog-keys.ts` | Focus trap, Esc to skip, arrow keys for Back/Next. |

Styles are the `.onb-*` block at the end of `app/globals.css`. Tour targets are `data-tour="..."` attributes in
`components/app/shell.tsx`, `components/app/live-panels.tsx`, `components/hospital-menu.tsx` and `app/app/view.tsx`.

## Changing the tour

- **Add or reorder a tour step:** add an entry to `TOUR_STEPS` and put `data-tour="<target>"` on the element.
- **Add a video:** drop the file in `public/onboarding/` and add an entry to `VIDEO_STEPS` (`src: '/onboarding/<file>.mp4'`).
  Optional `poster` is a still image shown before it plays.
- **Show everyone the tour again** (for example after a redesign): bump `VERSION` in `store.ts`.
- **Reset it for yourself:** run `localStorage.removeItem('onboarding:v1')` in the browser console and reload.

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
| Clear `localStorage`, open `/app` | Video modal appears once the dashboard has loaded |
| Click through to the end and press Get Started | Overlay disappears; reload shows nothing |
| Press Skip at any point | Overlay disappears; reload shows nothing |
| Reload in the middle of the tour | Starts again from the first video (nothing was saved) |
| Hospital menu or palette: Take a tour | Runs again; saved status unchanged |
| Narrow phone width | Bottom tab bar is highlighted instead of the top nav; steps whose target is hidden are skipped |
