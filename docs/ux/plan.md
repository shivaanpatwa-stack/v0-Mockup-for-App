# UX plan: design direction, design system, screens

Phase 2 of the UI/UX upgrade. Read this with `docs/ux/audit.md`. **No UI code has been written yet.** This document is for approval.

**Brand in one line:** the colours come from emergency signage (first-aid green for the one action that matters, signal red and amber only for state, a dim neutral room for everything else), and the type is engineered, signage-like Archivo over plain IBM Plex, because dispatchers read this under pressure for hours, not for delight.

---

## 0. Decisions that need your yes or no

These change behaviour or data. Everything else in this plan is presentation only.

| # | Proposal | Why | Change needed |
|---|---|---|---|
| P1 | **Preview, then Apply.** Recalculate calls `/simulate` with the real fleet (read-only, same `_compute_plan` as `/optimize`), shows the diff, and only **Apply plan** calls `/optimize`, which saves the run. | 3.6 A says "don't apply silently". Today `/optimize` saves the moment it runs. | **None.** Frontend only. I'll confirm the two endpoints give the same plan for the same inputs before relying on it. |
| P2 | **Undo by delaying the save.** After Apply, the toast counts down 10 s, and `/optimize` is called when it ends. Undo cancels it. | There is no endpoint to un-save a run. | **None.** The run appears in history about 10 s later. |
| P3 | **Save scenario** to Run History, and **Restore this plan** from history. | Asked for in 3.6 C and E. | **Backend change:** `/simulate` never saves, and nothing restores an old run. Until approved: scenarios are saved in this browser only (parameters, no credentials), and "Restore" re-runs the old run's inputs through the Apply flow, labelled "Re-run with these settings". |
| P4 | **What-if sliders the model can't do yet:** demand surge (+30% calls), traffic ("Clear roads" to "Monsoon gridlock"), close a hospital, block a bridge. | Asked for in 3.6 C. | **Backend change.** `/simulate` accepts only hour, ambulances, radius, spacing and max response time. I'll build those five now, and show the others as disabled rows marked "Not in the model yet" so the gap is honest. Your call whether to add them later. |
| P5 | **Show the latest saved run on load.** | Audit #3: reload shows an empty panel. | **None.** Uses `GET /runs` and `GET /runs/{id}`, which are already called. |
| P6 | **Landing page at `/`, app at `/app`.** `proxy.ts` lets `/` through without a session. | 5.3 item 6. | Routing only, no API change. Old links to `/` from signed-in users redirect to `/app`. |
| P7 | **Delete** the placeholder fleet rows in `fleet-table.tsx` and the hard-coded demand profile in `optimization-controls.tsx`, once replaced. | Data honesty (audit #7). | Deleting code: asking now. The Analytics section is **not** deleted. It is the map section, so the nav label simply goes (3.6 F). |
| P8 | **KPI: "% of population covered"**. The data has demand weights per ward, not population. | 5.3 item 1. | I'll label it "**% of predicted demand reachable in target time**" (what the model actually computes). A population figure would need census data per ward. Tell me if you want that added. |
| P9 | **Response-time numbers that disagree** (26.6 vs 29.2 min). | Audit #5. | I'll trace both in the code and show one definition. If they are different measures, both stay, each with its own label. No calculation changes. |

---

## 1. Reference study

I skipped the `web-scraper` token extraction on purpose: we borrow structure and interaction only, and the colours and type come from 5.2. `app-replicator` is not installed, so these notes come from studying the products directly.

| Reference | Borrow | Don't borrow |
|---|---|---|
| **Flight-tracking map** (Flightradar24 style) | The map is the page. Controls float in thin bars at the edges. Clicking an object opens a side panel and the map stays visible. A time slider for playback. A filter bar that hides layers instead of opening a settings page. | Yellow plane icons, heavy ad chrome, tiny 10px labels, a dark map with saturated markers that glow. |
| **Dense dev / finance dashboard** (Linear, Grafana, Stripe dashboard) | A 44px top bar with text tabs. `⌘K` palette for "jump to anything". Tables at 32–36px rows with mono numbers. Side drawers for detail instead of new pages. Keyboard shortcuts shown in tooltips. | Purple accents, sidebar icon soup, cards for every number, gradient stat tiles. |
| **Dark analytics product** (Datadog-like) | Flat surface steps instead of shadows. One accent. Status colours used only for state. A "last updated" stamp beside every live figure. | Neon lines on black, cyan as the main colour, chart walls. |
| **Structure from Mercury** (via `website-design`) | The 4px-based spacing scale, three surface steps (canvas, card, raised), no shadows, pill-shaped primary controls, a calm pace. | Its cobalt accent, Inter and Inter Tight, its 32–40px radii. |

**Base system:** Mercury structure, with 5.2's palette, type and radii replacing its defaults. **Motion:** level 1 in the app, level 2 with one level-3 hero on the landing page. **Signature twist:** the safety-green "Recalculate staging" pill and signage-style Archivo numbers on a dim control-room canvas.

---

## 2. Design tokens

Declared once as CSS variables in a new `app/tokens.css` (dark theme on `[data-theme="app"]`, light on `[data-theme="landing"]`), then mapped into Tailwind v4 with `@theme inline`. Components use only tokens, with no stray hex values. Every contrast below was measured with the `dataviz` validator.

### 2.1 Surfaces and ink: app (dark)

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--canvas` | `#111413` | App background, map surround | |
| `--surface` | `#181c1b` | Panels, top bar, drawers | |
| `--raised` | `#21262a` | Hover rows, inputs, popovers | |
| `--hairline` | `rgba(232,235,233,.10)` (about `#2c3235`) | 1px dividers. Depth comes from these plus surface steps, **never shadows** (one exception: the toast and the command palette float, with `0 8px 24px rgba(0,0,0,.4)` and no border). | |
| `--ink` | `#e8ebe9` | Primary text (no pure white) | 14.3 : 1 on surface |
| `--ink-muted` | `#9aa3a0` | Secondary text, labels | 6.65 : 1 |
| `--ink-faint` | `#6f7975` | Disabled, axis ticks (non-text or large only) | 3.8 : 1 |

### 2.2 Brand and status

| Token | Fill (icons, dots, button fills) | Text on dark | Text on light | Rule |
|---|---|---|---|---|
| `--brand` safety green | `#007a51` (white text 5.38 : 1) | `#3dbb85` (6.29) | `#00714b` (5.69) | **The** primary action, the active-tab underline, the wordmark. Nothing else. |
| `--critical` | `#d93025` (white text 4.77) | `#ff7a6b` (6.00) | `#c22a1f` (5.41) | Uncovered wards, breaches of the target, errors. Always with a ▲ or ⨯ icon and a word. |
| `--warning` | `#e8a400` (ink text 8.60) | `#e8a400` (7.08) | `#8a6100` (5.20) | Stale plan, near-target, units low. Always with a ● dot and a word. |
| `--ok` | neutral `--ink-muted` plus a ✓ icon | | | "Covered", "In position". Never a second green. |
| `--info` / predicted | `#8fa3b3` (5.86) | | | Forecast values, "predicted" tags. |

That is 3 status colours plus neutral, as 3.5 requires. The old navy, violet, rose, emerald and sky classes all go.

### 2.3 Demand ramp (map)

One hue (steel blue, about 240°) from dark to light: **low demand recedes into the dark map, high demand is the lightest**. Blue keeps it clear of green (action), red (critical) and amber (warning), and it reads as "predicted", matching `--info`. The dataviz ordinal check passes (monotone lightness, visible gaps, 4° hue spread, light end 2.12 : 1 against the surface).

| Step | Token | Hex | Band (unchanged from `map-theme.ts`) |
|---|---|---|---|
| 1 | `--demand-1` | `#3b5266` | risk < 0.20 |
| 2 | `--demand-2` | `#4f6f8f` | 0.20–0.46 |
| 3 | `--demand-3` | `#6b90b4` | 0.46–0.70 |
| 4 | `--demand-4` | `#93b3d3` | > 0.70 |
| (5) | `--demand-5` | `#c9dcee` | Reserved: hover / selected ward |

The bands and the four levels stay exactly as they are (`LOW_MAX`, `MODERATE_MAX`, `HIGH_MAX`). Only the colours change. The legend says **"Predicted demand (relative risk score, 0–1)"**, with the ranges, not colour names. Ward fills sit at 0.55 opacity so road labels stay readable. Ward codes become visible from zoom 11, as today. For colour-blind and print readers, the "Very high" band also gets a 45° hatch.

### 2.4 Light theme: landing page

| Token | Value |
|---|---|
| `--canvas` | `#f7f8f6` (near-white, cool, not cream) |
| `--surface` | `#ffffff` |
| `--hairline` | `rgba(22,25,26,.10)` |
| `--ink` | `#16191a` (16.6 : 1) |
| `--ink-muted` | `#5b6460` (5.74 : 1) |
| Brand and status | the "text on light" column above |

The live-map hero band uses the dark app tokens, full-bleed.

### 2.5 Type

| Role | Font | Sizes (px / line height) |
|---|---|---|
| Display, KPI numbers | **Archivo**, semi-condensed width (`wdth` 87), weight 500–600, `tnum` | App: 18/24 page title, 20/24 KPI value. Landing: 56/56 hero, 32/36 section, 24/30. |
| Body and UI | **IBM Plex Sans** 400/500 | 14/20 UI text, 13/18 dense UI, 12/16 labels (floor) |
| Data, IDs, times, coordinates | **IBM Plex Mono** 400/500, `tnum` | 13/18 table data, 12/16 secondary data |

The app scale is 12 / 13 / 14 / 18 / 20 / 24 (tight at the bottom where density matters; ≥1.25 steps from 14 upward). The landing scale is 16 / 20 / 24 / 32 / 56 (≥1.25 throughout). That is 6 sizes, against 29 today. There is **no text below 12px** and no uppercase kicker labels; table headers are 12px sentence case in `--ink-muted`. Fonts load through `next/font/google` with `display: swap` and size-adjusted fallbacks, so there is no layout shift. Tracking is 0 for body, -0.01em at 24–32px, and -0.02em at 56px.

### 2.6 Spacing, sizes, radii, motion

- **Spacing** (Mercury scale): 4, 8, 12, 16, 24, 32, 48, 72, 112. The app uses 4–24. The landing page uses 24–112 between sections, with deliberately unequal section heights.
- **Sizes:** controls 32px tall (touch: 44px under `pointer: coarse`), table rows 34px, top bar 46px, KPI strip 52px, what-if drawer 248px, moves panel 320px wide (resizable 280–480, collapsible).
- **Radii:** `--r-sm: 4px` for tables, chips and map controls. `--r-md: 10px` for panels, drawers and cards. `--r-pill: 999px` for the primary button and status pills only.
- **Motion:** `--ease-out: cubic-bezier(.2,.7,.2,1)`. 150 ms hover, 220 ms panel slide, 800 ms map `flyTo`. A pulsing ring appears only on a critical alert. Everything is off under `prefers-reduced-motion`.

---

## 3. Screen map

```
/                  Landing (public, light)
/start, /register  Sign in, register (restyled; same flows)
/app               1  Live map      (home, operational view only)
/app/plan          2  Staging plan  (moves + unit list)
/app/scenarios     3  Scenarios     (saved what-ifs)
/app/history       4  Run history
/app/data          5  Data & assumptions
```

There is no analytics page. The old `#analytics` section *is* the map, so it becomes `/app` itself, and the "Analytics" tab disappears. Nothing is deleted. Old hash links (`/#fleet`, `/#optimization-runs`) redirect to `/app/plan` and `/app/history`.

**Keyboard:** `1`–`5` switch sections, `⌘K` / `Ctrl K` opens the palette, `R` recalculates staging, `W` opens what-if, hold `Space` to compare, `←` / `→` move the time scrubber one hour, `Esc` closes the top panel, `?` shows all shortcuts. None of them fire while typing in an input.

---

## 4. Wireframes

### 4.0 App shell (all `/app` pages)

```
┌ 46px ─────────────────────────────────────────────────────────────────────────┐
│ AmbulanceIQ       Live map  Staging plan  Scenarios  Run history  Data          │
│                   ‾‾‾‾‾‾‾‾ (2px green underline on the active tab)               │
│                                  ● Live · updated 14:32   ⌘K Search   Parel ▾   │
└───────────────────────────────────────────────────────────────────────────────┘
```
- Wordmark on the left. Which name to use is open question 2 in §7, because the audit found two product names in use.
- The right side shows live status (green dot = connected, amber = data older than 15 min with "stale", red = backend unreachable), the `⌘K` button, and a hospital menu (driver code, keys, switch hospital, sign out: the same functions as today).
- **Mobile:** the top bar keeps the wordmark, status and menu. A bottom tab bar holds Live map, Plan, History, and More (Scenarios, Data, shortcuts).

### 4.1 Live map (`/app`, the 3-second screen)

```
┌ top bar ──────────────────────────────────────────────────────────────────────┐
├ KPI strip 52px ───────────────────────────────────────────────────────────────┤
│ Avg response 26.6 min ▼7.3 │ Demand reachable ≤20 min 9% ▲8 │ Units 1/1 │       │
│ ▲ 18 of 24 wards outside 20 min  [Show]                   Plan for 08:00 Tue    │
├───────────────────────────────────────────────────────────┬──────────────────┤
│ [⟳ Recalculate staging  R]  [What if…  W]                  │ Moves (1)     ⟨  │
│ Last calculated 14:32 · 6 min ago                          │ UXA-001  ALS     │
│   (stale: ● Inputs changed, recalculate recommended)        │ Base → Ward G/N  │
│                                                            │ Rajvi Clinic,    │
│                     M U M B A I   M A P                    │ Dadar            │
│        wards filled by demand ramp, units, reachable       │ −7.3 min avg     │
│        outline, hospital, uncovered wards outlined red     │ [Accept] [Skip]  │
│                                                            │                  │
│ ┌ layers ┐                         ┌ legend: predicted demand ┐│                  │
│ │Demand ✓│                         │ ▇▇▇▇ low → very high      ││                  │
│ │Reach  ✓│ ┌ time scrubber ───────────────────────────────┐  ││                  │
│ │Units  ✓│ │ ▶  00 ▁▂▃▅▆▇█▇▆▅▆▇▇▆▅▆▇▆▅▅▄▃  23    08:00 ●    │  ││                  │
│ └────────┘ └───────────────────────────────────────────────┘  │                  │
└───────────────────────────────────────────────────────────┴──────────────────┘
```
- The map fills everything under the strip. The moves panel is collapsible and resizable. At 1920px the map simply gets wider (no 1,360px cap).
- **KPI strip:** one row, 52px. Each item is a 12px label, a 20px Archivo tabular number, and a change mark ("▼ 7.3 min" in text colour plus sign; the arrow direction carries the meaning, so colour is never alone). After a recalculation, a changed value briefly highlights its background once (no count-up in the app).
- **Critical alert:** the coverage warning becomes an inline red item in the strip. "Show" outlines the uncovered wards on the map and lists them by name ("K/W Andheri West, …").
- **Time scrubber:** the existing hour slider and histogram, moved onto the map. The bars come from the real ward risk data for each hour, not the hard-coded list. Play/pause and `←`/`→` work. It replaces the "Target Time" form row.
- **Recalculate staging (3.6 A):** the only filled button on screen, a green pill with a refresh icon. Its states:

| State | Button | Status line | Map |
|---|---|---|---|
| Idle | Enabled | "Last calculated 14:32 · 6 min ago" | Current plan |
| Stale (hour changed, a unit went out of service, a what-if was applied, or the plan is over 60 min old) | Enabled, 2px amber ring | "● Inputs changed, recalculate recommended" | Current plan |
| Running | Disabled, spinner plus elapsed "Calculating · 3 s" (the backend reports no steps, so I show a timer); double clicks blocked | | Map still usable |
| Result (preview, P1) | Hidden behind the result panel | | Old positions become hollow ghost markers with thin arrows to the new ones |
| Applied (P2) | | Updates | Toast: "Plan applied · Undo (10)" |
| Error | Enabled | Red: "Couldn't reach the planning service. The previous plan is still in place." [Retry] | Unchanged |

  The result panel docks under the toolbar: "1 unit moved · 15-min reach 1% → 9% · avg response 33.9 → 26.6 min", with **Apply plan** (green), **Review moves** (opens the moves panel), and **Discard**. There is no "Auto every 15 min" option, because the backend has no scheduler.

- **What if… (3.6 C):** a bottom drawer, 248px, sliding up over the lower map. Its parts:
  - **Left: preset chips**, each labelled "assumption": "Rush hour 18:00", "Night 03:00", "1 unit down", "2 more units", "Strict 15 min". Each preset only sets the controls. "Monsoon evening" and "Festival night" need P4, so they appear disabled with a "Not in the model yet" note.
  - **Middle: controls:**
    - Ambulances available: a stepper, "1 unit → 3 units". Extra units are marked as simulated BLS, which is what the backend does.
    - Operating radius: a slider, 5–30 km.
    - Spacing between units: a slider, 0.5–5 km.
    - Target response: a segmented control, 15 / 20 / 25 min (the model allows 5–60, and today's default is 20).
    - Hour: tied to the map scrubber.
  - **Right: live readout:** avg response and demand reachable, "now → scenario", recalculated when a slider is released (each run is about 5 s, so not on every drag), with a "Calculating…" mark while pending.
  - **On the map:** scenario units appear as ghost markers and their reachable area as an outline. Hold `Space` or the "Hold to compare" button to flip back to the current plan.
  - **Actions:** Use as staging plan (goes through Result → Apply), Save scenario (P3), Reset, Close.
  - **Mobile:** a full-height sheet.

### 4.2 Staging plan (`/app/plan`)

```
┌ Moves for 08:00 · 1 unit ───────────────────────┬ small map ──────────┐
│ UXA-001  ALS   Hospital base → Ward G/N         │ hover previews the   │
│ Rajvi Clinic, Dadar · 10.5 km                   │ move with an arrow   │
│ Why: G/N is the highest-demand ward within reach│                      │
│ Gain: avg response −7.3 min    [Accept] [Skip]  │                      │
├ Units ─────────────────────────────────────────────────────────────────┤
│ Call sign  Type  Status      Ward  Position          From base   Edit  │
│ UXA-001    ALS   ✓ Available  G/N  Rajvi Clinic      10.5 km      ⋯    │
└──────────────────────────────────────────────────────────────────────────┘
```
- Call signs are shown exactly as stored (audit #6), in Plex Mono.
- Table headers are real sort buttons. "Edit fleet" opens the existing dialog, restyled.
- The "Why" line is built from data the plan already returns: ward code and name, demand level, minutes saved. No invented reasons. Accept marks the assignment through the existing `PATCH /ambulances/{call_sign}/assignment-status`, with a 10 s Undo.
- The "~28 min drive" estimate (distance × 2.7) is replaced by the travel time from the travel-time matrix the optimizer uses, or else shown as "10.5 km straight line". It is not presented as a drive time.
- **Empty state:** "No ambulances yet. Add the first one so the planner has something to place." [Add ambulance].

### 4.3 Scenarios (`/app/scenarios`)
A compact list: name, created, hour, units, radius, spacing, target, and last result (avg response / reach). Clicking a scenario reopens it in the what-if drawer over the map. Until P3 is approved, a note says "Saved in this browser only". Empty state: "No saved scenarios. Open What if… on the live map and save one."

### 4.4 Run history (`/app/history`, 3.6 E)
- **Table:** time, trigger (Manual / What-if; Auto never shows, because no scheduler exists), hour planned, units, units moved, reach before → after, avg response before → after, status.
  - Duration is not stored, so I leave it out rather than invent it.
  - Coloured numbers only show change: an improved number is plain text with ▼, a worse one is red with ▲.
- **Filters:** date range and trigger.
- **Row detail:** clicking a row opens a right-hand drawer with a small static map of that run's positions and its KPIs. Its actions are "Compare with…" (pick a second run to see two columns of numbers and both position sets on one map) and "Re-run with these settings" (P3).
- **Run numbers:** shown as the hospital's own count ("Run 1, 2, 3…"), not the global ID (audit, smaller issues).

### 4.5 Data & assumptions (`/app/data`)
Plain sections, each with a "last updated" date:
- What the model predicts (a relative risk score per ward and hour, not calls) and how it is built (base risk × time-of-day multiplier).
- Travel times (source, method, date).
- What is simulated. Banner: **"Simulated data based on published statistics"**, wording to be confirmed by you (audit Q1).
- How staging is chosen, in plain English.
- Known limitations: no live traffic, no hospital capacity, ward-level not street-level, 24 wards.

A short version of this banner also sits in the map legend: "Simulated demand · details".

### 4.6 Landing (`/`, light)
Following 9 in the brief:
1. **Hero:** left-aligned text beside a full-bleed dark map band.
   - Proposed headline: "Ambulances in the right place before the call comes in".
   - One subline with a real number from the app's own simulation, labelled "Simulated".
   - CTAs: "Open the live map" and "See the 08:00 Andheri plan".
2. **Problem:** 2–3 sourced sentences. **Placeholders clearly marked** until you give sources; I won't invent numbers.
3. **How it works:** one real, annotated screenshot of `/app` with 3 numbered callouts (forecast, recommendation, result).
4. **Impact:** one chart of the before/after response-time distribution with the target line, labelled "Simulated".
5. **Today / basic / next:** an honest, uneven list.
6. **Who it's for:** dispatch centres, hospital networks, private operators.
7. **Assumptions:** links to `/app/data`.
8. **Team:** your names and roles (needed from you), and contact.

**The hero "wow":** the actual 24 wards fill hour by hour through the day while units move to their staged positions. It uses the real GeoJSON and run data, drawn on a `<canvas>` over CARTO's dark tiles. Hexes and road-trace arcs would need data the app doesn't have (H3 cells, road routes), so I propose this honest version. If you want road-following traces, they would need routes precomputed once from OpenStreetMap; that's a data addition, so I'd ask first. Under reduced motion, or on mobile, a static frame shows instead.

### 4.7 Start and register
- The same flows, restyled with the dark app tokens, a two-column layout on desktop, and one consistent name ("Hospital code" everywhere).
- The violet pin becomes a neutral pin with a green ring. The checkbox is styled.
- "← Back" becomes an icon plus text.
- The `/start` page redirects to `/app` when already signed in.

---

## 5. Map technology

**Keep Leaflet.** The brief says to keep the current library unless switching is clearly worth it, and here it isn't:
- The data unit is 24 ward polygons plus a handful of markers, which Leaflet draws easily.
- MapLibre plus deck.gl would mean rewriting `mumbai-map.tsx` (567 lines), `ward-risk-layer.tsx` and the isochrone layer, with no gain for the dispatcher.

Changes:
- **CARTO `dark_nolabels` base plus a `dark_only_labels` pane** above the ward fills, so labels stay readable. It is the same provider and API key, and the CSP already allows `*.basemaps.cartocdn.com`.
- Custom `divIcon` unit markers: a status shape plus the call sign.
- Hollow ghost markers with SVG arrows for moves.
- `flyTo` at 800 ms.
- No glow anywhere.
- **Performance:** simplify the 924 KB ward GeoJSON to about 150 KB (a display-only copy; the original stays for the backend), and lazy-load the map component.

---

## 6. Components

All built with every state (default, hover, focus-visible, active, disabled, loading), using only the tokens.

| Component | Notes |
|---|---|
| `AppShell`, `TopBar`, `BottomTabs` (mobile) | 46px bar, 2px green underline, live status, hospital menu |
| `CommandPalette` | `⌘K`: wards (code and name), units (call sign), pages, actions. Built on a native `<dialog>`, no new dependency. |
| `ShortcutsOverlay` | `?` |
| `KpiStrip`, `KpiItem`, `AlertItem` | 52px row, tabular Archivo numbers, change marks |
| `RecalcControl` | Button plus status line, six states, `R` |
| `ResultPanel` | Diff summary, Apply / Review / Discard |
| `Toast` (with Undo countdown) | The only floating shadow besides the palette |
| `WhatIfDrawer`, `PresetChip`, `Stepper`, `RangeSlider` (24px hit area), `Segmented`, `LiveReadout`, `HoldToCompare` | |
| `MovesPanel`, `MoveRow` | Collapsible and resizable |
| `TimeScrubber` | Histogram from the risk data, play/pause, arrow keys |
| `MapLegend`, `LayerToggles`, `UnitMarker`, `GhostMarker`, `MoveArrow` | |
| `DataTable` (sortable headers as buttons, 34px rows), `SideDrawer` | Plan, history, scenarios |
| `StatusPill` | 3 states plus neutral, always icon plus word |
| `EmptyState`, `ErrorState`, `Skeleton` | Copy reviewed for every async element |
| `Field`, `Input`, `Select`, `Checkbox`, `Button` (primary pill / secondary / ghost / danger) | Shared by register and start |

**Libraries:** no new UI libraries in the app. For the landing page: `next/font`, Lenis (landing only), and Magic UI `number-ticker` (impact numbers, once). No border beams, shimmer, glow or spotlight components.

**Styles:** `globals.css` is rebuilt as `tokens.css` plus one stylesheet per component area. The old 38,000-line file is replaced, not edited, and the current one stays in git history. Since this swaps the stylesheet rather than deleting a route or component, I'm treating it as in scope; tell me if you'd rather I ask before replacing it.

---

## 7. Open questions

1. **Approve or reject P1–P9** in section 0.
2. **Product name.** Today it is "AmbulanceIQ" in the dashboard and "Ambulance Response Optimization Platform" on `/start`. Pick one, or I'll use "AmbulanceIQ" in the wordmark with the long name as its subtitle on the landing page.
3. **Data label wording.** Is the risk data "Simulated data based on published statistics", or is it modelled from real incident records? (audit Q1)
4. **Landing content.** Sourced Mumbai/India statistics (or I leave marked placeholders), team names, roles and the founders' note.
5. **Mobile priority.** The brief says the KPI strip, alerts and recommendations come first on mobile, with the map collapsible. Confirm that is right for judges opening a phone link. The alternative is the map first with the strip on top.

## 8. Build order after approval

| Phase | Work |
|---|---|
| 3 | Tokens, fonts, shell, shared components, new routes (old page kept working until the swap) |
| 4 | Live map, KPI strip, Recalculate flow, what-if drawer, moves panel, then plan, history, scenarios and data pages |
| 5 | Motion |
| 6 | Landing page |
| 7 | Accessibility, copy, performance, Lighthouse |
| 8 | Before/after screenshots, Tell Scores (target ≤ 10), click-through of every flow |

Each phase gets its own commit on `ui-ux-upgrade`. Nothing is pushed.
