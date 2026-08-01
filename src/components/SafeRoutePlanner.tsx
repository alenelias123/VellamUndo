"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock3, Navigation2, Route, Search, ShieldCheck } from "lucide-react";
import { calculateRoadRoutes, geocodeDestination, type SearchResultPlace } from "@/lib/routing";
import type { Coordinates, FloodReport, RouteOption } from "@/lib/types";

type SafeRoutePlannerProps = {
  userLocation: Coordinates | null;
  reports: FloodReport[];
  activeRoute?: RouteOption;
  onDestinationSelect: (place: SearchResultPlace | null) => void;
  onRouteChange: (route?: RouteOption) => void;
};

export function SafeRoutePlanner({
  userLocation,
  reports,
  activeRoute,
  onDestinationSelect,
  onRouteChange
}: SafeRoutePlannerProps) {
  const [destinationQuery, setDestinationQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultPlace[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<SearchResultPlace | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [routes, setRoutes] = useState<RouteOption[]>([]);

  // Default origin: User live GPS location or Kochi fallback
  const origin: Coordinates = userLocation || { lat: 9.9769, lng: 76.2824 };

  // Geocode search
  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!destinationQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await geocodeDestination(destinationQuery);
      setSearchResults(results);
      if (results.length > 0) {
        selectDestination(results[0]);
      }
    } finally {
      setIsSearching(false);
    }
  }

  async function selectDestination(place: SearchResultPlace) {
    setSelectedDestination(place);
    setSearchResults([]);
    setDestinationQuery(place.name);
    onDestinationSelect(place);

    // Calculate OSRM routes
    setIsCalculating(true);
    try {
      const computedRoutes = await calculateRoadRoutes(origin, place.coordinates, reports);
      setRoutes(computedRoutes);
      if (computedRoutes.length > 0) {
        onRouteChange(computedRoutes[0]);
      }
    } finally {
      setIsCalculating(false);
    }
  }

  return (
    <section className="panel-stack google-maps-panel" aria-label="Google Maps Route Navigation">
      <div className="panel-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Google Maps Directions</p>
            <h2>Destination Navigation</h2>
          </div>
          <Navigation2 size={20} className="brand-accent" />
        </div>

        {/* Origin Pill */}
        <div className="location-pill-row">
          <span className="pill-dot origin-dot"></span>
          <span className="pill-label">
            <strong>Origin:</strong> {userLocation ? "Your Realtime Location (GPS)" : "Kochi (Default)"}
          </span>
        </div>

        {/* Destination Search Form */}
        <form className="destination-search-form" onSubmit={handleSearch}>
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search destination (e.g. Aluva, Marine Drive, Thrissur)..."
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
            />
          </div>

          <button className="primary-action destination-search-btn" type="submit" disabled={isSearching}>
            {isSearching ? "Searching..." : "Search Destination"}
          </button>
        </form>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 ? (
          <ul className="search-results-list">
            {searchResults.map((result) => (
              <li key={result.id}>
                <button type="button" onClick={() => selectDestination(result)}>
                  <strong>📍 {result.name}</strong>
                  <small>{result.fullName}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Calculated Routes List */}
      <div className="panel-section route-options">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Routes</p>
            <h2>Flood-Avoidance Driving Options</h2>
          </div>
          {activeRoute ? (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                onRouteChange(undefined);
                setSelectedDestination(null);
                onDestinationSelect(null);
                setRoutes([]);
              }}
            >
              Clear Route
            </button>
          ) : null}
        </div>

        {isCalculating ? (
          <div className="loading-routes">Calculating safe road polylines via OSRM...</div>
        ) : routes.length === 0 ? (
          <p className="muted">Search and select a destination to compute flood-safe driving routes.</p>
        ) : (
          routes.map((option, index) => (
            <button
              type="button"
              className={`route-card ${activeRoute?.id === option.id ? "is-active" : ""}`}
              key={option.id}
              onClick={() => onRouteChange(option)}
            >
              <span className="route-card-title">
                <strong>{option.name}</strong>
                {index === 0 ? (
                  <span className="safe-badge">
                    <ShieldCheck size={14} />
                    Recommended
                  </span>
                ) : null}
              </span>
              <span className="muted">{option.summary}</span>
              <span className="route-stats">
                <span>
                  <Route size={14} />
                  {option.distanceKm} km
                </span>
                <span>
                  <Clock3 size={14} />
                  {option.estimatedMinutes} min
                </span>
                <span className={option.floodExposure > 3 ? "danger-exposure" : "safe-exposure"}>
                  <AlertTriangle size={14} />
                  {option.floodExposure} flood risk
                </span>
              </span>
              {option.warnings.length > 0 ? (
                <span className="route-warning">{option.warnings[0]}</span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </section>
  );
}
