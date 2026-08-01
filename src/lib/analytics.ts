import { getReportConfidence, severityRank } from "./floodReports";
import { getAvailableCapacity } from "./reliefCenters";
import type { AnalyticsSnapshot, FloodReport, HelpRequest, ReliefCenter } from "./types";

export function buildAnalyticsSnapshot(
  reports: FloodReport[],
  helpRequests: HelpRequest[],
  reliefCenters: ReliefCenter[]
): AnalyticsSnapshot {
  const blockedRoads = reports.filter((report) => severityRank[report.severity] >= 3).length;
  const openHelpRequests = helpRequests.filter((request) => request.status !== "completed").length;
  const criticalHelpRequests = helpRequests.filter(
    (request) => request.priority === "critical" && request.status !== "completed"
  ).length;
  const reliefBedsAvailable = reliefCenters.reduce(
    (total, center) => total + getAvailableCapacity(center),
    0
  );
  const averageConfidence =
    reports.length === 0
      ? 0
      : Math.round(
          reports.reduce((total, report) => total + getReportConfidence(report), 0) /
            reports.length
        );

  return {
    totalReports: reports.length,
    blockedRoads,
    openHelpRequests,
    criticalHelpRequests,
    reliefBedsAvailable,
    averageConfidence
  };
}
