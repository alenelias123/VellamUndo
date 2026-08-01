"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Navigation2,
  Route,
  Search,
  ShieldCheck,
  ExternalLink,
  Copy,
  Info,
  Layers,
  ArrowRight,
  TrendingDown
} from "lucide-react";
import { calculateRoadRoutes, geocodeDestination, haversineDistanceKm, type SearchResultPlace } from "@/lib/routing";
import type { Coordinates, Incident, RouteOption, SeverityLevel } from "@/lib/types";

type SafeRoutePlannerProps = {
  userLocation: Coordinates | null;
  incidents: Incident[];
  activeRoute?: RouteOption;
  onDestinationSelect: (place: SearchResultPlace | null) => void;
  onRouteChange: (route?: RouteOption) => void;
  onRoutesCalculated?: (routes: RouteOption[]) => void;
  onSelectIncident: (id: string) => void;
};

export function SafeRoutePlanner({
  userLocation,
  incidents,
  activeRoute,
  onDestinationSelect,
  onRouteChange,
  onRoutesCalculated,
  onSelectIncident
}: SafeRoutePlannerProps) {
  const [destinationQuery, setDestinationQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultPlace[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<SearchResultPlace | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  
  // Navigation menu state
  const [openNavMenuId, setOpenNavMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      const computedRoutes = await calculateRoadRoutes(origin, place.coordinates, incidents);
      setRoutes(computedRoutes);
      if (onRoutesCalculated) {
        onRoutesCalculated(computedRoutes);
      }
      if (computedRoutes.length > 0) {
        onRouteChange(computedRoutes[0]);
      }
    } finally {
      setIsCalculating(false);
    }
  }

  // Helper for Route Health Score description
  function getHealthLabel(health: number): { label: string; color: string } {
    if (health === 100) return { label: "Excellent", color: "text-green-600" };
    if (health >= 80) return { label: "Good", color: "text-green-600" };
    if (health >= 60) return { label: "Moderate", color: "text-blue-600" };
    if (health >= 40) return { label: "Poor", color: "text-amber-600" };
    if (health >= 20) return { label: "Dangerous", color: "text-orange-600" };
    return { label: "Blocked", color: "text-red-600 font-bold" };
  }

  // Helper to generate Google / Organic Maps deep links
  function openNavigation(routeOption: RouteOption, provider: "google" | "organic") {
    const dest = selectedDestination?.coordinates || routeOption.coordinates[routeOption.coordinates.length - 1];
    
    if (provider === "google") {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving`;
      window.open(url, "_blank");
    } else {
      const url = `omim://route?sll=${origin.lat},${origin.lng}&dll=${dest.lat},${dest.lng}&type=vehicle`;
      window.open(url, "_blank");
    }
  }

  // Copy coordinates
  function handleCopyCoordinates(routeOption: RouteOption) {
    const dest = selectedDestination?.coordinates || routeOption.coordinates[routeOption.coordinates.length - 1];
    const text = `Start: ${origin.lat},${origin.lng} -> End: ${dest.lat},${dest.lng}`;
    navigator.clipboard.writeText(text);
    setCopiedId(routeOption.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Check if destination itself is flooded
  const isDestinationFlooded = selectedDestination
    ? incidents.some((inc) => {
        if (inc.status === "resolved" || inc.status === "archived") return false;
        const dist = haversineDistanceKm(selectedDestination.coordinates, inc.coordinates);
        return dist < 1.0; // within 1km
      })
    : false;

  // Check if all routes are flooded
  const areAllRoutesBlocked = routes.length > 0 && routes.every((r) => (r.analysis?.routeHealth || 100) < 50);

  return (
    <section className="panel-stack google-maps-panel" aria-label="Route Navigation Advisor">
      <div className="panel-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Flood Advisor Mode</p>
            <h2>Safe Route Navigation</h2>
          </div>
          <Navigation2 size={20} className="brand-accent" />
        </div>

        {/* Origin Pill */}
        <div className="location-pill-row mb-3 bg-gray-50 border border-gray-200 rounded p-2.5 flex items-center gap-2 text-xs">
          <span className="pill-dot origin-dot bg-green-500 w-2.5 h-2.5 rounded-full shrink-0" />
          <span className="pill-label text-gray-700 leading-normal">
            <strong>Origin:</strong> {userLocation ? "Your GPS Location" : "Kochi (Default Coordinates)"}
          </span>
        </div>

        {/* Destination Search Form */}
        <form className="destination-search-form" onSubmit={handleSearch}>
          <div className="search-input-wrapper flex items-center gap-1.5 border border-gray-300 rounded bg-white px-2.5 py-2 shadow-sm focus-within:border-blue-500">
            <Search size={18} className="search-icon text-gray-400" />
            <input
              type="text"
              placeholder="Search destination (e.g. Aluva, Kakkanad)..."
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
              className="w-full text-xs font-semibold focus:outline-none"
            />
          </div>

          <button className="primary-action destination-search-btn mt-2 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-xs shadow" type="submit" disabled={isSearching}>
            {isSearching ? "Searching..." : "Plan Driving Route"}
          </button>
        </form>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 ? (
          <ul className="search-results-list bg-white border border-gray-200 rounded shadow-lg max-h-[160px] overflow-y-auto mt-1 text-xs">
            {searchResults.map((result) => (
              <li key={result.id} className="border-b border-gray-100 hover:bg-gray-50">
                <button type="button" className="w-full text-left p-2" onClick={() => selectDestination(result)}>
                  <strong className="block text-gray-800">📍 {result.name}</strong>
                  <span className="text-[10px] text-gray-500 truncate block">{result.fullName}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Flood Bounding Banners */}
      {isDestinationFlooded ? (
        <div className="px-4 py-2 bg-red-50 border-y border-red-200 text-red-800 text-xs font-bold flex items-center gap-1.5 leading-normal">
          <AlertTriangle size={15} className="shrink-0" />
          <span>Destination currently has active flood reports near it. Proceed with caution.</span>
        </div>
      ) : null}

      {areAllRoutesBlocked ? (
        <div className="px-4 py-2 bg-red-100 border-y border-red-300 text-red-900 text-xs font-bold flex items-center gap-1.5 leading-normal">
          <AlertTriangle size={15} className="shrink-0" />
          <span>No low-risk route currently exists. Roads are extensively waist-deep or blocked.</span>
        </div>
      ) : null}

      {/* Calculated Routes List */}
      <div className="panel-section route-options flex-1">
        <div className="section-heading flex justify-between items-center">
          <div>
            <p className="eyebrow">Calculated Paths</p>
            <h2>Route Comparison</h2>
          </div>
          {activeRoute ? (
            <button
              type="button"
              className="text-xs text-blue-600 hover:text-blue-800 font-bold"
              onClick={() => {
                onRouteChange(undefined);
                setSelectedDestination(null);
                onDestinationSelect(null);
                setRoutes([]);
                if (onRoutesCalculated) onRoutesCalculated([]);
              }}
            >
              Clear Route
            </button>
          ) : null}
        </div>

        {isCalculating ? (
          <div className="flex flex-col items-center justify-center py-6 text-gray-500 text-xs font-semibold gap-2">
            <span className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
            <span>Analyzing flood paths and safety metrics...</span>
          </div>
        ) : routes.length === 0 ? (
          <p className="muted text-xs text-gray-400 p-2 italic">Search and select a destination to evaluate safety alternatives.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {routes.map((option, index) => {
              const isSelected = activeRoute?.id === option.id;
              const analysis = option.analysis;
              const healthMeta = analysis ? getHealthLabel(analysis.routeHealth) : { label: "Good", color: "text-green-600" };
              const risk = analysis?.floodRisk || "LOW";

              // Style based on risk level
              const riskColorClass =
                risk === "LOW"
                  ? "bg-green-100 text-green-800"
                  : risk === "MEDIUM"
                  ? "bg-blue-100 text-blue-800"
                  : risk === "HIGH"
                  ? "bg-orange-100 text-orange-800"
                  : "bg-red-100 text-red-800 font-bold";

              return (
                <article
                  key={option.id}
                  className={`p-3 rounded border text-xs flex flex-col gap-2 relative transition-all ${
                    isSelected ? "bg-blue-50/50 border-blue-500 shadow-sm" : "bg-white border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <button
                      type="button"
                      onClick={() => onRouteChange(option)}
                      className="text-left flex-1"
                    >
                      <div className="flex items-center gap-1.5">
                        <strong className="text-gray-900 font-bold text-sm">{option.name}</strong>
                        {index === 0 && risk === "LOW" ? (
                          <span className="bg-green-500 text-white font-bold text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5 shadow-sm shrink-0">
                            <ShieldCheck size={11} /> Recommended
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[10px] text-gray-500 italic mt-0.5 leading-normal">{option.summary}</p>
                    </button>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide shrink-0 ${riskColorClass}`}>
                      {risk} RISK
                    </span>
                  </div>

                  {/* Route Stats Row */}
                  <div className="flex items-center gap-3 text-gray-600 font-semibold border-y border-gray-100 py-1.5 text-[11px] justify-between">
                    <span className="flex items-center gap-1">
                      <Route size={13} className="text-gray-400" />
                      {option.distanceKm} km
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock3 size={13} className="text-gray-400" />
                      {option.estimatedMinutes} min
                      {analysis && analysis.estimatedDelayMinutes > 0 && (
                        <span className="text-amber-600 font-bold text-[10px]">
                          (+{analysis.estimatedDelayMinutes}m delay)
                        </span>
                      )}
                    </span>
                    {analysis && (
                      <span className="flex items-center gap-1">
                        <Layers size={13} className="text-gray-400" />
                        Health: <span className={healthMeta.color}>{analysis.routeHealth}%</span>
                      </span>
                    )}
                  </div>

                  {/* Risk Explanations Block */}
                  {analysis && analysis.riskExplanations.length > 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded p-2 flex flex-col gap-1 text-[11px] text-gray-600 leading-normal">
                      {analysis.riskExplanations.map((exp, idx) => (
                        <div key={idx} className="flex gap-1 items-start">
                          <span className="text-amber-500 font-bold">•</span>
                          <span>{exp}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Affected Roads Segment */}
                  {analysis && analysis.affectedIncidentsCount > 0 && (
                    <div className="text-[11px]">
                      <span className="font-bold text-gray-700 block mb-1">Affected Hazard Locations:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.affectedIncidents.map((inc) => (
                          <button
                            key={inc.id}
                            type="button"
                            onClick={() => onSelectIncident(inc.id)}
                            className="px-2 py-1 rounded bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 hover:border-gray-400 transition-all font-semibold flex items-center gap-1"
                          >
                            <span>📍</span>
                            <span>{inc.roadName}</span>
                            <span className="text-[9px] text-gray-400">({inc.severity.replace("_", " ").toLowerCase()})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Navigation and View Buttons */}
                  <div className="flex gap-2 items-center mt-1">
                    <button
                      type="button"
                      onClick={() => onRouteChange(option)}
                      className={`flex-1 text-center py-1.5 font-bold rounded text-[11px] border transition-colors ${
                        isSelected
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      View on Map
                    </button>

                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setOpenNavMenuId(openNavMenuId === option.id ? null : option.id)}
                        className="p-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 flex items-center justify-center"
                        title="Navigate Options"
                      >
                        <ExternalLink size={14} />
                      </button>

                      {/* Navigation dropdown */}
                      {openNavMenuId === option.id && (
                        <div className="absolute right-0 bottom-full mb-1.5 z-40 bg-white border border-gray-200 rounded shadow-lg p-1 min-w-[120px] flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              openNavigation(option, "google");
                              setOpenNavMenuId(null);
                            }}
                            className="text-left w-full p-1.5 hover:bg-gray-50 text-[10px] font-bold text-gray-700"
                          >
                            Google Maps
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              openNavigation(option, "organic");
                              setOpenNavMenuId(null);
                            }}
                            className="text-left w-full p-1.5 hover:bg-gray-50 text-[10px] font-bold text-gray-700"
                          >
                            Organic Maps
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleCopyCoordinates(option);
                              setOpenNavMenuId(null);
                            }}
                            className="text-left w-full p-1.5 hover:bg-gray-50 text-[10px] font-bold text-gray-700 flex justify-between items-center"
                          >
                            <span>Copy Coords</span>
                            <Copy size={10} className="text-gray-400" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Copy success bubble */}
                  {copiedId === option.id && (
                    <div className="absolute left-1/2 -top-6 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-md z-50">
                      Copied!
                    </div>
                  )}
                </article>
              );
            })}

            {/* Side-by-side Comparative View */}
            <div className="bg-gray-50 border border-gray-200 rounded p-3 text-[11px] mt-2">
              <h4 className="font-bold text-gray-800 flex items-center gap-1 mb-2">
                <Info size={13} className="text-blue-500" />
                Comparative Summary Table
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 font-bold">
                      <th className="pb-1.5">Route</th>
                      <th className="pb-1.5 text-center">Dist.</th>
                      <th className="pb-1.5 text-center">Time</th>
                      <th className="pb-1.5 text-center">Health</th>
                      <th className="pb-1.5 text-center">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-100/50">
                        <td className="py-1.5 font-bold text-gray-800 truncate max-w-[100px]">{r.name}</td>
                        <td className="py-1.5 text-center text-gray-600 font-mono">{r.distanceKm}k</td>
                        <td className="py-1.5 text-center text-gray-600 font-mono">{r.estimatedMinutes}m</td>
                        <td className="py-1.5 text-center text-gray-700 font-bold">{r.analysis?.routeHealth ?? 100}%</td>
                        <td className="py-1.5 text-center">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${
                            r.analysis?.floodRisk === "LOW" ? "text-green-700 bg-green-50" :
                            r.analysis?.floodRisk === "MEDIUM" ? "text-blue-700 bg-blue-50" : "text-red-700 bg-red-50"
                          }`}>
                            {r.analysis?.floodRisk || "LOW"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
