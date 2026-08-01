"use client";

import { useEffect, useState } from "react";
import { Camera, MapPin, RotateCcw, Send, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { compressImage, uploadImageToSupabase } from "@/lib/imageUpload";
import { incidentTypeMeta, severityColorMeta } from "@/lib/floodReports";
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
  
  // Geocoding and GPS states
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");

  // Upload states
  const [uploadQueue, setUploadQueue] = useState<Array<{ name: string; progress: number; error?: string; url?: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Trigger browser GPS request on mount if no location selected yet
  useEffect(() => {
    if (!pendingLocation) {
      requestGPS();
    }
  }, []);

  // Request browser GPS coordinates
  function requestGPS() {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser");
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
        setGpsError("GPS lock failed. Tap on the map to manually select location.");
        console.warn("Geolocation error:", error);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Reverse geocode when pendingLocation changes
  useEffect(() => {
    if (!pendingLocation) return;

    async function reverseGeocode() {
      setIsGeocoding(true);
      try {
        const res = await fetch(`/api/geocode?lat=${pendingLocation?.lat}&lng=${pendingLocation?.lng}`);
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

  // Handle Photo selection & compression & upload
  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    
    // Add items to uploadQueue
    const newItems = filesArray.map((file) => ({
      name: file.name,
      progress: 0
    }));
    setUploadQueue((prev) => [...prev, ...newItems]);

    // Compress & upload each file
    filesArray.forEach(async (file, idx) => {
      const queueIndex = uploadQueue.length + idx;
      try {
        // Step 1: Compress canvas-first
        const compressedBlob = await compressImage(file);
        
        // Step 2: Upload to Supabase Storage
        const publicUrl = await uploadImageToSupabase(
          compressedBlob,
          file.name,
          (progress) => {
            setUploadQueue((prev) => {
              const copy = [...prev];
              if (copy[queueIndex]) {
                copy[queueIndex].progress = progress;
              }
              return copy;
            });
          }
        );

        setUploadQueue((prev) => {
          const copy = [...prev];
          if (copy[queueIndex]) {
            copy[queueIndex].progress = 100;
            copy[queueIndex].url = publicUrl;
          }
          return copy;
        });
      } catch (error: any) {
        console.error("Photo upload failed:", error);
        setUploadQueue((prev) => {
          const copy = [...prev];
          if (copy[queueIndex]) {
            copy[queueIndex].error = error.message || "Upload failed";
          }
          return copy;
        });
      }
    });
  }

  // Submit Handler
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!pendingLocation) {
      alert("Please select a location on the map first");
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
      const isOnline = await onSubmit(payload);
      setSubmitSuccess(true);
      
      // Clear form inputs
      setNotes("");
      setUploadQueue([]);
      
      // Show success briefly
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 3000);
    } catch (err) {
      alert("Submission error. Saved locally to sync later.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel-stack reporting-drawer" aria-label="Incident Reporting Sheet">
      <div className="panel-section">
        <div className="section-heading flex items-center justify-between">
          <div>
            <p className="eyebrow">Realtime Emergency</p>
            <h2 className="flex items-center gap-1.5 font-bold">
              <span>🚨</span> Report Incident
            </h2>
          </div>
          <button
            className="icon-button text-gray-500 hover:text-gray-900"
            type="button"
            onClick={onResetDemoData}
            title="Reset storage demo data"
          >
            <RotateCcw size={17} />
          </button>
        </div>

        {gpsError ? (
          <div className="p-2 mb-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold leading-relaxed">
            {gpsError}
          </div>
        ) : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          {/* Location status overlay */}
          <div className="span-2 location-capture-card bg-gray-50 border border-gray-200 rounded p-3 text-xs flex flex-col gap-1.5 shadow-sm">
            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-700 flex items-center gap-1">
                <MapPin size={14} className="text-red-600 animate-pulse" />
                GPS Coordinates
              </span>
              <button
                type="button"
                onClick={requestGPS}
                disabled={gpsLoading}
                className="text-[10px] text-blue-600 hover:text-blue-800 font-bold uppercase tracking-wider"
              >
                {gpsLoading ? "Locking..." : "Re-Lock GPS"}
              </button>
            </div>
            {pendingLocation ? (
              <span className="text-gray-900 font-mono">
                {pendingLocation.lat.toFixed(5)}, {pendingLocation.lng.toFixed(5)}
              </span>
            ) : (
              <span className="text-gray-500 italic">Detecting your location...</span>
            )}

            {isGeocoding ? (
              <div className="flex items-center gap-1.5 text-blue-600 mt-1">
                <Loader2 size={12} className="animate-spin" />
                <span>Nominatim reverse geocoding active...</span>
              </div>
            ) : null}
          </div>

          <label className="span-2">
            Incident Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as IncidentType)}
              className="w-full text-sm font-semibold rounded p-2 border border-gray-300"
            >
              {incidentTypes.map((t) => (
                <option key={t} value={t}>
                  {incidentTypeMeta[t].icon} {t}
                </option>
              ))}
            </select>
          </label>

          <label>
            Road / River
            <input
              value={roadName}
              onChange={(e) => setRoadName(e.target.value)}
              placeholder="e.g. Seaport-Airport Road"
              className="w-full text-sm rounded p-2 border border-gray-300"
            />
          </label>

          <label>
            Landmark
            <input
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="e.g. Near signal junction"
              className="w-full text-sm rounded p-2 border border-gray-300"
            />
          </label>

          <label className="span-2">
            Severity Level
            <div className="grid grid-cols-5 gap-1.5 mt-1">
              {severityLevels.map((l) => {
                const isSelected = l === severity;
                const meta = severityColorMeta[l];
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setSeverity(l)}
                    className={`p-1.5 rounded text-[10px] font-bold text-center border transition-all flex flex-col items-center justify-center min-h-[44px] ${
                      isSelected
                        ? "text-white shadow-sm scale-105"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                    style={{
                      backgroundColor: isSelected ? meta.color : undefined,
                      borderColor: isSelected ? meta.color : undefined
                    }}
                  >
                    <span>{meta.label.split(" ")[0]}</span>
                    {meta.label.split(" ")[1] && <span>{meta.label.split(" ")[1]}</span>}
                  </button>
                );
              })}
            </div>
          </label>

          <label className="span-2">
            Photos (Camera / Gallery)
            <div className="mt-1 flex flex-col gap-2">
              <div className="flex items-center justify-center border-2 border-dashed border-gray-300 rounded p-4 bg-gray-50 hover:bg-gray-100 cursor-pointer relative min-h-[70px]">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="flex items-center gap-2 text-gray-500 font-bold text-sm">
                  <Camera size={20} className="text-gray-400" />
                  <span>Choose Images / Take Photo</span>
                </div>
              </div>

              {/* Uploading progress list */}
              {uploadQueue.length > 0 ? (
                <div className="flex flex-col gap-1.5 bg-gray-50 border border-gray-200 rounded p-2 max-h-[140px] overflow-y-auto">
                  {uploadQueue.map((item, index) => (
                    <div key={index} className="flex justify-between items-center text-xs">
                      <span className="truncate max-w-[150px] font-mono text-[10px] text-gray-600">
                        {item.name}
                      </span>
                      {item.error ? (
                        <span className="text-red-600 font-bold">{item.error}</span>
                      ) : item.progress < 100 ? (
                        <span className="text-blue-600 font-bold">{item.progress}% uploading</span>
                      ) : (
                        <span className="text-green-600 font-bold flex items-center gap-0.5">
                          <CheckCircle2 size={11} /> Uploaded
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </label>

          <label className="span-2">
            Notes / Observations
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Water level rising fast, current is very strong, isolated family inside"
              className="w-full text-sm rounded p-2 border border-gray-300 min-h-[60px]"
            />
          </label>

          <label className="span-2">
            Reporter Name
            <input
              value={reporter}
              onChange={(e) => setReporter(e.target.value)}
              placeholder="e.g. Ward volunteer / Community responder"
              className="w-full text-sm rounded p-2 border border-gray-300"
            />
          </label>

          {submitSuccess ? (
            <div className="span-2 p-2 rounded bg-green-50 border border-green-200 text-green-800 text-xs font-bold text-center flex items-center justify-center gap-1">
              <CheckCircle2 size={14} /> Submitted successfully!
            </div>
          ) : null}

          <button
            className={`primary-action span-2 mt-2 w-full flex items-center justify-center gap-2 py-3 rounded text-sm font-bold text-white shadow-md ${
              isSubmitting ? "bg-gray-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
            }`}
            type="submit"
            disabled={isSubmitting || uploadQueue.some((item) => !item.url && !item.error)}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Posting Report...</span>
              </>
            ) : (
              <>
                <Send size={16} />
                <span>Submit Incident</span>
              </>
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
