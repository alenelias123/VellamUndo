"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  Ambulance,
  Building2,
  CircleDot,
  LifeBuoy,
  MapPinned,
  Navigation2,
  RadioTower,
  ShieldCheck,
  AlertTriangle
} from "lucide-react";
import { ReliefCentersPanel } from "@/components/ReliefCentersPanel";
import { ReportPanel } from "@/components/ReportPanel";
import { SafeRoutePlanner } from "@/components/SafeRoutePlanner";
import { HelpRequestPanel } from "@/components/HelpRequestPanel";
import { VolunteerDashboard } from "@/components/VolunteerDashboard";
import { IncidentDetailsDrawer } from "@/components/IncidentDetailsDrawer";
import { useEmergencyStore } from "@/hooks/useEmergencyStore";
import { defaultDistrictSlug, districts, getDistrictBySlug } from "@/lib/districts";
import { severityRank, severityMeta, severityColorMeta, incidentTypeMeta } from "@/lib/floodReports";
import type { Coordinates, RouteOption } from "@/lib/types";

const FloodMap = dynamic(() => import("@/components/FloodMap").then((mod) => mod.FloodMap), {
  ssr: false,
  loading: () => <div className="map-loading bg-gray-50 flex items-center justify-center h-full text-xs font-semibold text-gray-500">Loading Leaflet Map...</div>
});

type ActivePanel = "report" | "route" | "help" | "volunteers" | "centers";

const panelItems: Array<{
  id: ActivePanel;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: "report", label: "Report", icon: MapPinned },
  { id: "route", label: "Route", icon: Navigation2 },
  { id: "help", label: "Help", icon: LifeBuoy },
  { id: "volunteers", label: "Volunteers", icon: RadioTower },
  { id: "centers", label: "Centers", icon: Building2 }
];

export default function HomeClient() {
  const {
    incidents,
    helpRequests,
    reliefCenters,
    offlineQueue,
    isSyncing,
    analytics,
    addReport,
    verifyIncident,
    addHelpRequest,
    updateHelpStatus,
    resetDemoData
  } = useEmergencyStore();

  const [activeDistrictSlug, setActiveDistrictSlug] = useState(defaultDistrictSlug);
  const [activePanel, setActivePanel] = useState<ActivePanel>("report");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | undefined>();
  const [pendingLocation, setPendingLocation] = useState<Coordinates | undefined>();
  const [activeRoute, setActiveRoute] = useState<RouteOption | undefined>();

  const activeDistrict = getDistrictBySlug(activeDistrictSlug);
  
  const selectedIncident = useMemo(() => {
    return incidents.find((inc) => inc.id === selectedIncidentId);
  }, [incidents, selectedIncidentId]);

  // Center map on selected incident, pending coordinate, or default district center
  const mapCenter = useMemo(() => {
    if (selectedIncident) return selectedIncident.coordinates;
    if (pendingLocation) return pendingLocation;
    return activeDistrict.center;
  }, [selectedIncident, pendingLocation, activeDistrict]);

  // Calculate watchlist (highest severity active incidents)
  const severeIncidents = useMemo(() => {
    return [...incidents]
      .filter((inc) => inc.status === "active" || inc.status === "receding")
      .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.confidence - a.confidence)
      .slice(0, 4);
  }, [incidents]);

  // Calculate latest update rollup
  const latestUpdatesRollup = useMemo(() => {
    return [...incidents]
      .filter((inc) => inc.status !== "archived")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 4);
  }, [incidents]);

  function handlePickLocation(coordinates: Coordinates) {
    setPendingLocation(coordinates);
    setSelectedIncidentId(undefined); // close drawer to prioritize reporting
    setActivePanel("report");
  }

  function handleRouteChange(route?: RouteOption) {
    setActiveRoute(route);
    if (route) {
      setSelectedIncidentId(undefined);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">
            <ShieldCheck size={22} />
          </span>
          <div>
            <p className="eyebrow">Kerala flood response</p>
            <h1>Vellam Undo</h1>
          </div>
        </div>

        <div className="topbar-controls flex items-center gap-3">
          {offlineQueue.length > 0 ? (
            <div className="bg-amber-100 border border-amber-300 rounded px-2.5 py-1 text-[11px] font-bold text-amber-800 flex items-center gap-1.5 animate-pulse shadow-sm">
              <AlertTriangle size={12} />
              <span>{offlineQueue.length} queued offline</span>
            </div>
          ) : null}

          {isSyncing ? (
            <div className="bg-blue-100 border border-blue-300 rounded px-2.5 py-1 text-[11px] font-bold text-blue-800 flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
              <span>Syncing queue...</span>
            </div>
          ) : null}

          <label className="district-select">
            District
            <select
              value={activeDistrictSlug}
              onChange={(event) => {
                setActiveDistrictSlug(event.target.value);
                setSelectedIncidentId(undefined);
                setPendingLocation(undefined);
              }}
            >
              {districts.map((district) => (
                <option key={district.slug} value={district.slug}>
                  {district.name}
                </option>
              ))}
            </select>
          </label>
          <div className="signal-pill">
            <CircleDot size={14} className="text-green-500 fill-green-500 animate-pulse" />
            Live Network Status
          </div>
        </div>
      </header>

      <main className="workspace">
        <nav className="mode-rail" aria-label="Operations">
          {panelItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={activePanel === item.id && !selectedIncidentId ? "is-active" : ""}
                onClick={() => {
                  setSelectedIncidentId(undefined); // close drawer to switch modes
                  setActivePanel(item.id);
                }}
                title={item.label}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <section className="map-stage" aria-label="Flood response map">
          <div className="map-frame">
            <FloodMap
              center={mapCenter}
              incidents={incidents}
              helpRequests={helpRequests}
              reliefCenters={reliefCenters}
              selectedIncidentId={selectedIncidentId}
              activeRoute={activeRoute}
              pendingLocation={pendingLocation}
              onSelectIncident={(id) => {
                setSelectedIncidentId(id);
                setPendingLocation(undefined); // clear active reporting pins
              }}
              onPickLocation={handlePickLocation}
            />
          </div>

          <div className="map-summary">
            <Metric label="Incidents Logged" value={incidents.filter(i => i.status !== "archived").length} />
            <Metric label="Blocked Roads" value={analytics.blockedRoads} tone="danger" />
            <Metric label="SOS Help Requests" value={analytics.openHelpRequests} tone="warning" />
            <Metric label="Relief Camp Beds" value={analytics.reliefBedsAvailable} tone="safe" />
          </div>

          <aside className="map-intel" aria-label="Flood intelligence">
            <div className="intel-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Priority Areas</p>
                  <h2>Watch list</h2>
                </div>
                <Ambulance size={18} className="text-red-500" />
              </div>
              {severeIncidents.length === 0 ? (
                <p className="text-xs text-gray-400 p-2 italic">No active priority hazards.</p>
              ) : (
                severeIncidents.map((incident) => {
                  const typeMeta = incidentTypeMeta[incident.type] || { label: incident.type, icon: "📍" };
                  const color = severityColorMeta[incident.severity]?.color || "#7f7f7f";
                  return (
                    <button
                      type="button"
                      className="intel-row text-left hover:bg-gray-50 flex items-center gap-2 p-2 border-b border-gray-100"
                      key={incident.id}
                      onClick={() => {
                        setSelectedIncidentId(incident.id);
                        setPendingLocation(undefined);
                      }}
                    >
                      <span
                        className="severity-dot shrink-0"
                        style={{ background: color }}
                      />
                      <span className="truncate">
                        <strong className="text-xs text-gray-800 truncate block">{incident.roadName}</strong>
                        <small className="text-[10px] text-gray-500 font-semibold flex items-center gap-0.5">
                          <span>{typeMeta.icon}</span>
                          <span>{incident.type}</span>
                        </small>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="intel-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Incident Feed</p>
                  <h2>Latest updates</h2>
                </div>
              </div>
              {latestUpdatesRollup.length === 0 ? (
                <p className="text-xs text-gray-400 p-2 italic">No updates reported.</p>
              ) : (
                latestUpdatesRollup.map((incident) => {
                  const color = severityColorMeta[incident.severity]?.color || "#7f7f7f";
                  return (
                    <button
                      type="button"
                      className="intel-row text-left hover:bg-gray-50 flex items-center gap-2 p-2 border-b border-gray-100"
                      key={incident.id}
                      onClick={() => {
                        setSelectedIncidentId(incident.id);
                        setPendingLocation(undefined);
                      }}
                    >
                      <span
                        className="severity-dot shrink-0"
                        style={{ background: color }}
                      />
                      <span className="truncate">
                        <strong className="text-xs text-gray-800 truncate block">{incident.roadName}</strong>
                        <small className="text-[10px] text-gray-400 font-mono">
                          Updated {new Date(incident.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </small>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        </section>

        <aside className="operations-panel">
          {selectedIncidentId && selectedIncident ? (
            <IncidentDetailsDrawer
              incident={selectedIncident}
              onVerify={verifyIncident}
              onClose={() => setSelectedIncidentId(undefined)}
            />
          ) : (
            <>
              {activePanel === "report" ? (
                <ReportPanel
                  pendingLocation={pendingLocation}
                  onPickLocation={handlePickLocation}
                  onSubmit={addReport}
                  onResetDemoData={resetDemoData}
                />
              ) : null}

              {activePanel === "route" ? (
                <SafeRoutePlanner
                  userLocation={pendingLocation || null}
                  incidents={incidents}
                  activeRoute={activeRoute}
                  onDestinationSelect={() => {}}
                  onRouteChange={handleRouteChange}
                />
              ) : null}

              {activePanel === "help" ? (
                <HelpRequestPanel
                  activeDistrictSlug={activeDistrictSlug}
                  pendingLocation={pendingLocation}
                  requests={helpRequests}
                  onSubmit={(input) => {
                    const request = addHelpRequest(input);
                    setPendingLocation(undefined);
                    return request;
                  }}
                />
              ) : null}

              {activePanel === "volunteers" ? (
                <VolunteerDashboard requests={helpRequests} onUpdateStatus={updateHelpStatus} />
              ) : null}

              {activePanel === "centers" ? (
                <ReliefCentersPanel
                  centers={reliefCenters}
                  activeDistrictSlug={activeDistrictSlug}
                />
              ) : null}
            </>
          )}
        </aside>
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: number;
  tone?: "neutral" | "safe" | "warning" | "danger";
}) {
  return (
    <div className={`metric-card metric-card--${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
