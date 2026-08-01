export type Coordinates = {
  lat: number;
  lng: number;
};

// Supported Incident Types
export type IncidentType =
  | "Flooded Road"
  | "Flooded Area"
  | "Fallen Tree"
  | "Bridge Closed"
  | "Landslide"
  | "Vehicle Stuck"
  | "Rescue Needed"
  | "Medical Emergency"
  | "Power Line Down";

// Severity Levels
export type SeverityLevel =
  | "SAFE"
  | "WATERLOGGED"
  | "KNEE_DEEP"
  | "WAIST_DEEP"
  | "NOT_PASSABLE";

// Legacy Alias for compile-safety
export type FloodSeverity = SeverityLevel;

// Incident status lifecycle
export type IncidentStatus = "active" | "receding" | "resolved" | "archived";

// Master Incident Entity
export type Incident = {
  id: string;
  type: IncidentType;
  status: IncidentStatus;
  severity: SeverityLevel;
  roadName: string;
  landmark: string;
  district: string;
  coordinates: Coordinates;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  reports?: IncidentReport[];
  verifications?: IncidentVerification[];
};

// Child User Report Entity
export type IncidentReport = {
  id: string;
  incidentId: string;
  severity: SeverityLevel;
  notes?: string;
  reporter: string;
  createdAt: string;
  photos: string[];
};

export type FloodReport = {
  id: string;
  roadName: string;
  district: string;
  locationName: string;
  coordinates: Coordinates;
  severity: SeverityLevel;
  waterLevelCm: number;
  description: string;
  imageUrl?: string;
  createdBy: string;
  createdAt: string;
  confirmations: number;
  flags: number;
};

// Verification votes
export type VerificationVote =
  | "still-flooded"
  | "water-rising"
  | "water-receding"
  | "road-cleared"
  | "false-report";

export type IncidentVerification = {
  id: string;
  incidentId: string;
  reporter: string;
  vote: VerificationVote;
  createdAt: string;
};

// Legacy Help Type, Priority, Status, Request for other panels
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
