"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Ban,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Info,
  Layers,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation2,
  Plus,
  Route,
  Search,
  ShieldCheck,
  X
} from "lucide-react";
import { incidentTypeMeta } from "@/lib/floodReports";
import {
  calculateRoadRoutes,
  haversineDistanceKm,
  type SearchResultPlace
} from "@/lib/routing";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import type { Coordinates, Incident, RouteOption } from "@/lib/types";

type SafeRoutePlannerProps = {
  destination?: SearchResultPlace | null;
  userLocation: Coordinates | null;
  incidents: Incident[];
  activeRoute?: RouteOption;
  onDestinationSelect: (place: SearchResultPlace | null) => void;
  onRouteChange: (route?: RouteOption) => void;
  onRoutesCalculated?: (routes: RouteOption[]) => void;
  onSelectIncident?: (id: string) => void;
  onOpenReport?: () => void;
  mapPickMode?: "origin" | "destination" | null;
  mapPickedLocation?: { mode: "origin" | "destination"; coordinates: Coordinates; token: number } | null;
  onMapPickModeChange?: (mode: "origin" | "destination" | null) => void;
  onMapPickHandled?: () => void;
  onRouteOriginChange?: (origin: Coordinates | null) => void;
  onRouteDestinationChange?: (destination: Coordinates | null) => void;
};

export function SafeRoutePlanner({
  destination,
  userLocation,
  incidents,
  activeRoute,
  onDestinationSelect,
  onRouteChange,
  onRoutesCalculated,
  onSelectIncident,
  onOpenReport,
  mapPickMode = null,
  mapPickedLocation = null,
  onMapPickModeChange,
  onMapPickHandled,
  onRouteOriginChange,
  onRouteDestinationChange
}: SafeRoutePlannerProps) {
  // ── Destination & origin typeahead ────────────────────────────────
  const dest = useLocationSearch();
  const origin$ = useLocationSearch();
  const [selectedDestination, setSelectedDestination] = useState<SearchResultPlace | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [routes, setRoutes] = useState<RouteOption[]>([]);

  // Navigation menu & copy state
  const [openNavMenuId, setOpenNavMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Origin typeahead ──────────────────────────────────────────────
  const [customOrigin, setCustomOrigin] = useState<Coordinates | null>(null);
  const [activeSearchField, setActiveSearchField] = useState<"origin" | "destination" | null>(null);
  const [routeInputError, setRouteInputError] = useState("");
  const originQuery = origin$.query;
  const destinationQuery = dest.query;

  const lastRerouteOriginRef = useRef<Coordinates | null>(null);
  const lastRerouteAtRef = useRef<number>(0);
  const lastIncidentsKeyRef = useRef<string>("");
  const rerouteRequestIdRef = useRef<number>(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setActiveSearchField(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const origin = useMemo(
    () => customOrigin ?? userLocation,
    [customOrigin, userLocation]
  );

  const originLabel = useMemo(() => {
    if (customOrigin) return originQuery || "Custom Location";
    if (userLocation) return "Your GPS Location";
    return "";
  }, [customOrigin, originQuery, userLocation]);

  const incidentsKey = useMemo(
    () =>
      incidents
        .filter((inc) => inc.status === "active" || inc.status === "receding")
        .map((inc) => `${inc.id}:${inc.status}:${inc.severity}:${inc.updatedAt}`)
        .sort()
        .join("|"),
    [incidents]
  );

  // Sync destination from prop (e.g. from global search suggestion click)
  useEffect(() => {
    if (destination !== undefined) {
      if (destination === null) {
        setSelectedDestination(null);
        dest.setQuery("");
        setRoutes([]);
        onRoutesCalculated?.([]);
        onRouteChange(undefined);
      } else if (destination.id !== selectedDestination?.id) {
        setSelectedDestination(destination);
        dest.setQuery(destination.name);
        if (!origin) return;
        setIsCalculating(true);
        calculateRoadRoutes(origin, destination.coordinates, incidents)
          .then((computedRoutes) => {
            setRoutes(computedRoutes);
            onRoutesCalculated?.(computedRoutes);
            if (computedRoutes.length > 0) onRouteChange(computedRoutes[0]);
          })
          .catch((err) => {
            console.error("Failed to calculate routes:", err);
          })
          .finally(() => setIsCalculating(false));
      }
    }
  }, [destination, origin]);

  function selectOrigin(place: SearchResultPlace) {
    setCustomOrigin(place.coordinates);
    origin$.setQuery(place.name);
    origin$.clearSuggestions();
    setRouteInputError("");
    lastRerouteOriginRef.current = null;
    lastRerouteAtRef.current = 0;
    onMapPickModeChange?.(null);
  }

  function clearCustomOrigin() {
    setCustomOrigin(null);
    origin$.setQuery("");
    origin$.clearSuggestions();
    lastRerouteOriginRef.current = null;
    lastRerouteAtRef.current = 0;
    onMapPickModeChange?.(null);
  }

  async function selectDestination(place: SearchResultPlace) {
    if (!origin) {
      setRouteInputError("Set source location first.");
      return;
    }
    setRouteInputError("");
    setSelectedDestination(place);
    dest.setQuery(place.name);
    dest.clearSuggestions();
    onDestinationSelect(place);

    setIsCalculating(true);
    try {
      const computedRoutes = await calculateRoadRoutes(origin, place.coordinates, incidents);
      setRoutes(computedRoutes);
      onRoutesCalculated?.(computedRoutes);
      if (computedRoutes.length > 0) onRouteChange(computedRoutes[0]);
      lastRerouteOriginRef.current = origin;
      lastRerouteAtRef.current = Date.now();
      lastIncidentsKeyRef.current = incidentsKey;
      onMapPickModeChange?.(null);
    } finally {
      setIsCalculating(false);
    }
  }

  function clearDestination() {
    dest.setQuery("");
    dest.clearSuggestions();
    setSelectedDestination(null);
    onDestinationSelect(null);
    onRouteChange(undefined);
    setRoutes([]);
    onRoutesCalculated?.([]);
    lastRerouteOriginRef.current = null;
    lastRerouteAtRef.current = 0;
    lastIncidentsKeyRef.current = "";
    onRouteDestinationChange?.(null);
    onMapPickModeChange?.(null);
  }

  function toggleMapPickMode(mode: "origin" | "destination") {
    onMapPickModeChange?.(mapPickMode === mode ? null : mode);
  }

  async function useGpsAsSource() {
    if (!userLocation) return;
    setCustomOrigin(userLocation);
    setRouteInputError("");
    try {
      const res = await fetch(`/api/geocode?lat=${userLocation.lat}&lng=${userLocation.lng}`);
      if (res.ok) {
        const data = await res.json();
        const label = [data.roadName, data.landmark].filter(Boolean).join(", ").trim();
        origin$.setQuery(label || "Current Location");
      } else {
        origin$.setQuery("Current Location");
      }
    } catch {
      origin$.setQuery("Current Location");
    }
    origin$.clearSuggestions();
  }

  async function swapSourceDestination() {
    if (!origin || !selectedDestination) return;
    const oldOrigin = origin;
    const oldOriginName = originQuery.trim() || originLabel || "Current Location";
    const oldDestination = selectedDestination;

    setCustomOrigin(oldDestination.coordinates);
    origin$.setQuery(oldDestination.name);
    origin$.clearSuggestions();

    const newDestination: SearchResultPlace = {
      id: `swap-dest-${Date.now()}`,
      name: oldOriginName,
      fullName: oldOriginName,
      coordinates: oldOrigin
    };
    await selectDestination(newDestination);
  }

  useEffect(() => {
    onRouteOriginChange?.(origin ?? null);
  }, [onRouteOriginChange, origin]);

  useEffect(() => {
    onRouteDestinationChange?.(selectedDestination?.coordinates ?? null);
  }, [onRouteDestinationChange, selectedDestination]);

  useEffect(() => {
    if (!mapPickedLocation) return;
    if (mapPickedLocation.mode === "origin") {
      setCustomOrigin(mapPickedLocation.coordinates);
      origin$.setQuery(
        `Pinned (${mapPickedLocation.coordinates.lat.toFixed(5)}, ${mapPickedLocation.coordinates.lng.toFixed(5)})`
      );
      origin$.clearSuggestions();
      setRouteInputError("");
      lastRerouteOriginRef.current = null;
      lastRerouteAtRef.current = 0;
    } else {
      const coords = mapPickedLocation.coordinates;
      const place: SearchResultPlace = {
        id: `pin-dest-${mapPickedLocation.token}`,
        name: `Pinned Destination (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
        fullName: `Pinned Destination at ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
        coordinates: coords
      };
      void selectDestination(place);
    }
    onMapPickHandled?.();
  }, [mapPickedLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-reroute when origin or incidents change ──────────────────
  useEffect(() => {
    if (!selectedDestination || !origin) return;

    const now = Date.now();
    const movedKm = lastRerouteOriginRef.current
      ? haversineDistanceKm(lastRerouteOriginRef.current, origin)
      : Number.POSITIVE_INFINITY;
    const incidentsChanged = incidentsKey !== lastIncidentsKeyRef.current;
    const shouldReroute =
      movedKm >= 0.05 || incidentsChanged || routes.length === 0 || !activeRoute;
    const tooSoon = now - lastRerouteAtRef.current < 8000;
    if (!shouldReroute || (tooSoon && !incidentsChanged)) return;

    const requestId = ++rerouteRequestIdRef.current;
    setIsCalculating(true);

    void (async () => {
      try {
        const computedRoutes = await calculateRoadRoutes(
          origin,
          selectedDestination.coordinates,
          incidents
        );
        if (rerouteRequestIdRef.current !== requestId) return;
        setRoutes(computedRoutes);
        onRoutesCalculated?.(computedRoutes);
        if (computedRoutes.length > 0) onRouteChange(computedRoutes[0]);
        lastRerouteOriginRef.current = origin;
        lastRerouteAtRef.current = Date.now();
        lastIncidentsKeyRef.current = incidentsKey;
      } finally {
        if (rerouteRequestIdRef.current === requestId) setIsCalculating(false);
      }
    })();
  }, [activeRoute, incidents, incidentsKey, onRouteChange, origin, routes.length, selectedDestination]);

  // ── Helpers ───────────────────────────────────────────────────────
  function getHealthMeta(health: number): { label: string; color: string } {
    if (health === 100) return { label: "Excellent", color: "var(--green)" };
    if (health >= 80)   return { label: "Good",      color: "var(--green)" };
    if (health >= 60)   return { label: "Moderate",  color: "var(--blue)" };
    if (health >= 40)   return { label: "Poor",      color: "var(--amber)" };
    if (health >= 20)   return { label: "Dangerous", color: "#ea580c" };
    return              { label: "Blocked",  color: "var(--red)" };
  }

  function getRiskStyle(risk: string): { bg: string; text: string } {
    if (risk === "LOW")    return { bg: "#f0fdf4", text: "#166534" };
    if (risk === "MEDIUM") return { bg: "#eff6ff", text: "#1e40af" };
    if (risk === "HIGH")   return { bg: "#fff7ed", text: "#9a3412" };
    return                  { bg: "#fef2f2", text: "#991b1b" };
  }

  function openNavigation(routeOption: RouteOption, provider: "google" | "organic") {
    const start = origin ?? routeOption.coordinates[0];
    const dest =
      selectedDestination?.coordinates ??
      routeOption.coordinates[routeOption.coordinates.length - 1];
    if (!start || !dest) return;
    const url =
      provider === "google"
        ? `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving`
        : `omim://route?sll=${start.lat},${start.lng}&dll=${dest.lat},${dest.lng}&type=vehicle`;
    window.open(url, "_blank");
  }

  function handleCopyCoordinates(routeOption: RouteOption) {
    const start = origin ?? routeOption.coordinates[0];
    const dest =
      selectedDestination?.coordinates ??
      routeOption.coordinates[routeOption.coordinates.length - 1];
    if (!start || !dest) return;
    navigator.clipboard.writeText(
      `Start: ${start.lat},${start.lng} -> End: ${dest.lat},${dest.lng}`
    );
    setCopiedId(routeOption.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const isDestinationFlooded = selectedDestination
    ? incidents.some(
        (inc) =>
          inc.status !== "resolved" &&
          inc.status !== "archived" &&
          haversineDistanceKm(selectedDestination.coordinates, inc.coordinates) < 1.0
      )
    : false;

  const areAllRoutesBlocked =
    routes.length > 0 && routes.every((r) => (r.analysis?.routeHealth ?? 100) < 50);
  const primaryRoute = useMemo(
    () => routes.find((r) => r.id === "osrm-0") ?? null,
    [routes]
  );
  const isPrimaryRouteBlocked = primaryRoute
    ? (primaryRoute.analysis?.routeHealth ?? 100) === 0 ||
      primaryRoute.analysis?.floodRisk === "EXTREME"
    : false;

  // ── Route card renderer ───────────────────────────────────────────
  function renderRouteCard(
    option: RouteOption,
    availableIndex: number,
    isBlockedSection: boolean,
    isPrimaryBlockedRoute = false
  ) {
    const isSelected = activeRoute?.id === option.id;
    const analysis = option.analysis;
    const risk = analysis?.floodRisk ?? "LOW";
    const healthVal = analysis?.routeHealth ?? 100;
    const healthMeta = getHealthMeta(healthVal);
    const riskStyle = getRiskStyle(risk);
    const isBlocked = isBlockedSection || healthVal === 0 || risk === "EXTREME";

    return (
      <article
        key={option.id}
        className={[
          "route-card2",
          isSelected ? "route-card2--active" : "",
          isBlocked ? "route-card2--blocked" : "",
          isPrimaryBlockedRoute ? "route-card2--critical-blocked" : ""
        ].join(" ")}
      >
        {/* Card header */}
        <div className="route-card2-header">
          <button
            type="button"
            className="route-card2-title-btn"
            onClick={() => !isBlocked && onRouteChange(option)}
          >
            <strong className="route-card2-name">{option.name}</strong>
            {availableIndex === 0 && !isBlocked ? (
              <span className="route-recommended-badge">
                <ShieldCheck size={12} /> Recommended
              </span>
            ) : null}
            {isBlocked ? (
              <span className="route-blocked-badge">
                <Ban size={12} /> Impassable
              </span>
            ) : null}
            {isPrimaryBlockedRoute ? (
              <span className="route-primary-blocked-tag">Primary route blocked</span>
            ) : null}
          </button>
          <span
            className="route-risk-badge"
            style={{ background: riskStyle.bg, color: riskStyle.text }}
          >
            {risk}
          </span>
        </div>

        {option.summary ? <p className="route-card2-summary">{option.summary}</p> : null}

        {/* Stats row */}
        <div className="route-card2-stats">
          <span className="route-stat">
            <Route size={12} />
            {option.distanceKm} km
          </span>
          <span className="route-stat">
            <Clock3 size={12} />
            {option.estimatedMinutes} min
            {analysis && analysis.estimatedDelayMinutes > 0 ? (
              <span className="route-stat-delay">+{analysis.estimatedDelayMinutes}m delay</span>
            ) : null}
          </span>
          {analysis ? (
            <span className="route-stat">
              <Layers size={12} />
              <span style={{ color: healthMeta.color, fontWeight: 800 }}>
                {analysis.routeHealth}% health
              </span>
            </span>
          ) : null}
        </div>

        {/* Risk explanations */}
        {analysis && analysis.riskExplanations.length > 0 ? (
          <ul className="route-risk-explanations">
            {analysis.riskExplanations.map((exp, i) => (
              <li key={i}>{exp}</li>
            ))}
          </ul>
        ) : null}

        {/* Affected incidents */}
        {analysis && analysis.affectedIncidentsCount > 0 ? (
          <div className="route-affected-incidents">
            <span className="route-affected-label">Hazards on this route:</span>
            <div className="route-affected-chips">
              {analysis.affectedIncidents.map((inc) => {
                const TypeIcon = incidentTypeMeta[inc.type]?.icon ?? MapPin;
                return (
                  <button
                    key={inc.id}
                    type="button"
                    className="route-incident-chip"
                    onClick={() => onSelectIncident?.(inc.id)}
                  >
                    <TypeIcon size={12} className="shrink-0" />
                    {inc.roadName}
                    <span className="route-incident-severity">
                      {inc.severity.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Actions — hidden for blocked routes */}
        {!isBlocked ? (
          <div className="route-card2-actions">
            <button
              type="button"
              className={`route-view-btn ${isSelected ? "route-view-btn--active" : ""}`}
              onClick={() => onRouteChange(option)}
            >
              {isSelected ? <><CheckCircle2 size={14} /> Viewing</> : "View on Map"}
            </button>

            <div className="route-nav-menu-wrap">
              <button
                type="button"
                className="route-nav-trigger"
                onClick={() => setOpenNavMenuId(openNavMenuId === option.id ? null : option.id)}
                title="Open in navigation app"
              >
                <ExternalLink size={14} />
              </button>
              {openNavMenuId === option.id ? (
                <div className="route-nav-dropdown">
                  <button
                    type="button"
                    className="route-nav-btn--google"
                    onClick={() => { openNavigation(option, "google"); setOpenNavMenuId(null); }}
                  >
                    <ExternalLink size={15} />
                    Google Maps
                  </button>
                  <button type="button" onClick={() => { openNavigation(option, "organic"); setOpenNavMenuId(null); }}>
                    Organic Maps
                  </button>
                  <button type="button" onClick={() => { handleCopyCoordinates(option); setOpenNavMenuId(null); }}>
                    <span>Copy Coords</span><Copy size={12} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="route-blocked-footer">
            <Ban size={12} />
            <span>Road is impassable — use an alternate route above</span>
          </div>
        )}

        {copiedId === option.id ? (
          <div className="route-copied-toast">Copied!</div>
        ) : null}
      </article>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <section className="route-planner-panel" aria-label="Safe Route Navigation">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="route-planner-header">
        <div>
          <p className="eyebrow">Flood Advisor Mode</p>
          <h2>Safe Route Navigation</h2>
        </div>
        <div className="route-header-actions">
          <button
            type="button"
            className="route-report-btn"
            onClick={onOpenReport}
            title="Report a flood incident on the map"
          >
            <Plus size={14} />
            <span>Report Flood</span>
          </button>
          <button
            type="button"
            className="top-gps-btn"
            onClick={() => { void useGpsAsSource(); }}
            disabled={!userLocation}
            title="Set current GPS location as starting address"
          >
            <LocateFixed size={14} />
            <span>Your Location</span>
          </button>
        </div>
      </div>

      {/* ── Direct Source & Destination Search Card ───────── */}
      <div className="route-inputs-card" ref={cardRef}>

        {/* Source (From) Search Field */}
        <div className="route-field-group">
          <div className="route-input-box">
            <span className="route-field-dot route-field-dot--origin" title="Start location" />
            <div className="route-input-flex">
              <span className="route-field-label">FROM</span>
              <input
                type="text"
                className="route-search-input"
                placeholder="Search source (e.g. Aluva, Edappally…)"
                value={originQuery}
                onFocus={() => setActiveSearchField("origin")}
                onChange={(e) => {
                  origin$.setQuery(e.target.value);
                  if (!e.target.value) {
                    origin$.clearSuggestions();
                    clearCustomOrigin();
                  }
                }}
                onKeyDown={(e) => {
                  origin$.handleKeyDown(e, selectOrigin);
                  if (
                    e.key === "Enter" &&
                    !e.defaultPrevented &&
                    origin$.suggestions.length > 0
                  ) {
                    e.preventDefault();
                    selectOrigin(origin$.suggestions[0]);
                  }
                }}
              />
            </div>
            <div className="route-field-actions">
              {origin$.isLoading ? (
                <Loader2 size={14} className="report-spin" />
              ) : originQuery || customOrigin ? (
                <button
                  type="button"
                  className="route-icon-action-btn"
                  onClick={clearCustomOrigin}
                  title="Clear source location"
                >
                  <X size={14} />
                </button>
              ) : null}

              <button
                type="button"
                className={`route-map-pick-btn ${mapPickMode === "origin" ? "route-map-pick-btn--active" : ""}`}
                onClick={() => toggleMapPickMode("origin")}
                title="Pick starting location on map"
              >
                <MapPin size={14} />
                <span>Map</span>
              </button>
            </div>
          </div>

          {/* Source Suggestions Floating Dropdown */}
          {activeSearchField === "origin" && origin$.suggestions.length > 0 ? (
            <ul className="route-suggestions-dropdown">
              {origin$.suggestions.map((r, idx) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`route-suggestion-item ${origin$.highlightedIndex === idx ? "is-highlighted" : ""}`}
                    onClick={() => selectOrigin(r)}
                  >
                    <MapPin size={14} className="route-suggestion-icon route-suggestion-icon--origin" />
                    <div className="route-suggestion-text">
                      <strong>{r.name}</strong>
                      <small>{r.fullName}</small>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Central Swap Divider Button */}
        <div className="route-swap-divider">
          <div className="route-swap-line" />
          <button
            type="button"
            className="route-swap-center-btn"
            onClick={() => { void swapSourceDestination(); }}
            disabled={!origin || !selectedDestination}
            title="Swap source and destination"
          >
            <ArrowUpDown size={14} />
          </button>
          <div className="route-swap-line" />
        </div>

        {/* Destination (To) Search Field */}
        <div className="route-field-group">
          <div className="route-input-box">
            <span className="route-field-dot route-field-dot--dest" title="Destination location" />
            <div className="route-input-flex">
              <span className="route-field-label">TO</span>
              <input
                type="text"
                className="route-search-input"
                placeholder="Search destination (e.g. Marine Drive, Thrissur…)"
                value={destinationQuery}
                onFocus={() => setActiveSearchField("destination")}
                onChange={(e) => {
                  dest.setQuery(e.target.value);
                  if (!e.target.value) {
                    clearDestination();
                  }
                }}
                onKeyDown={(e) => {
                  dest.handleKeyDown(e, (place) => {
                    void selectDestination(place);
                  });
                  if (
                    e.key === "Enter" &&
                    !e.defaultPrevented &&
                    dest.suggestions.length > 0
                  ) {
                    e.preventDefault();
                    void selectDestination(dest.suggestions[0]);
                  }
                }}
              />
            </div>
            <div className="route-field-actions">
              {dest.isLoading ? (
                <Loader2 size={14} className="report-spin" />
              ) : destinationQuery || selectedDestination ? (
                <button
                  type="button"
                  className="route-icon-action-btn"
                  onClick={clearDestination}
                  title="Clear destination"
                >
                  <X size={14} />
                </button>
              ) : null}

              <button
                type="button"
                className={`route-map-pick-btn ${mapPickMode === "destination" ? "route-map-pick-btn--active" : ""}`}
                onClick={() => toggleMapPickMode("destination")}
                title="Pick destination location on map"
              >
                <MapPin size={14} />
                <span>Map</span>
              </button>
            </div>
          </div>

          {/* Destination Suggestions Floating Dropdown */}
          {activeSearchField === "destination" && dest.suggestions.length > 0 ? (
            <ul className="route-suggestions-dropdown">
              {dest.suggestions.map((r, idx) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`route-suggestion-item ${dest.highlightedIndex === idx ? "is-highlighted" : ""}`}
                    onClick={() => { void selectDestination(r); }}
                  >
                    <MapPin size={14} className="route-suggestion-icon route-suggestion-icon--dest" />
                    <div className="route-suggestion-text">
                      <strong>{r.name}</strong>
                      <small>{r.fullName}</small>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Input Errors */}
        {origin$.error ? <p className="location-search-error">{origin$.error}</p> : null}
        {dest.error ? <p className="location-search-error">{dest.error}</p> : null}
        {routeInputError ? <p className="location-search-error">{routeInputError}</p> : null}
      </div>

      {/* ── Flood warning banners ───────────────────────── */}
      {isDestinationFlooded ? (
        <div className="route-alert route-alert--warn">
          <AlertTriangle size={14} className="shrink-0" />
          <span>Destination has active flood reports nearby. Proceed with caution.</span>
        </div>
      ) : null}

      {areAllRoutesBlocked ? (
        <div className="route-alert route-alert--danger">
          <AlertTriangle size={14} className="shrink-0" />
          <span>No safe route found. Roads are extensively flooded or blocked.</span>
        </div>
      ) : null}

      {/* ── Routes section ──────────────────────────────── */}
      <div className="route-results-section">
        <div className="route-results-heading">
          <div>
            <p className="eyebrow">Calculated Paths</p>
            <h2>Route Comparison</h2>
          </div>
          {activeRoute ? (
            <button type="button" className="text-button" onClick={clearDestination}>
              Clear All
            </button>
          ) : null}
        </div>

        {isCalculating ? (
          <div className="route-calculating">
            <Loader2 size={16} className="report-spin" />
            <span>Analyzing flood paths and safety metrics…</span>
          </div>
        ) : routes.length === 0 ? (
          <div className="route-empty-state">
            <Navigation2 size={24} strokeWidth={1.5} />
            <p>Search a destination above to compute flood-safe driving routes.</p>
          </div>
        ) : (() => {
          const available = routes.filter(
            (r) => (r.analysis?.routeHealth ?? 100) > 0 && r.analysis?.floodRisk !== "EXTREME"
          );
          const blocked = routes.filter(
            (r) => (r.analysis?.routeHealth ?? 100) === 0 || r.analysis?.floodRisk === "EXTREME"
          );
          const suggestedAlternate = available[0];
          const blockedSorted = [...blocked].sort((a, b) => {
            if (a.id === "osrm-0") return -1;
            if (b.id === "osrm-0") return 1;
            return 0;
          });

          return (
            <div className="route-cards-list">
              {isPrimaryRouteBlocked && primaryRoute ? (
                <div className="route-primary-blocked-callout">
                  <span className="route-primary-blocked-title">
                    <Ban size={14} /> Fastest direct route is flooded/blocked
                  </span>
                  <span className="route-primary-blocked-meta">
                    {primaryRoute.name} · {primaryRoute.distanceKm} km · {primaryRoute.estimatedMinutes} min
                  </span>
                  {suggestedAlternate ? (
                    <button
                      type="button"
                      className="route-primary-alternate-btn"
                      onClick={() => onRouteChange(suggestedAlternate)}
                    >
                      Suggested alternate: {suggestedAlternate.name} ({suggestedAlternate.estimatedMinutes} min)
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* ── Available routes ──────────────────────── */}
              {available.length > 0 ? (
                <>
                  <div className="route-section-label route-section-label--available">
                    <CheckCircle2 size={14} />
                    {available.length} Available Route{available.length > 1 ? "s" : ""}
                  </div>
                  {available.map((option, index) => renderRouteCard(option, index, false))}
                </>
              ) : (
                <div className="route-all-blocked-banner">
                  <AlertTriangle size={16} />
                  <span>No passable routes found. All corridors are flooded or blocked.</span>
                </div>
              )}

              {/* ── Blocked routes ────────────────────────── */}
              {blocked.length > 0 ? (
                <>
                  <div className="route-section-label route-section-label--blocked">
                    <Ban size={14} />
                    {blocked.length} Blocked / Impassable Route{blocked.length > 1 ? "s" : ""}
                  </div>
                  {blockedSorted.map((option) =>
                    renderRouteCard(option, -1, true, option.id === "osrm-0")
                  )}
                </>
              ) : null}

              {/* ── Comparative table ─────────────────────── */}
              {routes.length > 1 ? (
                <div className="route-compare-table">
                  <p className="route-compare-title">
                    <Info size={12} />
                    Summary comparison
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Route</th>
                        <th>Dist</th>
                        <th>Time</th>
                        <th>Health</th>
                        <th>Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map((r) => {
                        const rs = getRiskStyle(r.analysis?.floodRisk ?? "LOW");
                        const isRouteBlocked =
                          (r.analysis?.routeHealth ?? 100) === 0 ||
                          r.analysis?.floodRisk === "EXTREME";
                        return (
                          <tr
                            key={r.id}
                            className={[
                              activeRoute?.id === r.id ? "is-selected-row" : "",
                              isRouteBlocked ? "is-blocked-row" : ""
                            ].join(" ")}
                          >
                            <td className="route-compare-name">
                              {isRouteBlocked ? <Ban size={14} className="inline" /> : ""}{r.name}
                            </td>
                            <td>{r.distanceKm} km</td>
                            <td>{r.estimatedMinutes} m</td>
                            <td
                              style={{
                                color: getHealthMeta(r.analysis?.routeHealth ?? 100).color,
                                fontWeight: 800
                              }}
                            >
                              {r.analysis?.routeHealth ?? 100}%
                            </td>
                            <td>
                              <span
                                className="route-compare-risk"
                                style={{ background: rs.bg, color: rs.text }}
                              >
                                {r.analysis?.floodRisk ?? "LOW"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })()}
      </div>
    </section>
  );
}
