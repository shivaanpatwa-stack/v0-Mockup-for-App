# UX audit: current app (before)

Branch `ui-ux-upgrade`, based on `b73eec7`. Audited 7 November 2026 on a local build (`next dev` on :3000, FastAPI on :8000, shared Supabase database).

## How this was done

- **Code read:** Next.js 16.3 App Router, React client components, Tailwind v4 plus one large hand-written stylesheet (`app/globals.css`), react-leaflet 5 with CARTO light tiles, lucide icons, no state library (all state lives in `app/page.tsx`). The browser talks only to `/api/backend/*`, a same-origin proxy that adds the hospital's credentials from httpOnly cookies.
- **Live walk-through:** registered a throwaway hospital ("UX audit test 7f3k", 1 ambulance), ran Recalculate once, opened every panel, then deleted the hospital and its rows afterwards. Widths: 1440×900, 1920×1080, 390×844.
- **Screenshots:** `docs/ux/screens/`. They are captured through the app's browser pane, so desktop shots are scaled down to 800px wide. The key-reveal screen after registration was not saved because it shows a key.
- **Tell Score:** `ai-design-tells` 0.4.0 on each page's rendered DOM with the compiled CSS inlined (scripts, map tiles and SVG paths stripped).
- **Critique and accessibility review:** the `design-critique` and `accessibility-review` skills are not installed here, so I followed the rules in the brief instead: WCAG 2.2 AA contrast, keyboard pass, focus, colour-only meaning, target sizes, heading structure, reduced motion. Contrast was measured in the page; a few colours written as `oklch()` could not be measured by my script and are marked "not measured".

**Not covered:** the error state of Recalculate was read from code rather than triggered (it would mean breaking the backend mid-run). The mobile driver app in `mobile/` is out of scope.

---

## 1. Screen inventory

| Route | Purpose | Main components | Notes |
|---|---|---|---|
| `/start` | Sign in, or go to registration | `start-card` ×2, sign-in form | Public. Shown even when already signed in. |
| `/register` | Create a hospital: name, radius, ambulances, map pin | `reg-card` ×3, `LocationSearch` (Photon combobox), Leaflet pin map, key reveal step | When signed in, first shows "You're already signed in to …". |
| `/` | The whole product on one scrolling page | `AppHeader`, `OptimizationControls`, `WhatIfPanel`, `MumbaiMap` + `MapLegend`, `KpiStrip`, `FleetTable`, `RunHistoryTable`, `EditFleetDialog`, hospital keys dialog | Header "tabs" only scroll to sections. "Analytics" scrolls to the map. |
| `/api/session`, `/api/backend/[...path]` | Session cookie and backend proxy | route handlers | Not screens. |

States seen on `/`: idle with no run, running ("Optimizing staging…"), result, coverage warning, what-if open, empty run history, one run in history, after reload. Hospital menu and dialogs exist in the DOM but are closed.

---

## 2. Top 15 problems

Ranked by how much each one slows a dispatcher or confuses a judge.

### 1. The map is not on the first screen
- **Screens:** `1440-dashboard-idle-first-screen.jpg`, `390-dashboard-first-screen.jpg`
- **Wrong:** at 1440×900 the map starts 626px down, under a parameter form and a what-if bar, so only its top strip is visible. At 1920×1080 it is the same 626px. At 390px it starts at 942px, below the first screen.
- **Why it matters:** the map is the product. A dispatcher can't see coverage without scrolling, and a judge's first impression is a settings form.
- **Fix:** a full-height map home with a slim KPI strip and a map toolbar (3.6 E). Everything else moves to its own page.

### 2. On a phone the map is crushed to nothing
- **Screen:** `390-dashboard-map-collapsed.jpg`
- **Wrong:** at 390px the map card shrinks to a strip about 40px wide and the "Optimization Impact" panel covers it. The map is effectively invisible.
- **Why it matters:** anyone opening the link on a phone (judges included) never sees the map.
- **Fix:** the mobile layout puts the KPI strip and alerts first, with the map full-width and collapsible (5.4).

### 3. Results disappear on reload, and the empty state shows broken text
- **Screen:** `1920-dashboard-after-reload.jpg`
- **Wrong:** after a reload the impact panel says "Run Recalculate above…" even though the run is saved and the controls say "Last run 7 Nov, 5:36 PM". The map caption then reads "15-min isochrone expands across **0 wards** (90%+ city demand, faster)", which is made-up copy.
- **Why it matters:** the screen looks like nothing has been planned, and the caption states a claim with no data behind it.
- **Fix:** on load, show the latest saved run from Run History as the current plan (read-only, same API), and give the caption a real empty state. *This uses data the app already fetches; no API change.*

### 4. Recalculate doesn't look like a button and has only two states
- **Screen:** `1440-dashboard-idle-first-screen.jpg`, `1440-dashboard-running.jpg`
- **Wrong:** "Recalculate Staging" is an unbordered sparkle icon over a line of text, at the bottom of the form. There is no stale state, no elapsed time, no diff before applying, no Apply/Discard, no Undo, and the result is applied silently.
- **Why it matters:** it is the main action of the product, and it is the hardest thing on the page to find.
- **Fix:** build 3.6 A in full: a filled primary button in the map toolbar with all six states.

### 5. Numbers on the same screen disagree
- **Screen:** `1440-dashboard-result-map-kpis.jpg`
- **Wrong:** for 8 AM the main card says the average response is **26.6 min, hospital base 33.9**. Right below, the chart callout says "8 AM: **29.2 min** response vs **43.4 min** baseline". Separately, "Min Spacing: —" is shown while spacing is set to 2 km (with one ambulance there is no pair to measure, but the label doesn't say that).
- **Why it matters:** a judge who spots two different answers to one question stops trusting every number.
- **Fix:** find out which calculation each number comes from (likely demand-weighted vs a separate 24-hour series). Show one definition everywhere and label the other. I will check this with you before changing what is shown.

### 6. Ambulance IDs are rewritten
- **Screen:** `1440-dashboard-result-fleet-history.jpg`
- **Wrong:** `formatAmbulanceId()` in `components/fleet-table.tsx` turns "UXA-001" into "UXA-01" (and "AMB-010" into "AMB-10"). The edit dialog shows the real "UXA-001".
- **Why it matters:** a dispatcher radios a unit by its call sign. Showing a different ID is a safety problem.
- **Fix:** always show the stored call sign, in IBM Plex Mono.

### 7. Placeholder ambulances at real hospitals
- **Code:** `components/fleet-table.tsx`, lines 145 onwards
- **Wrong:** when there is no fleet and no run, the table falls back to five invented ambulances at named real places ("Cooper Hospital Emergency Bay, Juhu" and others) with invented distances.
- **Why it matters:** it breaks the data-honesty rule and uses real hospital names as if they were part of the system.
- **Fix:** a real empty state ("No ambulances yet. Add one in Fleet."). I'll ask before deleting the placeholder data.

### 8. One long page pretending to have tabs
- **Screen:** all dashboard shots
- **Wrong:** Overview, Fleet, Optimization Runs and Analytics are buttons that scroll the page. "Analytics" is just the map section. The page is about 1,860px tall at 1440 and 2,480px at 390.
- **Why it matters:** there is no place to go for history or data notes, and the first screen mixes everything.
- **Fix:** real routes for Live map, Staging plan, Scenarios, Run history, and Data & assumptions (3.6 D). Analytics comes out of the nav. Its section is the map, so nothing is deleted (3.6 F).

### 9. The most critical message is the quietest
- **Screen:** `1440-dashboard-result-first-screen.jpg`
- **Wrong:** "Fleet too small to guarantee 20-minute coverage of every ward. Uncovered: A, B, C, D, E, F/N…" is grey text on a beige box, listing 18 ward codes in a sentence. The uncovered wards are not marked on the map.
- **Why it matters:** this is the alert a dispatcher must not miss.
- **Fix:** a critical alert row (red plus icon) in the KPI strip, "18 of 24 wards outside 20 min", with the uncovered wards outlined on the map and listed by name.

### 10. What-if is a form that pushes the map away
- **Screen:** `1440-dashboard-whatif-open.jpg`
- **Wrong:** opening what-if adds a 400px panel above the map: five preset cards, four control cards and a "Run Scenario Simulation" button. Nothing updates until you press it, and results are shown somewhere else on the page.
- **Why it matters:** you can't see the map and the scenario together, so you can't judge the scenario.
- **Fix:** the 3.6 C bottom drawer over the map with a live readout and hold-to-compare.

### 11. Too many tiny, inconsistent text sizes
- **Code:** `app/globals.css`
- **Wrong:** 29 distinct font sizes, including 9, 9.5, 10, 10.5, 11 and 11.5px. 78 rules set text below 12px, and 96 visible text elements on the dashboard are under 12px. Meanwhile the hero KPI is about 34px.
- **Why it matters:** too small to read on a control-room screen from a desk away, and the hierarchy is decided by shrinking text.
- **Fix:** a 5-step scale (12 / 13 / 14 / 18 / 24, about 1.25 apart at the top) with a 12px floor (3.6 B).

### 12. Scrolling the page zooms the map
- **Screen:** `1440-dashboard-map-scroll-trap.jpg`
- **Wrong:** the map sits in the middle of a scrolling page and captures the mouse wheel, so scrolling down zooms the map out instead.
- **Why it matters:** you lose your view by accident.
- **Fix:** goes away when the map fills the screen. Any small map inside a page (for example the run detail drawer) turns off wheel zoom until it is clicked.

### 13. Colour has no consistent meaning
- **Screens:** `1440-dashboard-result-fleet-history.jpg`, `1440-register-pin.jpg`
- **Wrong:**
  - The average response time in Run History is red (`text-rose-700`) even when it improved.
  - The demand ramp (sand to deep brick red) sits right next to a red that should mean "critical".
  - The register pin and its "Pin set manually" chip are violet.
  - The what-if presets use rose, emerald, amber, sky and purple icons.
  - Navy (`#0C4A6E`) is used for buttons, markers and focus.
  - The status pills come in 6+ colours.
- **Why it matters:** in a life-safety tool, red has to mean one thing.
- **Fix:** the 5.2 palette (safety green for action only, red/amber for status only, a separate colour-blind-safe sequential ramp for demand).

### 14. Copy that describes the software instead of the city
- **Screens:** most
- **Wrong:**
  - Machine phrases: "Repeated algorithmic placements", "generate algorithmic response impact metrics", "Stress-test out-of-service resilience", "Optimization Parameters".
  - "Incident Velocity 0.87x" has no explanation.
  - Grammar: "1 units", "1 runs".
  - The legend names colours instead of saying what they measure: "(Sand)", "(Ochre)", "(Terracotta)".
  - The sign-in hint says "driver code" while the field is labelled "Hospital code".
  - "15m Isochrone".
- **Why it matters:** fails the cover-the-logo test, and judges and officials don't know what an isochrone is.
- **Fix:** plain operational copy: "Reachable in 15 min", "Predicted calls per hour", "18 wards outside target", "1 unit".

### 15. Wide screens are wasted, and forms are rough
- **Screens:** `1920-dashboard-after-reload.jpg`, `390-register-signed-in.jpg`
- **Wrong:**
  - At 1920px the app is capped at 1,360px, so 560px of a control-room screen is empty margin.
  - On mobile, "Back to dashboard" wraps onto two lines inside its pill.
  - The "I have saved these" checkbox is unstyled and shows as a black square.
  - The spacing input shows browser spinner arrows over its text at 1920.
- **Why it matters:** large screens are the dispatcher's main display.
- **Fix:** full-bleed app shell, with a map that fills whatever space is left. Form controls get the shared input styles.

### Smaller things noted
- `<title>` is duplicated, and the metadata still says `generator: v0.app`. The page title is "AmbulanceIQ | Mumbai response model" while the start page says "Ambulance Response Optimization Platform": two product names.
- Run IDs are global (#115 for a hospital's first run), which leaks how many runs exist across all hospitals.
- Drive times in the fleet table are distance × 2.7 ("~28 min drive"). That is not the travel-time matrix the optimizer uses, so they can disagree with the KPIs.
- The demand profile in the time scrubber is a hard-coded list in `optimization-controls.tsx`, not read from the risk data.

---

## 3. Data honesty

| What | Where it comes from | Shown to the user as | Needed |
|---|---|---|---|
| Ward risk score per hour | `backend/data/ward_hour_risk_scores.csv`: `base_risk_score × time_multiplier`, plus a `risk_score_noisy` column | "Ward demand", "Forecasted Risk" | **Needs your confirmation:** is this modelled from published statistics or from real incident records? Unless real, label it "Simulated data based on published statistics". |
| Travel times | `travel_time_matrix_final.csv` | Response minutes | Source and date to show on the Data page. |
| 24-hour demand bars in the scrubber | Hard-coded in `optimization-controls.tsx` | Looks like data | Either derive from the risk file or label as illustrative. |
| Placeholder fleet | `fleet-table.tsx` fallback | Looks like a real fleet at real hospitals | Remove (asking first). |
| "Incident Velocity" | Time multiplier relative to city average | Sounds like measured incidents | Rename: "Demand vs daily average". |

Nothing in the app says anywhere that data is simulated.

---

## 4. Accessibility

| Issue | Where | Level |
|---|---|---|
| No `<h1>` on the dashboard. The first heading in the DOM is the hidden "Hospital keys" dialog's `<h2>`. | `/` | Fail (1.3.1, 2.4.6) |
| Contrast: "Succeeded" pill text 2.16:1. "Peak" / "Rush" tick labels 3.99:1 at 9.5px. Muted 10–11px labels on beige: not measured (`oklch`), but likely fail. | `/` | Fail (1.4.3) |
| 96 text elements under 12px. Smallest 9px. | `/` | Readability |
| Sortable table headers are `<th onClick>` with no button inside, so they can't be sorted from the keyboard and aren't announced as sortable. | Fleet table | Fail (2.1.1, 4.1.2) |
| Demand is shown by colour only on the map. Ward codes appear only at zoom 11+. The legend explains colours by colour names. No list view of wards and units as a text alternative. | Map | Fail (1.4.1, 1.1.1) |
| Range sliders are 16px tall (time scrubber, what-if). Map attribution links are 13px tall. Target is 24px. | `/` | Fail (2.5.8) |
| Three infinite pulse animations and no `prefers-reduced-motion` rule anywhere. | `globals.css` | Fail (2.3.3 advisory) |
| No skip link to the map or main content. | all | Advisory |
| Registration checkbox unstyled (black square) | `/register` | Polish |
| **Works:** visible 2px navy focus outline on inputs and the slider (9 `:focus-visible` rules). The error banner uses `role="alert"`. The coverage notice uses `role="status"`. Copy buttons have labels. The location search is a real ARIA combobox. | | Keep |

Automated name checks also flagged the what-if buttons and hospital-menu items as unnamed, but they were inside closed `<details>` at the time, so these are false positives. They will be re-checked once the new drawer exists.

---

## 5. Performance

| Issue | Measure | Impact |
|---|---|---|
| `globals.css` is 37,993 lines and 132 KB, but **33,337 of those lines are blank** (about 1,600 real lines), with duplicate blocks (`.legend-swatch.demand-*` three times). Compiled output: 111 KB. | file | Slow to work on. Duplicate rules fight each other. |
| Ward boundaries `zones_full_features_final.geojson` is **924 KB**, fetched by the dashboard, unsimplified. | network | Biggest single download, and delays the ward layer on slow connections. |
| `travel_time_matrix.json` is 190 KB. `ward-risk-data.ts` (11 KB) is bundled into the page JavaScript. | bundle | Moderate. |
| `/fleet` is requested twice on load. Each backend call takes 0.7–1.2 s because the database is in Tokyo (about 135 ms per round trip, several queries per request). | network | About 1.2 s before history appears. Registration took about 10 s. |
| Recalculate: about 5 s end to end. | network | Needs a real running state. |
| 24 map tiles on first view. No layout shift measured on load, but the KPI panel jumps from an empty state to about 600px tall when results arrive. | layout | Layout shift on every run. |
| Inter is named in CSS but never loaded, so the app renders in the system font. | fonts | No cost now, but the font will change once real fonts are added. Use `next/font` to avoid shift. |
| **Local setup:** the project lives on the iCloud-synced Desktop. macOS had moved 1,700 files in `node_modules` and `venv` to iCloud only, which made `next dev` hang. Fixed by reinstalling `node_modules`. To stop it happening again, right-click the project folder in Finder and choose **Keep Downloaded** (or move the project out of Desktop/Documents). `venv` still has 234 cloud-only files. | dev | Blocks development. |

Numbers are from `next dev` on localhost, not a production build. Lighthouse on the production build is planned for Phase 7.

---

## 6. AI-look audit

### Tell Scores (target 10 or below)

| Page | Score | Grade |
|---|---|---|
| `/start` | **26.3** | B, "a few tells" |
| `/register` | **28.6** | C, "visibly templated" |
| `/` dashboard | **30.1** | C, "visibly templated" |
| Stylesheet alone (empty page) | **26.3** | B |

The stylesheet alone scores the same as `/start`. Most tells come from `globals.css` and will go away when it is rebuilt on tokens, rather than page by page.

### Tells the tool found

| Tell | Evidence | Source |
|---|---|---|
| A1 House Indigo (+9) | `#c4b5fd`, `#5b21b6`, `#7c3aed` | `.reg-chip`, `.reg-pin` (register map pin); `text-purple-600` on the "Strict SLA" preset |
| C1 Hero + three cards (+8) | Card-grid pattern in CSS | `start-grid`, KPI 2×2 grid, preset grid |
| E3 No hairlines (+6) | No low-alpha 1px dividers | All borders are solid beige |
| B2 No type scale (+5) | 29 font sizes | `globals.css` |
| H1 Sparkle tax (+5) | `lucide-sparkles` | Recalculate button, presets label, map callout, empty run history |
| E2 Frosted everything (+4) | `backdrop-filter` on 8 elements | Map overlay pills |
| B4 10px squint (+3) | 78 sub-12px rules | `globals.css` |
| C4 Emoji as icons (+3) | `←`, `✕` | Register page |

### Banned defaults from 3.5 that the app uses now

- **Colour:** violet and purple (register pin, preset icon). A **cream/beige background** (`--bg: #F0EADF` canvas, `--card: #F9F6F0` cards), which is exactly the "beige to look less AI" default. Six or more status pill colours. Navy as the action colour.
- **Type:** one family for everything (system font, Inter declared). A flat scale with 29 sizes. A tracked uppercase kicker: "MUMBAI OPERATIONS". Uppercase table headers.
- **Layout:**
  - Rounded icon tiles above headings (what-if flask badge, run-history clock badge).
  - Cards inside cards (KPI tiles inside the impact card, preset cards inside the what-if card).
  - Six radii used without a system (8, 6, 4, 12, 10px and pill). It reads as "rounded everywhere".
  - "01 / 02" numbers in the legend markers.
  - A big number plus small label repeated (hero KPI and the 2×2 KPI grid).
- **Icons:** sparkles (×4), a science flask for what-if, a lightning bolt for "Dense Staging" and "Incident Velocity".
- **Copy:** "Stress-test out-of-service resilience…", "algorithmic response impact metrics", "Optimized Staging: Distributed fleet." Generic CTA "Get started" in the page title.
- **Motion:** infinite pulses on non-critical status dots.

### Required human signals that are missing

No dates on data, no source notes, no "what's simulated" page, no named people, no tabular numerals, no proper empty/error states for most panels. Real ward codes are used (good), but ward *names* (Andheri West, Dadar) appear only in the fleet table.

### Cover-the-logo test

With "AmbulanceIQ" hidden, "Optimization Parameters", "Optimization Impact" and "What-If Scenario Simulator" could belong to any logistics dashboard. Only the ward codes and "Mumbai" make it specific.

---

## 7. What to keep

- The data flow and API contracts: session proxy, `/optimize`, `/simulate`, `/runs`, `/fleet`, `/demand-scores`.
- The time-of-day scrubber idea with a demand histogram (it becomes the map's scrubber).
- Before/after framing ("All at base" vs "Optimized"). It is the clearest story in the app.
- The ward risk layer, ward code labels at high zoom, the 15-minute reachable area.
- The location search combobox on `/register`, the key reveal flow and the session gate.
- Focus outlines, error banner semantics.

## 8. Questions for you

1. Is the ward risk data modelled or from real incident records? (This decides the "Simulated" label.)
2. Do you have sourced statistics for the landing page, or should I leave marked placeholders?
3. Team names, roles and a short "why we built this" note for the landing page.
4. OK to delete the placeholder fleet rows in `fleet-table.tsx` and the hard-coded demand profile once they are replaced?
