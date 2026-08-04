# Vellam Undo

Vellam Undo is a working flood-reporting and re-navigation prototype for Kerala. It hsd a map-first emergency operations interface for:

- live flood reports and community verification
- road status by water level
- safer route planning that penalizes flooded corridors
- emergency help requests and volunteer triage
- relief center discovery
- local analytics for operational visibility

The prototype runs without external credentials. Data is seeded from local Kerala demo fixtures and persists in the browser with `localStorage`, while the code is split into service-style modules so Supabase, OpenRouteService, and realtime subscriptions can be wired in later.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Architecture Notes

- `src/app/home-client.tsx` is the client controller, similar to the GasUndo home shell.
- `src/lib/*` contains the flood-report, help-request, relief-center, routing, district, and analytics domain logic.
- `src/hooks/useEmergencyStore.ts` provides optimistic local persistence for the demo.
- `src/components/FloodMap.tsx` renders OpenStreetMap tiles, reports, relief centers, help requests, and selected route overlays.

## Production Swap Points

- Replace the local store with Supabase tables from the architecture plan.
- Replace `buildRouteOptions` in `src/lib/routing.ts` with OpenRouteService calls and avoid-polygons.
- Add Supabase Realtime subscriptions for reports, confirmations, help requests, and volunteer assignments.
- Move community verification and rate limits to API routes with server-side identity checks.
