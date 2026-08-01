"use client";

import { FormEvent, useMemo, useState } from "react";
import { Camera, CheckCircle2, Flag, MapPin, RotateCcw, Send } from "lucide-react";
import { districts, findDistrictForCoordinates, getDistrictBySlug } from "@/lib/districts";
import {
  formatRelativeTime,
  getReportConfidence,
  severityMeta,
  type NewFloodReportInput
} from "@/lib/floodReports";
import type { Coordinates, FloodReport, FloodSeverity } from "@/lib/types";

type ReportPanelProps = {
  activeDistrictSlug: string;
  pendingLocation?: Coordinates;
  selectedReport?: FloodReport;
  reports: FloodReport[];
  onSubmit: (input: NewFloodReportInput) => FloodReport;
  onVerify: (reportId: string, action: "confirm" | "flag") => void;
  onSelectReport: (reportId: string) => void;
  onResetDemoData: () => void;
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
  onSubmit,
  onVerify,
  onSelectReport,
  onResetDemoData
}: ReportPanelProps) {
  const activeDistrict = getDistrictBySlug(activeDistrictSlug);
  const [roadName, setRoadName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [severity, setSeverity] = useState<FloodSeverity>("waterlogged");
  const [waterLevelCm, setWaterLevelCm] = useState(25);
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [createdBy, setCreatedBy] = useState("Community reporter");

  const submitLocation = pendingLocation ?? activeDistrict.center;
  const inferredDistrict = useMemo(
    () => findDistrictForCoordinates(submitLocation.lat, submitLocation.lng),
    [submitLocation.lat, submitLocation.lng]
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const report = onSubmit({
      roadName: roadName.trim() || "Unnamed road",
      district: inferredDistrict.slug,
      locationName: locationName.trim() || inferredDistrict.name,
      coordinates: submitLocation,
      severity,
      waterLevelCm,
      description: description.trim() || severityMeta[severity].guidance,
      imageUrl: imageUrl.trim() || undefined,
      createdBy: createdBy.trim() || "Community reporter"
    });

    onSelectReport(report.id);
    setRoadName("");
    setLocationName("");
    setSeverity("waterlogged");
    setWaterLevelCm(25);
    setDescription("");
    setImageUrl("");
  }

  return (
    <section className="panel-stack" aria-label="Flood reports">
      <div className="panel-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Live reporting</p>
            <h2>Report flooded road</h2>
          </div>
          <button className="icon-button" type="button" onClick={onResetDemoData} title="Reset demo data">
            <RotateCcw size={17} />
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Road name
            <input
              value={roadName}
              onChange={(event) => setRoadName(event.target.value)}
              placeholder="Aluva bridge approach"
            />
          </label>

          <label>
            Local landmark
            <input
              value={locationName}
              onChange={(event) => setLocationName(event.target.value)}
              placeholder="Near bank junction"
            />
          </label>

          <label>
            Water level
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
            Depth in cm
            <input
              type="number"
              min={0}
              max={250}
              value={waterLevelCm}
              onChange={(event) => setWaterLevelCm(Number(event.target.value))}
            />
          </label>

          <label className="span-2">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Traffic, vehicle risk, rescue access, landmarks"
            />
          </label>

          <label className="span-2">
            Photo URL
            <span className="input-with-icon">
              <Camera size={16} />
              <input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="Optional public image link"
              />
            </span>
          </label>

          <label>
            Reporter
            <input value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} />
          </label>

          <div className="coordinate-chip">
            <MapPin size={16} />
            <span>
              {submitLocation.lat.toFixed(4)}, {submitLocation.lng.toFixed(4)}
            </span>
          </div>

          <button className="primary-action span-2" type="submit">
            <Send size={17} />
            Submit report
          </button>
        </form>
      </div>

      {selectedReport ? (
        <div className="panel-section selected-report">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Selected report</p>
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
            <span>{selectedReport.waterLevelCm} cm</span>
            <span>{getReportConfidence(selectedReport)}% confidence</span>
            <span>{formatRelativeTime(selectedReport.createdAt)}</span>
          </div>
          <div className="action-row">
            <button type="button" onClick={() => onVerify(selectedReport.id, "confirm")}>
              <CheckCircle2 size={16} />
              Confirm
            </button>
            <button type="button" onClick={() => onVerify(selectedReport.id, "flag")}>
              <Flag size={16} />
              Flag
            </button>
          </div>
        </div>
      ) : null}

      <div className="panel-section compact-list">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Latest</p>
            <h2>Road status feed</h2>
          </div>
          <span className="count-badge">{reports.length}</span>
        </div>
        {reports.slice(0, 7).map((report) => (
          <button
            className="feed-item"
            type="button"
            key={report.id}
            onClick={() => onSelectReport(report.id)}
          >
            <span
              className="severity-dot"
              style={{ background: severityMeta[report.severity].color }}
            />
            <span>
              <strong>{report.roadName}</strong>
              <small>
                {districts.find((district) => district.slug === report.district)?.name ??
                  report.district}{" "}
                · {formatRelativeTime(report.createdAt)}
              </small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
