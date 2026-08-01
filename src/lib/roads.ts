import type { FloodReport, FloodSeverity } from "./types";
import { severityMeta, severityRank } from "./floodReports";

export type RoadStatusSummary = {
  roadName: string;
  district: string;
  worstSeverity: FloodSeverity;
  reportCount: number;
  lastUpdated: string;
};

export function buildRoadStatusSummaries(reports: FloodReport[]): RoadStatusSummary[] {
  const summaries = new Map<string, RoadStatusSummary>();

  for (const report of reports) {
    const key = `${report.district}:${report.roadName.toLowerCase()}`;
    const existing = summaries.get(key);

    if (!existing) {
      summaries.set(key, {
        roadName: report.roadName,
        district: report.district,
        worstSeverity: report.severity,
        reportCount: 1,
        lastUpdated: report.createdAt
      });
      continue;
    }

    summaries.set(key, {
      ...existing,
      worstSeverity:
        severityRank[report.severity] > severityRank[existing.worstSeverity]
          ? report.severity
          : existing.worstSeverity,
      reportCount: existing.reportCount + 1,
      lastUpdated:
        new Date(report.createdAt).getTime() > new Date(existing.lastUpdated).getTime()
          ? report.createdAt
          : existing.lastUpdated
    });
  }

  return [...summaries.values()].sort((left, right) => {
    const severityDelta = severityRank[right.worstSeverity] - severityRank[left.worstSeverity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return new Date(right.lastUpdated).getTime() - new Date(left.lastUpdated).getTime();
  });
}

export function getRoadStatusLabel(severity: FloodSeverity): string {
  return severityMeta[severity].label;
}
