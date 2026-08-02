import type { SeverityLevel, IncidentType } from "./types";

export const severityRank: Record<string, number> = {
  safe: 0,
  SAFE: 0,
  waterlogged: 1,
  WATERLOGGED: 1,
  "knee-deep": 2,
  KNEE_DEEP: 2,
  "waist-deep": 3,
  WAIST_DEEP: 3,
  "not-passable": 4,
  NOT_PASSABLE: 4
};

export const severityMeta: Record<
  string,
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
  SAFE: {
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
  WATERLOGGED: {
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
  KNEE_DEEP: {
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
  WAIST_DEEP: {
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
  },
  NOT_PASSABLE: {
    label: "Not passable",
    shortLabel: "Closed",
    color: "#7b1d30",
    background: "#ffe4ea",
    border: "#f4a3b4",
    guidance: "Closed for civilian movement"
  }
};

export const incidentTypeMeta: Record<IncidentType, { label: string; icon: string }> = {
  "Flooded Road": { label: "Flooded Road", icon: "🚧" },
  "Flooded Area": { label: "Flooded Area", icon: "🌊" },
  "Fallen Tree": { label: "Fallen Tree", icon: "🌳" },
  "Bridge Closed": { label: "Bridge Closed", icon: "⛔" },
  "Landslide": { label: "Landslide", icon: "⛰️" },
  "Vehicle Stuck": { label: "Vehicle Stuck", icon: "🚗" },
  "Rescue Needed": { label: "Rescue Needed", icon: "🆘" },
  "Medical Emergency": { label: "Medical Emergency", icon: "🏥" },
  "Power Line Down": { label: "Power Line Down", icon: "⚡" }
};

export const severityColorMeta: Record<SeverityLevel, { label: string; color: string }> = {
  SAFE: { label: "Safe", color: "#157f3b" },
  WATERLOGGED: { label: "Waterlogged", color: "#087b93" },
  KNEE_DEEP: { label: "Knee deep", color: "#b86b00" },
  WAIST_DEEP: { label: "Waist deep", color: "#b33b23" },
  NOT_PASSABLE: { label: "Not passable", color: "#7b1d30" }
};

export function formatRelativeTime(isoDate: string): string {
  const elapsedMs = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) {
    return "yesterday";
  }
  return `${days} days ago`;
}
