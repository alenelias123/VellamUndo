"use client";

import { useEffect, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  Send,
  X
} from "lucide-react";
import { compressImage, uploadImageToSupabase } from "@/lib/imageUpload";
import { incidentTypeMeta, severityColorMeta } from "@/lib/floodReports";
import { geocodeDestination, type SearchResultPlace } from "@/lib/routing";
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
};

type ReportPanelProps = {
  pendingLocation?: Coordinates;
  onPickLocation: (coords: Coordinates) => void;
  onSubmit: (input: OfflineReportPayload) => Promise<boolean>;
  onResetDemoData: () => void;
};

const incidentTypes = Object.keys(incidentTypeMeta) as IncidentType[];
const severityLevels = Object.keys(severityColorMeta) as SeverityLevel[];

export function ReportPanel({
  pendingLocation,
  onPickLocation,
  onSubmit,
  onResetDemoData
}: ReportPanelProps) {
  const [roadName, setRoadName] = useState("");
  const [landmark, setLandmark] = useState("");
  const [district, setDistrict] = useState("ernakulam");
  const [type, setType] = useState<IncidentType>("Flooded Road");
  const [severity, setSeverity] = useState<SeverityLevel>("WATERLOGGED");
  const [notes, setNotes] = useState("");
  const [reporter, setReporter] = useState("");

  // Custom location search state
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<SearchResultPlace[]>([]);
  const [isLocationSearching, setIsLocationSearching] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState("");

  const [isGeocoding, setIsGeocoding] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [uploadQueue, setUploadQueue] = useState<
    Array<{ name: string; progress: number; error?: string; url?: string }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (!pendingLocation) {
      requestGPS();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pendingLocation) return;

    async function reverseGeocode() {
      setIsGeocoding(true);
      try {
        const res = await fetch(
          `/api/geocode?lat=${pendingLocation?.lat}&lng=${pendingLocation?.lng}`
        );
        if (res.ok) {
          const data = await res.json();
          setRoadName(data.roadName || "");
          setLandmark(data.landmark || "");
          setDistrict(data.district || "ernakulam");
        }
      } catch (err) {
        console.warn("Reverse geocode request failed:", err);
      } finally {
        setIsGeocoding(false);
      }
    }

    reverseGeocode();
  }, [pendingLocation]);

  function requestGPS() {
    if (!navigator.geolocation) {
      setGpsError("Geolocation not supported by this device.");
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
            setGpsError("Location access denied. Search a custom location below.");
            break;
          case error.POSITION_UNAVAILABLE:
            setGpsError("GPS signal unavailable. Search a custom location below.");
            break;
          default:
            setGpsError("GPS lock failed — tap the map or search a location below.");
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
  }

  async function handleLocationSearch() {
    const q = locationQuery.trim();
    if (q.length < 2) return;

    setIsLocationSearching(true);
    setLocationSearchError("");
    try {
      const results = await geocodeDestination(q);
      if (results.length === 0) {
        setLocationSearchError("No places found. Try a different name.");
        setLocationResults([]);
      } else {
        setLocationResults(results);
      }
    } catch {
      setLocationSearchError("Search failed. Check your connection.");
    } finally {
      setIsLocationSearching(false);
    }
  }

  function selectSearchedLocation(place: SearchResultPlace) {
    setLocationResults([]);
    setLocationQuery(place.name);
    onPickLocation(place.coordinates);
  }

  function clearCustomLocation() {
    setLocationQuery("");
    setLocationResults([]);
    setLocationSearchError("");
  }

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    const newItems = filesArray.map((file) => ({ name: file.name, progress: 0 }));
    setUploadQueue((prev) => [...prev, ...newItems]);

    filesArray.forEach(async (file, idx) => {
      const queueIndex = uploadQueue.length + idx;
      try {
        const compressedBlob = await compressImage(file);
        const publicUrl = await uploadImageToSupabase(compressedBlob, file.name, (progress) => {
          setUploadQueue((prev) => {
            const copy = [...prev];
            if (copy[queueIndex]) copy[queueIndex].progress = progress;
            return copy;
          });
        });
        setUploadQueue((prev) => {
          const copy = [...prev];
          if (copy[queueIndex]) {
            copy[queueIndex].progress = 100;
            copy[queueIndex].url = publicUrl;
          }
          return copy;
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Upload failed";
        setUploadQueue((prev) => {
          const copy = [...prev];
          if (copy[queueIndex]) copy[queueIndex].error = message;
          return copy;
        });
      }
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!pendingLocation) {
      alert("Please select a location on the map or search one below.");
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccess(false);

    const uploadedUrls = uploadQueue.filter((item) => item.url).map((item) => item.url!);

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
      photos: uploadedUrls
    };

    try {
      await onSubmit(payload);
      setSubmitSuccess(true);
      setNotes("");
      setUploadQueue([]);
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch {
      alert("Submission error. Saved locally to sync later.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const uploadsInProgress = uploadQueue.some((item) => !item.url && !item.error);

  return (
    <section className="panel-stack reporting-drawer" aria-label="Incident Reporting Sheet">
      <div className="panel-section">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="section-heading">
          <div>
            <p className="eyebrow">Realtime Emergency</p>
            <h2>Report Incident</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onResetDemoData}
            title="Reset demo data"
          >
            <RotateCcw size={16} />
          </button>
        </div>

        {/* ── GPS error banner ───────────────────────────── */}
        {gpsError ? (
          <div className="report-banner report-banner--warn">
            {gpsError}
          </div>
        ) : null}

        <form className="form-grid" onSubmit={handleSubmit}>

          {/* ── Location card ──────────────────────────────── */}
          <div className="span-2 report-location-card">
            <div className="report-location-row">
              <span className="report-location-label">
                <MapPin size={13} />
                Incident Location
              </span>
              <button
                type="button"
                className="text-button"
                onClick={requestGPS}
                disabled={gpsLoading}
                style={{ padding: "0 8px", minHeight: 28, fontSize: "0.75rem" }}
              >
                {gpsLoading ? (
                  <><Loader2 size={11} className="report-spin" /> Locking…</>
                ) : "Use my GPS"}
              </button>
            </div>

            {pendingLocation ? (
              <span className="report-coords">
                📍 {pendingLocation.lat.toFixed(5)}, {pendingLocation.lng.toFixed(5)}
              </span>
            ) : (
              <span className="report-coords report-coords--empty">
                {gpsLoading ? "Detecting location…" : "No location set — use GPS or search below"}
              </span>
            )}

            {isGeocoding ? (
              <span className="report-geocoding-status">
                <Loader2 size={11} className="report-spin" />
                Reverse geocoding…
              </span>
            ) : null}

            {/* ── Custom location search ─────────────────── */}
            <div className="location-search-block">
              <p className="location-search-label">Or search a custom start location:</p>
              <div className="location-search-row">
                <div className="location-search-input-wrap">
                  <Search size={13} className="location-search-icon" />
                  <input
                    type="text"
                    className="location-search-input"
                    placeholder="e.g. Aluva bus stand, Thrissur…"
                    value={locationQuery}
                    onChange={(e) => {
                      setLocationQuery(e.target.value);
                      if (!e.target.value) clearCustomLocation();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleLocationSearch();
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
                  onClick={() => handleLocationSearch()}
                  disabled={isLocationSearching || locationQuery.trim().length < 2}
                >
                  {isLocationSearching ? (
                    <Loader2 size={13} className="report-spin" />
                  ) : (
                    <Search size={13} />
                  )}
                </button>
              </div>

              {locationSearchError ? (
                <p className="location-search-error">{locationSearchError}</p>
              ) : null}

              {locationResults.length > 0 ? (
                <ul className="location-search-results">
                  {locationResults.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={() => selectSearchedLocation(result)}
                      >
                        <strong>📍 {result.name}</strong>
                        <small>{result.fullName}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {/* ── Incident type ──────────────────────────────── */}
          <label className="span-2">
            Incident Type
            <select value={type} onChange={(e) => setType(e.target.value as IncidentType)}>
              {incidentTypes.map((t) => (
                <option key={t} value={t}>
                  {incidentTypeMeta[t].icon} {t}
                </option>
              ))}
            </select>
          </label>

          {/* ── Road / Landmark ────────────────────────────── */}
          <label>
            Road / River
            <input
              value={roadName}
              onChange={(e) => setRoadName(e.target.value)}
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

          {/* ── Photos ─────────────────────────────────────── */}
          <label className="span-2">
            Photos
            <div className="photo-drop-zone">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoChange}
                className="photo-file-input"
              />
              <Camera size={18} />
              <span>Attach photos or take a picture</span>
            </div>

            {uploadQueue.length > 0 ? (
              <ul className="upload-queue">
                {uploadQueue.map((item, index) => (
                  <li key={index} className="upload-queue-item">
                    <span className="upload-filename">{item.name}</span>
                    {item.error ? (
                      <span className="upload-status upload-status--error">{item.error}</span>
                    ) : item.progress < 100 ? (
                      <span className="upload-status upload-status--progress">
                        {item.progress}%
                      </span>
                    ) : (
                      <span className="upload-status upload-status--done">
                        <CheckCircle2 size={11} /> Done
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </label>

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
            disabled={isSubmitting || uploadsInProgress}
            style={{ marginTop: 4 }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="report-spin" />
                Posting report…
              </>
            ) : (
              <>
                <Send size={15} />
                Submit Incident
              </>
            )}
          </button>

        </form>
      </div>
    </section>
  );
}
