"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Copy,
  Crosshair,
  ExternalLink,
  Info,
  Layers,
  Loader2,
  MapPin,
  Navigation2,
  Route,
  Search,
  ShieldCheck,
  X
} from "lucide-react";
import {
  calculateRoadRoutes,
  haversineDistanceKm,
  type SearchResultPlace
} from "@/lib/routing";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import type { Coordinates, Incident, RouteOption } from "@/lib/types";

const DEFAULT_KOCHI_COORDS: Coordinates = { lat: 9.9769, lng: 76.2824 };

type SafeRoutePlannerProps = {
  destination?: SearchResultPlace | null;
  userLocation: Coordinates | null;
  incidents: Incident[];
  activeRoute?: RouteOption;
  onDestinationSelect: (place: SearchResultPlace | null) => void;
  onRouteChange: (route?: RouteOption) => void;
  onRoutesCalculated?: (routes: RouteOption[]) => void;
  onSelectIncident?: (id: string) => void;
};

export function SafeRoutePlanner({
  destination,
  userLocation,
  incidents,
  activeRoute,
  onDestinationSelect,
  onRouteChange,
  onRoutesCalculated,
  onSelectIncident
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
  const [showOriginSearch, setShowOriginSearch] = useState(false);
  const originQuery = origin$.query;
  const destinationQuery = dest.query;

  const lastRerouteOriginRef = useRef<Coordinates | null>(null);
  const lastRerouteAtRef = useRef<number>(0);
  const lastIncidentsKeyRef = useRef<string>("");
  const rerouteRequestIdRef = useRef<number>(0);

  const origin = useMemo(
    () => customOrigin ?? userLocation ?? DEFAULT_KOCHI_COORDS,
    [customOrigin, userLocation]
  );

  const originLabel = useMemo(() => {
    if (customOrigin) return originQuery || "Custom Location";
    if (userLocation) return "Your GPS Location";
    return "Kochi (Default)";
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
    setShowOriginSearch(false);
    lastRerouteOriginRef.current = null;
    lastRerouteAtRef.current = 0;
  }

  function clearCustomOrigin() {
    setCustomOrigin(null);
    origin$.setQuery("");
    origin$.clearSuggestions();
    setShowOriginSearch(false);
    lastRerouteOriginRef.current = null;
    lastRerouteAtRef.current = 0;
  }

  async function selectDestination(place: SearchResultPlace) {
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
  }

  // ── Auto-reroute when origin or incidents change ──────────────────
  useEffect(() => {
    if (!selectedDestination) return;

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
    const dest =
      selectedDestination?.coordinates ??
      routeOption.coordinates[routeOption.coordinates.length - 1];
    const url =
      provider === "google"
        ? `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving`
        : `omim://route?sll=${origin.lat},${origin.lng}&dll=${dest.lat},${dest.lng}&type=vehicle`;
    window.open(url, "_blank");
  }

  function handleCopyCoordinates(routeOption: RouteOption) {
    const dest =
      selectedDestination?.coordinates ??
      routeOption.coordinates[routeOption.coordinates.length - 1];
    navigator.clipboard.writeText(
      `Start: ${origin.lat},${origin.lng} -> End: ${dest.lat},${dest.lng}`
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

  // ── Route card renderer ───────────────────────────────────────────
  function renderRouteCard(option: RouteOption, availableIndex: number, isBlockedSection: boolean) {
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
          isBlocked ? "route-card2--blocked" : ""
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
                <ShieldCheck size={10} /> Recommended
              </span>
            ) : null}
            {isBlocked ? (
              <span className="route-blocked-badge">
                <Ban size={10} /> Impassable
              </span>
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
              {analysis.affectedIncidents.map((inc) => (
                <button
                  key={inc.id}
                  type="button"
                  className="route-incident-chip"
                  onClick={() => onSelectIncident?.(inc.id)}
                >
                  📍 {inc.roadName}
                  <span className="route-incident-severity">
                    {inc.severity.replace(/_/g, " ").toLowerCase()}
                  </span>
                </button>
              ))}
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
              {isSelected ? <><CheckCircle2 size={13} /> Viewing</> : "View on Map"}
            </button>

            <div className="route-nav-menu-wrap">
              <button
                type="button"
                className="route-nav-trigger"
                onClick={() => setOpenNavMenuId(openNavMenuId === option.id ? null : option.id)}
                title="Open in navigation app"
              >
                <ExternalLink size={13} />
              </button>
              {openNavMenuId === option.id ? (
                <div className="route-nav-dropdown">
                  <button type="button" onClick={() => { openNavigation(option, "google"); setOpenNavMenuId(null); }}>
                    Google Maps
                  </button>
                  <button type="button" onClick={() => { openNavigation(option, "organic"); setOpenNavMenuId(null); }}>
                    Organic Maps
                  </button>
                  <button type="button" onClick={() => { handleCopyCoordinates(option); setOpenNavMenuId(null); }}>
                    <span>Copy Coords</span><Copy size={10} />
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
        <Navigation2 size={20} className="brand-accent" />
      </div>

      {/* ── From / To card ──────────────────────────────── */}
      <div className="route-inputs-card">

        {/* From row */}
        <div className="route-input-row">
          <span className="route-dot route-dot--origin" />
          <div className="route-input-content">
            <span className="route-input-eyebrow">From</span>
            <span className={`route-input-value ${customOrigin ? "route-input-value--custom" : ""}`}>
              {originLabel}
            </span>
          </div>
          <div className="route-input-actions">
            <button
              type="button"
              className="route-chip-btn"
              onClick={() => setShowOriginSearch((v) => !v)}
            >
              {showOriginSearch ? <X size={12} /> : <Search size={12} />}
              {showOriginSearch ? "Cancel" : "Change"}
            </button>
            {customOrigin ? (
              <button
                type="button"
                className="route-chip-btn route-chip-btn--ghost"
                onClick={clearCustomOrigin}
                title="Use GPS"
              >
                <Crosshair size={12} />
              </button>
            ) : null}
          </div>
        </div>

        {/* Origin search panel */}
        {showOriginSearch ? (
          <div className="route-inline-search">
            <div className="location-search-row">
              <div className="location-search-input-wrap">
                <Search size={13} className="location-search-icon" />
                <input
                  type="text"
                  className="location-search-input"
                  placeholder="e.g. Aluva, Edappally, Kakkanad…"
                  value={originQuery}
                  autoFocus
                  onChange={(e) => {
                    origin$.setQuery(e.target.value);
                    if (!e.target.value) origin$.clearSuggestions();
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
                {originQuery ? (
                  <button type="button" className="location-search-clear"
                    onClick={() => { origin$.setQuery(""); origin$.clearSuggestions(); }}>
                    <X size={12} />
                  </button>
                ) : null}
              </div>
              <button type="button" className="location-search-btn"
                onClick={() => origin$.setQuery(originQuery)}
                disabled={origin$.isLoading || originQuery.trim().length < 2}>
                {origin$.isLoading ? <Loader2 size={13} className="report-spin" /> : <Search size={13} />}
              </button>
            </div>
            {origin$.error ? <p className="location-search-error">{origin$.error}</p> : null}
            {origin$.suggestions.length > 0 ? (
              <ul className="location-search-results">
                {origin$.suggestions.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => selectOrigin(r)}>
                      <strong>📍 {r.name}</strong>
                      <small>{r.fullName}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* Divider */}
        <div className="route-inputs-divider" />

        {/* To row */}
        <div className="route-input-row">
          <span className="route-dot route-dot--dest" />
          <div className="route-input-content">
            <span className="route-input-eyebrow">To</span>
            {selectedDestination ? (
              <span className="route-input-value route-input-value--selected">
                {selectedDestination.name}
              </span>
            ) : (
              <span className="route-input-value route-input-value--empty">
                Search a destination…
              </span>
            )}
          </div>
          {selectedDestination ? (
            <button type="button" className="route-chip-btn route-chip-btn--ghost"
              onClick={clearDestination} title="Clear destination">
              <X size={12} />
            </button>
          ) : null}
        </div>

        {/* Destination search */}
        <div className="route-inline-search">
          <div className="location-search-row">
            <div className="location-search-input-wrap">
              <MapPin size={13} className="location-search-icon" />
              <input
                type="text"
                className="location-search-input"
                placeholder="e.g. Aluva, Marine Drive, Thrissur…"
                value={destinationQuery}
                onChange={(e) => {
                  dest.setQuery(e.target.value);
                  if (!e.target.value) dest.clearSuggestions();
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
              {destinationQuery ? (
                <button type="button" className="location-search-clear"
                  onClick={() => { dest.setQuery(""); dest.clearSuggestions(); }}>
                  <X size={12} />
                </button>
              ) : null}
            </div>
            <button type="button" className="location-search-btn"
              onClick={() => dest.setQuery(destinationQuery)}
              disabled={dest.isLoading || destinationQuery.trim().length < 2}>
              {dest.isLoading ? <Loader2 size={13} className="report-spin" /> : <Search size={13} />}
            </button>
          </div>
          {dest.error ? <p className="location-search-error">{dest.error}</p> : null}
          {dest.suggestions.length > 0 ? (
            <ul className="location-search-results">
              {dest.suggestions.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => selectDestination(r)}>
                    <strong>📍 {r.name}</strong>
                    <small>{r.fullName}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
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
            <Loader2 size={15} className="report-spin" />
            <span>Analyzing flood paths and safety metrics…</span>
          </div>
        ) : routes.length === 0 ? (
          <div className="route-empty-state">
            <Navigation2 size={28} strokeWidth={1.5} />
            <p>Search a destination above to compute flood-safe driving routes.</p>
          </div>
        ) : (() => {
          const available = routes.filter(
            (r) => (r.analysis?.routeHealth ?? 100) > 0 && r.analysis?.floodRisk !== "EXTREME"
          );
          const blocked = routes.filter(
            (r) => (r.analysis?.routeHealth ?? 100) === 0 || r.analysis?.floodRisk === "EXTREME"
          );

          return (
            <div className="route-cards-list">

              {/* ── Available routes ──────────────────────── */}
              {available.length > 0 ? (
                <>
                  <div className="route-section-label route-section-label--available">
                    <CheckCircle2 size={13} />
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
                    <Ban size={13} />
                    {blocked.length} Blocked / Impassable Route{blocked.length > 1 ? "s" : ""}
                  </div>
                  {blocked.map((option) => renderRouteCard(option, -1, true))}
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
                              {isRouteBlocked ? "🚫 " : ""}{r.name}
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
