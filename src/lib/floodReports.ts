import type { FloodReport, FloodSeverity } from "./types";

export const severityRank: Record<FloodSeverity, number> = {
  safe: 0,
  waterlogged: 1,
  "knee-deep": 2,
  "waist-deep": 3,
  "not-passable": 4
};

export const severityMeta: Record<
  FloodSeverity,
  {
    label: string;
    shortLabel: string;
    color: string;
    background: string;
    border: string;
    guidance: string;
  }
> = {
  safe: {
    label: "Safe",
    shortLabel: "Safe",
    color: "#157f3b",
    background: "#e7f8ed",
    border: "#a8e7bf",
    guidance: "Usable with normal caution"
  },
  waterlogged: {
    label: "Waterlogged",
    shortLabel: "Wet",
    color: "#087b93",
    background: "#e6f7fb",
    border: "#99dceb",
    guidance: "Slow traffic and poor visibility"
  },
  "knee-deep": {
    label: "Knee deep",
    shortLabel: "Knee",
    color: "#b86b00",
    background: "#fff3d8",
    border: "#ffd98a",
    guidance: "Avoid two-wheelers and small cars"
  },
  "waist-deep": {
    label: "Waist deep",
    shortLabel: "Waist",
    color: "#b33b23",
    background: "#ffe9e2",
    border: "#ffb7a6",
    guidance: "High risk. Use only for emergency response"
  },
  "not-passable": {
    label: "Not passable",
    shortLabel: "Closed",
    color: "#7b1d30",
    background: "#ffe4ea",
    border: "#f4a3b4",
    guidance: "Closed for civilian movement"
  }
};

export type NewFloodReportInput = Omit<
  FloodReport,
  "id" | "createdAt" | "confirmations" | "flags"
>;

export function createFloodReport(input: NewFloodReportInput): FloodReport {
  return {
    ...input,
    id: `report-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    confirmations: 1,
    flags: 0
  };
}

export function getReportConfidence(report: FloodReport): number {
  const rawConfidence =
    34 + report.confirmations * 13 - report.flags * 17 + severityRank[report.severity] * 4;
  return Math.max(5, Math.min(98, rawConfidence));
}

export function verifyReport(
  reports: FloodReport[],
  reportId: string,
  action: "confirm" | "flag"
): FloodReport[] {
  return reports.map((report) => {
    if (report.id !== reportId) {
      return report;
    }

    return {
      ...report,
      confirmations: action === "confirm" ? report.confirmations + 1 : report.confirmations,
      flags: action === "flag" ? report.flags + 1 : report.flags
    };
  });
}

export function getMostSevereReports(reports: FloodReport[], limit = 5): FloodReport[] {
  return [...reports]
    .sort((left, right) => {
      const severityDelta = severityRank[right.severity] - severityRank[left.severity];
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return getReportConfidence(right) - getReportConfidence(left);
    })
    .slice(0, limit);
}

export function formatRelativeTime(isoDate: string): string {
  const elapsedMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.max(1, Math.round(elapsedMs / 60000));

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
