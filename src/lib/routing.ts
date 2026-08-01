import { severityRank } from "./floodReports";
import type { Coordinates, FloodReport, RouteOption, RoutePlace } from "./types";

export const routePlaces: RoutePlace[] = [
  {
    id: "kochi-mg-road",
    name: "MG Road, Kochi",
    district: "ernakulam",
    coordinates: { lat: 9.9769, lng: 76.2824 }
  },
  {
    id: "aluva",
    name: "Aluva KSRTC",
    district: "ernakulam",
    coordinates: { lat: 10.1076, lng: 76.3512 }
  },
  {
    id: "kakkanad",
    name: "Kakkanad Civil Station",
    district: "ernakulam",
    coordinates: { lat: 10.0159, lng: 76.3419 }
  },
  {
    id: "cherthala",
    name: "Cherthala Junction",
    district: "alappuzha",
    coordinates: { lat: 9.6856, lng: 76.3366 }
  },
  {
    id: "alappuzha",
    name: "Alappuzha Beach Road",
    district: "alappuzha",
    coordinates: { lat: 9.5001, lng: 76.3263 }
  },
  {
    id: "kottayam",
    name: "Kottayam Collectorate",
    district: "kottayam",
    coordinates: { lat: 9.5916, lng: 76.5222 }
  },
  {
    id: "thrissur",
    name: "Thrissur Round",
    district: "thrissur",
    coordinates: { lat: 10.5276, lng: 76.2144 }
  },
  {
    id: "kozhikode",
    name: "Kozhikode Railway Station",
    district: "kozhikode",
    coordinates: { lat: 11.2456, lng: 75.7818 }
  }
];

const bypassWaypoints: RoutePlace[] = [
  {
    id: "muvattupuzha-high-road",
    name: "Muvattupuzha high road",
    district: "ernakulam",
    coordinates: { lat: 9.9849, lng: 76.579 }
  },
  {
    id: "angamaly-relief-corridor",
    name: "Angamaly relief corridor",
    district: "ernakulam",
    coordinates: { lat: 10.1905, lng: 76.3874 }
  },
  {
    id: "changanassery-elevated-link",
    name: "Changanassery elevated link",
    district: "kottayam",
    coordinates: { lat: 9.4457, lng: 76.5406 }
  },
  {
    id: "wadakkanchery-link",
    name: "Wadakkanchery link",
    district: "thrissur",
    coordinates: { lat: 10.6552, lng: 76.2529 }
  },
  {
    id: "ramanattukara-link",
    name: "Ramanattukara link",
    district: "kozhikode",
    coordinates: { lat: 11.1793, lng: 75.8597 }
  }
];

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

export function buildRouteOptions(
  source: RoutePlace,
  destination: RoutePlace,
  reports: FloodReport[]
): RouteOption[] {
  const direct = buildRouteOption("direct", "Fastest direct road", [source.coordinates, destination.coordinates], reports);

  const nearestSourceBypass = findNearestBypass(source.coordinates);
  const nearestDestinationBypass = findNearestBypass(destination.coordinates);
  const saferCoordinates =
    nearestSourceBypass.id === nearestDestinationBypass.id
      ? [source.coordinates, nearestSourceBypass.coordinates, destination.coordinates]
      : [
          source.coordinates,
          nearestSourceBypass.coordinates,
          nearestDestinationBypass.coordinates,
          destination.coordinates
        ];

  const reliefCorridor = buildRouteOption(
    "relief-corridor",
    "Relief corridor",
    saferCoordinates,
    reports,
    "Uses higher-capacity junctions and known response corridors"
  );

  const inlandBypass = buildRouteOption(
    "inland-bypass",
    "Inland bypass",
    [source.coordinates, { lat: 10.05, lng: 76.62 }, { lat: 10.45, lng: 76.48 }, destination.coordinates],
    reports,
    "Longer route that avoids low-lying coastal stretches"
  );

  return [direct, reliefCorridor, inlandBypass].sort((left, right) => {
    const exposureDelta = left.floodExposure - right.floodExposure;
    if (Math.abs(exposureDelta) > 1) {
      return exposureDelta;
    }

    return left.distanceKm - right.distanceKm;
  });
}

function buildRouteOption(
  id: string,
  name: string,
  coordinates: Coordinates[],
  reports: FloodReport[],
  summary = "Shortest available road geometry"
): RouteOption {
  const distanceKm = calculateRouteDistance(coordinates);
  const floodExposure = calculateFloodExposure(coordinates, reports);
  const estimatedMinutes = Math.round(distanceKm * 2.4 + floodExposure * 3);
  const warnings = buildWarnings(floodExposure, reports, coordinates);

  return {
    id,
    name,
    summary,
    coordinates,
    distanceKm: Number(distanceKm.toFixed(1)),
    estimatedMinutes,
    floodExposure: Number(floodExposure.toFixed(1)),
    confidence: Math.max(42, Math.min(96, Math.round(96 - floodExposure * 5))),
    warnings
  };
}

function calculateRouteDistance(coordinates: Coordinates[]): number {
  return coordinates.reduce((total, coordinate, index) => {
    if (index === 0) {
      return total;
    }

    return total + haversineDistanceKm(coordinates[index - 1], coordinate);
  }, 0);
}

function calculateFloodExposure(route: Coordinates[], reports: FloodReport[]): number {
  let exposure = 0;

  for (const report of reports) {
    const nearestSegmentDistance = getNearestSegmentDistanceKm(report.coordinates, route);
    const impactRadiusKm = severityRank[report.severity] >= 3 ? 2.4 : 1.4;
    const proximity = Math.max(0, 1 - nearestSegmentDistance / impactRadiusKm);
    exposure += proximity * severityRank[report.severity] * (1 + report.confirmations * 0.12);
  }

  return exposure;
}

function getNearestSegmentDistanceKm(point: Coordinates, route: Coordinates[]): number {
  let nearest = Number.POSITIVE_INFINITY;

  for (let index = 1; index < route.length; index += 1) {
    nearest = Math.min(nearest, distancePointToSegmentKm(point, route[index - 1], route[index]));
  }

  return nearest;
}

function distancePointToSegmentKm(point: Coordinates, start: Coordinates, end: Coordinates): number {
  const originLat = toRadians((start.lat + end.lat + point.lat) / 3);
  const toXY = (coordinate: Coordinates) => ({
    x: coordinate.lng * 111.32 * Math.cos(originLat),
    y: coordinate.lat * 110.57
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

function buildWarnings(
  floodExposure: number,
  reports: FloodReport[],
  coordinates: Coordinates[]
): string[] {
  const nearbyReports = reports
    .filter((report) => getNearestSegmentDistanceKm(report.coordinates, coordinates) < 1.2)
    .filter((report) => severityRank[report.severity] >= 2)
    .slice(0, 3);

  if (nearbyReports.length === 0 && floodExposure < 2) {
    return ["No high-severity reports close to this route."];
  }

  return nearbyReports.map(
    (report) => `${report.roadName}: ${report.waterLevelCm} cm water near ${report.locationName}`
  );
}

function findNearestBypass(coordinates: Coordinates): RoutePlace {
  return [...bypassWaypoints].sort(
    (left, right) =>
      haversineDistanceKm(coordinates, left.coordinates) -
      haversineDistanceKm(coordinates, right.coordinates)
  )[0];
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
