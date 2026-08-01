import { severityRank } from "./floodReports";
import type { Coordinates, Incident, RouteOption } from "./types";

export type SearchResultPlace = {
  id: string;
  name: string;
  fullName: string;
  coordinates: Coordinates;
};

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

// Fetch turn-by-turn road route from OSRM public API
export async function calculateRoadRoutes(
  origin: Coordinates,
  destination: Coordinates,
  incidents: Incident[]
): Promise<RouteOption[]> {
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&alternatives=true&steps=true`;

  try {
    const response = await fetch(osrmUrl);
    if (!response.ok) {
      throw new Error(`OSRM HTTP error ${response.status}`);
    }

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
      return [buildFallbackDirectRoute(origin, destination, incidents)];
    }

    const routeOptions: RouteOption[] = data.routes.map((route: any, index: number) => {
      const coords: Coordinates[] = route.geometry.coordinates.map(
        (pair: [number, number]) => ({
          lat: pair[1],
          lng: pair[0]
        })
      );

      const distanceKm = Number((route.distance / 1000).toFixed(1));
      const baseMinutes = Math.round(route.duration / 60);
      const floodExposure = calculateFloodExposure(coords, incidents);
      const warnings = buildRouteWarnings(coords, incidents);
      const estimatedMinutes = Math.round(baseMinutes + floodExposure * 3);

      const isFirst = index === 0;
      const isLowExposure = floodExposure < 1;

      let name = isFirst
        ? isLowExposure
          ? "Direct Safe Route"
          : "Primary Driving Route"
        : `Alternate Route ${index}`;
      let summary = isLowExposure
        ? "Clear roads based on reported flood markers"
        : `Passes near flood points (${warnings.length} caution warnings)`;

      return {
        id: `osrm-route-${index}`,
        name,
        summary,
        coordinates: coords,
        distanceKm,
        estimatedMinutes,
        floodExposure: Number(floodExposure.toFixed(1)),
        confidence: Math.max(40, Math.min(98, Math.round(98 - floodExposure * 8))),
        warnings
      };
    });

    // Check if primary route is flooded. If so, generate an inland bypass if possible.
    const primaryRoute = routeOptions[0];
    if (primaryRoute && primaryRoute.floodExposure > 2.5) {
      const bypassRoute = buildInlandBypassRoute(origin, destination, incidents);
      routeOptions.push(bypassRoute);
    }

    // Sort routes by lowest flood exposure first, then distance
    return routeOptions.sort((a, b) => {
      const expDiff = a.floodExposure - b.floodExposure;
      if (Math.abs(expDiff) > 1) return expDiff;
      return a.distanceKm - b.distanceKm;
    });
  } catch (err) {
    console.warn("OSRM routing failed, falling back to geometric route:", err);
    return [buildFallbackDirectRoute(origin, destination, incidents)];
  }
}

function calculateFloodExposure(route: Coordinates[], incidents: Incident[]): number {
  if (!incidents || incidents.length === 0) return 0;
  let exposure = 0;

  for (const incident of incidents) {
    if (incident.status !== "active" && incident.status !== "receding") {
      continue;
    }

    const nearestSegmentDistance = getNearestSegmentDistanceKm(incident.coordinates, route);
    const rank = severityRank[incident.severity] || 0;
    const impactRadiusKm = rank >= 3 ? 2.5 : 1.2;
    if (nearestSegmentDistance < impactRadiusKm) {
      const proximity = Math.max(0, 1 - nearestSegmentDistance / impactRadiusKm);
      exposure += proximity * rank * (1 + (incident.reports?.length || 0) * 0.1);
    }
  }

  return exposure;
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

function buildRouteWarnings(coordinates: Coordinates[], incidents: Incident[]): string[] {
  if (!incidents || incidents.length === 0) {
    return ["Route clear. No active flood incidents logged."];
  }

  const nearby = incidents
    .filter((inc) => inc.status === "active" || inc.status === "receding")
    .filter((inc) => getNearestSegmentDistanceKm(inc.coordinates, coordinates) < 1.5)
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
    .slice(0, 3);

  if (nearby.length === 0) {
    return ["No high-severity flood incidents close to this route."];
  }

  return nearby.map(
    (inc) =>
      `⚠️ ${inc.roadName} (${inc.landmark}): ${inc.type} (${inc.severity})`
  );
}

function buildFallbackDirectRoute(
  origin: Coordinates,
  destination: Coordinates,
  incidents: Incident[]
): RouteOption {
  const distanceKm = Number(haversineDistanceKm(origin, destination).toFixed(1));
  const coordinates = [origin, destination];
  const floodExposure = calculateFloodExposure(coordinates, incidents);
  const warnings = buildRouteWarnings(coordinates, incidents);

  return {
    id: "fallback-direct",
    name: "Direct Route",
    summary: "Geodesic straight line distance",
    coordinates,
    distanceKm,
    estimatedMinutes: Math.round(distanceKm * 2.2),
    floodExposure: Number(floodExposure.toFixed(1)),
    confidence: 80,
    warnings
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
  const floodExposure = calculateFloodExposure(coordinates, incidents);
  const warnings = buildRouteWarnings(coordinates, incidents);

  return {
    id: "inland-bypass",
    name: "Inland Safe Bypass",
    summary: "Bypasses low-lying river corridors",
    coordinates,
    distanceKm,
    estimatedMinutes: Math.round(distanceKm * 2.5),
    floodExposure: Number(floodExposure.toFixed(1)),
    confidence: 90,
    warnings
  };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
