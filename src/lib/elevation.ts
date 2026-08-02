import type { Coordinates } from "./types";

// ── In-memory elevation cache ────────────────────────────────────────────────
// Elevations for a given lat/lng are stable, so cache them forever.
const cache = new Map<string, number>();

export function elevationKey(coordinates: Coordinates): string {
  return `${coordinates.lat.toFixed(5)},${coordinates.lng.toFixed(5)}`;
}

export function getCachedElevation(coordinates: Coordinates): number | undefined {
  return cache.get(elevationKey(coordinates));
}

/**
 * Fetch ground elevation (metres above sea level) for a list of coordinates.
 * Uses the free Open-Meteo elevation API (no key required) and caches results
 * in-memory so repeated lookups are free. Unresolved points are skipped so the
 * caller can degrade gracefully to proximity-only routing.
 */
export async function fetchElevations(
  coords: Coordinates[]
): Promise<Record<string, number>> {
  const unique = new Map<string, Coordinates>();
  for (const c of coords) {
    const key = elevationKey(c);
    if (!unique.has(key)) unique.set(key, c);
  }

  const result: Record<string, number> = {};
  const missing: Coordinates[] = [];
  for (const [key, c] of unique) {
    const cached = cache.get(key);
    if (cached !== undefined) result[key] = cached;
    else missing.push(c);
  }

  if (missing.length === 0) return result;

  // Open-Meteo accepts comma-separated coordinates; batch in chunks of 100.
  const CHUNK = 100;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    try {
      const latitudes = chunk.map((c) => c.lat.toFixed(6)).join(",");
      const longitudes = chunk.map((c) => c.lng.toFixed(6)).join(",");
      const url =
        `https://api.open-meteo.com/v1/elevation` +
        `?latitude=${latitudes}&longitude=${longitudes}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const data = await res.json();
      const elevations = data.elevation as number[];
      chunk.forEach((c, idx) => {
        const elev = Number(elevations[idx]);
        if (!Number.isFinite(elev)) return;
        const key = elevationKey(c);
        cache.set(key, elev);
        result[key] = elev;
      });
    } catch {
      // Elevation service unreachable — fall back to proximity-only analysis.
    }
  }

  return result;
}

export async function getElevationAt(coordinates: Coordinates): Promise<number | undefined> {
  const key = elevationKey(coordinates);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const result = await fetchElevations([coordinates]);
  return result[key];
}
