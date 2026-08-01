export type Coordinates = {
  lat: number;
  lng: number;
};

export type FloodSeverity =
  | "safe"
  | "waterlogged"
  | "knee-deep"
  | "waist-deep"
  | "not-passable";

export type FloodReport = {
  id: string;
  roadName: string;
  district: string;
  locationName: string;
  coordinates: Coordinates;
  severity: FloodSeverity;
  waterLevelCm: number;
  description: string;
  imageUrl?: string;
  createdBy: string;
  createdAt: string;
  confirmations: number;
  flags: number;
};

export type HelpType =
  | "rescue"
  | "food"
  | "water"
  | "medicine"
  | "shelter"
  | "charging";

export type HelpPriority = "low" | "medium" | "high" | "critical";

export type HelpStatus = "open" | "assigned" | "in-progress" | "completed";

export type HelpRequest = {
  id: string;
  requesterName: string;
  contact: string;
  district: string;
  locationName: string;
  coordinates: Coordinates;
  type: HelpType;
  priority: HelpPriority;
  peopleCount: number;
  description: string;
  status: HelpStatus;
  assignedVolunteer?: string;
  createdAt: string;
};

export type ReliefCenterType =
  | "relief-camp"
  | "hospital"
  | "fire-station"
  | "police-station"
  | "supply-point";

export type ReliefCenter = {
  id: string;
  name: string;
  district: string;
  type: ReliefCenterType;
  coordinates: Coordinates;
  address: string;
  contact: string;
  capacity: number;
  occupancy: number;
  supplies: string[];
};

export type District = {
  slug: string;
  name: string;
  center: Coordinates;
  bounds: [[number, number], [number, number]];
};

export type RoutePlace = {
  id: string;
  name: string;
  district: string;
  coordinates: Coordinates;
};

export type RouteOption = {
  id: string;
  name: string;
  summary: string;
  coordinates: Coordinates[];
  distanceKm: number;
  estimatedMinutes: number;
  floodExposure: number;
  confidence: number;
  warnings: string[];
};

export type AnalyticsSnapshot = {
  totalReports: number;
  blockedRoads: number;
  openHelpRequests: number;
  criticalHelpRequests: number;
  reliefBedsAvailable: number;
  averageConfidence: number;
};
