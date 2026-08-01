import { severityRank, formatRelativeTime } from "./floodReports";
import type { Coordinates, Incident, RouteOption, RouteAnalysis, SeverityLevel } from "./types";

export type SearchResultPlace = {
  id: string;
  name: string;
  fullName: string;
  coordinates: Coordinates;
};

// In-memory cache for OSRM raw route geometries to avoid redundant slow requests
const osrmGeometryCache = new Map<string, any>();

// Search places using OpenStreetMap Nominatim API
export async function geocodeDestination(query: string): Promise<SearchResultPlace[]> {
  if (!query || query.trim().length < 2) return [];

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query.trim()
    )}&limit=6&countrycodes=in`;
    const response = await fetch(url, {
      headers: {
        "Accept-Language": "en-US,en"
      }
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.map((item: any) => ({
      id: item.place_id ? String(item.place_id) : `place-${Math.random()}`,
      name: item.display_name.split(",")[0] || item.display_name,
      fullName: item.display_name,
      coordinates: {
        lat: Number.parseFloat(item.lat),
        lng: Number.parseFloat(item.lon)
      }
    }));
  } catch (error) {
    console.warn("Geocoding failed:", error);
    return [];
  }
}

export function haversineDistanceKm(start: Coordinates, end: Coordinates): number {
  const radiusKm = 6371;
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLng = toRadians(end.lng - start.lng);
  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return radiusKm * angularDistance;
}

// Check if incident is verified or reported by a volunteer
function isVolunteerVerified(incident: Incident): boolean {
  const hasVolReport = incident.reports?.some(
    (r) =>
      r.reporter.toLowerCase().includes("volunteer") ||
      r.reporter.toLowerCase().includes("admin")
  );
  const hasVolVerif = incident.verifications?.some(
    (v) =>
      v.reporter.toLowerCase().includes("volunteer") ||
      v.reporter.toLowerCase().includes("admin")
  );
  return !!(hasVolReport || hasVolVerif);
}

// Calculate report age decay factor
function getIncidentAgeFactor(updatedAtStr: string): number {
  const elapsedMs = Date.now() - new Date(updatedAtStr).getTime();
  const elapsedHours = Math.max(0, elapsedMs / (1000 * 60 * 60));
  if (elapsedHours > 24) return 0.25;
  if (elapsedHours > 12) return 0.5;
  if (elapsedHours > 4) return 0.75;
  return 1.0;
}

// Calculate enhanced flood exposure score
export function calculateFloodExposure(route: Coordinates[], incidents: Incident[]): number {
  if (!incidents || incidents.length === 0) return 0;
  let exposure = 0;

  for (const incident of incidents) {
    // Ignore resolved and archived/false incidents
    if (incident.status === "resolved" || incident.status === "archived") {
      continue;
    }

    const nearestSegmentDistance = getNearestSegmentDistanceKm(incident.coordinates, route);
    const rank = severityRank[incident.severity] || 0;
    
    // Safety buffer impact radius (higher severity affects wider areas)
    const impactRadiusKm = rank >= 3 ? 2.5 : 1.2;

    if (nearestSegmentDistance < impactRadiusKm) {
      const proximity = Math.max(0, 1 - nearestSegmentDistance / impactRadiusKm);
      const ageFactor = getIncidentAgeFactor(incident.updatedAt);
      const confidenceFactor = 1.0 + incident.confidence * 0.01; // higher confidence has higher weight
      const volunteerFactor = isVolunteerVerified(incident) ? 1.5 : 1.0; // volunteer verified receives higher weight

      exposure += proximity * rank * ageFactor * confidenceFactor * volunteerFactor;
    }
  }

  return exposure;
}

// Performs analysis step for a generated route
export function analyzeRoute(
  routeCoords: Coordinates[],
  incidents: Incident[],
  distanceKm: number,
  baseMinutes: number
): RouteAnalysis {
  const affectedIncidents: Incident[] = [];

  for (const incident of incidents) {
    if (incident.status === "resolved" || incident.status === "archived") {
      continue;
    }

    const nearestDist = getNearestSegmentDistanceKm(incident.coordinates, routeCoords);
    const rank = severityRank[incident.severity] || 0;
    const impactRadiusKm = rank >= 3 ? 2.5 : 1.2;

    if (nearestDist < impactRadiusKm) {
      affectedIncidents.push(incident);
    }
  }

  const affectedIncidentsCount = affectedIncidents.length;
  
  // Calculate highest severity
  let highestIncidentSeverity: SeverityLevel | "SAFE" = "SAFE";
  for (const inc of affectedIncidents) {
    if (highestIncidentSeverity === "SAFE" || severityRank[inc.severity] > severityRank[highestIncidentSeverity]) {
      highestIncidentSeverity = inc.severity;
    }
  }

  // Average confidence
  const averageConfidence =
    affectedIncidentsCount > 0
      ? Math.round(
          affectedIncidents.reduce((sum, inc) => sum + inc.confidence, 0) / affectedIncidentsCount
        )
      : 0;

  // Last updated timestamp
  let lastUpdated = "N/A";
  if (affectedIncidentsCount > 0) {
    const latestTime = Math.max(...affectedIncidents.map((inc) => new Date(inc.updatedAt).getTime()));
    lastUpdated = new Date(latestTime).toISOString();
  }

  // Estimated delays (delay padded based on flood severity exposure score)
  const exposure = calculateFloodExposure(routeCoords, incidents);
  const estimatedDelayMinutes = Math.round(exposure * 3.5);

  // Risk Rating
  let floodRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME" = "LOW";
  if (exposure > 5) floodRisk = "EXTREME";
  else if (exposure > 2) floodRisk = "HIGH";
  else if (exposure > 0) floodRisk = "MEDIUM";

  // Health score normalized 0 - 100
  let routeHealth = 100;
  if (highestIncidentSeverity === "NOT_PASSABLE") {
    routeHealth = 0; // Blocked route has zero health
  } else {
    routeHealth = Math.max(0, Math.round(100 - exposure * 14));
  }

  // Compile risk explanations
  const riskExplanations: string[] = [];
  if (affectedIncidentsCount === 0) {
    riskExplanations.push("Route appears clear based on local flood reports.");
  } else {
    riskExplanations.push(`Route passes through ${affectedIncidentsCount} active flood incident${affectedIncidentsCount > 1 ? "s" : ""}.`);
    
    // Sort affected incidents by severity to describe key hazards first
    const sortedAffected = [...affectedIncidents].sort(
      (a, b) => severityRank[b.severity] - severityRank[a.severity]
    );

    // List top 2 warnings
    sortedAffected.slice(0, 2).forEach((inc) => {
      const severityLabel = inc.severity.replace("_", " ").toLowerCase();
      riskExplanations.push(`${inc.type} (${severityLabel}) near ${inc.landmark}.`);
    });

    if (lastUpdated !== "N/A") {
      riskExplanations.push(`Condition confirmed ${formatRelativeTime(lastUpdated)}.`);
    }
  }

  return {
    floodRisk,
    routeHealth,
    affectedIncidentsCount,
    highestIncidentSeverity,
    averageConfidence,
    lastUpdated,
    estimatedDelayMinutes,
    affectedIncidents,
    riskExplanations
  };
}

// Fetch turn-by-turn road route from OSRM public API with cache layer
export async function calculateRoadRoutes(
  origin: Coordinates,
  destination: Coordinates,
  incidents: Incident[]
): Promise<RouteOption[]> {
  const cacheKey = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}-${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
  let osrmData = osrmGeometryCache.get(cacheKey);

  const fetchFailed = false;

  if (!osrmData) {
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&alternatives=true&steps=true`;
      const response = await fetch(osrmUrl);
      if (response.ok) {
        osrmData = await response.json();
        osrmGeometryCache.set(cacheKey, osrmData);
      }
    } catch (err) {
      console.warn("OSRM API fetch failed, falling back to geometric calculation:", err);
    }
  }

  try {
    if (!osrmData || !osrmData.routes || osrmData.routes.length === 0) {
      return [buildFallbackDirectRoute(origin, destination, incidents)];
    }

    const routeOptions: RouteOption[] = osrmData.routes.map((route: any, index: number) => {
      const coords: Coordinates[] = route.geometry.coordinates.map(
        (pair: [number, number]) => ({
          lat: pair[1],
          lng: pair[0]
        })
      );

      const distanceKm = Number((route.distance / 1000).toFixed(1));
      const baseMinutes = Math.round(route.duration / 60);
      const floodExposure = calculateFloodExposure(coords, incidents);
      const analysis = analyzeRoute(coords, incidents, distanceKm, baseMinutes);
      const estimatedMinutes = baseMinutes + analysis.estimatedDelayMinutes;

      const isFirst = index === 0;

      let name = isFirst
        ? analysis.floodRisk === "LOW"
          ? "Direct Safe Route"
          : "Primary Driving Route"
        : `Alternate Route ${index}`;

      let summary = analysis.floodRisk === "LOW"
        ? "Clear roads based on reported flood markers"
        : `Passes near flood points (${analysis.affectedIncidentsCount} cautions)`;

      return {
        id: `osrm-route-${index}`,
        name,
        summary,
        coordinates: coords,
        distanceKm,
        estimatedMinutes,
        floodExposure: Number(floodExposure.toFixed(1)),
        confidence: Math.max(40, Math.min(98, Math.round(98 - floodExposure * 8))),
        warnings: analysis.riskExplanations,
        analysis
      };
    });

    // Check if primary route is flooded. If so, generate an inland bypass if possible.
    const primaryRoute = routeOptions[0];
    if (primaryRoute && primaryRoute.analysis && primaryRoute.analysis.floodRisk !== "LOW") {
      const bypassRoute = buildInlandBypassRoute(origin, destination, incidents);
      routeOptions.push(bypassRoute);
    }

    // Rank routes: 1. Lowest flood risk, 2. Highest Health, 3. Shortest travel time, 4. Distance
    const riskWeight = { LOW: 0, MEDIUM: 1, HIGH: 2, EXTREME: 3 };
    return routeOptions.sort((a, b) => {
      const aRisk = a.analysis?.floodRisk || "LOW";
      const bRisk = b.analysis?.floodRisk || "LOW";
      const riskDiff = riskWeight[aRisk] - riskWeight[bRisk];
      if (riskDiff !== 0) return riskDiff;

      const aHealth = a.analysis?.routeHealth ?? 100;
      const bHealth = b.analysis?.routeHealth ?? 100;
      const healthDiff = bHealth - aHealth;
      if (healthDiff !== 0) return healthDiff;

      const timeDiff = a.estimatedMinutes - b.estimatedMinutes;
      if (timeDiff !== 0) return timeDiff;

      return a.distanceKm - b.distanceKm;
    });
  } catch (err) {
    console.warn("Routing processing error, using straight direct fallback:", err);
    return [buildFallbackDirectRoute(origin, destination, incidents)];
  }
}

function getNearestSegmentDistanceKm(point: Coordinates, route: Coordinates[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  const sampleStep = Math.max(1, Math.floor(route.length / 80));

  for (let index = sampleStep; index < route.length; index += sampleStep) {
    nearest = Math.min(
      nearest,
      distancePointToSegmentKm(point, route[index - sampleStep], route[index])
    );
  }

  return nearest;
}

function distancePointToSegmentKm(point: Coordinates, start: Coordinates, end: Coordinates): number {
  const originLat = toRadians((start.lat + end.lat + point.lat) / 3);
  const toXY = (c: Coordinates) => ({
    x: c.lng * 111.32 * Math.cos(originLat),
    y: c.lat * 110.57
  });

  const p = toXY(point);
  const a = toXY(start);
  const b = toXY(end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const segmentLengthSquared = dx * dx + dy * dy;

  if (segmentLengthSquared === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / segmentLengthSquared));
  const projection = {
    x: a.x + t * dx,
    y: a.y + t * dy
  };

  return Math.hypot(p.x - projection.x, p.y - projection.y);
}

function buildFallbackDirectRoute(
  origin: Coordinates,
  destination: Coordinates,
  incidents: Incident[]
): RouteOption {
  const distanceKm = Number(haversineDistanceKm(origin, destination).toFixed(1));
  const coordinates = [origin, destination];
  const baseMinutes = Math.round(distanceKm * 2.2);
  const analysis = analyzeRoute(coordinates, incidents, distanceKm, baseMinutes);
  const estimatedMinutes = baseMinutes + analysis.estimatedDelayMinutes;

  return {
    id: "fallback-direct",
    name: "Direct Route",
    summary: "Geodesic straight line distance",
    coordinates,
    distanceKm,
    estimatedMinutes,
    floodExposure: Number(calculateFloodExposure(coordinates, incidents).toFixed(1)),
    confidence: 80,
    warnings: analysis.riskExplanations,
    analysis
  };
}

function buildInlandBypassRoute(
  origin: Coordinates,
  destination: Coordinates,
  incidents: Incident[]
): RouteOption {
  // Generate an inland offset waypoint to circumvent coastal / river flood zones
  const midLat = (origin.lat + destination.lat) / 2;
  const midLng = (origin.lng + destination.lng) / 2 + 0.08; // Shift east/inland
  const coordinates = [origin, { lat: midLat, lng: midLng }, destination];

  const distanceKm = Number((haversineDistanceKm(origin, coordinates[1]) + haversineDistanceKm(coordinates[1], destination)).toFixed(1));
  const baseMinutes = Math.round(distanceKm * 2.5);
  const analysis = analyzeRoute(coordinates, incidents, distanceKm, baseMinutes);
  const estimatedMinutes = baseMinutes + analysis.estimatedDelayMinutes;

  return {
    id: "inland-bypass",
    name: "Inland Safe Bypass",
    summary: "Bypasses low-lying river corridors",
    coordinates,
    distanceKm,
    estimatedMinutes,
    floodExposure: Number(calculateFloodExposure(coordinates, incidents).toFixed(1)),
    confidence: 90,
    warnings: analysis.riskExplanations,
    analysis
  };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
