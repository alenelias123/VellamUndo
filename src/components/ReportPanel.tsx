"use client";

import { FormEvent, useMemo, useState } from "react";
import { Camera, CheckCircle2, Flag, Lock, MapPin, Send, Trash2 } from "lucide-react";
import { districts, findDistrictForCoordinates, getDistrictBySlug } from "@/lib/districts";
import {
  formatRelativeTime,
  getReportConfidence,
  severityMeta,
  type NewFloodReportInput
} from "@/lib/floodReports";
import type { Coordinates, FloodReport, FloodSeverity } from "@/lib/types";
import type { UserSession } from "@/hooks/useEmergencyStore";

type ReportPanelProps = {
  activeDistrictSlug: string;
  pendingLocation?: Coordinates;
  selectedReport?: FloodReport;
  reports: FloodReport[];
  userSession: UserSession | null;
  onRequestLogin: () => void;
  onSubmit: (input: NewFloodReportInput) => Promise<FloodReport>;
  onDeleteReport: (reportId: string) => void;
  onVerify: (reportId: string, action: "confirm" | "flag") => void;
  onSelectReport: (reportId: string) => void;
};

const severityOptions: FloodSeverity[] = [
  "safe",
  "waterlogged",
  "knee-deep",
  "waist-deep",
  "not-passable"
];

export function ReportPanel({
  activeDistrictSlug,
  pendingLocation,
  selectedReport,
  reports,
  userSession,
  onRequestLogin,
  onSubmit,
  onDeleteReport,
  onVerify,
  onSelectReport
}: ReportPanelProps) {
  const activeDistrict = getDistrictBySlug(activeDistrictSlug);
  const [roadName, setRoadName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [severity, setSeverity] = useState<FloodSeverity>("waterlogged");
  const [waterLevelCm, setWaterLevelCm] = useState(30);
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitLocation = pendingLocation ?? activeDistrict.center;
  const inferredDistrict = useMemo(
    () => findDistrictForCoordinates(submitLocation.lat, submitLocation.lng),
    [submitLocation.lat, submitLocation.lng]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userSession) {
      onRequestLogin();
      return;
    }

    setIsSubmitting(true);
    try {
      const report = await onSubmit({
        roadName: roadName.trim() || "Unnamed road",
        district: inferredDistrict.slug,
        locationName: locationName.trim() || inferredDistrict.name,
        coordinates: submitLocation,
        severity,
        waterLevelCm,
        description: description.trim() || severityMeta[severity].guidance,
        imageUrl: imageUrl.trim() || undefined,
        createdBy: userSession.email
      });

      onSelectReport(report.id);
      setRoadName("");
      setLocationName("");
      setSeverity("waterlogged");
      setWaterLevelCm(30);
      setDescription("");
      setImageUrl("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel-stack" aria-label="Flood reports">
      <div className="panel-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Supabase Live Database</p>
            <h2>Report Flooded Area</h2>
          </div>
        </div>

        {!userSession ? (
          <div className="auth-lock-card">
            <Lock size={22} />
            <div>
              <strong>Login Required</strong>
              <p>You must log in to submit a flood report.</p>
            </div>
            <button type="button" className="primary-action small-btn" onClick={onRequestLogin}>
              Log In to Report
            </button>
          </div>
        ) : (
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Road name
              <input
                value={roadName}
                required
                onChange={(event) => setRoadName(event.target.value)}
                placeholder="e.g. MG Road, Kakkanad Signal"
              />
            </label>

            <label>
              Landmark / Junction
              <input
                value={locationName}
                required
                onChange={(event) => setLocationName(event.target.value)}
                placeholder="e.g. Near Metro Station"
              />
            </label>

            <label>
              Flood severity
              <select
                value={severity}
                onChange={(event) => setSeverity(event.target.value as FloodSeverity)}
              >
                {severityOptions.map((option) => (
                  <option key={option} value={option}>
                    {severityMeta[option].label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Water Depth (cm)
              <input
                type="number"
                min={0}
                max={300}
                value={waterLevelCm}
                onChange={(event) => setWaterLevelCm(Number(event.target.value))}
              />
            </label>

            <label className="span-2">
              Description / Hazards
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Provide details about road conditions, submerged vehicles, rescue needs..."
              />
            </label>

            <label className="span-2">
              Photo URL (Optional)
              <span className="input-with-icon">
                <Camera size={16} />
                <input
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="https://..."
                />
              </span>
            </label>

            <div className="coordinate-chip">
              <MapPin size={16} />
              <span>
                {submitLocation.lat.toFixed(4)}, {submitLocation.lng.toFixed(4)}
              </span>
            </div>

            <button className="primary-action span-2" type="submit" disabled={isSubmitting}>
              <Send size={17} />
              {isSubmitting ? "Saving to Supabase..." : "Submit Flood Report"}
            </button>
          </form>
        )}
      </div>

      {selectedReport ? (
        <div className="panel-section selected-report">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Selected Report</p>
              <h2>{selectedReport.roadName}</h2>
            </div>
            <span
              className="status-pill"
              style={{
                background: severityMeta[selectedReport.severity].background,
                color: severityMeta[selectedReport.severity].color
              }}
            >
              {severityMeta[selectedReport.severity].label}
            </span>
          </div>
          <p className="muted">{selectedReport.locationName}</p>
          <p>{selectedReport.description}</p>
          <div className="metric-row">
            <span>💧 {selectedReport.waterLevelCm} cm</span>
            <span>{getReportConfidence(selectedReport)}% confidence</span>
            <span>{formatRelativeTime(selectedReport.createdAt)}</span>
          </div>

          <div className="action-row">
            <button type="button" onClick={() => onVerify(selectedReport.id, "confirm")}>
              <CheckCircle2 size={16} /> Confirm
            </button>
            <button type="button" onClick={() => onVerify(selectedReport.id, "flag")}>
              <Flag size={16} /> Flag
            </button>

            {/* Only Admin can delete */}
            {userSession?.role === "admin" ? (
              <button
                type="button"
                className="danger-btn"
                onClick={() => onDeleteReport(selectedReport.id)}
              >
                <Trash2 size={16} /> Delete (Admin)
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="panel-section compact-list">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Live Reports</p>
            <h2>Supabase Flood Feed</h2>
          </div>
          <span className="count-badge">{reports.length}</span>
        </div>

        {reports.length === 0 ? (
          <p className="muted empty-feed">No active flood reports logged yet. Be the first to report!</p>
        ) : (
          reports.map((report) => (
            <div
              className={`feed-item ${selectedReport?.id === report.id ? "is-active" : ""}`}
              key={report.id}
            >
              <button
                className="feed-item-content"
                type="button"
                onClick={() => onSelectReport(report.id)}
              >
                <span
                  className="severity-dot"
                  style={{ background: severityMeta[report.severity].color }}
                />
                <span>
                  <strong>{report.roadName}</strong>
                  <small>
                    {report.locationName} · {report.waterLevelCm}cm · {formatRelativeTime(report.createdAt)}
                  </small>
                </span>
              </button>

              {userSession?.role === "admin" ? (
                <button
                  type="button"
                  className="feed-delete-btn"
                  title="Delete report (Admin)"
                  onClick={() => onDeleteReport(report.id)}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
