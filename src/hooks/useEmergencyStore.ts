"use client";

import { useEffect, useMemo, useState } from "react";
import { buildAnalyticsSnapshot } from "@/lib/analytics";
import { demoFloodReports, demoHelpRequests, demoReliefCenters } from "@/lib/demo-data";
import { createFloodReport, type NewFloodReportInput, verifyReport } from "@/lib/floodReports";
import {
  createHelpRequest,
  type NewHelpRequestInput,
  updateHelpRequestStatus
} from "@/lib/helpRequests";
import type { FloodReport, HelpRequest, HelpStatus, ReliefCenter } from "@/lib/types";

type EmergencyState = {
  reports: FloodReport[];
  helpRequests: HelpRequest[];
  reliefCenters: ReliefCenter[];
};

const storageKey = "vellam-undo-emergency-state-v1";

const initialState: EmergencyState = {
  reports: demoFloodReports,
  helpRequests: demoHelpRequests,
  reliefCenters: demoReliefCenters
};

export function useEmergencyStore() {
  const [state, setState] = useState<EmergencyState>(initialState);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        setState(JSON.parse(saved) as EmergencyState);
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [isHydrated, state]);

  const analytics = useMemo(
    () => buildAnalyticsSnapshot(state.reports, state.helpRequests, state.reliefCenters),
    [state.helpRequests, state.reliefCenters, state.reports]
  );

  return {
    ...state,
    analytics,
    addReport(input: NewFloodReportInput) {
      const report = createFloodReport(input);
      setState((current) => ({
        ...current,
        reports: [report, ...current.reports]
      }));
      return report;
    },
    verifyReport(reportId: string, action: "confirm" | "flag") {
      setState((current) => ({
        ...current,
        reports: verifyReport(current.reports, reportId, action)
      }));
    },
    addHelpRequest(input: NewHelpRequestInput) {
      const request = createHelpRequest(input);
      setState((current) => ({
        ...current,
        helpRequests: [request, ...current.helpRequests]
      }));
      return request;
    },
    updateHelpStatus(requestId: string, status: HelpStatus, assignedVolunteer?: string) {
      setState((current) => ({
        ...current,
        helpRequests: updateHelpRequestStatus(
          current.helpRequests,
          requestId,
          status,
          assignedVolunteer
        )
      }));
    },
    resetDemoData() {
      setState(initialState);
      window.localStorage.removeItem(storageKey);
    }
  };
}
