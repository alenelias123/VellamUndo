"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ambulance,
  CircleDot,
  LogIn,
  LogOut,
  MapPinned,
  Navigation2,
  ShieldCheck,
  AlertTriangle,
  User,
  Search,
  SlidersHorizontal,
  X
} from "lucide-react";
import { ReportPanel } from "@/components/ReportPanel";
import { SafeRoutePlanner } from "@/components/SafeRoutePlanner";
import { IncidentDetailsDrawer } from "@/components/IncidentDetailsDrawer";
import { AuthModal } from "@/components/AuthModal";
import { useEmergencyStore } from "@/hooks/useEmergencyStore";
import { useAuth } from "@/hooks/useAuth";
import { severityRank, severityColorMeta, incidentTypeMeta, formatRelativeTime } from "@/lib/floodReports";
import type { Coordinates, RouteOption, Incident, SeverityLevel, IncidentType } from "@/lib/types";
import type { SearchResultPlace } from "@/lib/routing";

const FloodMap = dynamic(
  () => import("@/components/FloodMap").then((mod) => mod.FloodMap),
  {
    ssr: false,
    loading: () => (
      <div className="map-loading bg-slate-50 flex items-center justify-center h-full text-xs font-semibold text-slate-500">
        Loading Map Viewport...
      </div>
    )
  }
);

type ActivePanel = "report" | "route";

const panelItems: Array<{
  id: ActivePanel;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: "report", label: "Report", icon: MapPinned },
  { id: "route",  label: "Route",  icon: Navigation2 }
];

const DEFAULT_KOCHI_COORDS: Coordinates = { lat: 9.9769, lng: 76.2824 };

const DISTRICT_CENTERS: Record<string, { lat: number; lng: number; zoom: number }> = {
  all: { lat: 10.1605, lng: 76.6413, zoom: 8 },
  ernakulam: { lat: 9.9816, lng: 76.2999, zoom: 11 },
  thrissur: { lat: 10.5276, lng: 76.2144, zoom: 11 },
  alappuzha: { lat: 9.4981, lng: 76.3388, zoom: 11 },
  kottayam: { lat: 9.5916, lng: 76.5222, zoom: 11 },
  pathanamthitta: { lat: 9.2648, lng: 76.7870, zoom: 11 },
  idukki: { lat: 9.9189, lng: 77.1025, zoom: 10 },
  kollam: { lat: 8.8932, lng: 76.6141, zoom: 11 },
  kozhikode: { lat: 11.2588, lng: 75.7804, zoom: 11 },
  kannur: { lat: 11.8745, lng: 75.3704, zoom: 11 },
  kasaragod: { lat: 12.5103, lng: 74.9852, zoom: 11 },
  malappuram: { lat: 11.0735, lng: 76.0740, zoom: 11 },
  palakkad: { lat: 10.7867, lng: 76.6548, zoom: 11 },
  wayanad: { lat: 11.6854, lng: 76.1320, zoom: 11 },
  thiruvananthapuram: { lat: 8.5241, lng: 76.9366, zoom: 11 }
};

const districtsList = Object.keys(DISTRICT_CENTERS);

export default function HomeClient() {
  const {
    incidents,
    offlineQueue,
    isSyncing,
    addReport,
    verifyIncident,
    editReport,
    deleteReport,
    resetDemoData
  } = useEmergencyStore();

  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();

  const [activePanel, setActivePanel] = useState<ActivePanel>("report");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | undefined>();
  const [pendingLocation, setPendingLocation] = useState<Coordinates | undefined>();
  const [activeRoute, setActiveRoute] = useState<RouteOption | undefined>();
  const [routesList, setRoutesList] = useState<RouteOption[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // Filters (District, Combined map filters, Global Search)
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterSeverities, setFilterSeverities] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalSuggestions, setGlobalSuggestions] = useState<Incident[]>([]);
  
  // Shared routing destination to trigger from search
  const [routingDestination, setRoutingDestination] = useState<SearchResultPlace | null>(null);

  // ── GPS ────────────────────────────────────────────────────────────
  const startGpsWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported.");
      return;
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsLoading(true);
    setGeoError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5) });
        setGeoError(null);
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === err.PERMISSION_DENIED)
          setGeoError("Location access denied. Set location manually.");
        else if (err.code === err.POSITION_UNAVAILABLE)
          setGeoError("GPS unavailable. Move outdoors or set location manually.");
        else if (err.code === err.TIMEOUT) {
          setGeoError("GPS timed out. Retrying with low accuracy…");
          navigator.geolocation.getCurrentPosition(
            (p) => { setUserLocation({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }); setGeoError(null); },
            () => setGeoError("Could not get location. Set manually on map."),
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
          );
        } else setGeoError("Unable to fetch GPS location.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }, []);

  useEffect(() => {
    startGpsWatch();
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, [startGpsWatch]);

  const handleRecenter = useCallback(() => {
    startGpsWatch();
    setRecenterTrigger((n) => n + 1);
  }, [startGpsWatch]);

  // Global search autocomplete watcher
  useEffect(() => {
    if (globalSearch.trim().length < 2) {
      setGlobalSuggestions([]);
      return;
    }
    const q = globalSearch.toLowerCase().trim();
    const matches = incidents.filter(
      (inc) =>
        inc.roadName.toLowerCase().includes(q) ||
        inc.district.toLowerCase().includes(q) ||
        inc.landmark.toLowerCase().includes(q) ||
        inc.type.toLowerCase().includes(q)
    );
    setGlobalSuggestions(matches.slice(0, 5));
  }, [globalSearch, incidents]);

  // ── Derived state & Filtering ──────────────────────────────────────
  const selectedIncident = useMemo(
    () => incidents.find((inc) => inc.id === selectedIncidentId),
    [incidents, selectedIncidentId]
  );

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      // District filtering
      if (selectedDistrict !== "all" && inc.district.toLowerCase() !== selectedDistrict.toLowerCase()) {
        return false;
      }
      // Type filtering
      if (filterTypes.length > 0 && !filterTypes.includes(inc.type)) {
        return false;
      }
      // Severity filtering
      if (filterSeverities.length > 0 && !filterSeverities.includes(inc.severity)) {
        return false;
      }
      // Status filtering (support both status check & needs verification flag)
      if (filterStatus.length > 0) {
        const matchesVerification = filterStatus.includes("Needs Verification") && inc.needsVerification;
        const matchesStatus = filterStatus.includes(inc.status);
        if (!matchesVerification && !matchesStatus) {
          return false;
        }
      }
      return true;
    });
  }, [incidents, selectedDistrict, filterTypes, filterSeverities, filterStatus]);

  // District Dashboard Statistics (Feature 8)
  const districtDashboardStats = useMemo(() => {
    const subset = incidents.filter(
      (inc) => selectedDistrict === "all" || inc.district.toLowerCase() === selectedDistrict.toLowerCase()
    );
    const active = subset.filter((inc) => inc.status === "active" || inc.status === "receding");
    
    const blockedRoads = active.filter(
      (inc) => inc.severity === "NOT_PASSABLE" || inc.severity === "WAIST_DEEP"
    ).length;
    
    const bridgeClosures = active.filter((inc) => inc.type === "Bridge Closed").length;
    const rescueRequests = active.filter((inc) => inc.type === "Rescue Needed" || inc.type === "Medical Emergency").length;

    // Relative timestamp for last update
    const times = subset.map((inc) => new Date(inc.updatedAt || inc.createdAt).getTime());
    const lastUpdated = times.length > 0 ? formatRelativeTime(new Date(Math.max(...times)).toISOString()) : "never";

    return {
      activeCount: active.length,
      blockedRoads,
      bridgeClosures,
      rescueRequests,
      lastUpdated
    };
  }, [incidents, selectedDistrict]);

  const mapCenter = useMemo(() => {
    void recenterTrigger;
    if (selectedIncident) return { ...selectedIncident.coordinates, zoom: 12 };
    if (pendingLocation) return { ...pendingLocation, zoom: 11 };
    if (selectedDistrict !== "all") {
      const center = DISTRICT_CENTERS[selectedDistrict];
      return center ? { lat: center.lat, lng: center.lng, zoom: center.zoom } : DEFAULT_KOCHI_COORDS;
    }
    if (userLocation) return { ...userLocation, zoom: 11 };
    return DEFAULT_KOCHI_COORDS;
  }, [selectedIncident, pendingLocation, selectedDistrict, userLocation, recenterTrigger]);

  const severeIncidents = useMemo(() =>
    [...filteredIncidents]
      .filter((i) => i.status === "active" || i.status === "receding")
      .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.confidence - a.confidence)
      .slice(0, 4),
    [filteredIncidents]
  );

  const latestUpdates = useMemo(() =>
    [...filteredIncidents]
      .filter((i) => i.status !== "archived")
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 4),
    [filteredIncidents]
  );

  function handlePickLocation(coords: Coordinates) {
    setPendingLocation(coords);
    setSelectedIncidentId(undefined);
    setActivePanel("report");
  }

  function handleRouteChange(route?: RouteOption) {
    setActiveRoute(route);
    if (route) setSelectedIncidentId(undefined);
  }

  function handleSelectGlobalSuggestion(inc: Incident) {
    setSelectedIncidentId(inc.id);
    setPendingLocation(undefined);
    setGlobalSearch("");
    setGlobalSuggestions([]);
    
    // Highlight route by setting it as routing destination and switching panel
    setRoutingDestination({
      id: inc.id,
      name: inc.roadName,
      fullName: `${inc.roadName}, near ${inc.landmark}, ${inc.district}`,
      coordinates: inc.coordinates
    });
    setActivePanel("route");
  }

  function toggleFilterType(type: string) {
    setFilterTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function toggleFilterSeverity(sev: string) {
    setFilterSeverities((prev) =>
      prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev]
    );
  }

  function toggleFilterStatus(st: string) {
    setFilterStatus((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]
    );
  }

  return (
    <div className="app-shell">
      {/* Auth modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        user={user}
        loading={authLoading}
        onSignIn={signInWithGoogle}
        onSignOut={signOut}
      />

      {/* ── Topbar ────────────────────────────────────── */}
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark"><ShieldCheck size={22} /></span>
          <div>
            <p className="eyebrow">Kerala flood response</p>
            <h1>Vellam Undo</h1>
          </div>
        </div>

        {/* Global Autocomplete Search (Feature 10) */}
        <div className="global-search-container relative flex-1 max-w-md mx-6">
          <div className="relative flex items-center">
            <Search size={16} className="absolute left-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search roads, districts, landmarks or incident types..."
              className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
            {globalSearch && (
              <button
                type="button"
                className="absolute right-2 text-slate-400 hover:text-slate-600"
                onClick={() => { setGlobalSearch(""); setGlobalSuggestions([]); }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {globalSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[2000] text-sm overflow-hidden">
              {globalSuggestions.map((inc) => (
                <button
                  key={inc.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 flex items-center gap-2"
                  onClick={() => handleSelectGlobalSuggestion(inc)}
                >
                  <span>{incidentTypeMeta[inc.type]?.icon || "📍"}</span>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800">{inc.roadName}</div>
                    <div className="text-xs text-slate-500">{inc.landmark}, {inc.district}</div>
                  </div>
                  <span className="text-xs font-bold text-blue-600">{inc.confidence}% match</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="topbar-controls">
          {offlineQueue.length > 0 && (
            <div className="offline-badge">
              <AlertTriangle size={12} />
              <span>{offlineQueue.length} queued offline</span>
            </div>
          )}
          {isSyncing && (
            <div className="syncing-badge">
              <span className="syncing-dot" />
              <span>Syncing…</span>
            </div>
          )}

          <div className="signal-pill">
            <CircleDot size={14} className="text-green-500 fill-green-500 animate-pulse" />
            Live
          </div>

          {/* ── Auth button ─────────────────────────── */}
          {authLoading ? null : user ? (
            <button
              type="button"
              className="topbar-auth-btn topbar-auth-btn--signed-in"
              onClick={() => setAuthModalOpen(true)}
              title={`Signed in as ${user.name}`}
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="topbar-avatar" referrerPolicy="no-referrer" />
              ) : (
                <User size={15} />
              )}
              <span className="topbar-auth-name">{user.name.split(" ")[0]}</span>
              <LogOut size={13} className="topbar-auth-signout-icon" />
            </button>
          ) : (
            <button
              type="button"
              className="topbar-auth-btn topbar-auth-btn--signed-out"
              onClick={() => setAuthModalOpen(true)}
            >
              <LogIn size={15} />
              <span>Sign in to verify</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Workspace ─────────────────────────────────── */}
      <main className="workspace">
        <nav className="mode-rail" aria-label="Operations">
          {panelItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={activePanel === id && !selectedIncidentId ? "is-active" : ""}
              onClick={() => { setSelectedIncidentId(undefined); setActivePanel(id); }}
              title={label}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <section className="map-stage" aria-label="Flood response map">
          <div className="map-frame">
            <FloodMap
              center={mapCenter}
              userLocation={userLocation ?? undefined}
              incidents={filteredIncidents}
              selectedIncidentId={selectedIncidentId}
              activeRoute={activeRoute}
              routes={routesList}
              onSelectRoute={handleRouteChange}
              pendingLocation={pendingLocation}
              gpsLoading={gpsLoading}
              onRecenter={handleRecenter}
              onSelectIncident={(id) => { setSelectedIncidentId(id); setPendingLocation(undefined); }}
              onPickLocation={handlePickLocation}
            />
          </div>

          <div className="map-summary">
            <Metric label="Incidents Displayed" value={filteredIncidents.length} />
          </div>

          {/* ── Map intel sidebar ──────────────────────── */}
          <aside className="map-intel" aria-label="Flood intelligence">
            {/* District Selector Filter (Feature 7) */}
            <div className="intel-section district-filter-section bg-slate-50 p-3 rounded-lg border border-slate-200 mb-3">
              <label className="block text-xs uppercase font-bold text-slate-500 mb-1">
                Filter by District:
              </label>
              <select
                className="w-full p-2 border border-slate-200 rounded text-sm bg-white"
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
              >
                <option value="all">All Kerala (Statewide)</option>
                {districtsList.filter(d => d !== "all").map((d) => (
                  <option key={d} value={d}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* District Dashboard Stats (Feature 8) */}
            <div className="intel-section district-dashboard bg-white p-3 rounded-lg border border-slate-200 mb-3 text-xs flex flex-col gap-2">
              <h4 className="font-bold text-slate-800 uppercase tracking-wider mb-1 border-b border-slate-100 pb-1.5 flex justify-between items-center">
                <span>📊 {selectedDistrict.charAt(0).toUpperCase() + selectedDistrict.slice(1)} Summary</span>
                <span className="text-[10px] text-slate-400 lowercase italic font-normal">updated {districtDashboardStats.lastUpdated}</span>
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-slate-50 border border-slate-100 rounded text-center">
                  <div className="text-lg font-black text-slate-700">{districtDashboardStats.activeCount}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Active Cases</div>
                </div>
                <div className="p-2 bg-red-50 border border-red-100 rounded text-center">
                  <div className="text-lg font-black text-red-600">{districtDashboardStats.blockedRoads}</div>
                  <div className="text-[10px] text-red-400 uppercase font-bold">Blocked Roads</div>
                </div>
                <div className="p-2 bg-amber-50 border border-amber-100 rounded text-center">
                  <div className="text-lg font-black text-amber-600">{districtDashboardStats.bridgeClosures}</div>
                  <div className="text-[10px] text-amber-400 uppercase font-bold">Bridge Closures</div>
                </div>
                <div className="p-2 bg-blue-50 border border-blue-100 rounded text-center">
                  <div className="text-lg font-black text-blue-600">{districtDashboardStats.rescueRequests}</div>
                  <div className="text-[10px] text-blue-400 uppercase font-bold">Rescue/Emergency</div>
                </div>
              </div>
            </div>

            {/* Combined Filters (Feature 9) */}
            <div className="intel-section map-filters-section bg-slate-50 p-3 rounded-lg border border-slate-200 mb-3 text-xs flex flex-col gap-3">
              <h4 className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <SlidersHorizontal size={12} /> Combined Map Filters
              </h4>
              
              <div>
                <span className="block font-bold text-slate-500 uppercase tracking-wider mb-1.5">Type:</span>
                <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1">
                  {Object.keys(incidentTypeMeta).map((type) => (
                    <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterTypes.includes(type)}
                        onChange={() => toggleFilterType(type)}
                      />
                      <span>{incidentTypeMeta[type as IncidentType]?.icon} {type}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <span className="block font-bold text-slate-500 uppercase tracking-wider mb-1.5">Severity:</span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(severityColorMeta).map((sev) => {
                    const active = filterSeverities.includes(sev);
                    return (
                      <button
                        key={sev}
                        type="button"
                        className="px-2 py-0.5 rounded border text-[10px] font-semibold transition"
                        style={{
                          background: active ? severityColorMeta[sev as SeverityLevel].color : "white",
                          color: active ? "white" : "#475569",
                          borderColor: severityColorMeta[sev as SeverityLevel].color
                        }}
                        onClick={() => toggleFilterSeverity(sev)}
                      >
                        {severityColorMeta[sev as SeverityLevel].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="block font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status:</span>
                <div className="flex flex-wrap gap-1.5">
                  {["active", "receding", "resolved", "archived", "Needs Verification"].map((st) => {
                    const active = filterStatus.includes(st);
                    return (
                      <button
                        key={st}
                        type="button"
                        className="px-2 py-0.5 rounded border text-[10px] font-semibold transition"
                        style={{
                          background: active ? "#334155" : "white",
                          color: active ? "white" : "#475569",
                          borderColor: "#cbd5e1"
                        }}
                        onClick={() => toggleFilterStatus(st)}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="intel-section">
              <div className="section-heading">
                <div><p className="eyebrow">Priority Areas</p><h2>Watch list</h2></div>
                <Ambulance size={18} style={{ color: "var(--red)" }} />
              </div>
              {severeIncidents.length === 0 ? (
                <p className="muted" style={{ padding: "6px 0", fontSize: "0.78rem" }}>No active priority hazards.</p>
              ) : severeIncidents.map((inc) => {
                const meta = incidentTypeMeta[inc.type] ?? { icon: "📍", label: inc.type };
                const color = severityColorMeta[inc.severity]?.color ?? "#7f7f7f";
                return (
                  <button key={inc.id} type="button" className="intel-row"
                    onClick={() => { setSelectedIncidentId(inc.id); setPendingLocation(undefined); }}>
                    <span className="severity-dot" style={{ background: color }} />
                    <span>
                      <strong>{inc.roadName}</strong>
                      <small>{meta.icon} {inc.type}</small>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="intel-section">
              <div className="section-heading">
                <div><p className="eyebrow">Incident Feed</p><h2>Latest updates</h2></div>
              </div>
              {latestUpdates.map((inc) => {
                const color = severityColorMeta[inc.severity]?.color ?? "#7f7f7f";
                const verifCount = inc.verifications?.length ?? 0;
                return (
                  <button key={inc.id} type="button" className="intel-row"
                    onClick={() => { setSelectedIncidentId(inc.id); setPendingLocation(undefined); }}>
                    <span className="severity-dot" style={{ background: color }} />
                    <span>
                      <strong>
                        {inc.roadName}
                        {verifCount >= 2 && (
                          <span className="intel-verified-tick" title="Community verified"> ✓</span>
                        )}
                      </strong>
                      <small>
                        {new Date(inc.updatedAt || inc.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
        </section>

        {/* ── Operations panel ──────────────────────────── */}
        <aside className="operations-panel">
          {selectedIncidentId && selectedIncident ? (
            <IncidentDetailsDrawer
              incident={selectedIncident}
              user={user}
              onVerify={verifyIncident}
              onEditReport={editReport}
              onDeleteReport={deleteReport}
              onClose={() => setSelectedIncidentId(undefined)}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          ) : (
            <>
              {activePanel === "report" && (
                <ReportPanel
                  pendingLocation={pendingLocation}
                  onPickLocation={handlePickLocation}
                  onSubmit={addReport}
                  onResetDemoData={resetDemoData}
                />
              )}
              {activePanel === "route" && (
                <SafeRoutePlanner
                  userLocation={userLocation}
                  incidents={filteredIncidents}
                  activeRoute={activeRoute}
                  destination={routingDestination}
                  onDestinationSelect={setRoutingDestination}
                  onRouteChange={handleRouteChange}
                  onRoutesCalculated={setRoutesList}
                  onSelectIncident={(id) => { setSelectedIncidentId(id); setPendingLocation(undefined); }}
                />
              )}
            </>
          )}
        </aside>
      </main>

      {/* ── GPS status bar ────────────────────────────── */}
      <div className="gps-status-bar">
        {gpsLoading
          ? "🛰 Acquiring GPS…"
          : userLocation
          ? `GPS live · ${userLocation.lat}, ${userLocation.lng}`
          : geoError ?? "Fetching GPS…"}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: {
  label: string; value: number; tone?: "neutral" | "safe" | "warning" | "danger";
}) {
  return (
    <div className={`metric-card metric-card--${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
