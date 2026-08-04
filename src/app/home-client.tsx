"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleDot,
  ChevronUp,
  LogIn,
  LogOut,
  MapPin,
  Satellite,
  ShieldCheck,
  AlertTriangle,
  User,
  Search,
  SlidersHorizontal,
  X,
  Loader2,
  Github,
  Linkedin
} from "lucide-react";
import { ReportPanel } from "@/components/ReportPanel";
import { SafeRoutePlanner } from "@/components/SafeRoutePlanner";
import { SearchResultsPanel } from "@/components/SearchResultsPanel";
import { IncidentDetailsDrawer } from "@/components/IncidentDetailsDrawer";
import { AuthModal } from "@/components/AuthModal";
import { useEmergencyStore } from "@/hooks/useEmergencyStore";
import { useAuth } from "@/hooks/useAuth";
import { useIncidentSearch } from "@/hooks/useIncidentSearch";
import { severityColorMeta, severityMeta, incidentTypeMeta, formatRelativeTime } from "@/lib/floodReports";
import type { Coordinates, RouteOption, Incident, SeverityLevel } from "@/lib/types";
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

type ActivePanel = "report" | "route" | "search";

const FALLBACK_CENTER_COORDS: Coordinates = { lat: 10.15, lng: 76.4 };

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

  const router = useRouter();

  const [activePanel, setActivePanel] = useState<ActivePanel>("route");
  const [panelExpanded, setPanelExpanded] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
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

  // Mobile: drag the bottom sheet up/down to expand/collapse it in a flow.
  // Drag only engages while the sheet is scrolled to the top so the panel's
  // own content (route results etc.) still scrolls normally once expanded.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const SHEET_BOTTOM = 12;
    const EXPANDED_TOP = 4;
    const collapsedHeight = () => Math.min(220, Math.max(100, window.innerHeight * 0.2));

    let startY = 0;
    let startTop = 0;
    let active = false;
    let moved = false;
    let snapTimer: number | undefined;

    const getWorkspace = () => panel.closest<HTMLElement>(".workspace");
    const getRange = () => {
      const ws = getWorkspace();
      if (!ws) return { min: EXPANDED_TOP, max: EXPANDED_TOP };
      const h = ws.getBoundingClientRect().height;
      return { min: EXPANDED_TOP, max: h - collapsedHeight() - SHEET_BOTTOM };
    };
    const clampTop = (top: number) => {
      const { min, max } = getRange();
      return Math.min(max, Math.max(min, top));
    };

    const onTouchStart = (e: TouchEvent) => {
      if (panel.scrollTop > 0) return;
      const ws = getWorkspace();
      if (!ws) return;
      if (snapTimer !== undefined) {
        window.clearTimeout(snapTimer);
        snapTimer = undefined;
      }
      active = true;
      moved = false;
      startY = e.touches[0].clientY;
      startTop = panel.getBoundingClientRect().top - ws.getBoundingClientRect().top;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active) return;
      const deltaY = e.touches[0].clientY - startY;
      if (!moved) {
        if (Math.abs(deltaY) < 8) return;
        moved = true;
      }
      if (e.cancelable) e.preventDefault();
      const ws = getWorkspace();
      if (!ws) return;
      ws.style.setProperty("--sheet-top", `${clampTop(startTop + deltaY)}px`);
      ws.classList.add("workspace--dragging");
    };

    const finishDrag = (currentY: number) => {
      if (!active) return;
      const ws = getWorkspace();
      if (ws) {
        ws.classList.remove("workspace--dragging");
        if (moved) {
          const { min, max } = getRange();
          const currentTop = clampTop(startTop + (currentY - startY));
          setPanelExpanded(currentTop <= (min + max) / 2);
          const target = currentTop <= (min + max) / 2 ? min : max;
          ws.style.setProperty("--sheet-top", `${target}px`);
          snapTimer = window.setTimeout(() => {
            ws.style.removeProperty("--sheet-top");
            snapTimer = undefined;
          }, 380);
        } else {
          ws.style.removeProperty("--sheet-top");
        }
      }
      active = false;
      moved = false;
    };

    const onTouchEnd = (e: TouchEvent) => finishDrag(e.changedTouches[0].clientY);
    const onTouchCancel = () => {
      const ws = getWorkspace();
      if (ws) {
        ws.classList.remove("workspace--dragging");
        ws.style.removeProperty("--sheet-top");
      }
      active = false;
      moved = false;
    };

    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchmove", onTouchMove, { passive: false });
    panel.addEventListener("touchend", onTouchEnd, { passive: true });
    panel.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      if (snapTimer !== undefined) window.clearTimeout(snapTimer);
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchmove", onTouchMove);
      panel.removeEventListener("touchend", onTouchEnd);
      panel.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

  // Filters (Combined map filters, Global Search)
  const [filterSeverities, setFilterSeverities] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [globalSearchFocused, setGlobalSearchFocused] = useState(false);
  const globalSearchRef = useRef<HTMLDivElement>(null);
  const incidentSearch = useIncidentSearch(incidents);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Incident[]>([]);

  // Close the filter popover when clicking outside it
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setIsFiltersOpen(false);
      }
      if (globalSearchRef.current && !globalSearchRef.current.contains(event.target as Node)) {
        setGlobalSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  // Footer appears only after the user scrolls down within the app shell.
  const shellRef = useRef<HTMLDivElement>(null);
  const [showFooter, setShowFooter] = useState(false);
  useEffect(() => {
    function handleScroll() {
      setShowFooter((shellRef.current?.scrollTop ?? 0) > 8);
    }
    handleScroll();
    const el = shellRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);
  
  // Shared routing destination to trigger from search
  const [routingDestination, setRoutingDestination] = useState<SearchResultPlace | null>(null);

  // ── GPS ────────────────────────────────────────────────────────────
  const startGpsWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation requires a secure connection (HTTPS) or localhost.");
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
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError("Location access denied. Please enable location permissions in browser settings.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoError("GPS signal unavailable. Try again outdoors or set location manually.");
        } else if (err.code === err.TIMEOUT) {
          setGeoError("GPS request timed out. Try again outdoors or set location manually.");
        } else {
          setGeoError("Unable to fetch GPS location.");
        }
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

  // Tapping the brand/title opens the main route-planner page.
  const handleBrandClick = useCallback(() => {
    router.push("/");
    setActivePanel("route");
    setSelectedIncidentId(undefined);
    setPendingLocation(undefined);
    setRoutingDestination(null);
    setPanelExpanded(false);
    setSearchResults([]);
    setSearchQuery("");
  }, [router]);

  // ── Derived state & Filtering ──────────────────────────────────────
  const selectedIncident = useMemo(
    () => incidents.find((inc) => inc.id === selectedIncidentId),
    [incidents, selectedIncidentId]
  );

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
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
  }, [incidents, filterSeverities, filterStatus]);

  const mapCenter = useMemo(() => {
    void recenterTrigger;
    if (selectedIncident) return { ...selectedIncident.coordinates, zoom: 12 };
    if (pendingLocation) return { ...pendingLocation };
    if (userLocation) return { ...userLocation, zoom: 11 };
    return FALLBACK_CENTER_COORDS;
  }, [selectedIncident, pendingLocation, userLocation, recenterTrigger]);

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
      if (!pendingLocation) setPendingLocation(coords);
      return;
    }
    if (!stretchEnd) {
      setStretchEnd(coords);
      if (!pendingLocation) setPendingLocation(coords);
      return;
    }
    setStretchEnd(coords);
    if (!pendingLocation) setPendingLocation(coords);
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
    if (route) {
      setSelectedIncidentId(undefined);
      // On mobile, minimize the bottom sheet so the map (with the route) is visible.
      setPanelExpanded(false);
    }
  }

  function handleSelectGlobalSuggestion(inc: Incident) {
    setSelectedIncidentId(inc.id);
    setPendingLocation(undefined);
    incidentSearch.setQuery("");
    incidentSearch.clearSuggestions();
    setGlobalSearchFocused(false);
    
    // Highlight route by setting it as routing destination and switching panel
    setRoutingDestination({
      id: inc.id,
      name: inc.roadName,
      fullName: `${inc.roadName}, near ${inc.landmark}, ${inc.district}`,
      coordinates: inc.coordinates
    });
    setActivePanel("route");
  }

  // Open the results page showing every matching incident for the query.
  function openSearchResults() {
    const matches = incidentSearch.suggestions;
    if (matches.length === 0) return;
    setSearchResults(matches);
    setSearchQuery(incidentSearch.query.trim());
    setSelectedIncidentId(undefined);
    setPendingLocation(undefined);
    setActivePanel("search");
    setPanelExpanded(true);
    incidentSearch.clearSuggestions();
    setGlobalSearchFocused(false);
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

  const activeFilterCount = filterSeverities.length + filterStatus.length;

  return (
    <div className="app-shell" ref={shellRef}>
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
        {/* Standard Brand Lockup — click to open the route planner (main page) */}
        <button
          type="button"
          className="brand-lockup flex items-center gap-3"
          onClick={handleBrandClick}
          title="Open Route Planner"
          aria-label="Vellam Undo — open route planner"
        >
          <span className="brand-mark rounded-lg flex items-center justify-center shrink-0">
            <img src="/favicon.png" alt="Vellam Undo" className="brand-mark-img" />
          </span>
          <div className="leading-tight">
            <h1>Vellam Undo</h1>
          </div>
        </button>

            {/* Search + map filters */}
            <div className="topbar-middle">
              {/* Desktop Autocomplete Search - Hidden on Mobile */}
              <div
                className="global-search-container relative hidden md:block"
                ref={globalSearchRef}
              >
                <div className="header-search-wrap">
                  <Search size={16} className="header-search-icon" />
                  <input
                    type="text"
                    placeholder="Search incidents, roads, districts, landmarks..."
                    className="header-search-input"
                    value={incidentSearch.query}
                    onChange={(e) => incidentSearch.setQuery(e.target.value)}
                    onFocus={() => setGlobalSearchFocused(true)}
                    onKeyDown={(e) => {
                      incidentSearch.handleKeyDown(e, handleSelectGlobalSuggestion);
                      if (
                        e.key === "Enter" &&
                        !e.defaultPrevented &&
                        incidentSearch.suggestions.length > 0
                      ) {
                        e.preventDefault();
                        openSearchResults();
                      }
                    }}
                  />
                  {incidentSearch.query && (
                    <button
                      type="button"
                      className="header-search-clear"
                      onClick={() => {
                        incidentSearch.setQuery("");
                        incidentSearch.clearSuggestions();
                      }}
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {globalSearchFocused && (incidentSearch.isLoading || incidentSearch.query.trim().length >= 2) ? (
                  <div className="glass-search-dropdown">
                    {incidentSearch.isLoading ? (
                      <div className="glass-search-status">
                        <Loader2 size={14} className="report-spin" />
                        Searching reported incidents…
                      </div>
                    ) : incidentSearch.suggestions.length > 0 ? (
                      <>
                        <ul className="glass-search-list">
                        {incidentSearch.suggestions.map((inc, idx) => {
                          const TypeIcon = incidentTypeMeta[inc.type]?.icon ?? MapPin;
                          const sevMeta =
                            severityMeta[inc.severity] ?? severityMeta.WATERLOGGED;
                          return (
                            <li key={inc.id}>
                              <button
                                type="button"
                                className={`glass-search-item ${
                                  incidentSearch.highlightedIndex === idx ? "is-highlighted" : ""
                                }`}
                                onMouseEnter={() => incidentSearch.setHighlightedIndex(idx)}
                                onClick={() => handleSelectGlobalSuggestion(inc)}
                              >
                                <span
                                  className="glass-search-icon"
                                  style={{ background: sevMeta.background, color: sevMeta.color }}
                                >
                                  <TypeIcon size={15} />
                                </span>
                                <div className="glass-search-text">
                                  <strong>{inc.roadName}</strong>
                                  <small>
                                    {inc.landmark}, {inc.district}
                                  </small>
                                </div>
                                <div className="glass-search-meta">
                                  <span
                                    className="glass-search-badge"
                                    style={{
                                      background: sevMeta.background,
                                      color: sevMeta.color,
                                      borderColor: sevMeta.border
                                    }}
                                  >
                                    {sevMeta.shortLabel}
                                  </span>
                                  <span className="glass-search-conf">{inc.confidence}%</span>
                                </div>
                              </button>
                              <div className="glass-search-foot">
                                <span>{incidentTypeMeta[inc.type]?.label ?? inc.type}</span>
                                <span className="glass-search-status-chip">{inc.status}</span>
                                <span>{formatRelativeTime(inc.updatedAt)}</span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <button
                        type="button"
                        className="glass-search-viewall"
                        onClick={openSearchResults}
                      >
                        View all {incidentSearch.suggestions.length} results
                      </button>
                      </>
                    ) : (
                      <div className="glass-search-empty">{incidentSearch.error}</div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Combined map filters */}
              <div className="header-filters" ref={filtersRef}>
                <button
                  type="button"
                  className={`filter-toggle-btn${isFiltersOpen ? " filter-toggle-btn--open" : ""}`}
                  onClick={() => setIsFiltersOpen((v) => !v)}
                  aria-expanded={isFiltersOpen}
                  aria-controls="filter-popover"
                >
                  <SlidersHorizontal size={14} />
                  <span className="hidden sm:inline">Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="filter-active-count">{activeFilterCount}</span>
                  )}
                </button>

                {isFiltersOpen && (
                  <div id="filter-popover" className="filter-popover" role="group" aria-label="Map filters">
                    <div className="header-filter-group">
                      <span className="header-filter-label">Severity</span>
                      <div className="header-filter-chips">
                        {Object.keys(severityColorMeta).map((sev) => {
                          const active = filterSeverities.includes(sev);
                          const meta = severityColorMeta[sev as SeverityLevel];
                          return (
                            <button
                              key={sev}
                              type="button"
                              className={`header-filter-chip${active ? " header-filter-chip--active" : ""}`}
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

                    <div className="header-filter-group">
                      <span className="header-filter-label">Status</span>
                      <div className="header-filter-chips">
                        {["active", "receding", "resolved", "archived", "Needs Verification"].map((st) => {
                          const active = filterStatus.includes(st);
                          let activeChip = "header-chip-active";
                          if (st === "Needs Verification") {
                            activeChip = "header-chip-verify";
                          } else if (st === "resolved") {
                            activeChip = "header-chip-resolved";
                          } else if (st === "archived") {
                            activeChip = "header-chip-archived";
                          } else if (st === "receding") {
                            activeChip = "header-chip-receding";
                          }
                          return (
                            <button
                              key={st}
                              type="button"
                              className={`header-filter-chip${active ? ` ${activeChip} header-filter-chip--active` : ""}`}
                              onClick={() => toggleFilterStatus(st)}
                            >
                              {st}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right side controls */}
            <div className="topbar-controls flex items-center gap-2 md:gap-3">
              {offlineQueue.length > 0 && (
                <div className="offline-badge">
                  <AlertTriangle size={12} />
                  <span className="hidden sm:inline">{offlineQueue.length} queued offline</span>
                  <span className="sm:hidden">{offlineQueue.length}</span>
                </div>
              )}
              {isSyncing && (
                <div className="syncing-badge">
                  <span className="syncing-dot" />
                  <span>Syncing…</span>
                </div>
              )}

              <div className="signal-pill">
                <CircleDot size={12} className="text-teal-600 fill-teal-600 animate-pulse shrink-0" />
                Live
              </div>

              {/* Auth button */}
              {authLoading ? null : user ? (
                <button
                  type="button"
                  className="topbar-auth-btn topbar-auth-btn--signed-in"
                  onClick={() => setAuthModalOpen(true)}
                  title={`Signed in as ${user.name}`}
                >
                  <span className="topbar-avatar">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="topbar-avatar-img" referrerPolicy="no-referrer" />
                    ) : (
                      <User size={14} />
                    )}
                  </span>
                  <span className="topbar-auth-name hidden sm:inline">{user.name.split(" ")[0]}</span>
                  <LogOut size={12} className="topbar-auth-signout-icon" />
                </button>
              ) : (
                <button
                  type="button"
                  className="topbar-auth-btn topbar-auth-btn--signed-out"
                  onClick={() => setAuthModalOpen(true)}
                >
                  <LogIn size={13} />
                  <span className="hidden sm:inline">Sign in to verify</span>
                </button>
              )}
            </div>
        </header>

      {/* ── Workspace ─────────────────────────────────── */}
      <main className={`workspace${panelExpanded ? " workspace--panel-expanded" : ""}`}>
        <section className="map-stage" aria-label="Flood response map">
          {geoError && (
            <div className="absolute top-[88px] left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg shadow-lg z-[2000] text-xs font-semibold flex items-center gap-2 max-w-sm w-full mx-4 animate-slideDown">
              <AlertTriangle size={14} className="shrink-0" />
              <div className="flex-1 leading-normal">{geoError}</div>
              <button
                type="button"
                className="text-red-400 hover:text-red-600 font-bold ml-1 focus:outline-none"
                onClick={() => setGeoError(null)}
                aria-label="Dismiss GPS error"
              >
                <X size={14} />
              </button>
            </div>
          )}
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
              reportPinMode={activePanel === "report"}
              onToggleStretchDrawing={handleToggleStretchDrawing}
            />
          </div>

          <div className="map-summary">
            <Metric label="Incidents Displayed" value={filteredIncidents.length} />
          </div>
        </section>

        {/* ── Mobile: expand/collapse the operations panel ─── */}
        <button
          type="button"
          className="operations-panel-toggle"
          onClick={() => setPanelExpanded((v) => !v)}
          aria-expanded={panelExpanded}
          aria-label={panelExpanded ? "Minimize panel" : "Expand panel"}
          title={panelExpanded ? "Minimize panel" : "Expand panel"}
        >
          <ChevronUp size={18} className={`ops-toggle-icon${panelExpanded ? " ops-toggle-icon--up" : ""}`} />
        </button>

        {/* ── Operations panel ──────────────────────────── */}
        <aside className="operations-panel" ref={panelRef}>
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
              {activePanel === "search" && (
                <SearchResultsPanel
                  query={searchQuery}
                  initialResults={searchResults}
                  onBack={() => { setSearchResults([]); setActivePanel("route"); }}
                  onSelectIncident={(id) => { setSelectedIncidentId(id); setPendingLocation(undefined); }}
                />
              )}
              {activePanel === "report" && (
                <ReportPanel
                  pendingLocation={pendingLocation}
                  onPickLocation={handlePickLocation}
                  onSubmit={addReport}
                  onResetDemoData={resetDemoData}
                  onBack={() => {
                    setPendingLocation(undefined);
                    setIsDrawingStretch(false);
                    setStretchStart(undefined);
                    setStretchEnd(undefined);
                    setActivePanel("route");
                  }}
                  isDrawingStretch={isDrawingStretch}
                  stretchStart={stretchStart}
                  stretchEnd={stretchEnd}
                  onStretchChange={handleStretchChange}
                  onToggleStretchDrawing={handleToggleStretchDrawing}
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
                  onOpenReport={() => { setSelectedIncidentId(undefined); setActivePanel("report"); }}
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
          ? <><Satellite size={14} className="inline" /> Acquiring GPS…</>
          : userLocation
          ? <>GPS live · {userLocation.lat}, {userLocation.lng}</>
          : geoError ?? "Fetching GPS…"}
      </div>

      {/* ── Footer (only after scrolling down) ───────────── */}
      <footer className={`app-footer${showFooter ? " app-footer--visible" : ""}`}>
          <div className="footer-links">
            <a href="https://www.linkedin.com/in/alen-elias-bb3812327/" target="_blank" rel="noreferrer" aria-label="Alen Elias on LinkedIn">
              <Linkedin size={16} /> Alen Elias
            </a>
            <a href="https://www.linkedin.com/in/amith-biju-a70813327/" target="_blank" rel="noreferrer" aria-label="Amith Biju on LinkedIn">
              <Linkedin size={16} /> Amith Biju
            </a>
            <a href="https://github.com/alenelias123" target="_blank" rel="noreferrer" aria-label="Alen Elias on GitHub">
              <Github size={16} /> Alen Elias
            </a>
            <a href="https://github.com/amith-exe" target="_blank" rel="noreferrer" aria-label="Amith Biju on GitHub">
              <Github size={16} /> Amith Biju
            </a>
          </div>
          <p className="footer-credit">Created by Alen Elias and Amith Biju</p>
        </footer>
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


