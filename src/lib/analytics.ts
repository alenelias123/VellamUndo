import { getAvailableCapacity } from "./reliefCenters";
import type { AnalyticsSnapshot, Incident, HelpRequest, ReliefCenter } from "./types";

export function buildAnalyticsSnapshot(
  incidents: Incident[],
  helpRequests: HelpRequest[],
  reliefCenters: ReliefCenter[]
): AnalyticsSnapshot {
  const activeIncidents = incidents.filter((inc) => inc.status === "active" || inc.status === "receding");
  const blockedRoads = activeIncidents.filter((inc) => inc.severity === "NOT_PASSABLE" || inc.severity === "WAIST_DEEP").length;
  const totalReports = incidents.reduce((sum, inc) => sum + (inc.reports?.length || 0), 0);
  const openHelpRequests = helpRequests.filter((request) => request.status !== "completed").length;
  const criticalHelpRequests = helpRequests.filter(
    (request) => request.priority === "critical" && request.status !== "completed"
  ).length;
  const reliefBedsAvailable = reliefCenters.reduce(
    (total, center) => total + getAvailableCapacity(center),
    0
  );
  const averageConfidence =
    activeIncidents.length === 0
      ? 0
      : Math.round(
          activeIncidents.reduce((total, inc) => total + inc.confidence, 0) /
            activeIncidents.length
        );

  return {
    totalReports,
    blockedRoads,
    openHelpRequests,
    criticalHelpRequests,
    reliefBedsAvailable,
    averageConfidence
  };
}
