# AmbulanceIQ — driver app (Expo)

React Native (Expo SDK 57, Expo Router) app for ambulance crews. It talks to the same FastAPI backend as the
web dashboard in `../frontend`; there is no separate mobile backend.

## Screens

| Screen | File | Backend |
| --- | --- | --- |
| Enter hospital code (first launch, or after "Change hospital") | `src/app/enter-code.tsx` | `GET /hospital` with the typed code |
| Select unit | `src/app/switch-unit.tsx` | `GET /fleet` |
| Assignment (unit, recommended position, status stepper, availability sheet, "Position updated" banner) | `src/app/(tabs)/index.tsx` | `GET /fleet`, `GET /hospital`, `GET /demand-scores`, `PATCH /ambulances/{id}/status`, `PATCH /ambulances/{id}/assignment-status` |
| Map (full-screen map with the base and this unit's staging position, bottom card, Recenter) | `src/app/(tabs)/map.tsx` | same polled `/fleet` and cached `/hospital` as the Assignment tab; no extra requests |

**Hospital code.** Every request carries `X-Hospital-Code` once a code is stored (`src/lib/api.ts`). The code, the
hospital name and the chosen unit are kept on the device; "Switch unit" forgets the unit, "Change hospital" forgets
all three. `X-Hospital-Code` is the only hospital identifier the app ever sends (no hospital id, no `X-Admin-Key`).

**Polling.** `/fleet` is refreshed every 10 s, only while the app is in the foreground and the screen is focused
(`src/hooks/use-focused-polling.ts`). If the optimizer re-plans a unit (a different `candidate_id`), the app shows
the "Position updated" banner and resets the stepper to *Planned*.

**Offline cache.** After each successful `GET /hospital` or `GET /fleet` the app saves `cache.hospital`
(`{name, lat, lng}`) and `cache.unit` (`{call_sign, type, status, current_assignment, cachedAt}`) to AsyncStorage, at
most one write every 5 s (`src/state/fleet.tsx`). When the server can't be reached (network failure or 5xx; not 401,
403 or 429) the Assignment and Map tabs render from it with the banner "Can't reach the server. Showing last known
position. Cached at 9:02 PM" and Retry, plus "Data may be out of date" once it is over 30 minutes old. Start moving,
I've arrived and Change availability are disabled ("Reconnect to update"); actions are never queued or replayed. A cached
plan past its end shows "plan has ended". When a poll succeeds again the banner goes and "Back online." shows briefly.
The cache is cleared by Switch unit, Change hospital and any 401.

**Errors.** All of this lives in the fetch wrapper in `src/lib/api.ts`:

| Response | What the app does |
| --- | --- |
| 401 (or the older 404 "Hospital code not found") | Clears the code, unit and cached data and returns to the code screen with "Your hospital code is no longer valid." On the code screen itself it shows "Code not found. Check with your dispatcher." |
| 429 | "Too many attempts. Try again in a few minutes." The `Retry-After` header (seconds or a date; 5 min if missing) is honored: on the code screen Connect is disabled with a countdown, elsewhere a banner shows and polling pauses. While locked out, no request is sent at all. |
| 403 and other 4xx | Shows the backend's `detail` text; nothing is cleared. |
| No connection, 8 s timeout, or 5xx | "Can't reach the server." with Retry; the last data stays on screen and nothing is cleared. |

## Run it

```bash
cd mobile
npm install
cp .env.example .env        # optional, see below
npx expo start              # scan the QR code with Expo Go
```

Start the backend so a phone can reach it:

```bash
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000
```

On first launch the app asks for a hospital code (like `PAREL-4821`). Get it from the web app after registering a
hospital at `/register`. Units only get a recommended position after you press **Recalculate** on the dashboard.

- `EXPO_PUBLIC_API_URL`: backend URL as seen from the phone. If unset, the app uses the Expo dev server's host on
  port 8000 (works when the phone and computer share a Wi-Fi network).

`npx expo start --web` also works for a quick look in a browser, but the map itself is native-only (see below).

## Expo Go and SDK versions

Expo Go from the App Store runs only the newest SDK it ships with. This project is on **SDK 57** because the
SDK 58 version of Expo Go wasn't in the stores yet when it was written. If Expo Go says "Project is incompatible
with this version of Expo Go", the project and the app disagree: upgrade the project once the store version moves
(`npx expo install expo@latest --fix`), or install the matching Expo Go. On SDK 58 and later, import `Tabs` from
`expo-router/js-tabs` in `src/app/(tabs)/_layout.tsx` (the plain `expo-router` export is deprecated there).

## Known limits

- Stepper timestamps ("Started 9:14 PM") are recorded on the device only; the backend stores just the current stage.
- There is no login: anyone with a hospital code can pick any unit; the choice is stored on the device.
- The web preview (`--web`) calls the API from a browser, and the backend's CORS currently allows only
  `http://localhost:3000`, so run it with `--port 3000`. Phones are not affected by CORS.
- The Map tab uses `react-native-maps` with each platform's default provider (Apple Maps on iOS, Google Maps on
  Android; both work in Expo Go without a key). The package has no web implementation, so the web preview shows a
  placeholder with the two marker styles instead of a map.
