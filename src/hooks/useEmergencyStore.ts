"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { demoFloodReports, demoHelpRequests, demoReliefCenters } from "@/lib/demo-data";
import {
  createHelpRequest,
  type NewHelpRequestInput,
  updateHelpRequestStatus
} from "@/lib/helpRequests";
import type {
  Incident,
  IncidentReport,
  IncidentVerification,
  HelpRequest,
  HelpStatus,
  ReliefCenter,
  AnalyticsSnapshot,
  SeverityLevel,
  IncidentType,
  VerificationVote,
  Coordinates
} from "@/lib/types";

// Convert demo flood reports to incidents for fallback/mock mode
const seedIncidents: Incident[] = demoFloodReports.map((report, idx) => ({
  id: report.id || `incident-${idx}`,
  type: (idx === 3 ? "Bridge Closed" : idx === 4 ? "Flooded Area" : "Flooded Road") as IncidentType,
  status: "active",
  severity: report.severity as SeverityLevel,
  roadName: report.roadName,
  landmark: report.locationName,
  district: report.district,
  coordinates: report.coordinates,
  confidence: Math.max(40, Math.min(96, 34 + report.confirmations * 6)),
  createdAt: report.createdAt,
  updatedAt: report.createdAt,
  reports: [
    {
      id: `report-${report.id}`,
      incidentId: report.id,
      severity: report.severity as SeverityLevel,
      notes: report.description,
      reporter: report.createdBy,
      createdAt: report.createdAt,
      photos: report.imageUrl ? [report.imageUrl] : []
    }
  ],
  verifications: []
}));

type EmergencyState = {
  incidents: Incident[];
  helpRequests: HelpRequest[];
  reliefCenters: ReliefCenter[];
};

const storageKey = "vellam-undo-emergency-incidents-state-v1";
const queueStorageKey = "vellam-undo-offline-queue-v1";

const initialState: EmergencyState = {
  incidents: seedIncidents,
  helpRequests: demoHelpRequests,
  reliefCenters: demoReliefCenters
};

export type OfflineReportPayload = {
  latitude: number;
  longitude: number;
  severity: SeverityLevel;
  type: IncidentType;
  roadName: string;
  landmark: string;
  district: string;
  notes?: string;
  reporter: string;
  photos: string[];
  elevationMeters?: number;
  floodStartLat?: number;
  floodStartLng?: number;
  floodEndLat?: number;
  floodEndLng?: number;
  floodStretchPath?: Coordinates[];
  originalLatitude?: number;
  originalLongitude?: number;
  snappedLatitude?: number;
  snappedLongitude?: number;
  roadSnapDistance?: number;
  locationConfidence?: number;
  resolvedRoadName?: string;
  manualTimestamp?: string;
  requesterEmail?: string;
};

export function useEmergencyStore() {
  const [state, setState] = useState<EmergencyState>(initialState);
  const [offlineQueue, setOfflineQueue] = useState<OfflineReportPayload[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const savedQueue = window.localStorage.getItem(queueStorageKey);

    let loadedIncidents = seedIncidents;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.incidents) loadedIncidents = parsed.incidents;
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    setState({
      incidents: loadedIncidents,
      helpRequests: demoHelpRequests,
      reliefCenters: demoReliefCenters
    });

    if (savedQueue) {
      try {
        setOfflineQueue(JSON.parse(savedQueue));
      } catch {
        window.localStorage.removeItem(queueStorageKey);
      }
    }

    setIsHydrated(true);
  }, []);

  // Fetch incidents from API route
  const fetchIncidents = async () => {
    try {
      const response = await fetch("/api/incidents");
      if (response.ok) {
        const data = await response.json();
        if (data.incidents) {
          setState((prev) => ({
            ...prev,
            incidents: data.incidents
          }));
          // Back up live data to localStorage
          window.localStorage.setItem(
            storageKey,
            JSON.stringify({ incidents: data.incidents })
          );
        }
      }
    } catch (err) {
      console.warn("Failed to fetch live incidents, using cached/local fallback:", err);
    }
  };

  // Run fetch on mount & set up realtime subscriptions
  useEffect(() => {
    if (!isHydrated) return;

    fetchIncidents();

    if (!supabase) return;

    // Supabase Realtime channel setup
    const channel = supabase
      .channel("realtime-emergency-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => {
        fetchIncidents();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_reports" }, () => {
        fetchIncidents();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_verifications" }, () => {
        fetchIncidents();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_images" }, () => {
        fetchIncidents();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_logs" }, () => {
        fetchIncidents();
      })
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [isHydrated]);

  // Sync offline queue to server
  const syncOfflineQueue = async (queue: OfflineReportPayload[]) => {
    if (queue.length === 0 || isSyncing || !navigator.onLine) return;
    setIsSyncing(true);

    const remaining = [...queue];
    while (remaining.length > 0) {
      const report = remaining[0];
      try {
        const res = await fetch("/api/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(report)
        });
        if (res.ok) {
          remaining.shift(); // remove from queue if successful
          // update state & store
          setOfflineQueue([...remaining]);
          window.localStorage.setItem(queueStorageKey, JSON.stringify(remaining));
        } else {
          // If server error, halt sync loop to try later
          break;
        }
      } catch (err) {
        console.warn("Offline sync error, will retry later:", err);
        break;
      }
    }

    setIsSyncing(false);
    fetchIncidents();
  };

  // Sync queue automatically when online status returns
  useEffect(() => {
    const handleOnline = () => {
      syncOfflineQueue(offlineQueue);
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [offlineQueue, isSyncing]);

  // Save offlineQueue changes to localStorage
  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(queueStorageKey, JSON.stringify(offlineQueue));
  }, [offlineQueue, isHydrated]);

  // Build metrics for topbar & local widgets
  const analytics = useMemo((): AnalyticsSnapshot => {
    const activeIncidents = state.incidents.filter((inc) => inc.status === "active" || inc.status === "receding");
    const blockedRoads = activeIncidents.filter((inc) => inc.severity === "NOT_PASSABLE" || inc.severity === "WAIST_DEEP").length;
    const totalReports = state.incidents.reduce((sum, inc) => sum + (inc.reports?.length || 0), 0);
    const sumConfidence = activeIncidents.reduce((sum, inc) => sum + inc.confidence, 0);
    const avgConfidence = activeIncidents.length > 0 ? Math.round(sumConfidence / activeIncidents.length) : 0;

    const openHelp = state.helpRequests.filter((r) => r.status !== "completed").length;
    const criticalHelp = state.helpRequests.filter((r) => r.priority === "critical" && r.status !== "completed").length;
    const beds = state.reliefCenters.reduce((sum, c) => sum + Math.max(0, c.capacity - c.occupancy), 0);

    return {
      totalReports,
      blockedRoads,
      openHelpRequests: openHelp,
      criticalHelpRequests: criticalHelp,
      reliefBedsAvailable: beds,
      averageConfidence: avgConfidence
    };
  }, [state]);

  return {
    incidents: state.incidents,
    helpRequests: state.helpRequests,
    reliefCenters: state.reliefCenters,
    offlineQueue,
    isSyncing,
    analytics,

    // Add flood report - checks connectivity & handles offline queueing
    // Add flood report - checks connectivity & handles offline queueing
    async addReport(input: OfflineReportPayload) {
      if (navigator.onLine) {
        try {
          const res = await fetch("/api/incidents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input)
          });
          if (res.ok) {
            const data = await res.json();
            if (data.ownershipToken && data.reportId) {
              try {
                const tokens = JSON.parse(window.localStorage.getItem("vu-report-ownership-tokens") || "{}");
                tokens[data.reportId] = data.ownershipToken;
                window.localStorage.setItem("vu-report-ownership-tokens", JSON.stringify(tokens));
              } catch (e) {
                console.error("Failed to store guest ownership token:", e);
              }
            }
            await fetchIncidents();
            return true;
          }

          let message = "Failed to submit report";
          try {
            const data = await res.json();
            if (typeof data?.error === "string") {
              message = data.error;
            }
          } catch {
            // Ignore JSON parse failures and use the default message.
          }

          throw new Error(message);
        } catch (err) {
          if (err instanceof Error && navigator.onLine) {
            throw err;
          }
          console.warn("Failed to POST report online, fallback to queueing:", err);
        }
      }

      // Offline or network post failed -> Queue report locally
      const updatedQueue = [...offlineQueue, input];
      setOfflineQueue(updatedQueue);
      // Create a temporary local incident in store to reflect immediately
      const localCreatedAt = input.manualTimestamp || new Date().toISOString();
      const tempId = `temp-${crypto.randomUUID()}`;
      const newLocalIncident: Incident = {
        id: tempId,
        type: input.type,
        status: "active",
        severity: input.severity,
        roadName: input.roadName,
        landmark: input.landmark,
        district: input.district,
        coordinates: {
          lat: input.latitude,
          lng: input.longitude
        },
        elevationMeters: input.elevationMeters,
        floodStartLat: input.floodStartLat,
        floodStartLng: input.floodStartLng,
        floodEndLat: input.floodEndLat,
        floodEndLng: input.floodEndLng,
        floodStretchPath: input.floodStretchPath,
        confidence: 30, // low confidence for offline temp items
        createdAt: localCreatedAt,
        updatedAt: new Date().toISOString(),
        reports: [
          {
            id: `temp-rep-${crypto.randomUUID()}`,
            incidentId: tempId,
            severity: input.severity,
            notes: input.notes,
            reporter: input.reporter,
            createdAt: localCreatedAt,
            photos: input.photos
          }
        ],
        verifications: []
      };

      setState((prev) => ({
        ...prev,
        incidents: [newLocalIncident, ...prev.incidents]
      }));

      return false; // indicates it was queued offline
    },

    async editReport(reportId: string, notes: string, severity: SeverityLevel, token?: string) {
      if (navigator.onLine) {
        try {
          const res = await fetch(`/api/reports/${reportId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes, severity, ownershipToken: token })
          });
          if (res.ok) {
            await fetchIncidents();
            return true;
          } else {
            const data = await res.json();
            alert(data.error || "Failed to edit report");
          }
        } catch (err) {
          console.warn("Failed to PUT edit report:", err);
        }
      } else {
        alert("You must be online to edit reports.");
      }
      return false;
    },

    async deleteReport(reportId: string, token?: string) {
      if (navigator.onLine) {
        try {
          const url = `/api/reports/${reportId}` + (token ? `?token=${encodeURIComponent(token)}` : "");
          const res = await fetch(url, {
            method: "DELETE"
          });
          if (res.ok) {
            await fetchIncidents();
            return true;
          } else {
            const data = await res.json();
            alert(data.error || "Failed to delete report");
          }
        } catch (err) {
          console.warn("Failed to DELETE report:", err);
        }
      } else {
        alert("You must be online to delete reports.");
      }
      return false;
    },

    // Submit a verification vote (Still Flooded, Water Rising, etc.)
    async verifyIncident(incidentId: string, vote: VerificationVote, reporter: string) {
      const optimisticUpdate = (currentIncidents: Incident[]) =>
        currentIncidents.map((inc) => {
          if (inc.id !== incidentId) return inc;

          const tempVerification: IncidentVerification = {
            id: `temp-verif-${crypto.randomUUID()}`,
            incidentId,
            reporter,
            vote,
            createdAt: new Date().toISOString()
          };

          const newVerifications = [...(inc.verifications || []), tempVerification];

          let voteShift = 0;
          if (vote === "still-flooded" || vote === "water-rising") voteShift = 10;
          else if (vote === "water-receding") voteShift = 5;
          else if (vote === "road-cleared") voteShift = -15;
          else if (vote === "false-report") voteShift = -25;

          const newConfidence = Math.max(5, Math.min(98, inc.confidence + voteShift));

          return {
            ...inc,
            confidence: newConfidence,
            verifications: newVerifications
          };
        });

      const previousIncidents = state.incidents;

      setState((prev) => ({
        ...prev,
        incidents: optimisticUpdate(prev.incidents)
      }));

      if (!navigator.onLine) {
        alert("You must be online to submit a verification.");
        setState((prev) => ({ ...prev, incidents: previousIncidents }));
        return;
      }

      try {
        const res = await fetch(`/api/incidents/${incidentId}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vote, reporter })
        });

        if (!res.ok) {
          let message = "Failed to submit verification";
          try {
            const data = await res.json();
            if (typeof data?.error === "string") {
              message = data.error;
            }
          } catch {}

          setState((prev) => ({ ...prev, incidents: previousIncidents }));
          alert(message);
          return;
        }

        await fetchIncidents();
      } catch (err) {
        console.warn("Failed to cast verification vote online:", err);
        setState((prev) => ({ ...prev, incidents: previousIncidents }));
        alert("Failed to submit verification");
      }
    },

    // Legacy Help updates
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

    async editIncident(incidentId: string, updates: Partial<Incident> & { latitude?: number; longitude?: number }) {
      setState((prev) => ({
        ...prev,
        incidents: prev.incidents.map((inc) => {
          if (inc.id !== incidentId) return inc;
          const merged = { ...inc, ...updates };
          if (updates.latitude !== undefined && updates.longitude !== undefined) {
            merged.coordinates = { lat: updates.latitude, lng: updates.longitude };
          }
          return merged;
        })
      }));

      if (navigator.onLine) {
        try {
          const res = await fetch(`/api/incidents/${incidentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates)
          });
          if (res.ok) {
            await fetchIncidents();
          }
        } catch (err) {
          console.warn("Failed to edit incident online:", err);
        }
      }
    },

    async deleteIncident(incidentId: string) {
      const previousIncidents = state.incidents;

      setState((prev) => ({
        ...prev,
        incidents: prev.incidents.filter((inc) => inc.id !== incidentId)
      }));

      if (!navigator.onLine) {
        alert("You must be online to delete incidents.");
        setState((prev) => ({ ...prev, incidents: previousIncidents }));
        return;
      }

      try {
        const sessionData = await supabase?.auth.getSession();
        const sessionEmail = sessionData?.data.session?.user?.email;
        const accessToken = sessionData?.data.session?.access_token;
        const headers: Record<string, string> = {};
        if (sessionEmail) headers["x-admin-email"] = sessionEmail;
        if (accessToken) headers["authorization"] = `Bearer ${accessToken}`;

        const res = await fetch(`/api/incidents/${incidentId}`, {
          method: "DELETE",
          headers: Object.keys(headers).length > 0 ? headers : undefined
        });

        if (!res.ok) {
          let message = "Failed to delete incident";
          try {
            const data = await res.json();
            if (typeof data?.error === "string") {
              message = data.error;
            }
          } catch {}

          setState((prev) => ({ ...prev, incidents: previousIncidents }));
          alert(message);
          return;
        }

        await fetchIncidents();
      } catch (err) {
        console.warn("Failed to delete incident online:", err);
        setState((prev) => ({ ...prev, incidents: previousIncidents }));
        alert("Failed to delete incident");
      }
    },

    // Clears local storage and resets data back to seeds
    resetDemoData() {
      window.localStorage.removeItem(storageKey);
      window.localStorage.removeItem(queueStorageKey);
      setOfflineQueue([]);
      setState({
        incidents: seedIncidents,
        helpRequests: demoHelpRequests,
        reliefCenters: demoReliefCenters
      });
      fetchIncidents();
    }
  };
}





