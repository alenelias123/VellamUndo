"use client";

import { useState } from "react";
import { ShieldCheck, AlertTriangle, Clock, Calendar, CheckSquare, XCircle, Send, Users, ChevronRight } from "lucide-react";
import { formatRelativeTime } from "@/lib/floodReports";
import { incidentTypeMeta, severityColorMeta } from "@/lib/floodReports";
import type { Incident, VerificationVote } from "@/lib/types";

type IncidentDetailsDrawerProps = {
  incident: Incident;
  onVerify: (incidentId: string, vote: VerificationVote, reporter: string) => Promise<void> | void;
  onClose: () => void;
};

const voteOptions: Array<{ id: VerificationVote; label: string; icon: string; colorClass: string }> = [
  { id: "still-flooded", label: "Still Flooded", icon: "🌊", colorClass: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200" },
  { id: "water-rising", label: "Water Rising", icon: "📈", colorClass: "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200" },
  { id: "water-receding", label: "Water Receding", icon: "📉", colorClass: "bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-200" },
  { id: "road-cleared", label: "Road Cleared", icon: "✅", colorClass: "bg-green-100 text-green-800 border-green-200 hover:bg-green-200" },
  { id: "false-report", label: "False Report", icon: "❌", colorClass: "bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200" }
];

export function IncidentDetailsDrawer({
  incident,
  onVerify,
  onClose
}: IncidentDetailsDrawerProps) {
  const [verifier, setVerifier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [voteCasted, setVoteCasted] = useState(false);

  const typeMeta = incidentTypeMeta[incident.type] || { label: incident.type, icon: "📍" };
  const sevMeta = severityColorMeta[incident.severity];

  // Extract all photos uploaded across reports
  const allPhotos = incident.reports?.reduce((acc, report) => {
    if (report.photos) {
      return [...acc, ...report.photos];
    }
    return acc;
  }, [] as string[]) || [];

  async function handleVoteSubmit(voteId: VerificationVote) {
    const verifierName = verifier.trim() || "Community verifier";
    setIsSubmitting(true);
    try {
      await onVerify(incident.id, voteId, verifierName);
      setVoteCasted(true);
      setTimeout(() => {
        setVoteCasted(false);
      }, 3000);
    } catch (err) {
      console.warn("Failed to cast verification vote:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel-stack incident-detail-drawer" aria-label="Incident Details Panel">
      <div className="panel-section bg-white border-b border-gray-100 p-4">
        {/* Drawer Header */}
        <div className="flex justify-between items-start gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>{typeMeta.icon}</span>
              <span>{incident.type}</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900 leading-tight mt-1">
              {incident.roadName}
            </h2>
            <p className="text-xs text-gray-500 italic mt-0.5">Near {incident.landmark}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-2.5 py-1 text-gray-400 hover:text-gray-900 border border-gray-200 rounded font-semibold bg-gray-50"
          >
            Close
          </button>
        </div>

        {/* Badges & Metrics Row */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span
            className="px-2 py-0.5 rounded text-xs font-bold text-white shadow-sm"
            style={{ backgroundColor: sevMeta.color }}
          >
            {sevMeta.label}
          </span>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 flex items-center gap-1">
            <ShieldCheck size={13} />
            {incident.confidence}% match
          </span>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-50 text-gray-700 border border-gray-200 capitalize">
            {incident.status}
          </span>
        </div>
      </div>

      {/* Image Gallery */}
      {allPhotos.length > 0 ? (
        <div className="panel-section image-gallery bg-gray-50 p-3 border-b border-gray-100">
          <p className="eyebrow mb-1.5 font-bold text-gray-500 uppercase tracking-wide">Photographic Evidence</p>
          <div className="flex gap-2 overflow-x-auto pb-1 max-h-[120px] scrollbar-thin">
            {allPhotos.map((url, idx) => (
              <a href={url} target="_blank" rel="noopener noreferrer" key={idx} className="shrink-0 rounded border border-gray-200 overflow-hidden shadow-sm relative group bg-white">
                <img
                  src={url}
                  alt={`Incident reference ${idx + 1}`}
                  className="h-[100px] w-[130px] object-cover group-hover:scale-105 transition-transform"
                />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {/* Timeline of User Submissions */}
      <div className="panel-section timeline bg-white p-4 border-b border-gray-100">
        <h3 className="eyebrow flex items-center gap-1 mb-3 text-gray-500 font-bold uppercase tracking-wider">
          <Clock size={14} />
          Report Timeline ({incident.reports?.length || 0})
        </h3>
        
        <div className="flex flex-col gap-3 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-100">
          {incident.reports?.map((report, idx) => (
            <article className="flex gap-3 items-start relative text-xs" key={report.id}>
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-50 border border-gray-200 shrink-0 text-sm font-bold text-gray-600 shadow-sm">
                #{idx + 1}
              </div>
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded p-2.5 shadow-xs leading-normal">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-gray-800 flex items-center gap-1">
                    <Users size={12} className="text-gray-400" />
                    {report.reporter}
                  </span>
                  <span className="text-[10px] text-gray-400 font-semibold font-mono">
                    {formatRelativeTime(report.createdAt)}
                  </span>
                </div>
                <span className="inline-block px-1 py-0.5 rounded text-[9px] font-bold text-white mb-1.5" style={{ backgroundColor: severityColorMeta[report.severity].color }}>
                  {severityColorMeta[report.severity].label}
                </span>
                {report.notes ? (
                  <p className="text-gray-700 leading-relaxed text-xs">{report.notes}</p>
                ) : (
                  <p className="text-gray-400 italic">No notes provided</p>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Community Verification Actions */}
      <div className="panel-section verification-box bg-gray-50 p-4">
        <h3 className="eyebrow flex items-center gap-1 mb-2 text-gray-500 font-bold uppercase tracking-wider">
          <CheckSquare size={14} />
          Verify Incident Status
        </h3>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Help emergency teams by checking conditions. Ensure you are within geographical range.
        </p>

        {/* Verifier identity */}
        <label className="text-xs font-bold text-gray-600 flex flex-col gap-1 mb-3">
          Verifier Label
          <input
            type="text"
            placeholder="e.g. Local volunteer, passerby"
            value={verifier}
            onChange={(e) => setVerifier(e.target.value)}
            className="w-full text-xs font-semibold rounded p-2 border border-gray-300 bg-white"
          />
        </label>

        {voteCasted ? (
          <div className="p-2 rounded bg-green-50 border border-green-200 text-green-800 text-xs font-bold text-center">
            Verification recorded! Confidence updated.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {voteOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleVoteSubmit(opt.id)}
                disabled={isSubmitting}
                className={`flex items-center gap-1.5 p-2 rounded text-xs font-bold border transition-colors justify-center min-h-[40px] shadow-sm ${opt.colorClass} ${
                  opt.id === "false-report" || opt.id === "road-cleared" ? "col-span-1" : "col-span-1"
                }`}
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
