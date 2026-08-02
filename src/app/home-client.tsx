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
  X,
  ArrowLeft
} from "lucide-react";
import { ReportPanel } from "@/components/ReportPanel";
import { SafeRoutePlanner } from "@/components/SafeRoutePlanner";
import { IncidentDetailsDrawer } from "@/components/IncidentDetailsDrawer";
import { AuthModal } from "@/components/AuthModal";
import { useEmergencyStore } from "@/hooks/useEmergencyStore";
import { useAuth } from "@/hooks/useAuth";
import { severityRank, severityColorMeta, incidentTypeMeta, formatRelativeTime } from "@/lib/floodReports";
import type { Coordinates, RouteOption, Incident, SeverityLevel, IncidentType } from "@/lib/types";
import { fetchRoadPath, type SearchResultPlace } from "@/lib/routing";

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

const FALLBACK_CENTER_COORDS: Coordinates = { lat: 10.15, lng: 76.4 };

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
    editIncident,
    deleteIncident,
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
  const [routeOriginPin, setRouteOriginPin] = useState<Coordinates | null>(null);
  const [routeDestinationPin, setRouteDestinationPin] = useState<Coordinates | null>(null);
  const [routeMapPickMode, setRouteMapPickMode] = useState<"origin" | "destination" | null>(null);
  const [routeMapPickedLocation, setRouteMapPickedLocation] = useState<{
    mode: "origin" | "destination";
    coordinates: Coordinates;
    token: number;
  } | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isDrawingStretch, setIsDrawingStretch] = useState(false);
  const [stretchStart, setStretchStart] = useState<Coordinates | undefined>();
  const [stretchEnd, setStretchEnd] = useState<Coordinates | undefined>();
  const [stretchPath, setStretchPath] = useState<Coordinates[] | undefined>();
  const [stretchPathKm, setStretchPathKm] = useState<number | undefined>();
  const [isResolvingStretch, setIsResolvingStretch] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const stretchReqRef = useRef(0);

  // Resolve the road path along the drawn stretch so the flooded length
  // follows the road geometry instead of a straight line between markers.
  useEffect(() => {
    const reqId = ++stretchReqRef.current;
    if (!stretchStart || !stretchEnd) {
      setStretchPath(undefined);
      setStretchPathKm(undefined);
      setIsResolvingStretch(false);
      return;
    }
    setIsResolvingStretch(true);
    const timeout = setTimeout(async () => {
      const path = await fetchRoadPath(stretchStart, stretchEnd);
      if (stretchReqRef.current !== reqId) return;
      setStretchPath(path?.coordinates);
      setStretchPathKm(path?.distanceKm);
      setIsResolvingStretch(false);
    }, 350);
    return () => clearTimeout(timeout);
  }, [stretchStart, stretchEnd]);

  // Filters (District, Combined map filters, Global Search)
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterSeverities, setFilterSeverities] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalSuggestions, setGlobalSuggestions] = useState<Incident[]>([]);
  const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState(false);
  
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
      return center ? { lat: center.lat, lng: center.lng, zoom: center.zoom } : FALLBACK_CENTER_COORDS;
    }
    if (userLocation) return { ...userLocation, zoom: 11 };
    return FALLBACK_CENTER_COORDS;
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
    if (activePanel === "route" && routeMapPickMode) {
      setRouteMapPickedLocation({
        mode: routeMapPickMode,
        coordinates: coords,
        token: Date.now()
      });
      return;
    }
    setPendingLocation(coords);
    setSelectedIncidentId(undefined);
    setActivePanel("report");
  }

  function handleStretchPoint(coords: Coordinates) {
    if (!stretchStart) {
      setStretchStart(coords);
      return;
    }
    if (!stretchEnd) {
      setStretchEnd(coords);
      return;
    }
    setStretchEnd(coords);
  }

  function handleStretchChange(start: Coordinates, end: Coordinates) {
    setStretchStart(start);
    setStretchEnd(end);
  }

  function handleToggleStretchDrawing(active: boolean) {
    setIsDrawingStretch(active);
    if (!active) {
      setStretchStart(undefined);
      setStretchEnd(undefined);
    }
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
    setIsMobileSearchExpanded(false);
    
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
      <header className="topbar flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-slate-200 bg-white relative min-h-[72px]">
        {/* If mobile search is expanded, render full-width search input */}
        {isMobileSearchExpanded ? (
          <div className="flex items-center w-full gap-2 z-[2000] animate-fadeIn">
            <button
              type="button"
              className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition"
              onClick={() => {
                setIsMobileSearchExpanded(false);
                setGlobalSearch("");
                setGlobalSuggestions([]);
              }}
              aria-label="Back to topbar"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search roads, districts, landmarks..."
                autoFocus
                className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
              {globalSearch && (
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => { setGlobalSearch(""); setGlobalSuggestions([]); }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {globalSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-lg shadow-xl z-[2000] text-sm overflow-hidden mx-4 animate-slideDown">
                {globalSuggestions.map((inc) => (
                  <button
                    key={inc.id}
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 flex items-center gap-3 transition"
                    onClick={() => handleSelectGlobalSuggestion(inc)}
                  >
                    <span className="text-lg">{incidentTypeMeta[inc.type]?.icon || "📍"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{inc.roadName}</div>
                      <div className="text-xs text-slate-500 truncate">{inc.landmark}, {inc.district}</div>
                    </div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">{inc.confidence}% match</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Standard Brand Lockup */}
            <div className="brand-lockup flex items-center gap-3">
              <span className="brand-mark bg-slate-800 text-white rounded-lg p-2 flex items-center justify-center shrink-0">
                <ShieldCheck size={20} />
              </span>
              <div className="leading-tight">
                <p className="eyebrow text-[10px] tracking-wider text-slate-400 font-bold uppercase">Kerala flood response</p>
                <h1 className="text-lg font-black text-slate-800">Vellam Undo</h1>
              </div>
            </div>

            {/* Desktop Autocomplete Search - Hidden on Mobile */}
            <div className="global-search-container relative flex-1 max-w-md mx-6 hidden md:block">
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

            {/* Right side controls */}
            <div className="topbar-controls flex items-center gap-2 md:gap-3">
              {/* Mobile Search Toggle Button - Visible only on Mobile */}
              <button
                type="button"
                className="md:hidden p-2 hover:bg-slate-100 rounded-full text-slate-600 transition"
                onClick={() => setIsMobileSearchExpanded(true)}
                aria-label="Expand search"
              >
                <Search size={20} />
              </button>

              {offlineQueue.length > 0 && (
                <div className="offline-badge flex items-center gap-1 text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded animate-pulse">
                  <AlertTriangle size={12} />
                  <span className="hidden sm:inline">{offlineQueue.length} queued offline</span>
                  <span className="sm:hidden">{offlineQueue.length}</span>
                </div>
              )}
              {isSyncing && (
                <div className="syncing-badge flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1 rounded">
                  <span className="syncing-dot bg-blue-600 w-2 h-2 rounded-full animate-ping" />
                  <span>Syncing…</span>
                </div>
              )}

              <div className="signal-pill flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold">
                <CircleDot size={12} className="text-green-500 fill-green-500 animate-pulse shrink-0" />
                Live
              </div>

              {/* Auth button */}
              {authLoading ? null : user ? (
                <button
                  type="button"
                  className="topbar-auth-btn topbar-auth-btn--signed-in flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-slate-200 text-xs font-semibold hover:bg-slate-50 transition"
                  onClick={() => setAuthModalOpen(true)}
                  title={`Signed in as ${user.name}`}
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className="w-5 h-5 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                  ) : (
                    <User size={12} />
                  )}
                  <span className="topbar-auth-name hidden sm:inline text-slate-700">{user.name.split(" ")[0]}</span>
                  <LogOut size={12} className="text-slate-400 hover:text-slate-600" />
                </button>
              ) : (
                <button
                  type="button"
                  className="topbar-auth-btn topbar-auth-btn--signed-out flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
                  onClick={() => setAuthModalOpen(true)}
                >
                  <LogIn size={13} />
                  <span className="hidden sm:inline">Sign in to verify</span>
                </button>
              )}
            </div>
          </>
        )}
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
              routeOrigin={routeOriginPin ?? undefined}
              routeDestination={routeDestinationPin ?? undefined}
              routeMapPickMode={routeMapPickMode}
              onSelectRoute={handleRouteChange}
              onRoutePinMoved={(mode, coordinates) =>
                setRouteMapPickedLocation({ mode, coordinates, token: Date.now() })
              }
              pendingLocation={pendingLocation}
              gpsLoading={gpsLoading}
              onRecenter={handleRecenter}
              onSelectIncident={(id) => { setSelectedIncidentId(id); setPendingLocation(undefined); }}
              onPickLocation={handlePickLocation}
              isDrawingStretch={isDrawingStretch}
              stretchStart={stretchStart}
              stretchEnd={stretchEnd}
              onStretchChange={handleStretchChange}
              onStretchPoint={handleStretchPoint}
              stretchPath={stretchPath}
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

            {/* Redesigned Combined Filters (Feature 9) */}
            <div className="intel-section map-filters-section bg-white/95 backdrop-blur-md p-4 rounded-xl border border-slate-200 shadow-md mb-3 text-xs flex flex-col gap-4">
              <h4 className="font-bold text-slate-800 text-sm tracking-wide flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <SlidersHorizontal size={14} className="text-teal-600 animate-pulse" /> Combined Map Filters
              </h4>
              
              <div>
                <span className="block font-bold text-slate-500 uppercase tracking-wider mb-2">Hazard Type:</span>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {Object.keys(incidentTypeMeta).map((type) => {
                    const active = filterTypes.includes(type);
                    const meta = incidentTypeMeta[type as IncidentType];
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleFilterType(type)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all duration-200 hover:scale-105 active:scale-95 ${
                          active
                            ? "bg-teal-700 text-white border-teal-700 shadow-sm"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        <span>{meta?.icon}</span>
                        <span>{type}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="block font-bold text-slate-500 uppercase tracking-wider mb-2">Severity:</span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(severityColorMeta).map((sev) => {
                    const active = filterSeverities.includes(sev);
                    const meta = severityColorMeta[sev as SeverityLevel];
                    return (
                      <button
                        key={sev}
                        type="button"
                        className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all duration-200 hover:scale-105 active:scale-95 border ${
                          active
                            ? "text-white shadow-sm"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                        style={active ? {
                          backgroundColor: meta.color,
                          borderColor: meta.color,
                        } : {}}
                        onClick={() => toggleFilterSeverity(sev)}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="block font-bold text-slate-500 uppercase tracking-wider mb-2">Status:</span>
                <div className="flex flex-wrap gap-1.5">
                  {["active", "receding", "resolved", "archived", "Needs Verification"].map((st) => {
                    const active = filterStatus.includes(st);
                    let activeClass = "bg-slate-800 text-white border-slate-800";
                    if (st === "Needs Verification") {
                      activeClass = "bg-amber-600 text-white border-amber-600";
                    } else if (st === "resolved") {
                      activeClass = "bg-green-600 text-white border-green-600";
                    } else if (st === "archived") {
                      activeClass = "bg-slate-500 text-white border-slate-500";
                    } else if (st === "receding") {
                      activeClass = "bg-sky-600 text-white border-sky-600";
                    }
                    return (
                      <button
                        key={st}
                        type="button"
                        className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 hover:scale-105 active:scale-95 border ${
                          active
                            ? activeClass
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
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
              onEdit={editIncident}
              onDelete={deleteIncident}
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
                  isDrawingStretch={isDrawingStretch}
                  stretchStart={stretchStart}
                  stretchEnd={stretchEnd}
                  onToggleStretchDrawing={handleToggleStretchDrawing}
                  onStretchChange={handleStretchChange}
                  onStretchReset={() => {
                    setStretchStart(undefined);
                    setStretchEnd(undefined);
                    setIsDrawingStretch(false);
                  }}
                  stretchPath={stretchPath}
                  stretchPathKm={stretchPathKm}
                  isResolvingStretch={isResolvingStretch}
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
                  mapPickMode={routeMapPickMode}
                  mapPickedLocation={routeMapPickedLocation}
                  onMapPickModeChange={setRouteMapPickMode}
                  onMapPickHandled={() => setRouteMapPickedLocation(null)}
                  onRouteOriginChange={setRouteOriginPin}
                  onRouteDestinationChange={setRouteDestinationPin}
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
