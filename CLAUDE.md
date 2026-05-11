# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project overview

**Strava Map** — a single-page React + Vite app that connects to Strava and renders the user's activities (any sport) on a single Leaflet map filtered by date range and sport. It also auto-suggests "trips" (clusters of activities far from the user's typical area) for one-click viewing.

Refactored from `claude-cheetah` (a half-marathon training tracker) — most training-app code was stripped; the Strava OAuth + caching + map rendering plumbing was reused.

## Commands

```bash
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build
npm run lint     # ESLint
npm run preview  # Preview production build
npm test         # Jest
```

## Tech stack

- Vite 7 + React 19 + TypeScript 5.9
- Material-UI 7 (theme in `src/theme.ts`)
- Leaflet (raw, no react-leaflet wrapper) — `ActivityMap` component
- Jest + ts-jest

## Architecture

```
src/
├── App.tsx                            # AppShell + StravaConnect + MapView
├── components/
│   ├── layout/AppShell.tsx            # MUI AppBar + Container chrome
│   ├── strava/StravaConnect.tsx       # Top-bar connect/sync/disconnect
│   ├── map/ActivityMap.tsx            # Leaflet map, multi-polyline, fit-bounds, ski tiles
│   ├── trip/
│   │   ├── SportPicker.tsx            # Bucket toggle + dynamic sport_type chips
│   │   ├── DateRangePicker.tsx        # Two native date inputs
│   │   └── TripSuggestions.tsx        # Clickable list of auto-detected trips
│   └── MapView.tsx                    # Single-page main view
├── hooks/useStrava.ts                 # OAuth + activity cache (localStorage)
├── services/
│   ├── stravaAuth.ts                  # OAuth: authorize, exchange, refresh
│   └── stravaApi.ts                   # Paged date-range activity fetch
├── utils/
│   ├── polyline.ts                    # Google polyline decoder
│   ├── sportBuckets.ts                # Curated sport buckets + bucket lookup
│   └── tripDetection.ts               # Date-gap + away-from-home cluster detection
└── types/strava.ts                    # Strava API types
```

## Key concepts

**Sport buckets** (`utils/sportBuckets.ts`) — Strava has ~30 `sport_type` values. We group them into 7 curated buckets (Run, Ride, Ski/Snow, Hike/Walk, Swim, Water, Other) for the picker. After filtering by bucket+date, a second-level chip row lets the user narrow further by exact `sport_type`.

**Trip detection** (`utils/tripDetection.ts`) — `home` is the median start_latlng across all geo activities. Activities >50 km from home are clustered by date (gap > 3 days breaks a cluster). Each cluster becomes a `TripSuggestion` with start/end date, sports, buckets, and centroid distance.

**Sync flow** — `useStrava.sync(start, end)` calls `stravaApi.fetchActivitiesInDateRange`, pages through Strava's `/athlete/activities` endpoint (per_page=100, max 20 pages), stores results in `localStorage['strava_activities']`. The list endpoint returns `map.summary_polyline` so no per-activity detail fetch is needed.

## Environment variables

```env
VITE_STRAVA_CLIENT_ID=
VITE_STRAVA_CLIENT_SECRET=
VITE_STRAVA_REDIRECT_URI=http://localhost:5173/
```

Get credentials at https://www.strava.com/settings/api.

## Tests

Colocated with sources (`*.test.ts`):
- `src/services/stravaApi.test.ts`
- `src/services/stravaAuth.test.ts`
- `src/utils/polyline.test.ts`

Run: `npm test`
