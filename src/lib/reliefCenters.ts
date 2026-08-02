import {
  Building,
  Flame,
  Hospital,
  Package,
  Shield,
  type LucideIcon
} from "lucide-react";
import type { ReliefCenter, ReliefCenterType } from "./types";

export const reliefCenterTypeMeta: Record<
  ReliefCenterType,
  {
    label: string;
    color: string;
    background: string;
    icon: LucideIcon;
  }
> = {
  "relief-camp": {
    label: "Relief camp",
    color: "#2458b8",
    background: "#e8efff",
    icon: Building
  },
  hospital: {
    label: "Hospital",
    color: "#ad1d43",
    background: "#ffe7ef",
    icon: Hospital
  },
  "fire-station": {
    label: "Fire station",
    color: "#a84300",
    background: "#ffe9d5",
    icon: Flame
  },
  "police-station": {
    label: "Police station",
    color: "#374f74",
    background: "#e8edf5",
    icon: Shield
  },
  "supply-point": {
    label: "Supply point",
    color: "#24714a",
    background: "#e6f4ec",
    icon: Package
  }
};

export function getAvailableCapacity(center: ReliefCenter): number {
  return Math.max(0, center.capacity - center.occupancy);
}

export function sortReliefCenters(centers: ReliefCenter[]): ReliefCenter[] {
  return [...centers].sort((left, right) => {
    const availableDelta = getAvailableCapacity(right) - getAvailableCapacity(left);
    if (availableDelta !== 0) {
      return availableDelta;
    }

    return left.name.localeCompare(right.name);
  });
}
