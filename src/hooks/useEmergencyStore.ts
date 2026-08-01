"use client";

import { useEffect, useMemo, useState } from "react";
import { buildAnalyticsSnapshot } from "@/lib/analytics";
import { demoFloodReports, demoHelpRequests, demoReliefCenters } from "@/lib/demo-data";
import { createFloodReport, type NewFloodReportInput, verifyReport } from "@/lib/floodReports";
import {
  deleteReportFromSupabase,
  fetchReportsFromSupabase,
  insertReportToSupabase
} from "@/lib/supabase";
import type { FloodReport, HelpRequest, HelpStatus, ReliefCenter } from "@/lib/types";

export type UserSession = {
  email: string;
  role: "user" | "admin";
};

type EmergencyState = {
  reports: FloodReport[];
  helpRequests: HelpRequest[];
  reliefCenters: ReliefCenter[];
};

const storageKey = "vellam-undo-emergency-state-v2";
const authStorageKey = "vellam-undo-auth-user";

const initialState: EmergencyState = {
  reports: demoFloodReports,
  helpRequests: demoHelpRequests,
  reliefCenters: demoReliefCenters
};

export function useEmergencyStore() {
  const [state, setState] = useState<EmergencyState>(initialState);
  const [isHydrated, setIsHydrated] = useState(false);
  const [userSession, setUserSession] = useState<UserSession | null>(null);

  // Load user session & fetch reports from Supabase on mount
  useEffect(() => {
    // 1. Auth session
    const savedAuth = window.localStorage.getItem(authStorageKey);
    if (savedAuth) {
      try {
        setUserSession(JSON.parse(savedAuth));
      } catch {
        window.localStorage.removeItem(authStorageKey);
      }
    }

    // 2. Saved state fallback
    const savedState = window.localStorage.getItem(storageKey);
    if (savedState) {
      try {
        setState(JSON.parse(savedState) as EmergencyState);
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    // 3. Supabase live fetch
    fetchReportsFromSupabase().then((supabaseReports) => {
      if (supabaseReports !== null) {
        setState((current) => ({
          ...current,
          reports: supabaseReports
        }));
      }
      setIsHydrated(true);
    });
  }, []);

  // Sync state to local storage
  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [isHydrated, state]);

  // Sync auth to local storage
  useEffect(() => {
    if (userSession) {
      window.localStorage.setItem(authStorageKey, JSON.stringify(userSession));
    } else {
      window.localStorage.removeItem(authStorageKey);
    }
  }, [userSession]);

  const analytics = useMemo(
    () => buildAnalyticsSnapshot(state.reports, state.helpRequests, state.reliefCenters),
    [state.helpRequests, state.reliefCenters, state.reports]
  );

  return {
    ...state,
    analytics,
    userSession,
    login(email: string, role: "user" | "admin" = "user") {
      const session: UserSession = { email, role };
      setUserSession(session);
      return session;
    },
    logout() {
      setUserSession(null);
    },
    async addReport(input: NewFloodReportInput) {
      const report = createFloodReport({
        ...input,
        createdBy: userSession?.email || input.createdBy || "Logged-in User"
      });

      // Update local state immediately
      setState((current) => ({
        ...current,
        reports: [report, ...current.reports]
      }));

      // Insert into Supabase
      await insertReportToSupabase(report);
      return report;
    },
    async deleteReport(reportId: string) {
      // Remove from state
      setState((current) => ({
        ...current,
        reports: current.reports.filter((r) => r.id !== reportId)
      }));

      // Delete from Supabase
      await deleteReportFromSupabase(reportId);
    },
    verifyReport(reportId: string, action: "confirm" | "flag") {
      setState((current) => ({
        ...current,
        reports: verifyReport(current.reports, reportId, action)
      }));
    },
    resetData() {
      setState({
        reports: [],
        helpRequests: [],
        reliefCenters: []
      });
      window.localStorage.removeItem(storageKey);
    }
  };
}
