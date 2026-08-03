"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Droplets,
  Loader2,
  LocateFixed,
  MapPin,
  RotateCcw,
  Search,
  Send,
  X
} from "lucide-react";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { incidentTypeMeta, severityColorMeta } from "@/lib/floodReports";
import { getElevationAt } from "@/lib/elevation";
import { haversineDistanceKm, type SearchResultPlace } from "@/lib/routing";
import type { Coordinates, IncidentType, SeverityLevel } from "@/lib/types";

type OfflineReportPayload = {
  latitude: number;
  longitude: number;
  severity: SeverityLevel;
  type: IncidentType;
  roadName: string;
  landmark: string;
  district: string;
  notes?: string;
  reporter: string;
  photos: string[];
  elevationMeters?: number;
  floodStartLat?: number;
  floodStartLng?: number;
  floodEndLat?: number;
  floodEndLng?: number;
  floodStretchPath?: Coordinates[];
  originalLatitude?: number;
  originalLongitude?: number;
  snappedLatitude?: number;
  snappedLongitude?: number;
  roadSnapDistance?: number;
  locationConfidence?: number;
  resolvedRoadName?: string;
};

type ReportPanelProps = {
  pendingLocation?: Coordinates;
  onPickLocation: (coords: Coordinates) => void;
  onSubmit: (input: OfflineReportPayload) => Promise<boolean>;
  onResetDemoData: () => void;
  onBack?: () => void;
  isDrawingStretch?: boolean;
  stretchStart?: Coordinates;
  stretchEnd?: Coordinates;
  stretchPath?: Coordinates[];
  stretchPathKm?: number;
  isResolvingStretch?: boolean;
  onStretchChange?: (start: Coordinates, end: Coordinates) => void;
  onStretchReset?: () => void;
  onToggleStretchDrawing?: (active: boolean) => void;
};

const incidentTypes = Object.keys(incidentTypeMeta) as IncidentType[];
const severityLevels = Object.keys(severityColorMeta) as SeverityLevel[];

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export function ReportPanel({
  pendingLocation,
  onPickLocation,
  onSubmit,
  onResetDemoData,
  onBack,
  isDrawingStretch = false,
  stretchStart,
  stretchEnd,
  stretchPath,
  stretchPathKm,
  isResolvingStretch = false,
  onStretchChange,
  onStretchReset,
  onToggleStretchDrawing
}: ReportPanelProps) {
  const [roadName, setRoadName] = useState("");
  const [landmark, setLandmark] = useState("");
  const [district, setDistrict] = useState("ernakulam");
  const [type, setType] = useState<IncidentType>("Flooded Road");
  const [severity, setSeverity] = useState<SeverityLevel>("WATERLOGGED");
  const [notes, setNotes] = useState("");
  const [reporter, setReporter] = useState("");
  const [elevationMeters, setElevationMeters] = useState<number | undefined>();

  // Custom location search state
  const location$ = useLocationSearch();
  const locationQuery = location$.query;

  const [isGeocoding, setIsGeocoding] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // ── GPS Snapping & Location Resolution (Step 1-12) ───────────────────
  const [geocodeCache] = useState(() => new Map<string, any>());
  const [nearestCache] = useState(() => new Map<string, any>());

  const [originalCoords, setOriginalCoords] = useState<Coordinates | null>(null);
  const [snappedCoords, setSnappedCoords] = useState<Coordinates | null>(null);
  const [roadSnapDistance, setRoadSnapDistance] = useState<number | undefined>();
  const [locationConfidence, setLocationConfidence] = useState<number>(100);
  const [resolvedRoadName, setResolvedRoadName] = useState<string>("");

  const [snapBanner, setSnapBanner] = useState<{
    roadName: string;
    distance: number;
  } | null>(null);

  const [distanceWarning, setDistanceWarning] = useState<{
    distance: number;
    tempCoords: Coordinates;
    tempRoad: string;
  } | null>(null);

  const lastSnappedCoordsRef = useRef<Coordinates | null>(null);

  // How the user chose to mark the flooded location (map point / road stretch).
  const [locationMode, setLocationMode] = useState<"point" | "stretch" | null>(null);

  useEffect(() => {
    if (pendingLocation) setLocationMode(null);
  }, [pendingLocation]);

  useEffect(() => {
    if (!pendingLocation) return;

    // Check if this pendingLocation is the one we just snapped to.
    if (
      lastSnappedCoordsRef.current &&
      Math.abs(pendingLocation.lat - lastSnappedCoordsRef.current.lat) < 0.00001 &&
      Math.abs(pendingLocation.lng - lastSnappedCoordsRef.current.lng) < 0.00001
    ) {
      return;
    }

    async function runPipeline() {
      setIsGeocoding(true);
      setSnapBanner(null);
      setDistanceWarning(null);

      const lat = pendingLocation!.lat;
      const lng = pendingLocation!.lng;
      const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;

      let geocodeData = geocodeCache.get(cacheKey);

      try {
        // Step 1: Normal Reverse Geocoding
        if (!geocodeData) {
          const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
          if (res.ok) {
            geocodeData = await res.json();
            geocodeCache.set(cacheKey, geocodeData);
          }
        }

        const rawRoad = geocodeData?.roadName || "";
        const isUnnamed = !rawRoad || rawRoad.toLowerCase() === "unnamed road" || rawRoad.toLowerCase() === "unknown road" || rawRoad.toLowerCase() === "unknown";

        if (!isUnnamed) {
          setRoadName(rawRoad);
          setLandmark(geocodeData.landmark || "Kerala");
          setDistrict(geocodeData.district || "ernakulam");
          setLocationConfidence(100);
          setOriginalCoords(pendingLocation!);
          setSnappedCoords(null);
          setRoadSnapDistance(undefined);
          setResolvedRoadName(rawRoad);
          setIsGeocoding(false);
          return;
        }

        // Geocoding returned Unnamed Road/empty -> Proceed to Step 2: Road Snapping
        let nearestData = nearestCache.get(cacheKey);
        if (!nearestData) {
          const nearestUrl = `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=1`;
          const nRes = await fetch(nearestUrl);
          if (nRes.ok) {
            nearestData = await nRes.json();
            nearestCache.set(cacheKey, nearestData);
          }
        }

        const waypoint = nearestData?.waypoints?.[0];
        if (!waypoint || !waypoint.location) {
          // Step 4: Smart Fallback using OSM highway around coordinates
          let osmHighwayName = "";
          try {
            const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json][timeout:5];way(around:100,${lat},${lng})[highway];out;`;
            const overpassRes = await fetch(overpassUrl);
            if (overpassRes.ok) {
              const opData = await overpassRes.json();
              const way = opData?.elements?.[0];
              if (way && way.tags && way.tags.name) {
                osmHighwayName = way.tags.name;
              }
            }
          } catch {}

          const resolvedName = osmHighwayName || "Unknown Road";
          setRoadName(resolvedName);
          setLandmark(geocodeData?.landmark || "Kerala");
          setDistrict(geocodeData?.district || "ernakulam");
          setLocationConfidence(20);
          setOriginalCoords(pendingLocation!);
          setSnappedCoords(null);
          setRoadSnapDistance(undefined);
          setResolvedRoadName(resolvedName);
          setIsGeocoding(false);
          return;
        }

        const snappedLng = waypoint.location[0];
        const snappedLat = waypoint.location[1];
        const snappedName = waypoint.name || "Unnamed road";
        const distanceMeters = Math.round(waypoint.distance);
        const snappedCoordinates = { lat: snappedLat, lng: snappedLng };

        setOriginalCoords(pendingLocation!);

        // Step 3: Distance Validation
        if (distanceMeters <= 50) {
          // Auto snap!
          lastSnappedCoordsRef.current = snappedCoordinates;
          onPickLocation(snappedCoordinates);

          setSnappedCoords(snappedCoordinates);
          setRoadSnapDistance(distanceMeters);
          setLocationConfidence(95);
          setResolvedRoadName(snappedName);

          const snappedCacheKey = `${snappedLat.toFixed(5)},${snappedLng.toFixed(5)}`;
          let snappedGeocode = geocodeCache.get(snappedCacheKey);
          if (!snappedGeocode) {
            const sgRes = await fetch(`/api/geocode?lat=${snappedLat}&lng=${snappedLng}`);
            if (sgRes.ok) {
              snappedGeocode = await sgRes.json();
              geocodeCache.set(snappedCacheKey, snappedGeocode);
            }
          }

          setRoadName(snappedName);
          setLandmark(snappedGeocode?.landmark || geocodeData?.landmark || "Kerala");
          setDistrict(snappedGeocode?.district || geocodeData?.district || "ernakulam");

          setSnapBanner({
            roadName: snappedName,
            distance: distanceMeters
          });

        } else {
          // distance > 50 meters, show warning banner
          setDistanceWarning({
            distance: distanceMeters,
            tempCoords: snappedCoordinates,
            tempRoad: snappedName
          });

          setRoadName(rawRoad || "Unnamed road");
          setLandmark(geocodeData?.landmark || "Kerala");
          setDistrict(geocodeData?.district || "ernakulam");
          setLocationConfidence(50);
        }

      } catch (err) {
        console.warn("Snapping pipeline failed:", err);
        setRoadName(geocodeData?.roadName || "Unknown Road");
        setLandmark(geocodeData?.landmark || "Kerala");
        setDistrict(geocodeData?.district || "ernakulam");
        setLocationConfidence(20);
      } finally {
        setIsGeocoding(false);
      }
    }

    runPipeline();
  }, [pendingLocation, onPickLocation]);

  // Look up ground elevation for the report location so the router can
  // compare altitudes when scoring nearby routes (see src/lib/routing.ts).
  useEffect(() => {
    if (!pendingLocation) return;
    let cancelled = false;
    getElevationAt(pendingLocation).then((elev) => {
      if (!cancelled && elev !== undefined) setElevationMeters(Math.round(elev));
    });
    return () => { cancelled = true; };
  }, [pendingLocation]);

  function requestGPS() {
    if (!navigator.geolocation) {
      setGpsError("Geolocation requires a secure connection (HTTPS) or localhost.");
      return;
    }
    setGpsLoading(true);
    setGpsError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLoading(false);
        onPickLocation({
          lat: Number(position.coords.latitude.toFixed(5)),
          lng: Number(position.coords.longitude.toFixed(5))
        });
      },
      (error) => {
        setGpsLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGpsError("Location access denied. Please enable location permissions in browser settings.");
            break;
          case error.POSITION_UNAVAILABLE:
            setGpsError("GPS signal unavailable. Try again outdoors or set location manually.");
            break;
          case error.TIMEOUT:
            setGpsError("GPS lock request timed out. Try again outdoors or set location manually.");
            break;
          default:
            setGpsError("GPS lock failed — tap the map or search a location below.");
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
  }

  function selectSearchedLocation(place: SearchResultPlace) {
    location$.setQuery(place.name);
    location$.clearSuggestions();
    onPickLocation(place.coordinates);
  }

  function clearCustomLocation() {
    location$.setQuery("");
    location$.clearSuggestions();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!pendingLocation) {
      alert("Please select a location on the map or search one below.");
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccess(false);

    const payload: OfflineReportPayload = {
      latitude: pendingLocation.lat,
      longitude: pendingLocation.lng,
      severity,
      type,
      roadName: roadName.trim() || "Unnamed road",
      landmark: landmark.trim() || "Kerala",
      district,
      notes: notes.trim() || undefined,
      reporter: reporter.trim() || "Community reporter",
      photos: [],
      elevationMeters,
      floodStartLat: stretchStart?.lat,
      floodStartLng: stretchStart?.lng,
      floodEndLat: stretchEnd?.lat,
      floodEndLng: stretchEnd?.lng,
      floodStretchPath: stretchPath,
      // Snapping Metadata (Step 12)
      originalLatitude: originalCoords?.lat || pendingLocation.lat,
      originalLongitude: originalCoords?.lng || pendingLocation.lng,
      snappedLatitude: snappedCoords?.lat || undefined,
      snappedLongitude: snappedCoords?.lng || undefined,
      roadSnapDistance: roadSnapDistance,
      locationConfidence: locationConfidence,
      resolvedRoadName: resolvedRoadName || roadName
    };

    try {
      await onSubmit(payload);
      setSubmitSuccess(true);
      setNotes("");
      onStretchReset?.();
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch {
      alert("Submission error. Saved locally to sync later.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel-stack reporting-drawer" aria-label="Incident Reporting Sheet">
      <div className="panel-section">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="section-heading">
          <div>
            <p className="eyebrow">Realtime Emergency</p>
            <h2>Report Flood</h2>
          </div>
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                className="icon-button"
                type="button"
                onClick={onBack}
                title="Back to route planner"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <button
              className="icon-button"
              type="button"
              onClick={onResetDemoData}
              title="Reset demo data"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        {/* ── GPS error banner ───────────────────────────── */}
        {gpsError ? (
          <div className="report-banner report-banner--warn">
            {gpsError}
          </div>
        ) : null}

        {/* ── Snapping Banner (Step 7) ───────────────────────── */}
        {snapBanner && (
          <div className="bg-teal-50 border border-teal-200 text-teal-800 p-3 rounded-lg flex flex-col gap-2 mb-4 animate-fadeIn">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-xs">
                <CheckCircle2 size={14} className="text-teal-600" />
                Snapped to nearest road
              </span>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  className="chip-button chip-button--primary"
                  onClick={() => setSnapBanner(null)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="chip-button chip-button--teal"
                  onClick={() => { setSnapBanner(null); setLocationConfidence(50); }}
                >
                  Move Pin
                </button>
              </div>
            </div>
            <p className="text-[11px] text-teal-700 leading-relaxed">
              <strong>{snapBanner.roadName}</strong> · {formatDistance(snapBanner.distance)} away
            </p>
          </div>
        )}

        {/* ── Distance Warning (> 50m, Step 3) ───────────────── */}
        {distanceWarning && (
          <div className="bg-teal-50 border border-teal-200 text-teal-800 p-3 rounded-lg flex flex-col gap-2 mb-4 animate-fadeIn">
            <div className="flex items-center gap-1.5 font-bold text-xs">
              <AlertTriangle size={14} className="text-teal-600" />
              {formatDistance(distanceWarning.distance)} from nearest road
            </div>
            <p className="text-[11px] text-teal-700 leading-relaxed">
              Snap the marker to <strong>{distanceWarning.tempRoad}</strong>?
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="chip-button chip-button--primary"
                onClick={async () => {
                  const { tempCoords, tempRoad, distance } = distanceWarning;
                  lastSnappedCoordsRef.current = tempCoords;
                  onPickLocation(tempCoords);
                  setSnappedCoords(tempCoords);
                  setRoadSnapDistance(distance);
                  setLocationConfidence(80);
                  setResolvedRoadName(tempRoad);
                  
                  try {
                    const sgRes = await fetch(`/api/geocode?lat=${tempCoords.lat}&lng=${tempCoords.lng}`);
                    if (sgRes.ok) {
                      const sgData = await sgRes.json();
                      setRoadName(tempRoad);
                      setLandmark(sgData.landmark || "Kerala");
                      setDistrict(sgData.district || "ernakulam");
                    }
                  } catch {}
                  
                  setSnapBanner({
                    roadName: tempRoad,
                    distance
                  });
                  setDistanceWarning(null);
                }}
              >
                Snap to road
              </button>
              <button
                type="button"
                className="chip-button chip-button--teal"
                onClick={() => {
                  setDistanceWarning(null);
                  setLocationConfidence(50);
                }}
              >
                Keep manual
              </button>
              <button
                type="button"
                className="chip-button"
                onClick={() => {
                  setDistanceWarning(null);
                  setLocationConfidence(50);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <form className="form-grid" onSubmit={handleSubmit}>

          {/* ── Incident Location + mark-on-map options ────── */}
          <div className="span-2 report-location-card">
            <div className="report-location-row">
              <span className="report-location-label">
                <MapPin size={14} />
                Incident Location
              </span>
            </div>

            {pendingLocation ? (
              <span className="report-coords">
                <MapPin size={14} className="inline" /> {pendingLocation.lat.toFixed(5)}, {pendingLocation.lng.toFixed(5)}
              </span>
            ) : (
              <span className="report-coords report-coords--empty">
                {gpsLoading ? "Detecting location…" : "No location set yet"}
              </span>
            )}

            {isGeocoding ? (
              <span className="report-geocoding-status">
                <Loader2 size={12} className="report-spin" />
                Reverse geocoding…
              </span>
            ) : null}

            <p className="report-loc-options-label">Mark it on the map:</p>
            <div className="report-loc-options">
              <button
                type="button"
                className={`report-loc-option${locationMode === "point" ? " report-loc-option--active" : ""}`}
                onClick={() => setLocationMode("point")}
              >
                <MapPin size={13} />
                Click point on map
              </button>
              <button
                type="button"
                className={`report-loc-option${locationMode === "stretch" ? " report-loc-option--active" : ""}`}
                onClick={() => { setLocationMode("stretch"); onToggleStretchDrawing?.(true); }}
              >
                <Droplets size={13} />
                Trace road stretch
              </button>
              <button
                type="button"
                className="report-loc-option"
                onClick={requestGPS}
                disabled={gpsLoading}
              >
                {gpsLoading ? <Loader2 size={13} className="report-spin" /> : <LocateFixed size={13} />}
                {gpsLoading ? "Locking…" : "Use my GPS"}
              </button>
            </div>

            {locationMode === "point" && !pendingLocation ? (
              <p className="report-loc-hint">
                Click anywhere on the map to set the incident point…
              </p>
            ) : null}
            {locationMode === "stretch" && !isDrawingStretch && !pendingLocation ? (
              <p className="report-loc-hint">
                Tap the map to mark the start, then the end of the flooded road…
              </p>
            ) : null}

            {/* ── Custom location search ─────────────────── */}
            <div className="location-search-block">
              <p className="location-search-label">Or search a location:</p>
              <div className="location-search-row">
                <div className="location-search-input-wrap">
                  <Search size={14} className="location-search-icon" />
                  <input
                    type="text"
                    className="location-search-input"
                    placeholder="e.g. Aluva bus stand, Thrissur…"
                    value={locationQuery}
                    onChange={(e) => {
                      location$.setQuery(e.target.value);
                      if (!e.target.value) location$.clearSuggestions();
                    }}
                    onKeyDown={(e) => {
                      location$.handleKeyDown(e, selectSearchedLocation);
                      if (
                        e.key === "Enter" &&
                        !e.defaultPrevented &&
                        location$.suggestions.length > 0
                      ) {
                        e.preventDefault();
                        selectSearchedLocation(location$.suggestions[0]);
                      }
                    }}
                  />
                  {locationQuery ? (
                    <button
                      type="button"
                      className="location-search-clear"
                      onClick={clearCustomLocation}
                      aria-label="Clear search"
                    >
                      <X size={12} />
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="location-search-btn"
                  onClick={() => location$.setQuery(locationQuery)}
                  disabled={location$.isLoading || locationQuery.trim().length < 2}
                >
                  {location$.isLoading ? (
                    <Loader2 size={14} className="report-spin" />
                  ) : (
                    <Search size={14} />
                  )}
                </button>
              </div>

              {location$.error ? (
                <p className="location-search-error">{location$.error}</p>
              ) : null}

              {location$.suggestions.length > 0 ? (
                <ul className="location-search-results">
                  {location$.suggestions.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={() => selectSearchedLocation(result)}
                      >
                        <strong className="inline-flex items-center gap-1.5">
                          <MapPin size={14} className="shrink-0" />
                          {result.name}
                        </strong>
                        <small>{result.fullName}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {/* ── Incident details section ───────────────────── */}
          <div className="span-2 form-section-label">Incident Details</div>

          {/* ── Flooded road stretch (visible only while tracing) ── */}
          {isDrawingStretch ? (
          <div className="span-2 stretch-tool-card">
            <div className="stretch-tool-head">
              <span className="stretch-tool-label">
                <MapPin size={14} />
                Flooded road stretch
              </span>
              <span className="stretch-status-chip stretch-status-chip--drawing">Drawing on map…</span>
            </div>

            <p className="stretch-hint">
              Click on the map to mark the <strong>start</strong>, then the{" "}
              <strong>end</strong> of the flooded road. Drag the S / E markers to fine-tune.
            </p>

            {stretchStart && stretchEnd ? (
              <div className="stretch-status-row">
                <span className={`stretch-status-chip${isResolvingStretch ? " stretch-status-chip--muted" : ""}`}>
                  {isResolvingStretch
                    ? "Calculating road path…"
                    : <><Droplets size={14} className="inline" /> {(
                        stretchPathKm ??
                        haversineDistanceKm(stretchStart, stretchEnd)
                      ).toFixed(2)} km flooded</>}
                </span>
                <span className="stretch-status-coords">
                  ({stretchStart.lat.toFixed(4)}, {stretchStart.lng.toFixed(4)}) → (
                  {stretchEnd.lat.toFixed(4)}, {stretchEnd.lng.toFixed(4)})
                </span>
                <button
                  type="button"
                  className="stretch-clear-btn"
                  onClick={onStretchReset}
                  title="Clear the drawn flooded stretch"
                >
                  <X size={12} /> Clear
                </button>
              </div>
            ) : stretchStart ? (
              <p className="stretch-hint">Start marked — now click the map for the end of the stretch.</p>
            ) : null}
          </div>
          ) : null}

          {/* ── Incident type ──────────────────────────────── */}
          <label className="span-2">
            Incident Type
            <select value={type} onChange={(e) => setType(e.target.value as IncidentType)}>
              {incidentTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          {/* ── Road / Landmark ────────────────────────────── */}
          <label>
            Road / River
            <input
              value={roadName}
              onChange={(e) => {
                setRoadName(e.target.value);
                setLocationConfidence(50);
              }}
              placeholder="e.g. Seaport-Airport Rd"
            />
          </label>

          <label>
            Landmark
            <input
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="e.g. Near signal junction"
            />
          </label>

          {/* ── Severity picker ────────────────────────────── */}
          <label className="span-2">
            Severity Level
            <div className="severity-grid">
              {severityLevels.map((level) => {
                const meta = severityColorMeta[level];
                const isSelected = level === severity;
                return (
                  <button
                    key={level}
                    type="button"
                    className={`severity-chip${isSelected ? " severity-chip--active" : ""}`}
                    style={
                      isSelected
                        ? { backgroundColor: meta.color, borderColor: meta.color, color: "#fff" }
                        : { borderColor: "var(--line-strong)" }
                    }
                    onClick={() => setSeverity(level)}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </label>

          {/* ── Notes section ──────────────────────────────── */}
          <div className="span-2 form-section-label">Notes & Reporter</div>

          {/* ── Notes ──────────────────────────────────────── */}
          <label className="span-2">
            Notes / Observations
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Water rising fast, strong current, family stranded inside"
            />
          </label>

          {/* ── Reporter ───────────────────────────────────── */}
          <label className="span-2">
            Reporter Name
            <input
              value={reporter}
              onChange={(e) => setReporter(e.target.value)}
              placeholder="e.g. Ward volunteer / Community responder"
            />
          </label>

          {/* ── Success feedback ───────────────────────────── */}
          {submitSuccess ? (
            <div className="span-2 report-banner report-banner--success">
              <CheckCircle2 size={14} /> Incident submitted successfully.
            </div>
          ) : null}

          {/* ── Submit ─────────────────────────────────────── */}
          <button
            className="primary-action span-2"
            type="submit"
            disabled={isSubmitting}
            style={{ marginTop: 4 }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="report-spin" />
                Posting report…
              </>
            ) : (
              <>
                <Send size={16} />
                Submit Incident
              </>
            )}
          </button>

        </form>
      </div>
    </section>
  );
}
