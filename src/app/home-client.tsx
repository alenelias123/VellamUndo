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
  User
} from "lucide-react";
import { ReportPanel } from "@/components/ReportPanel";
import { SafeRoutePlanner } from "@/components/SafeRoutePlanner";
import { IncidentDetailsDrawer } from "@/components/IncidentDetailsDrawer";
import { AuthModal } from "@/components/AuthModal";
import { useEmergencyStore } from "@/hooks/useEmergencyStore";
import { useAuth } from "@/hooks/useAuth";
import { severityRank, severityColorMeta, incidentTypeMeta } from "@/lib/floodReports";
import type { Coordinates, RouteOption } from "@/lib/types";

const FloodMap = dynamic(
  () => import("@/components/FloodMap").then((mod) => mod.FloodMap),
  {
    ssr: false,
    loading: () => (
      <div className="map-loading">Loading map…</div>
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

export default function HomeClient() {
  const { incidents, offlineQueue, isSyncing, addReport, verifyIncident, resetDemoData } =
    useEmergencyStore();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRecenter = useCallback(() => {
    startGpsWatch();
    setRecenterTrigger((n) => n + 1);
  }, [startGpsWatch]);

  // ── Derived state ──────────────────────────────────────────────────
  const selectedIncident = useMemo(
    () => incidents.find((inc) => inc.id === selectedIncidentId),
    [incidents, selectedIncidentId]
  );

  const mapCenter = useMemo(() => {
    void recenterTrigger;
    if (selectedIncident) return selectedIncident.coordinates;
    if (pendingLocation) return pendingLocation;
    if (userLocation) return userLocation;
    return DEFAULT_KOCHI_COORDS;
  }, [selectedIncident, pendingLocation, userLocation, recenterTrigger]);

  const severeIncidents = useMemo(() =>
    [...incidents]
      .filter((i) => i.status === "active" || i.status === "receding")
      .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.confidence - a.confidence)
      .slice(0, 4),
    [incidents]
  );

  const latestUpdates = useMemo(() =>
    [...incidents]
      .filter((i) => i.status !== "archived")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 4),
    [incidents]
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
              incidents={incidents}
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
            <Metric label="Incidents" value={incidents.filter((i) => i.status !== "archived").length} />
          </div>

          {/* ── Map intel sidebar ──────────────────────── */}
          <aside className="map-intel" aria-label="Flood intelligence">
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
                // Show verified tick if community-verified
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
                        {new Date(inc.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
                  incidents={incidents}
                  activeRoute={activeRoute}
                  onDestinationSelect={() => {}}
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
