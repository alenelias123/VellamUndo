export type RateLimitPolicyName =
  | "analytics"
  | "geocode"
  | "incidents"
  | "incident-create"
  | "incident-verify"
  | "route-plan"
  | "help-request"
  | "report-edit"
  | "report-delete";

export interface RateLimitPolicyConfig {
  limit: number;
  window: string; // sliding window formatted as "10 s", "10 m", "1 h", etc.
}

export const RATE_LIMIT_CONFIG: Record<RateLimitPolicyName, RateLimitPolicyConfig> = {
  analytics: {
    limit: 120,
    window: "60 s"
  },
  geocode: {
    limit: 20,
    window: "60 s"
  },
  incidents: {
    limit: 120,
    window: "60 s"
  },
  "incident-create": {
    limit: 5,
    window: "600 s" // 10 minutes = 600 seconds
  },
  "incident-verify": {
    limit: 20,
    window: "3600 s" // 1 hour = 3600 seconds
  },
  "route-plan": {
    limit: 30,
    window: "60 s"
  },
  "help-request": {
    limit: 3,
    window: "600 s" // 10 minutes = 600 seconds
  },
  "report-edit": {
    limit: 10,
    window: "3600 s" // 1 hour = 3600 seconds
  },
  "report-delete": {
    limit: 10,
    window: "3600 s" // 1 hour = 3600 seconds
  }
};
