# Before and after

Before: `docs/ux/screens/` (audit, 7 Nov 2026). After: `docs/ux/screens-after/`. Screenshots come from the app's browser pane, so desktop shots are scaled to 800px wide.

## Tell Scores (`ai-design-tells` 0.4.0, lower is better, target 10 or below)

| Page | Before | After |
|---|---|---|
| Landing `/` | (none: the dashboard was at `/`) | **0.0** |
| Sign in `/start` | 26.3 | **0.0** |
| Register `/register` | 28.6 | **0.0** |
| Live map `/app` (was the dashboard `/`) | 30.1 | **0.0** |
| Staging plan `/app/plan` | (none) | **0.0** |
| Run history `/app/history` | (none) | **0.0** |
| Data & assumptions `/app/data` | (none) | **0.0** |

How they were measured:
- Public pages use their server-rendered HTML with the CSS inlined.
- Signed-in pages use the hydrated page from the browser, with scripts, map tiles and hidden dialogs removed.
- The Data and History snapshots were shortened copies with the same structure, classes and stylesheet.

On the first pass two tells still fired, both caused by tooling rather than by the design:
- **C1 "three-card hero":** Tailwind's base CSS text contains "font-feature-settings" six times, which the checker counts. Tailwind is now removed.
- **E3 "no hairlines":** the build turned `rgba()` into 8-digit hex. Hairlines are now `rgb(from var(--ink) r g b / 0.1)`.

## Screen by screen

| Screen | Before | After | What changed |
|---|---|---|---|
| Live map, 1440 | `1440-dashboard-idle-first-screen.jpg` | `1440-live-map-first-screen.jpg` | The map fills the first screen. A 52px KPI strip replaces the parameter form. Recalculate staging is the one green button on the map. |
| Recalculate result | `1440-dashboard-running.jpg` | `1440-live-map-result-panel.jpg` | A preview with the diff (units moved, 15-min reach, avg response) and Apply / Review moves / Discard. Nothing is saved until Apply. |
| Applied | (applied silently) | `1440-live-map-applied-undo-toast.jpg` | "Plan applied · saving in 8 s · Undo". |
| Error | (red banner at the top of the page) | `1440-live-map-error-state.png` | Plain-English reason plus Retry. The previous plan stays on the map. |
| What if | `1440-dashboard-whatif-open.jpg` | `1440-what-if-festival-night.jpg` | A bottom drawer over the map with knobs, presets, a live readout, assumptions and hold-to-compare. |
| Fleet | `1440-dashboard-result-fleet-history.jpg` | `1440-staging-plan.jpg` | Full call signs (UXT-010, not UXT-10). Each move has a reason. Sortable headers are real buttons. |
| Run history | `1440-dashboard-result-fleet-history.jpg` | `1440-run-history-drawer-compare.jpg` | Its own page with filters, a drawer with a mini map, comparing two runs, and Restore. |
| Scenarios | (none) | `1440-scenarios.jpg` | Saved what-ifs, reopenable. |
| Data | (none) | `1440-data-assumptions.jpg` | What is simulated, how each number is computed, the knobs, limits. |
| Landing | (none) | `1440-landing.jpg`, `1440-landing-impact.jpg` | Dark live-map band, a sourced problem section, the simulated impact chart, an honest status list, team placeholders. |
| 1920 | `1920-dashboard-after-reload.jpg` (capped at 1,360px, empty results after reload) | `1920-live-map.jpg` | The map uses the full width. The latest saved plan is restored on load. |
| Phone | `390-dashboard-map-collapsed.jpg` (map crushed to about 40px) | `390-live-map.jpg`, `390-staging-plan.jpg`, `390-landing.jpg` | Full-width map, moves as a bottom sheet, bottom tabs, no horizontal overflow. |
| Register | `1440-register-pin.jpg` (violet pin) | `1440-register-signed-in.jpg` | Dark tokens, green pin, consistent "hospital code" naming, icons instead of ← and ✕. |

## Banned list (3.5), checked item by item

| Item | Status |
|---|---|
| Indigo / violet / purple, blue-to-purple gradients | Gone (register pin, presets, utility classes) |
| Gradient text | None |
| Glows, neon, bloom, aurora | None |
| Cyan-on-dark accent | None. The accent is safety green. |
| Glassmorphism | None (0 `backdrop-filter`) |
| Diffuse shadows | Only the toast, palette, dialogs and menus (they float). Panels use surface steps and hairlines. |
| Many coloured status pills | 3 status colours plus neutral, each with an icon or dot and a word |
| Cream / beige background | Gone. Dark `#111413`, light `#f7f8f6`. |
| Inter / Geist / Space Grotesk, one family | Archivo + IBM Plex Sans + IBM Plex Mono |
| Flat type scale | App 12 / 13 / 14 / 18 / 20 / 24. Landing up to 32 / 56. Nothing under 12px. |
| Eyebrow pills, uppercase kickers | None ("MUMBAI OPERATIONS" and uppercase table headers removed) |
| Full-sentence oversized headline, tight tracking | The headline is 9 words at 56px, tracking -0.02em |
| Hero + 3 cards, icon-card grids | None |
| Icon tiles above headings | None |
| Everything centred | Left-aligned. The landing band is asymmetric. |
| One radius, one padding | Radii 4 / 10 / pill. Spacing varies by context. |
| Cards in cards | None (moves and tables are flat lists with dividers) |
| Thick coloured left borders | None |
| Fake 01 / 02 / 03 numbering | Only on the landing callouts, which are a real sequence |
| Emoji, sparkles, magic wands | None (lucide icons; the ← ✕ × symbols are replaced) |
| Repeated big-number stat blocks | One slim KPI strip |
| Same fade-up everywhere, bounce easing, beams, shimmer, glow borders | None. Motion is limited to hovers, the drawer and panels, the map flyTo, and the landing canvas. |
| Generic headlines, buzzwords, "AI-powered", generic CTAs | None ("Open the live map", "See the Parel simulation") |
| Em dashes, lorem ipsum | None in the UI copy |

## Cover-the-logo test

With "Product Name" hidden, every page still says what only this product does: Mumbai wards, call signs, "Recalculate staging", "15-min reach", "Monsoon evening", Parel, the 20-minute urban benchmark.

## Fresh-eyes review

A separate agent that never saw the build reviewed only `screens-after/`. Its findings and what was changed are listed in the final summary.

### Fresh-eyes findings and response

| Finding | Response |
|---|---|
| Zoom buttons and map credit covered "Use as staging plan" in the What-if drawer | **Fixed**: controls move above the drawer, zoom hidden while it is open (`1440-what-if-drawer-clear.jpg`). |
| Secondary text (last calculated, reasons, legend) read as too small | **Fixed**: raised from 12 to 13px. The screenshots were scaled to 800px, so the real size was 12px, not 10 to 11. |
| Monospace used for numbers | Kept on purpose: the brief asks for IBM Plex Mono on data, IDs and times. |
| Shortcut chips (R, W, ⌘K) everywhere | Kept: 3.6 A and D ask for the shortcut on the button and in the bar. |
| Visible `[STAT NEEDED]` on the landing page | Kept on purpose until a verified Mumbai figure is supplied. |
| Unit labels can overlap at city zoom | Known issue (see final summary). |
| Generic "dark dashboard" look, 4 equal KPI tiles | Partly disagree: the strip is the slim row 3.6 B asks for, and the red alert item leads when wards are uncovered. A bolder single lead number is listed as a follow-up idea. |
| Large empty areas on Scenarios / Run history with little data | Expected with 1 to 4 test rows; empty states explain the next step. |
