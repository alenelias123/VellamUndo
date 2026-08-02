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

export type AuditLogAction = "Create" | "Update" | "Delete" | "Verify" | "Resolve" | "Archive";

export type AuditLog = {
  id: string;
  incidentId: string;
  userId?: string;
  action: AuditLogAction;
  targetTable: string;
  targetId: string;
  previousValue?: any;
  newValue?: any;
  createdAt: string;
};

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
  lastVerifiedAt?: string;
  lastReportAt?: string;
  archivedAt?: string;
  needsVerification?: boolean;
  reports?: IncidentReport[];
  verifications?: IncidentVerification[];
  elevationMeters?: number;
  floodStartLat?: number;
  floodStartLng?: number;
  floodEndLat?: number;
  floodEndLng?: number;
  auditLogs?: AuditLog[];
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
  ownershipToken?: string;
  isGuestReport?: boolean;
  reporterId?: string;
  updatedAt?: string;
  deletedAt?: string;
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

export type RouteAnalysis = {
  floodRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  routeHealth: number; // 0 - 100
  affectedIncidentsCount: number;
  highestIncidentSeverity: SeverityLevel | "SAFE";
  averageConfidence: number;
  lastUpdated: string;
  estimatedDelayMinutes: number;
  affectedIncidents: Incident[];
  riskExplanations: string[];
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
  analysis?: RouteAnalysis;
};

export type AnalyticsSnapshot = {
  totalReports: number;
  blockedRoads: number;
  openHelpRequests: number;
  criticalHelpRequests: number;
  reliefBedsAvailable: number;
  averageConfidence: number;
};
