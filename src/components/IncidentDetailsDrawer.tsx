"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CheckSquare,
  Clock,
  LogIn,
  ShieldCheck,
  Users,
  X,
  Edit,
  Trash2,
  AlertTriangle,
  HelpCircle,
  Clock3
} from "lucide-react";
import { formatRelativeTime, incidentTypeMeta, severityColorMeta } from "@/lib/floodReports";
import type { AuthUser } from "@/hooks/useAuth";
import type { Incident, VerificationVote, SeverityLevel, IncidentReport } from "@/lib/types";

type IncidentDetailsDrawerProps = {
  incident: Incident;
  user: AuthUser | null;
  onVerify: (incidentId: string, vote: VerificationVote, reporter: string) => Promise<void> | void;
  onEditReport: (reportId: string, notes: string, severity: SeverityLevel, token?: string) => Promise<boolean>;
  onDeleteReport: (reportId: string, token?: string) => Promise<boolean>;
  onClose: () => void;
  onOpenAuth: () => void;
};

const voteOptions: Array<{
  id: VerificationVote;
  label: string;
  icon: string;
  bg: string;
  text: string;
  border: string;
}> = [
  { id: "still-flooded",   label: "Still Flooded",   icon: "🌊", bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" },
  { id: "water-rising",    label: "Water Rising",    icon: "📈", bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  { id: "water-receding",  label: "Water Receding",  icon: "📉", bg: "#f0fdfa", text: "#134e4a", border: "#99f6e4" },
  { id: "road-cleared",    label: "Road Cleared",    icon: "✅", bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
  { id: "false-report",    label: "False Report",    icon: "❌", bg: "#fff1f2", text: "#9f1239", border: "#fecdd3" }
];

type TimelineEvent = {
  id: string;
  type:
    | "Incident Reported"
    | "Water Rising"
    | "Water Receding"
    | "Still Flooded"
    | "Road Cleared"
    | "Volunteer Verified"
    | "Moderator Action"
    | "False Report";
  timestamp: string;
  reporter: string;
  notes?: string;
  photos?: string[];
  severity?: SeverityLevel;
  reportObj?: IncidentReport;
};

export function IncidentDetailsDrawer({
  incident,
  user,
  onVerify,
  onEditReport,
  onDeleteReport,
  onClose,
  onOpenAuth
}: IncidentDetailsDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastVote, setLastVote] = useState<VerificationVote | null>(null);
  const [voteSuccess, setVoteSuccess] = useState(false);

  // Guest ownership tokens from localStorage
  const [localTokens, setLocalTokens] = useState<Record<string, string>>({});
  
  // Inline edit state
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editSeverity, setEditSeverity] = useState<SeverityLevel>("WATERLOGGED");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Check roles helper
  const userRole = useMemo(() => {
    if (!user) return "guest";
    const email = user.email.toLowerCase();
    if (user.id?.includes("demo-") || email === "admin@vellamundo.org") return "admin";
    if (email.includes("moderator") || email.endsWith("@volunteer.vellamundo.org")) return "moderator";
    return "user";
  }, [user]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("vu-report-ownership-tokens");
      if (raw) setLocalTokens(JSON.parse(raw));
    } catch {}
  }, [incident]);

  const typeMeta = incidentTypeMeta[incident.type] ?? { label: incident.type, icon: "📍" };
  const sevMeta = severityColorMeta[incident.severity];

  const voteCounts = useMemo(() => {
    const counts: Record<VerificationVote, number> = {
      "still-flooded": 0,
      "water-rising": 0,
      "water-receding": 0,
      "road-cleared": 0,
      "false-report": 0
    };
    for (const v of incident.verifications ?? []) {
      counts[v.vote] = (counts[v.vote] ?? 0) + 1;
    }
    return counts;
  }, [incident.verifications]);

  const verif = useMemo(() => {
    const total = Object.values(voteCounts).reduce((s, n) => s + n, 0);
    if (total === 0) return { isVerified: false, dominant: null, total: 0 };
    const entries = Object.entries(voteCounts) as [VerificationVote, number][];
    entries.sort((a, b) => b[1] - a[1]);
    const [dominant, topCount] = entries[0];
    return { isVerified: topCount >= 2, dominant, total };
  }, [voteCounts]);

  const allPhotos = useMemo(() => {
    return incident.reports?.flatMap((r) => r.photos ?? []) ?? [];
  }, [incident.reports]);

  // Expose Freshness (Feature 3)
  const freshness = useMemo(() => {
    const updatedAtTime = new Date(incident.updatedAt || incident.createdAt).getTime();
    const elapsedMs = Date.now() - updatedAtTime;
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    if (incident.needsVerification || elapsedHours >= 24) {
      return {
        label: "Needs Verification" as const,
        color: "#b91c1c",
        bg: "#fef2f2",
        border: "#fca5a5",
        icon: "⚠️"
      };
    }
    if (elapsedHours < 0.5) {
      return {
        label: "Fresh" as const,
        color: "#16a34a",
        bg: "#f0fdf4",
        border: "#bbf7d0",
        icon: "🟢"
      };
    }
    if (elapsedHours < 3) {
      return {
        label: "Recent" as const,
        color: "#0d9488",
        bg: "#f0fdfa",
        border: "#99f6e4",
        icon: "🔵"
      };
    }
    if (elapsedHours < 12) {
      return {
        label: "Old" as const,
        color: "#d97706",
        bg: "#fffbeb",
        border: "#fef3c7",
        icon: "🟡"
      };
    }
    return {
      label: "Stale" as const,
      color: "#4b5563",
      bg: "#f9fafb",
      border: "#e5e7eb",
      icon: "⚪"
    };
  }, [incident.updatedAt, incident.createdAt, incident.needsVerification]);

  // Chronological timeline newest first (Feature 2)
  const timelineEvents = useMemo((): TimelineEvent[] => {
    const list: TimelineEvent[] = [];

    // Reports
    for (const r of incident.reports ?? []) {
      const isVol =
        r.reporter.toLowerCase().includes("volunteer") ||
        r.reporter.toLowerCase().includes("admin") ||
        r.reporterId === "admin" ||
        r.reporterId === "moderator";

      list.push({
        id: r.id,
        type: isVol ? "Volunteer Verified" : "Incident Reported",
        timestamp: r.createdAt,
        reporter: r.reporter,
        notes: r.notes,
        photos: r.photos,
        severity: r.severity,
        reportObj: r
      });
    }

    // Verifications
    for (const v of incident.verifications ?? []) {
      let voteType: TimelineEvent["type"] = "Still Flooded";
      if (v.vote === "water-rising") voteType = "Water Rising";
      else if (v.vote === "water-receding") voteType = "Water Receding";
      else if (v.vote === "road-cleared") voteType = "Road Cleared";
      else if (v.vote === "false-report") voteType = "False Report";

      const isVol =
        v.reporter.toLowerCase().includes("volunteer") ||
        v.reporter.toLowerCase().includes("admin");

      if (isVol) {
        list.push({
          id: `v-${v.id}`,
          type: "Volunteer Verified",
          timestamp: v.createdAt,
          reporter: v.reporter,
          notes: `Verified condition as: "${v.vote.replace("-", " ")}"`
        });
      } else {
        list.push({
          id: `v-${v.id}`,
          type: voteType,
          timestamp: v.createdAt,
          reporter: v.reporter
        });
      }
    }

    // Audit logs
    for (const a of incident.auditLogs ?? []) {
      if (a.userId?.startsWith("System")) continue;
      list.push({
        id: `a-${a.id}`,
        type: "Moderator Action",
        timestamp: a.createdAt,
        reporter: a.userId || "System Coordinator",
        notes: `${a.action} performed on ${a.targetTable.replace("incident_", "")}.`
      });
    }

    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [incident.reports, incident.verifications, incident.auditLogs]);

  // Report Explanation calculation (Feature 11)
  const reportExplanation = useMemo(() => {
    const totalReports = incident.reports?.length ?? 0;
    const uniqueUsers = new Set(
      incident.reports?.map((r) => r.reporter.toLowerCase().trim())
    ).size;
    const hasVolunteer =
      incident.reports?.some(
        (r) => r.reporter.toLowerCase().includes("volunteer") || r.reporter.toLowerCase().includes("admin")
      ) ||
      incident.verifications?.some(
        (v) => v.reporter.toLowerCase().includes("volunteer") || v.reporter.toLowerCase().includes("admin")
      );

    return {
      type: incident.type,
      severityText: sevMeta.label,
      totalReports,
      uniqueUsers,
      volunteerVerified: hasVolunteer,
      lastUpdatedText: formatRelativeTime(incident.updatedAt || incident.createdAt),
      confidence: incident.confidence
    };
  }, [incident, sevMeta]);

  async function handleVote(vote: VerificationVote) {
    if (!user) {
      onOpenAuth();
      return;
    }
    setIsSubmitting(true);
    try {
      await onVerify(incident.id, vote, user.name);
      setLastVote(vote);
      setVoteSuccess(true);
      setTimeout(() => setVoteSuccess(false), 4000);
    } catch (err) {
      console.warn("Vote failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(report: IncidentReport) {
    setEditingReportId(report.id);
    setEditNotes(report.notes || "");
    setEditSeverity(report.severity);
  }

  async function saveEdit(reportId: string) {
    setIsSavingEdit(true);
    const token = localTokens[reportId];
    try {
      const ok = await onEditReport(reportId, editNotes, editSeverity, token);
      if (ok) {
        setEditingReportId(null);
      }
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function deleteReport(reportId: string) {
    if (confirm("Are you sure you want to delete this report? This action is permanent.")) {
      const token = localTokens[reportId];
      await onDeleteReport(reportId, token);
    }
  }

  return (
    <section className="incident-drawer" aria-label="Incident Details">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="incident-drawer-header">
        <div className="incident-drawer-title">
          <div className="incident-type-eyebrow">
            <span>{typeMeta.icon}</span>
            <span>{incident.type}</span>
          </div>
          <h2>{incident.roadName}</h2>
          <p className="incident-landmark">Near {incident.landmark}, {incident.district}</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      {/* ── Freshness Warning and Status Badges ─────────── */}
      <div className="incident-badges flex flex-wrap gap-2 mb-4">
        {/* Freshness Badge (Feature 3) */}
        <span
          className="incident-freshness-badge px-2 py-1 rounded text-xs font-semibold flex items-center gap-1"
          style={{
            background: freshness.bg,
            color: freshness.color,
            border: `1px solid ${freshness.border}`
          }}
        >
          {freshness.icon} {freshness.label}
        </span>

        <span className="incident-severity-badge" style={{ background: sevMeta.color }}>
          {sevMeta.label}
        </span>

        <span className="incident-status-badge text-xs uppercase font-bold" data-status={incident.status}>
          {incident.status}
        </span>

        {verif.isVerified && (
          <span className="incident-verified-badge bg-green-50 text-green-700 px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
            <CheckCircle2 size={12} />
            Community verified
          </span>
        )}
      </div>

      {/* ── Report Explanation Box (Feature 11) ─────────── */}
      <div className="report-explanation-box bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 text-sm text-slate-700">
        <h4 className="font-semibold text-slate-800 flex items-center gap-1 mb-1">
          <HelpCircle size={14} /> Why is this active?
        </h4>
        <p className="leading-relaxed">
          This <strong>{reportExplanation.type}</strong> is active due to{" "}
          <strong>{reportExplanation.severityText}</strong> conditions. Verified by{" "}
          <strong>{reportExplanation.totalReports} report(s)</strong> across{" "}
          <strong>{reportExplanation.uniqueUsers} independent user(s)</strong>.
          {reportExplanation.volunteerVerified && (
            <span> Officially verified by emergency volunteers.</span>
          )}
          {" "}Updated <strong>{reportExplanation.lastUpdatedText}</strong>. Exposing a trust confidence level of{" "}
          <strong>{reportExplanation.confidence}%</strong>.
        </p>
      </div>

      {/* ── Expose Timestamps (Feature 1) ───────────────── */}
      <div className="incident-timestamps text-xs text-slate-500 mb-4 grid grid-cols-2 gap-1 border-b border-slate-100 pb-3">
        <div>🕒 First reported: {formatRelativeTime(incident.createdAt)}</div>
        <div>🔄 Last updated: {formatRelativeTime(incident.updatedAt || incident.createdAt)}</div>
        {incident.lastVerifiedAt && (
          <div>✓ Last verified: {formatRelativeTime(incident.lastVerifiedAt)}</div>
        )}
        {incident.lastReportAt && (
          <div>📣 Last report added: {formatRelativeTime(incident.lastReportAt)}</div>
        )}
      </div>

      {/* ── Photo Gallery ───────────────────────────────── */}
      {allPhotos.length > 0 && (
        <div className="incident-photos mb-4">
          <p className="eyebrow text-xs uppercase text-slate-400 font-bold mb-2">Evidence photos</p>
          <div className="incident-photo-scroll flex gap-2 overflow-x-auto pb-2">
            {allPhotos.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="incident-photo-thumb block w-20 h-20 rounded overflow-hidden border border-slate-200 flex-shrink-0"
              >
                <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── Chronological Timeline Newest First (Feature 2) ── */}
      <div className="incident-timeline mb-4">
        <p className="eyebrow text-xs uppercase text-slate-400 font-bold mb-3 flex items-center gap-1">
          <Clock size={12} />
          Incident Timeline ({timelineEvents.length})
        </p>

        <div className="incident-timeline-list flex flex-col gap-3 relative before:content-[''] before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
          {timelineEvents.map((event) => {
            const isReport = event.reportObj !== undefined;
            const rObj = event.reportObj;

            // Auth verification checks for editing/deleting (Features 5 & 6)
            let showActions = false;
            let isGuestTokenValid = false;

            if (isReport && rObj) {
              if (userRole === "admin") {
                showActions = true;
              } else if (userRole === "moderator") {
                showActions = true;
              } else if (user && rObj.reporterId === user.id) {
                showActions = true;
              } else if (rObj.isGuestReport && localTokens[rObj.id]) {
                // Verify 5-minute guest ownership window
                const elapsedMin = (Date.now() - new Date(rObj.createdAt).getTime()) / (1000 * 60);
                if (elapsedMin <= 5) {
                  showActions = true;
                  isGuestTokenValid = true;
                }
              }
            }

            const guestExpired =
              isReport && rObj?.isGuestReport && localTokens[rObj.id] &&
              (Date.now() - new Date(rObj.createdAt).getTime()) / (1000 * 60) > 5;

            return (
              <article key={event.id} className="incident-timeline-item flex gap-3 items-start relative pl-8">
                {/* Event Marker Dot */}
                <div
                  className="absolute left-2.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center text-[8px]"
                  style={{
                    background:
                      event.type === "Volunteer Verified"
                        ? "var(--green)"
                        : event.type === "Moderator Action"
                        ? "var(--blue)"
                        : event.type === "Road Cleared"
                        ? "#22c55e"
                        : event.type === "False Report"
                        ? "var(--red)"
                        : "var(--amber)",
                    marginLeft: "-1px"
                  }}
                />

                <div className="incident-timeline-body flex-1 bg-white p-3 rounded-lg border border-slate-100 shadow-sm text-sm">
                  <div className="incident-timeline-meta flex items-center justify-between mb-1 text-xs text-slate-500">
                    <span className="incident-timeline-reporter font-medium flex items-center gap-1">
                      <Users size={11} />
                      {event.reporter}
                    </span>
                    <span className="incident-timeline-time flex items-center gap-1">
                      <Clock3 size={10} />
                      {formatRelativeTime(event.timestamp)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                      {event.type}
                    </span>
                    {event.severity && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                        style={{ background: severityColorMeta[event.severity].color }}
                      >
                        {severityColorMeta[event.severity].label}
                      </span>
                    )}
                  </div>

                  {/* Notes content */}
                  {editingReportId === event.id && rObj ? (
                    // Inline Edit Form (Feature 5 & 6)
                    <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded flex flex-col gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          Edit Report Notes:
                        </label>
                        <textarea
                          className="w-full text-xs p-1.5 border border-slate-200 rounded"
                          rows={2}
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          Severity:
                        </label>
                        <select
                          className="w-full text-xs p-1 border border-slate-200 rounded"
                          value={editSeverity}
                          onChange={(e) => setEditSeverity(e.target.value as SeverityLevel)}
                        >
                          {Object.keys(severityColorMeta).map((key) => (
                            <option key={key} value={key}>
                              {severityColorMeta[key as SeverityLevel].label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          className="px-2 py-1 text-xs bg-slate-200 rounded font-semibold"
                          onClick={() => setEditingReportId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 text-xs bg-blue-600 text-white rounded font-semibold flex items-center gap-1"
                          disabled={isSavingEdit}
                          onClick={() => saveEdit(event.id)}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {event.notes ? (
                        <p className="text-slate-600 leading-relaxed">{event.notes}</p>
                      ) : (
                        <p className="text-slate-400 italic">No notes attached</p>
                      )}

                      {/* Display Photos inside timeline item */}
                      {event.photos && event.photos.length > 0 && (
                        <div className="flex gap-1.5 mt-2">
                          {event.photos.map((u, idx) => (
                            <a
                              key={idx}
                              href={u}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-12 h-12 rounded border border-slate-100 overflow-hidden block"
                            >
                              <img src={u} alt="Attachment" className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions Drawer Panel (Features 5 & 6) */}
                  {showActions && editingReportId !== event.id && rObj && (
                    <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-slate-100 text-xs">
                      {(userRole === "admin" || userRole === "moderator" || isGuestTokenValid || (user && rObj.reporterId === user.id)) && (
                        <button
                          type="button"
                          className="text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                          onClick={() => startEdit(rObj)}
                        >
                          <Edit size={10} /> Edit
                        </button>
                      )}
                      {(userRole === "admin" || isGuestTokenValid || (user && rObj.reporterId === user.id)) && (
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-800 flex items-center gap-0.5"
                          onClick={() => deleteReport(rObj.id)}
                        >
                          <Trash2 size={10} /> Delete
                        </button>
                      )}
                    </div>
                  )}

                  {/* Guest Expired Warning Lockout (Feature 5) */}
                  {guestExpired && (
                    <div className="mt-2 text-[10px] text-slate-400 italic">
                      This report is locked. Sign in to request changes.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* ── Verification Section ─────────────────────────── */}
      <div className="incident-verify-section bg-slate-50 p-4 rounded-lg border border-slate-200">
        <p className="eyebrow text-xs uppercase text-slate-400 font-bold mb-3 flex items-center gap-1">
          <CheckSquare size={12} />
          Verify this incident
        </p>

        {!user ? (
          <div className="incident-auth-gate text-center py-3 bg-white border border-slate-200 rounded p-4">
            <div className="incident-auth-gate-icon mb-1">🔒</div>
            <p className="incident-auth-gate-title font-semibold text-slate-800">Sign in to verify</p>
            <p className="incident-auth-gate-sub text-xs text-slate-500 mb-3">
              Anyone can submit reports. Verification requires a Google account to
              prevent false data from affecting emergency response.
            </p>
            <button
              type="button"
              className="incident-auth-gate-btn bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 mx-auto"
              onClick={onOpenAuth}
            >
              <LogIn size={13} />
              Sign in with Google
            </button>
          </div>
        ) : voteSuccess ? (
          <div className="incident-vote-success flex items-center gap-2 bg-green-50 border border-green-200 rounded p-3 text-green-800 text-sm">
            <CheckCircle2 size={18} />
            <div>
              <p className="incident-vote-success-title font-semibold">
                Verification recorded
              </p>
              <p className="incident-vote-success-sub text-xs opacity-90">
                Voted "{voteOptions.find((v) => v.id === lastVote)?.label}" as {user.name}
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="incident-verify-hint text-xs text-slate-600 mb-3">
              Signed in as <strong>{user.name}</strong>
              {user.isReal ? (
                <span className="incident-google-badge ml-1 bg-blue-100 text-blue-800 px-1 py-0.5 rounded text-[9px]">
                  Google
                </span>
              ) : (
                <span className="incident-demo-badge ml-1 bg-amber-100 text-amber-800 px-1 py-0.5 rounded text-[9px]">
                  Demo
                </span>
              )}
            </p>

            <div className="incident-vote-grid grid grid-cols-2 md:grid-cols-3 gap-2">
              {voteOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="incident-vote-btn border rounded p-2 text-xs flex flex-col items-center justify-center transition hover:opacity-90"
                  style={{ background: opt.bg, color: opt.text, borderColor: opt.border }}
                  disabled={isSubmitting}
                  onClick={() => handleVote(opt.id)}
                >
                  <span className="incident-vote-icon text-lg mb-1">{opt.icon}</span>
                  <span className="font-semibold">{opt.label}</span>
                  {voteCounts[opt.id] > 0 && (
                    <span className="incident-vote-count mt-1 bg-white px-1.5 py-0.5 rounded text-[9px] font-bold border border-slate-200">
                      {voteCounts[opt.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
