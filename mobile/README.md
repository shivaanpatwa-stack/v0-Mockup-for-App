# AmbulanceIQ — driver app (Expo)

React Native (Expo SDK 57, Expo Router) app for ambulance crews. It talks to the same FastAPI backend as the
web dashboard in `../frontend`; there is no separate mobile backend.

## Screens

| Screen | File | Backend |
| --- | --- | --- |
| Enter hospital code (first launch, or after "Change hospital") | `src/app/enter-code.tsx` | `GET /hospital` with the typed code |
| Select unit | `src/app/switch-unit.tsx` | `GET /fleet` |
| Assignment (unit, recommended position, status stepper, availability sheet, "Position updated" banner) | `src/app/(tabs)/index.tsx` | `GET /fleet`, `GET /hospital`, `GET /demand-scores`, `PATCH /ambulances/{id}/status`, `PATCH /ambulances/{id}/assignment-status` |
| Map (assigned position, hospital, nearby hotspots) | `src/app/(tabs)/map.tsx` | same data as above |

**Hospital code.** Every request carries `X-Hospital-Code` once a code is stored (`src/lib/api.ts`). The code, the
hospital name and the chosen unit are kept on the device; "Switch unit" forgets the unit, "Change hospital" forgets
all three. If the backend answers 404 "Hospital code not found" on any call, the app clears them and returns to the
code screen.

**Polling.** `/fleet` is refreshed every 10 s, only while the app is in the foreground and the screen is focused
(`src/hooks/use-focused-polling.ts`). If the optimizer re-plans a unit (a different `candidate_id`), the app shows
the "Position updated" banner and resets the stepper to *Planned*.

**Errors.** Network failures (no connection, or no answer within 8 s) show an amber banner with Retry and keep the
last data on screen; HTTP errors show the backend's own `detail` text.

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
- `EXPO_PUBLIC_CARTO_API_KEY`: same CARTO key as the web app's `NEXT_PUBLIC_CARTO_API_KEY`. Without it the map uses OpenStreetMap tiles.

`npx expo start --web` also works for a quick look in a browser (the map renders in an iframe there).

## Expo Go and SDK versions

Expo Go from the App Store runs only the newest SDK it ships with. This project is on **SDK 57** because the
SDK 58 version of Expo Go wasn't in the stores yet when it was written. If Expo Go says "Project is incompatible
with this version of Expo Go", the project and the app disagree: upgrade the project once the store version moves
(`npx expo install expo@latest --fix`), or install the matching Expo Go. On SDK 58 and later, import `Tabs` from
`expo-router/js-tabs` in `src/app/(tabs)/_layout.tsx` (the plain `expo-router` export is deprecated there).

## Known limits

- Stepper timestamps ("Started 9:14 PM") are recorded on the device only; the backend stores just the current stage.
- "Nearby hotspots" uses ward centroids from the web app's GeoJSON (`src/data/wards.ts`) and the neighbourhood names
  there are the usual BMC ward names, so check them.
- There is no login: anyone with a hospital code can pick any unit; the choice is stored on the device.
- The web preview (`--web`) calls the API from a browser, and the backend's CORS currently allows only
  `http://localhost:3000`, so run it with `--port 3000`. Phones are not affected by CORS.
- The map is a Leaflet page in a WebView (loads Leaflet from cdnjs, so it needs internet).
