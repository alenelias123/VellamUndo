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
  ShieldCheck
} from "lucide-react";
import { ReliefCentersPanel } from "@/components/ReliefCentersPanel";
import { ReportPanel } from "@/components/ReportPanel";
import { SafeRoutePlanner } from "@/components/SafeRoutePlanner";
import { HelpRequestPanel } from "@/components/HelpRequestPanel";
import { VolunteerDashboard } from "@/components/VolunteerDashboard";
import { useEmergencyStore } from "@/hooks/useEmergencyStore";
import { defaultDistrictSlug, districts, getDistrictBySlug } from "@/lib/districts";
import { getMostSevereReports, severityMeta } from "@/lib/floodReports";
import { buildRoadStatusSummaries } from "@/lib/roads";
import type { Coordinates, RouteOption } from "@/lib/types";

const FloodMap = dynamic(() => import("@/components/FloodMap").then((mod) => mod.FloodMap), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map...</div>
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
    reports,
    helpRequests,
    reliefCenters,
    analytics,
    addReport,
    verifyReport,
    addHelpRequest,
    updateHelpStatus,
    resetDemoData
  } = useEmergencyStore();
  const [activeDistrictSlug, setActiveDistrictSlug] = useState(defaultDistrictSlug);
  const [activePanel, setActivePanel] = useState<ActivePanel>("report");
  const [selectedReportId, setSelectedReportId] = useState<string | undefined>(reports[0]?.id);
  const [pendingLocation, setPendingLocation] = useState<Coordinates | undefined>();
  const [activeRoute, setActiveRoute] = useState<RouteOption | undefined>();

  const activeDistrict = getDistrictBySlug(activeDistrictSlug);
  const selectedReport = reports.find((report) => report.id === selectedReportId);
  const mapCenter = selectedReport?.coordinates ?? pendingLocation ?? activeDistrict.center;
  const severeReports = useMemo(() => getMostSevereReports(reports, 4), [reports]);
  const roadSummaries = useMemo(() => buildRoadStatusSummaries(reports).slice(0, 4), [reports]);

  function handlePickLocation(coordinates: Coordinates) {
    setPendingLocation(coordinates);
    setActivePanel("report");
  }

  function handleRouteChange(route?: RouteOption) {
    setActiveRoute(route);
    if (route) {
      setSelectedReportId(undefined);
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

        <div className="topbar-controls">
          <label className="district-select">
            District
            <select
              value={activeDistrictSlug}
              onChange={(event) => {
                setActiveDistrictSlug(event.target.value);
                setSelectedReportId(undefined);
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
            <CircleDot size={14} />
            Local demo live
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
                className={activePanel === item.id ? "is-active" : ""}
                onClick={() => setActivePanel(item.id)}
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
              reports={reports}
              helpRequests={helpRequests}
              reliefCenters={reliefCenters}
              selectedReportId={selectedReportId}
              activeRoute={activeRoute}
              pendingLocation={pendingLocation}
              onSelectReport={(reportId) => {
                setSelectedReportId(reportId);
                setActivePanel("report");
              }}
              onPickLocation={handlePickLocation}
            />
          </div>

          <div className="map-summary">
            <Metric label="Reports" value={analytics.totalReports} />
            <Metric label="Blocked roads" value={analytics.blockedRoads} tone="danger" />
            <Metric label="Open help" value={analytics.openHelpRequests} tone="warning" />
            <Metric label="Beds free" value={analytics.reliefBedsAvailable} tone="safe" />
          </div>

          <aside className="map-intel" aria-label="Flood intelligence">
            <div className="intel-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Priority roads</p>
                  <h2>Watch list</h2>
                </div>
                <Ambulance size={18} />
              </div>
              {severeReports.map((report) => (
                <button
                  type="button"
                  className="intel-row"
                  key={report.id}
                  onClick={() => {
                    setSelectedReportId(report.id);
                    setActivePanel("report");
                  }}
                >
                  <span
                    className="severity-dot"
                    style={{ background: severityMeta[report.severity].color }}
                  />
                  <span>
                    <strong>{report.roadName}</strong>
                    <small>{severityMeta[report.severity].label}</small>
                  </span>
                </button>
              ))}
            </div>

            <div className="intel-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Road status</p>
                  <h2>Latest rollup</h2>
                </div>
              </div>
              {roadSummaries.map((summary) => (
                <div className="intel-row" key={`${summary.district}-${summary.roadName}`}>
                  <span
                    className="severity-dot"
                    style={{ background: severityMeta[summary.worstSeverity].color }}
                  />
                  <span>
                    <strong>{summary.roadName}</strong>
                    <small>
                      {summary.reportCount} report{summary.reportCount === 1 ? "" : "s"}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <aside className="operations-panel">
          {activePanel === "report" ? (
            <ReportPanel
              activeDistrictSlug={activeDistrictSlug}
              pendingLocation={pendingLocation}
              selectedReport={selectedReport}
              reports={reports}
              onSubmit={(input) => {
                const report = addReport(input);
                setPendingLocation(undefined);
                return report;
              }}
              onVerify={verifyReport}
              onSelectReport={setSelectedReportId}
              onResetDemoData={() => {
                resetDemoData();
                setPendingLocation(undefined);
                setActiveRoute(undefined);
              }}
            />
          ) : null}

          {activePanel === "route" ? (
            <SafeRoutePlanner
              reports={reports}
              activeRoute={activeRoute}
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
