import { severityRank, formatRelativeTime } from "./floodReports";
import { fetchElevations, elevationKey } from "./elevation";
import type { Coordinates, Incident, RouteOption, RouteAnalysis, SeverityLevel } from "./types";

export type SearchResultPlace = {
  id: string;
  name: string;
  fullName: string;
  coordinates: Coordinates;
};

// ── Cache ─────────────────────────────────────────────────────────────────────
// Cache raw OSRM responses by waypoint string so identical requests are instant.
const osrmCache = new Map<string, any>();

// ── Geocoding ─────────────────────────────────────────────────────────────────
export async function geocodeDestination(query: string): Promise<SearchResultPlace[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query.trim()
    )}&limit=6&countrycodes=in`;
    const response = await fetch(url, { headers: { "Accept-Language": "en-US,en" } });
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((item: any) => ({
      id: item.place_id ? String(item.place_id) : `place-${Math.random()}`,
      name: item.display_name.split(",")[0] || item.display_name,
      fullName: item.display_name,
      coordinates: { lat: Number.parseFloat(item.lat), lng: Number.parseFloat(item.lon) }
    }));
  } catch (err) {
    console.warn("Geocoding failed:", err);
    return [];
  }
}

// ── Haversine distance ────────────────────────────────────────────────────────
export function haversineDistanceKm(start: Coordinates, end: Coordinates): number {
  const R = 6371;
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const dLat = toRadians(end.lat - start.lat);
  const dLng = toRadians(end.lng - start.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── OSRM fetch (real road geometry) ──────────────────────────────────────────
/**
 * Fetch a real driving route from OSRM for an arbitrary list of waypoints.
 * Returns the parsed JSON or null on failure.
 */
async function fetchOsrmRoute(waypoints: Coordinates[]): Promise<any | null> {
  if (waypoints.length < 2) return null;

  const coordStr = waypoints.map((c) => `${c.lng},${c.lat}`).join(";");
  const cacheKey = coordStr;
  if (osrmCache.has(cacheKey)) return osrmCache.get(cacheKey);

  const url =
    `https://router.project-osrm.org/route/v1/driving/${coordStr}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=false`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    osrmCache.set(cacheKey, data);
    return data;
  } catch {
    return null;
  }
}

/**
 * Parse a single OSRM route object into a Coordinates array.
 */
function osrmRouteToCoords(route: any): Coordinates[] {
  return route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
}

/**
 * Fetch the exact road path between two points so a flooded stretch follows
 * the road geometry instead of a straight line. Returns null on failure.
 */
export async function fetchRoadPath(
  start: Coordinates,
  end: Coordinates
): Promise<{ coordinates: Coordinates[]; distanceKm: number } | null> {
  const result = await fetchOsrmRoute([start, end]);
  const route = result?.routes?.[0];
  if (!route) return null;
  const coordinates = osrmRouteToCoords(route);
  return {
    coordinates,
    distanceKm: Number((route.distance / 1000).toFixed(2))
  };
}

// ── Detour waypoint generation ────────────────────────────────────────────────
/**
 * Returns two waypoint candidates on either side of the origin→destination
 * line, at fractional position `t` along it, offset `offsetKm` perpendicularly.
 */
function buildPerpendicularPair(
  origin: Coordinates,
  destination: Coordinates,
  t: number,
  offsetKm: number
): [Coordinates, Coordinates] {
  const midLat = origin.lat + t * (destination.lat - origin.lat);
  const midLng = origin.lng + t * (destination.lng - origin.lng);

  const dLat = destination.lat - origin.lat;
  const dLng = destination.lng - origin.lng;
  const len = Math.hypot(dLat, dLng) || 1;
  // Perpendicular unit vector
  const perpLat = -dLng / len;
  const perpLng = dLat / len;

  const kmPerDegLat = 110.57;
  const kmPerDegLng = 111.32 * Math.cos(toRadians(midLat));

  const left: Coordinates = {
    lat: midLat + perpLat * (offsetKm / kmPerDegLat),
    lng: midLng + perpLng * (offsetKm / kmPerDegLng)
  };
  const right: Coordinates = {
    lat: midLat - perpLat * (offsetKm / kmPerDegLat),
    lng: midLng - perpLng * (offsetKm / kmPerDegLng)
  };
  return [left, right];
}

/**
 * Rough similarity score between two routes based on how many sampled
 * points from routeA land within ~300 m of routeB.
 * Returns 0 (totally different) to 1 (identical).
 */
function routeSimilarity(routeA: Coordinates[], routeB: Coordinates[]): number {
  const sampleCount = 12;
  const stepA = Math.max(1, Math.floor(routeA.length / sampleCount));
  let matches = 0;
  let total = 0;
  for (let i = 0; i < routeA.length; i += stepA) {
    const dist = getNearestSegmentDistanceKm(routeA[i], routeB);
    if (dist < 0.3) matches++; // within 300 m = "same road"
    total++;
  }
  return total === 0 ? 0 : matches / total;
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function calculateRoadRoutes(
  origin: Coordinates,
  destination: Coordinates,
  incidents: Incident[]
): Promise<RouteOption[]> {
  const activeIncidents = incidents.filter(
    (i) => i.status === "active" || i.status === "receding"
  );

  // ── Step 1: Fetch primary OSRM route with alternatives ────────────────────
  const primaryCacheKey = `${origin.lng.toFixed(5)},${origin.lat.toFixed(5)};${destination.lng.toFixed(5)},${destination.lat.toFixed(5)}`;
  let primaryOsrm = osrmCache.get(primaryCacheKey);

  if (!primaryOsrm) {
    const coordStr = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const url =
      `https://router.project-osrm.org/route/v1/driving/${coordStr}` +
      `?overview=full&geometries=geojson&alternatives=3&steps=false`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const data = await res.json();
        if (data.code === "Ok" && data.routes?.length) {
          primaryOsrm = data;
          osrmCache.set(primaryCacheKey, data);
        }
      }
    } catch (err) {
      console.warn("OSRM primary fetch failed:", err);
    }
  }

  if (!primaryOsrm) {
    return [buildOfflineNotice(origin, destination, activeIncidents)];
  }

  // ── Step 2: Build raw route geometries from all OSRM alternatives ─────────
  // Drafts carry only geometry/time/distance — analysis (which needs elevation
  // data) is attached afterwards in Step 4.
  type RouteDraft = {
    id: string;
    nameHint: string;
    isDetour: boolean;
    coordinates: Coordinates[];
    distanceKm: number;
    baseMinutes: number;
  };

  const rawDrafts: RouteDraft[] = primaryOsrm.routes.map((osrmRoute: any, i: number) => {
    const coords = osrmRouteToCoords(osrmRoute);
    return {
      id: `osrm-${i}`,
      nameHint: i === 0 ? "primary" : `Alternate Route ${i}`,
      isDetour: false,
      coordinates: coords,
      distanceKm: Number((osrmRoute.distance / 1000).toFixed(1)),
      baseMinutes: Math.round(osrmRoute.duration / 60)
    };
  });

  // ── Step 3: Generate systematic detour waypoints ──────────────────────────
  // Build a grid of intermediate waypoints that force OSRM onto different
  // road corridors. We try: both perpendicular sides × three longitudinal
  // positions (30%, 50%, 70% along the route) × two offset magnitudes.
  const directDistKm = haversineDistanceKm(origin, destination);
  // Scale offsets with route distance: short trips need smaller offsets
  const offsetsKm = directDistKm > 50 ? [8, 16] : directDistKm > 20 ? [5, 10] : [3, 6];
  const tPositions = [0.25, 0.5, 0.75];

  const waypointCandidates: Coordinates[] = [];
  for (const t of tPositions) {
    for (const offsetKm of offsetsKm) {
      const [left, right] = buildPerpendicularPair(origin, destination, t, offsetKm);
      waypointCandidates.push(left, right);
    }
  }

  // Fetch all detour routes in parallel
  const detourFetches = waypointCandidates.map((wp) =>
    fetchOsrmRoute([origin, wp, destination])
  );
  const detourResults = await Promise.allSettled(detourFetches);

  const extraDrafts: RouteDraft[] = [];
  detourResults.forEach((result, idx) => {
    if (result.status !== "fulfilled" || !result.value) return;
    const osrmRoute = result.value.routes[0];
    if (!osrmRoute) return;

    const coords = osrmRouteToCoords(osrmRoute);
    const distanceKm = Number((osrmRoute.distance / 1000).toFixed(1));
    const baseMinutes = Math.round(osrmRoute.duration / 60);

    // Skip if geometry is too similar to an already-collected route (dedup)
    const isDuplicate = [...rawDrafts, ...extraDrafts].some(
      (existing) => routeSimilarity(existing.coordinates, coords) > 0.82
    );
    if (isDuplicate) return;

    // Skip if it's absurdly longer than the primary (> 2.5× distance)
    if (distanceKm > rawDrafts[0].distanceKm * 2.5) return;

    extraDrafts.push({
      id: `detour-wp-${idx}`,
      nameHint: "detour",
      isDetour: true,
      coordinates: coords,
      distanceKm,
      baseMinutes
    });
  });

  const drafts = [...rawDrafts, ...extraDrafts];

  // ── Step 4: Resolve elevation data for altitude-aware health scoring ──────
  // A road that sits on higher ground than a reported flood won't be flooded
  // even when it passes nearby — so nearby, higher routes keep a high health
  // score instead of being rejected in favour of distant detours.
  const elevations = await resolveElevationsForRoutes(drafts, activeIncidents);

  // ── Step 5: Attach flood analysis and return sorted options ───────────────
  const allRoutes: RouteOption[] = drafts.map((draft) => {
    const analysis = analyzeRoute(
      draft.coordinates,
      activeIncidents,
      draft.distanceKm,
      draft.baseMinutes,
      elevations
    );
    const exposure = calculateFloodExposure(draft.coordinates, activeIncidents, elevations);
    return {
      id: draft.id,
      name: draft.isDetour
        ? labelRouteName(analysis.floodRisk, true)
        : draft.nameHint === "primary"
          ? labelRouteName(analysis.floodRisk, false)
          : draft.nameHint,
      summary: buildSummary(analysis),
      coordinates: draft.coordinates,
      distanceKm: draft.distanceKm,
      estimatedMinutes: draft.baseMinutes + analysis.estimatedDelayMinutes,
      floodExposure: Number(exposure.toFixed(1)),
      confidence: draft.isDetour
        ? Math.max(40, Math.min(95, Math.round(95 - exposure * 8)))
        : Math.max(40, Math.min(98, Math.round(98 - exposure * 8))),
      warnings: analysis.riskExplanations,
      analysis
    } satisfies RouteOption;
  });

  // ── Step 6: Sort and return ───────────────────────────────────────────────
  return allRoutes.sort((a, b) => {
    const rDiff =
      riskWeight(a.analysis?.floodRisk ?? "LOW") -
      riskWeight(b.analysis?.floodRisk ?? "LOW");
    if (rDiff !== 0) return rDiff;
    const hDiff = (b.analysis?.routeHealth ?? 100) - (a.analysis?.routeHealth ?? 100);
    if (hDiff !== 0) return hDiff;
    const tDiff = a.estimatedMinutes - b.estimatedMinutes;
    if (tDiff !== 0) return tDiff;
    return a.distanceKm - b.distanceKm;
  });
}

// ── Blockage detection ────────────────────────────────────────────────────────
/**
 * Walks the route coordinates and returns the index of the first point that
 * enters the impact radius of a severe/impassable incident.
 * Returns -1 if no blockage is found on this route.
 */
export function findBlockagePoint(
  routeCoords: Coordinates[],
  incidents: Incident[]
): number {
  const blocking = incidents.filter(
    (i) =>
      (i.status === "active" || i.status === "receding") &&
      (i.severity === "NOT_PASSABLE" || i.severity === "WAIST_DEEP")
  );
  if (blocking.length === 0) return -1;

  for (let i = 0; i < routeCoords.length; i++) {
    for (const incident of blocking) {
      const dist = haversineDistanceKm(routeCoords[i], incident.coordinates);
      const radius = incident.severity === "NOT_PASSABLE" ? 0.4 : 0.6;
      if (dist < radius) return i;
    }
  }
  return -1;
}

// ── Analysis ──────────────────────────────────────────────────────────────────
export function calculateFloodExposure(
  route: Coordinates[],
  incidents: Incident[],
  elevations?: Record<string, number>
): number {
  if (!incidents?.length) return 0;
  let exposure = 0;
  for (const incident of incidents) {
    if (incident.status === "resolved" || incident.status === "archived") continue;
    const { distanceKm, point } = getNearestSegmentInfo(incident.coordinates, route);
    const rank = severityRank[incident.severity] || 0;
    const radius = rank >= 3 ? 2.5 : 1.2;
    if (distanceKm < radius) {
      const proximity = Math.max(0, 1 - distanceKm / radius);
      const age = getIncidentAgeFactor(incident.updatedAt);
      const conf = 1.0 + incident.confidence * 0.01;
      const vol = isVolunteerVerified(incident) ? 1.5 : 1.0;
      const alt = getAltitudeFactor(
        elevations?.[elevationKey(point)],
        getIncidentElevation(incident, elevations)
      );
      exposure += proximity * rank * age * conf * vol * alt;
    }
  }
  return exposure;
}

export function analyzeRoute(
  coords: Coordinates[],
  incidents: Incident[],
  distanceKm: number,
  baseMinutes: number,
  elevations?: Record<string, number>
): RouteAnalysis {
  const affected: Incident[] = [];
  for (const inc of incidents) {
    if (inc.status === "resolved" || inc.status === "archived") continue;
    const rank = severityRank[inc.severity] || 0;
    const radius = rank >= 3 ? 2.5 : 1.2;
    const { distanceKm: segDist, point } = getNearestSegmentInfo(inc.coordinates, coords);
    if (segDist < radius) {
      const alt = getAltitudeFactor(
        elevations?.[elevationKey(point)],
        getIncidentElevation(inc, elevations)
      );
      // Only count incidents that genuinely threaten a route at this altitude.
      if (alt > 0.5) affected.push(inc);
    }
  }

  const exposure = calculateFloodExposure(coords, incidents, elevations);
  const estimatedDelayMinutes = Math.round(exposure * 3.5);

  let floodRisk: RouteAnalysis["floodRisk"] = "LOW";
  if (exposure > 5) floodRisk = "EXTREME";
  else if (exposure > 2) floodRisk = "HIGH";
  else if (exposure > 0) floodRisk = "MEDIUM";

  let routeHealth = 100;
  const hasBlocked = affected.some((i) => i.severity === "NOT_PASSABLE");
  if (hasBlocked) routeHealth = 0;
  else routeHealth = Math.max(0, Math.round(100 - exposure * 14));

  let highestIncidentSeverity: SeverityLevel | "SAFE" = "SAFE";
  for (const inc of affected) {
    if (highestIncidentSeverity === "SAFE" || severityRank[inc.severity] > severityRank[highestIncidentSeverity as SeverityLevel]) {
      highestIncidentSeverity = inc.severity;
    }
  }

  const averageConfidence =
    affected.length > 0
      ? Math.round(affected.reduce((s, i) => s + i.confidence, 0) / affected.length)
      : 0;

  const latestTime =
    affected.length > 0
      ? Math.max(...affected.map((i) => new Date(i.updatedAt).getTime()))
      : 0;
  const lastUpdated = latestTime > 0 ? new Date(latestTime).toISOString() : "N/A";

  const riskExplanations: string[] = [];
  if (affected.length === 0) {
    riskExplanations.push("Route appears clear based on local flood reports.");
  } else {
    riskExplanations.push(
      `Route passes through ${affected.length} active flood incident${affected.length > 1 ? "s" : ""}.`
    );
    const sorted = [...affected].sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
    sorted.slice(0, 2).forEach((inc) => {
      riskExplanations.push(
        `${inc.type} (${inc.severity.replace(/_/g, " ").toLowerCase()}) near ${inc.landmark}.`
      );
    });
    if (lastUpdated !== "N/A") {
      riskExplanations.push(`Condition confirmed ${formatRelativeTime(lastUpdated)}.`);
    }
  }

  return {
    floodRisk,
    routeHealth,
    affectedIncidentsCount: affected.length,
    highestIncidentSeverity,
    averageConfidence,
    lastUpdated,
    estimatedDelayMinutes,
    affectedIncidents: affected,
    riskExplanations
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function riskWeight(risk: string): number {
  return { LOW: 0, MEDIUM: 1, HIGH: 2, EXTREME: 3 }[risk] ?? 0;
}

function labelRouteName(risk: string, isDetour: boolean): string {
  if (isDetour) {
    if (risk === "LOW") return "Flood-Safe Detour";
    if (risk === "MEDIUM") return "Partial Detour";
    return "Best Available Detour";
  }
  if (risk === "LOW") return "Direct Safe Route";
  if (risk === "MEDIUM") return "Primary Route (Caution)";
  if (risk === "HIGH") return "Primary Route (High Risk)";
  return "Primary Route (Blocked)";
}

function buildSummary(analysis: RouteAnalysis): string {
  if (analysis.floodRisk === "LOW") return "Clear roads based on reported flood markers.";
  if (analysis.affectedIncidentsCount === 0) return "No active incidents on this path.";
  return `Passes near ${analysis.affectedIncidentsCount} active flood incident${analysis.affectedIncidentsCount > 1 ? "s" : ""}.`;
}

/**
 * Last-resort placeholder shown only when OSRM is completely unreachable.
 * Clearly labelled as an estimate, not a real road route.
 */
function buildOfflineNotice(
  origin: Coordinates,
  destination: Coordinates,
  incidents: Incident[]
): RouteOption {
  const distanceKm = Number(haversineDistanceKm(origin, destination).toFixed(1));
  const coords = [origin, destination];
  const baseMin = Math.round(distanceKm * 2.5);
  const analysis = analyzeRoute(coords, incidents, distanceKm, baseMin);
  return {
    id: "offline-estimate",
    name: "Offline Estimate (No Road Data)",
    summary: "Routing service unreachable. Straight-line distance only — not a real road path.",
    coordinates: coords,
    distanceKm,
    estimatedMinutes: baseMin + analysis.estimatedDelayMinutes,
    floodExposure: Number(calculateFloodExposure(coords, incidents).toFixed(1)),
    confidence: 20,
    warnings: [
      "Road routing is unavailable. Connect to the internet for real routes.",
      ...analysis.riskExplanations
    ],
    analysis
  };
}

function isVolunteerVerified(incident: Incident): boolean {
  return !!(
    incident.reports?.some((r) =>
      r.reporter.toLowerCase().includes("volunteer") ||
      r.reporter.toLowerCase().includes("admin")
    ) ||
    incident.verifications?.some((v) =>
      v.reporter.toLowerCase().includes("volunteer") ||
      v.reporter.toLowerCase().includes("admin")
    )
  );
}

function getIncidentAgeFactor(updatedAt: string): number {
  const hours = Math.max(0, (Date.now() - new Date(updatedAt).getTime()) / 3_600_000);
  if (hours > 24) return 0.25;
  if (hours > 12) return 0.5;
  if (hours > 4)  return 0.75;
  return 1.0;
}

/**
 * Resolve ground elevation for the incident anchors plus the portion of every
 * route that runs near a flood zone. Only points close to an incident matter
 * for the altitude-aware health score, which keeps the elevation lookups cheap.
 */
async function resolveElevationsForRoutes(
  drafts: Array<{ coordinates: Coordinates[] }>,
  incidents: Incident[]
): Promise<Record<string, number>> {
  if (incidents.length === 0) return {};
  const coords: Coordinates[] = incidents.map((inc) => inc.coordinates);
  for (const draft of drafts) {
    const step = Math.max(1, Math.floor(draft.coordinates.length / 40));
    for (let i = 0; i < draft.coordinates.length; i += step) {
      const point = draft.coordinates[i];
      const nearFlood = incidents.some(
        (inc) => haversineDistanceKm(point, inc.coordinates) < 3.0
      );
      if (nearFlood) coords.push(point);
    }
  }
  return fetchElevations(coords);
}

/**
 * Altitude-aware flood factor.
 * Returns how strongly a flood incident should impact a route:
 *   0  → the road sits meaningfully higher than the reported flood water, so
 *        the flood cannot reach it (no impact),
 *   1  → the road is at/below the flood's elevation (full impact),
 *   linear interpolation in between.
 * When either elevation is unknown we assume the worst (factor = 1), i.e. the
 * legacy proximity-only behaviour.
 */
function getAltitudeFactor(routeElevation: number | undefined, floodElevation: number | undefined): number {
  if (routeElevation === undefined || floodElevation === undefined) return 1;
  const lowerBound = floodElevation - 1.0;
  const upperBound = floodElevation + 2.5;
  if (routeElevation <= lowerBound) return 1;
  if (routeElevation >= upperBound) return 0;
  return (upperBound - routeElevation) / (upperBound - lowerBound);
}

function getIncidentElevation(
  incident: Incident,
  elevations?: Record<string, number>
): number | undefined {
  if (incident.elevationMeters !== undefined) return incident.elevationMeters;
  return elevations?.[elevationKey(incident.coordinates)];
}

function getNearestSegmentInfo(
  point: Coordinates,
  route: Coordinates[]
): { distanceKm: number; point: Coordinates } {
  let nearest = Number.POSITIVE_INFINITY;
  let nearestPoint = route[0];
  const step = Math.max(1, Math.floor(route.length / 80));
  for (let i = step; i < route.length; i += step) {
    const dist = distancePointToSegmentKm(point, route[i - step], route[i]);
    if (dist < nearest) {
      nearest = dist;
      nearestPoint = route[i];
    }
  }
  return { distanceKm: nearest, point: nearestPoint };
}

function getNearestSegmentDistanceKm(point: Coordinates, route: Coordinates[]): number {
  return getNearestSegmentInfo(point, route).distanceKm;
}

function distancePointToSegmentKm(
  point: Coordinates,
  start: Coordinates,
  end: Coordinates
): number {
  const refLat = toRadians((start.lat + end.lat + point.lat) / 3);
  const toXY = (c: Coordinates) => ({
    x: c.lng * 111.32 * Math.cos(refLat),
    y: c.lat * 110.57
  });
  const p = toXY(point);
  const a = toXY(start);
  const b = toXY(end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}
