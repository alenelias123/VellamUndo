"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  Compass,
  Crosshair,
  LogIn,
  LogOut,
  MapPin,
  MapPinned,
  Navigation,
  Navigation2,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck
} from "lucide-react";
import { AuthModal } from "@/components/AuthModal";
import { ReportPanel } from "@/components/ReportPanel";
import { SafeRoutePlanner } from "@/components/SafeRoutePlanner";
import { useEmergencyStore } from "@/hooks/useEmergencyStore";
import { calculateRoadRoutes, geocodeDestination, type SearchResultPlace } from "@/lib/routing";
import type { Coordinates, RouteOption } from "@/lib/types";

const FloodMap = dynamic(() => import("@/components/FloodMap").then((mod) => mod.FloodMap), {
  ssr: false,
  loading: () => <div className="map-loading">Loading Google Map Engine...</div>
});

type ActivePanel = "none" | "search" | "report";

export default function HomeClient() {
  const {
    reports,
    userSession,
    login,
    logout,
    addReport,
    deleteReport,
    verifyReport
  } = useEmergencyStore();

  // User Realtime Geolocation State
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<Coordinates>({ lat: 9.9769, lng: 76.2824 }); // Default Kochi

  // UI state
  const [activePanel, setActivePanel] = useState<ActivePanel>("search");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | undefined>();
  const [pendingLocation, setPendingLocation] = useState<Coordinates | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<Coordinates | null>(null);
  const [activeRoute, setActiveRoute] = useState<RouteOption | undefined>();

  // Top destination search input state
  const [topSearchQuery, setTopSearchQuery] = useState("");
  const [topSearchResults, setTopSearchResults] = useState<SearchResultPlace[]>([]);
  const [isSearchingTop, setIsSearchingTop] = useState(false);

  // 1. Fetch Realtime Geolocation of User
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords: Coordinates = {
          lat: Number(position.coords.latitude.toFixed(5)),
          lng: Number(position.coords.longitude.toFixed(5))
        };
        setUserLocation(coords);
        // On initial load, set center to user location
        setMapCenter((prev) => (prev.lat === 9.9769 && prev.lng === 76.2824 ? coords : prev));
      },
      (err) => {
        console.warn("Geolocation watch error:", err.message);
        setGeoError("Unable to retrieve your location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Handle map click to select a point
  function handlePickLocation(coordinates: Coordinates) {
    setPendingLocation(coordinates);
    setMapCenter(coordinates);
  }

  // Recenter to user's live position
  function handleRecenterUser() {
    if (userLocation) {
      setMapCenter({ ...userLocation });
    } else {
      navigator.geolocation.getCurrentPosition((pos) => {
        const coords = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5))
        };
        setUserLocation(coords);
        setMapCenter(coords);
      });
    }
  }

  // Handle top search submission
  async function handleTopSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topSearchQuery.trim()) return;

    setIsSearchingTop(true);
    try {
      const results = await geocodeDestination(topSearchQuery);
      setTopSearchResults(results);
      if (results.length > 0) {
        handleSelectTopDestination(results[0]);
      }
    } finally {
      setIsSearchingTop(false);
    }
  }

  // Select destination from search result
  async function handleSelectTopDestination(place: SearchResultPlace) {
    setDestinationLocation(place.coordinates);
    setMapCenter(place.coordinates);
    setTopSearchResults([]);
    setTopSearchQuery(place.name);

    // Compute route from user location (or default origin) to destination
    const origin = userLocation || { lat: 9.9769, lng: 76.2824 };
    const routes = await calculateRoadRoutes(origin, place.coordinates, reports);
    if (routes.length > 0) {
      setActiveRoute(routes[0]);
      setActivePanel("search");
    }
  }

  // Handle Report Flood Click
  function handleReportClick() {
    if (!userSession) {
      setIsAuthModalOpen(true);
    } else {
      setActivePanel("report");
    }
  }

  const selectedReport = reports.find((r) => r.id === selectedReportId);
  const isAdmin = userSession?.role === "admin";

  return (
    <div className="google-maps-app">
      {/* Top Google Maps Floating Search Bar */}
      <header className="gmaps-topbar">
        <div className="gmaps-brand">
          <ShieldCheck size={24} className="brand-logo" />
          <span className="brand-title">Vellam Undo</span>
        </div>

        <form className="gmaps-search-box" onSubmit={handleTopSearchSubmit}>
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search destination (e.g. Aluva, Marine Drive, Thrissur)..."
            value={topSearchQuery}
            onChange={(e) => setTopSearchQuery(e.target.value)}
          />
          <button type="submit" className="destination-search-button" disabled={isSearchingTop}>
            {isSearchingTop ? "Searching..." : "Search Destination"}
          </button>
        </form>

        {/* User / Auth Controls */}
        <div className="gmaps-auth-controls">
          {userSession ? (
            <div className="user-badge-pill">
              {isAdmin ? (
                <span className="admin-tag">
                  <ShieldAlert size={14} /> Admin
                </span>
              ) : (
                <span className="user-tag">
                  <UserCheck size={14} /> Citizen
                </span>
              )}
              <span className="user-email">{userSession.email.split("@")[0]}</span>
              <button type="button" className="logout-btn" title="Sign Out" onClick={logout}>
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="login-btn primary-action"
              onClick={() => setIsAuthModalOpen(true)}
            >
              <LogIn size={16} /> Sign In
            </button>
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {topSearchResults.length > 0 ? (
          <ul className="gmaps-search-dropdown">
            {topSearchResults.map((place) => (
              <li key={place.id}>
                <button type="button" onClick={() => handleSelectTopDestination(place)}>
                  <strong>📍 {place.name}</strong>
                  <small>{place.fullName}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {/* Main Fullscreen Map Viewport */}
      <main className="gmaps-viewport">
        <FloodMap
          center={mapCenter}
          userLocation={userLocation}
          reports={reports}
          selectedReportId={selectedReportId}
          activeRoute={activeRoute}
          destinationLocation={destinationLocation}
          pendingLocation={pendingLocation}
          isAdmin={isAdmin}
          onSelectReport={(reportId) => {
            setSelectedReportId(reportId);
            setActivePanel("report");
          }}
          onDeleteReport={(reportId) => deleteReport(reportId)}
          onPickLocation={handlePickLocation}
        />

        {/* Floating Google Maps Quick Action Bar */}
        <div className="gmaps-floating-actions">
          <button
            type="button"
            className="floating-fab recenter-fab"
            title="Recenter to my location"
            onClick={handleRecenterUser}
          >
            <Crosshair size={20} />
          </button>

          <button
            type="button"
            className={`floating-fab nav-fab ${activePanel === "search" ? "active" : ""}`}
            title="Navigation Directions"
            onClick={() => setActivePanel(activePanel === "search" ? "none" : "search")}
          >
            <Navigation2 size={20} />
          </button>

          <button
            type="button"
            className={`floating-fab report-fab ${activePanel === "report" ? "active" : ""}`}
            title="Report Flooded Road"
            onClick={handleReportClick}
          >
            <MapPinned size={20} />
            <span className="fab-label">Report Flood</span>
          </button>
        </div>

        {/* Live GPS Status Chip */}
        <div className="gmaps-gps-chip">
          <span className={`gps-dot ${userLocation ? "active" : "searching"}`}></span>
          <span>
            {userLocation
              ? `GPS Live: ${userLocation.lat}, ${userLocation.lng}`
              : geoError || "Fetching live location..."}
          </span>
        </div>

        {/* Active Route Summary Floating Sheet */}
        {activeRoute ? (
          <div className="gmaps-route-card">
            <div className="route-card-header">
              <div>
                <span className="route-tag">Active Directions</span>
                <h3>{activeRoute.name}</h3>
              </div>
              <button
                type="button"
                className="close-route-btn"
                onClick={() => {
                  setActiveRoute(undefined);
                  setDestinationLocation(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className="route-metrics">
              <span className="metric">🚗 {activeRoute.distanceKm} km</span>
              <span className="metric">⏱️ {activeRoute.estimatedMinutes} mins</span>
              <span
                className={`metric risk ${
                  activeRoute.floodExposure > 3 ? "high-risk" : "low-risk"
                }`}
              >
                🛡️ Flood Exposure: {activeRoute.floodExposure}
              </span>
            </div>
            {activeRoute.warnings.length > 0 ? (
              <p className="route-warning">{activeRoute.warnings[0]}</p>
            ) : null}
          </div>
        ) : null}

        {/* Sliding Operations Side Panel */}
        {activePanel !== "none" ? (
          <aside className="gmaps-side-panel">
            <button
              type="button"
              className="close-panel-btn"
              onClick={() => setActivePanel("none")}
            >
              ✕
            </button>

            {activePanel === "search" ? (
              <SafeRoutePlanner
                userLocation={userLocation}
                reports={reports}
                activeRoute={activeRoute}
                onDestinationSelect={(place) => {
                  if (place) {
                    setDestinationLocation(place.coordinates);
                    setMapCenter(place.coordinates);
                  }
                }}
                onRouteChange={(route) => setActiveRoute(route)}
              />
            ) : null}

            {activePanel === "report" ? (
              <ReportPanel
                activeDistrictSlug="ernakulam"
                pendingLocation={pendingLocation || undefined}
                selectedReport={selectedReport}
                reports={reports}
                userSession={userSession}
                onRequestLogin={() => setIsAuthModalOpen(true)}
                onSubmit={(input) => addReport(input)}
                onDeleteReport={(reportId) => deleteReport(reportId)}
                onVerify={verifyReport}
                onSelectReport={setSelectedReportId}
              />
            ) : null}
          </aside>
        ) : null}
      </main>

      {/* Auth Modal for Log In / Sign Up & Admin Authentication */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLogin={(email, role) => {
          login(email, role);
          setActivePanel("report");
        }}
      />
    </div>
  );
}
