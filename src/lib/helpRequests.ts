import {
  BedDouble,
  Cross,
  GlassWater,
  LifeBuoy,
  PlugZap,
  Utensils,
  type LucideIcon
} from "lucide-react";
import type { HelpPriority, HelpRequest, HelpStatus, HelpType } from "./types";

export const helpTypeMeta: Record<
  HelpType,
  {
    label: string;
    description: string;
    icon: LucideIcon;
  }
> = {
  rescue: {
    label: "Rescue",
    description: "People need evacuation or direct rescue",
    icon: LifeBuoy
  },
  food: {
    label: "Food",
    description: "Cooked meals or dry ration required",
    icon: Utensils
  },
  water: {
    label: "Water",
    description: "Drinking water required",
    icon: GlassWater
  },
  medicine: {
    label: "Medicine",
    description: "Medicine, first aid, or medical support",
    icon: Cross
  },
  shelter: {
    label: "Shelter",
    description: "Temporary safe accommodation",
    icon: BedDouble
  },
  charging: {
    label: "Charging point",
    description: "Power bank, phone charging, or power access",
    icon: PlugZap
  }
};

export const priorityMeta: Record<
  HelpPriority,
  {
    label: string;
    color: string;
    background: string;
  }
> = {
  low: {
    label: "Low",
    color: "#23615d",
    background: "#e5f4f1"
  },
  medium: {
    label: "Medium",
    color: "#8a5a00",
    background: "#fff2cc"
  },
  high: {
    label: "High",
    color: "#a33d16",
    background: "#ffe7da"
  },
  critical: {
    label: "Critical",
    color: "#8f1537",
    background: "#ffe2ec"
  }
};

export const statusMeta: Record<
  HelpStatus,
  {
    label: string;
    description: string;
  }
> = {
  open: {
    label: "Open",
    description: "Waiting for volunteer assignment"
  },
  assigned: {
    label: "Assigned",
    description: "Volunteer has accepted"
  },
  "in-progress": {
    label: "In progress",
    description: "Help is on the way"
  },
  completed: {
    label: "Completed",
    description: "Request has been handled"
  }
};

export type NewHelpRequestInput = Omit<HelpRequest, "id" | "createdAt" | "status">;

export function createHelpRequest(input: NewHelpRequestInput): HelpRequest {
  return {
    ...input,
    id: `help-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    status: "open"
  };
}

export function updateHelpRequestStatus(
  requests: HelpRequest[],
  requestId: string,
  status: HelpStatus,
  assignedVolunteer?: string
): HelpRequest[] {
  return requests.map((request) => {
    if (request.id !== requestId) {
      return request;
    }

    return {
      ...request,
      status,
      assignedVolunteer:
        assignedVolunteer?.trim() || request.assignedVolunteer || (status === "open" ? undefined : "Duty desk")
    };
  });
}

export function sortHelpRequests(requests: HelpRequest[]): HelpRequest[] {
  const priorityRank: Record<HelpPriority, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
  };

  const statusRank: Record<HelpStatus, number> = {
    open: 4,
    assigned: 3,
    "in-progress": 2,
    completed: 1
  };

  return [...requests].sort((left, right) => {
    const statusDelta = statusRank[right.status] - statusRank[left.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const priorityDelta = priorityRank[right.priority] - priorityRank[left.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}
