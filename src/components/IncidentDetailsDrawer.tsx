"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  CheckSquare,
  Clock,
  Clock3,
  Edit,
  Lock,
  LogIn,
  MapPin,
  Megaphone,
  Pencil,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  Waves,
  X,
  type LucideIcon
} from "lucide-react";
import { formatRelativeTime, incidentTypeMeta, severityColorMeta } from "@/lib/floodReports";
import type { AuthUser } from "@/hooks/useAuth";
import type { Incident, IncidentType, SeverityLevel, IncidentStatus, VerificationVote, IncidentReport } from "@/lib/types";

type IncidentDetailsDrawerProps = {
  incident: Incident;
  user: AuthUser | null;
  onVerify: (incidentId: string, vote: VerificationVote, reporter: string) => Promise<void> | void;
  onEdit: (
    incidentId: string,
    updates: Partial<Incident> & { latitude?: number; longitude?: number }
  ) => Promise<void> | void;
  onDelete: (incidentId: string) => Promise<void> | void;
  onEditReport: (reportId: string, notes: string, severity: SeverityLevel, token?: string) => Promise<boolean>;
  onDeleteReport: (reportId: string, token?: string) => Promise<boolean>;
  onClose: () => void;
  onOpenAuth: () => void;
};

const incidentTypeOptions = Object.keys(incidentTypeMeta) as IncidentType[];
const severityOptions = Object.keys(severityColorMeta) as SeverityLevel[];
const statusOptions: IncidentStatus[] = ["active", "receding", "resolved", "archived"];

function shortRelativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const voteOptions: Array<{
  id: VerificationVote;
  label: string;
  icon: LucideIcon;
  bg: string;
  text: string;
  border: string;
}> = [
  { id: "still-flooded",   label: "Still Flooded",   icon: Waves,       bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" },
  { id: "water-rising",    label: "Water Rising",    icon: TrendingUp,  bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  { id: "water-receding",  label: "Water Receding",  icon: TrendingDown, bg: "#f0fdfa", text: "#134e4a", border: "#99f6e4" },
  { id: "road-cleared",    label: "Road Cleared",    icon: BadgeCheck,  bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
  { id: "false-report",    label: "False Report",    icon: X,           bg: "#fff1f2", text: "#9f1239", border: "#fecdd3" }
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

type StatCardProps = {
  icon: LucideIcon;
  value: React.ReactNode;
  label: string;
  sub?: React.ReactNode;
};

function StatCard({ icon: Icon, value, label, sub }: StatCardProps) {
  return (
    <div className="incident-stat">
      <span className="incident-stat-icon"><Icon size={13} /></span>
      <strong>{value}</strong>
      <span className="incident-stat-label">{label}</span>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

export function IncidentDetailsDrawer({
  incident,
  user,
  onVerify,
  onEdit,
  onDelete,
  onEditReport,
  onDeleteReport,
  onClose,
  onOpenAuth
}: IncidentDetailsDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastVote, setLastVote] = useState<VerificationVote | null>(null);
  const [voteSuccess, setVoteSuccess] = useState(false);

  // ── Parent Edit / delete state ───────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isSavingParentEdit, setIsSavingParentEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
    type: incident.type,
    severity: incident.severity,
    status: incident.status,
    roadName: incident.roadName,
    landmark: incident.landmark,
    district: incident.district
  });

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

  const typeMeta = incidentTypeMeta[incident.type] ?? { label: incident.type, icon: MapPin };
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

  // Expose Freshness
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
        icon: Clock3
      };
    }
    if (elapsedHours < 0.5) {
      return {
        label: "Fresh" as const,
        color: "#16a34a",
        bg: "#f0fdf4",
        border: "#bbf7d0",
        icon: BadgeCheck
      };
    }
    if (elapsedHours < 3) {
      return {
        label: "Recent" as const,
        color: "#0d9488",
        bg: "#f0fdfa",
        border: "#99f6e4",
        icon: Clock3
      };
    }
    if (elapsedHours < 12) {
      return {
        label: "Old" as const,
        color: "#d97706",
        bg: "#fffbeb",
        border: "#fef3c7",
        icon: Clock
      };
    }
    return {
      label: "Stale" as const,
      color: "#4b5563",
      bg: "#f9fafb",
      border: "#e5e7eb",
      icon: Clock
    };
  }, [incident.updatedAt, incident.createdAt, incident.needsVerification]);

  // Chronological timeline newest first
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

      const targetTable = a.targetTable.replace("incident_", "");
      const isRedundantCreate =
        a.action === "Create" &&
        (targetTable === "incidents" || targetTable === "reports");
      const isRedundantVerify =
        a.action === "Verify" && targetTable === "verifications";

      if (isRedundantCreate || isRedundantVerify) continue;

      list.push({
        id: `a-${a.id}`,
        type: "Moderator Action",
        timestamp: a.createdAt,
        reporter: a.userId || "System Coordinator",
        notes: `${a.action} performed on ${targetTable}.`
      });
    }

    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [incident.reports, incident.verifications, incident.auditLogs]);

  // Quick stats data
  const stats = useMemo(() => {
    const totalReports = incident.reports?.length ?? 0;
    const uniqueUsers = new Set(
      incident.reports?.map((r) => r.reporter.toLowerCase().trim())
    ).size;
    const lastReportTime = incident.lastReportAt || incident.updatedAt || incident.createdAt;
    const dominantVote = verif.dominant
      ? voteOptions.find((v) => v.id === verif.dominant)?.label
      : null;

    return {
      totalReports,
      uniqueUsers,
      lastReportTime,
      dominantVote
    };
  }, [incident, verif]);

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

  function requireManage(action: () => void) {
    if (!user) {
      onOpenAuth();
      return;
    }
    action();
  }

  function startEditing() {
    setEditForm({
      type: incident.type,
      severity: incident.severity,
      status: incident.status,
      roadName: incident.roadName,
      landmark: incident.landmark,
      district: incident.district
    });
    setEditError("");
    setIsDeleteConfirming(false);
    setIsEditing(true);
  }

  async function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault();
    setIsSavingParentEdit(true);
    setEditError("");
    try {
      await onEdit(incident.id, editForm);
      setIsEditing(false);
    } catch (err) {
      console.warn("Edit failed:", err);
      setEditError("Could not save changes. Try again.");
    } finally {
      setIsSavingParentEdit(false);
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

  async function handleConfirmDelete() {
    setIsSavingParentEdit(true);
    setEditError("");
    try {
      await onDelete(incident.id);
      onClose();
    } catch (err) {
      console.warn("Delete failed:", err);
      setEditError("Could not delete incident. Try again.");
      setIsDeleteConfirming(false);
      setIsSavingParentEdit(false);
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
            <typeMeta.icon size={14} className="shrink-0" />
            <span>{incident.type}</span>
          </div>
          <h2>{incident.roadName}</h2>
          <p className="incident-landmark">Near {incident.landmark}, {incident.district}</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      {/* ── Status badges ───────────────────────────────── */}
      <div className="incident-badges">
        <span
          className="incident-freshness-badge"
          style={{
            background: freshness.bg,
            color: freshness.color,
            border: `1px solid ${freshness.border}`
          }}
        >
          <freshness.icon size={12} /> {freshness.label}
        </span>

        <span className="incident-severity-badge" style={{ background: sevMeta.color }}>
          {sevMeta.label}
        </span>

        <span className="incident-status-badge" data-status={incident.status}>
          {incident.status}
        </span>

        {verif.isVerified && (
          <span className="incident-verified-badge">
            <CheckCircle2 size={12} />
            Community verified
          </span>
        )}
      </div>

      {/* ── Edit / Delete incident buttons ──────────────── */}
      {!isEditing && !isDeleteConfirming && (
        <div className="incident-manage-bar">
          <button
            type="button"
            className="incident-manage-btn incident-manage-btn--primary"
            onClick={() => requireManage(startEditing)}
          >
            <Pencil size={13} />
            Edit Incident
          </button>
          <button
            type="button"
            className="incident-manage-btn incident-manage-btn--danger"
            onClick={() => requireManage(() => { setEditError(""); setIsDeleteConfirming(true); })}
          >
            <Trash2 size={13} />
            Delete Incident
          </button>
          {!user ? <span className="incident-manage-hint">Sign in to edit or delete</span> : null}
        </div>
      )}

      {isDeleteConfirming && (
        <div className="incident-delete-confirm">
          <p className="incident-delete-confirm-title">Delete this incident?</p>
          <p className="incident-delete-confirm-sub">
            This permanently removes “{incident.roadName}” and all of its reports.
          </p>
          {editError ? <p className="incident-edit-error">{editError}</p> : null}
          <div className="incident-delete-confirm-actions">
            <button
              type="button"
              className="incident-btn incident-btn--secondary"
              onClick={() => { setIsDeleteConfirming(false); setEditError(""); }}
              disabled={isSavingParentEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              className="incident-btn incident-btn--danger"
              onClick={() => void handleConfirmDelete()}
              disabled={isSavingParentEdit}
            >
              {isSavingParentEdit ? "Deleting..." : "Delete permanently"}
            </button>
          </div>
        </div>
      )}

      {isEditing && (
        <form className="incident-edit-form" onSubmit={handleSaveEdit}>
          <p className="incident-edit-title">Edit incident</p>

          <div className="incident-edit-field">
            <span className="incident-edit-label">Road / River</span>
            <input
              className="incident-edit-input"
              value={editForm.roadName}
              onChange={(e) => setEditForm((f) => ({ ...f, roadName: e.target.value }))}
            />
          </div>

          <div className="incident-edit-field">
            <span className="incident-edit-label">Landmark</span>
            <input
              className="incident-edit-input"
              value={editForm.landmark}
              onChange={(e) => setEditForm((f) => ({ ...f, landmark: e.target.value }))}
            />
          </div>

          <div className="incident-edit-field">
            <span className="incident-edit-label">District</span>
            <input
              className="incident-edit-input"
              value={editForm.district}
              onChange={(e) => setEditForm((f) => ({ ...f, district: e.target.value }))}
            />
          </div>

          <div className="incident-edit-field">
            <span className="incident-edit-label">Incident Type</span>
            <select
              className="incident-edit-input"
              value={editForm.type}
              onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value as IncidentType }))}
            >
              {incidentTypeOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="incident-edit-field">
            <span className="incident-edit-label">Severity</span>
            <select
              className="incident-edit-input"
              value={editForm.severity}
              onChange={(e) => setEditForm((f) => ({ ...f, severity: e.target.value as SeverityLevel }))}
            >
              {severityOptions.map((s) => (
                <option key={s} value={s}>{severityColorMeta[s].label}</option>
              ))}
            </select>
          </div>

          <div className="incident-edit-field">
            <span className="incident-edit-label">Status</span>
            <select
              className="incident-edit-input"
              value={editForm.status}
              onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as IncidentStatus }))}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {editError ? <p className="incident-edit-error">{editError}</p> : null}

          <div className="incident-edit-form-actions">
            <button
              type="button"
              className="incident-btn incident-btn--secondary"
              onClick={() => { setIsEditing(false); setEditError(""); }}
              disabled={isSavingParentEdit}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="incident-btn incident-btn--primary"
              disabled={isSavingParentEdit}
            >
              {isSavingParentEdit ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      )}

      {/* ── Quick stats ─────────────────────────────────── */}
      <div className="incident-quick-stats">
        <StatCard
          icon={Megaphone}
          value={stats.totalReports}
          label="Reports"
          sub={`Last ${shortRelativeTime(stats.lastReportTime)}`}
        />
        <StatCard
          icon={Users}
          value={verif.total}
          label="Verifications"
          sub={
            stats.dominantVote
              ? `Mostly "${stats.dominantVote}" from ${stats.uniqueUsers} reporter${stats.uniqueUsers === 1 ? "" : "s"}`
              : `${stats.uniqueUsers} reporter${stats.uniqueUsers === 1 ? "" : "s"}`
          }
        />
        <StatCard
          icon={Clock3}
          value={shortRelativeTime(incident.updatedAt || incident.createdAt)}
          label="Last Updated"
          sub={freshness.label}
        />
      </div>

      {/* ── Timeline ────────────────────────────────────── */}
      <div className="incident-timeline">
        <p className="eyebrow">
          <Clock size={12} />
          Incident Timeline ({timelineEvents.length})
        </p>

        {timelineEvents.length === 0 ? (
          <p className="incident-timeline-notes incident-timeline-notes--empty">
            No reports or verifications yet for this incident.
          </p>
        ) : (
          <div className="incident-timeline-list">
            {timelineEvents.map((event) => {
              const isReport = event.reportObj !== undefined;
              const rObj = event.reportObj;

              // Auth verification checks for editing/deleting a report
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
                <article key={event.id} className="incident-timeline-item">
                  <span
                    className="incident-timeline-dot"
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
                          : "var(--amber)"
                    }}
                  />
                  <div className="incident-timeline-body">
                    <div className="incident-timeline-meta">
                      <span className="incident-timeline-reporter">
                        <Users size={12} />
                        {event.reporter}
                      </span>
                      <span className="incident-timeline-time">
                        <Clock3 size={12} />
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>

                    <div className="incident-timeline-type-row">
                      <span className="incident-timeline-type">{event.type}</span>
                      {event.severity && (
                        <span
                          className="incident-timeline-severity"
                          style={{ background: severityColorMeta[event.severity].color }}
                        >
                          {severityColorMeta[event.severity].label}
                        </span>
                      )}
                    </div>

                    {editingReportId === event.id && rObj ? (
                      <div className="incident-report-edit-inline">
                        <div>
                          <label className="incident-edit-label">Edit Report Notes</label>
                          <textarea
                            className="incident-edit-input"
                            rows={2}
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="incident-edit-label">Severity</label>
                          <select
                            className="incident-edit-input"
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
                        <div className="incident-edit-form-actions">
                          <button
                            type="button"
                            className="incident-btn incident-btn--secondary"
                            onClick={() => setEditingReportId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="incident-btn incident-btn--primary"
                            disabled={isSavingEdit}
                            onClick={() => saveEdit(event.id)}
                          >
                            <Save size={13} />
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {event.notes ? (
                          <p className="incident-timeline-notes">{event.notes}</p>
                        ) : (
                          <p className="incident-timeline-notes incident-timeline-notes--empty">
                            No notes attached
                          </p>
                        )}

                        {event.photos && event.photos.length > 0 && (
                          <div className="incident-timeline-photos">
                            {event.photos.map((u, idx) => (
                              <a
                                key={idx}
                                href={u}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="incident-photo-thumb"
                              >
                                <img src={u} alt="Attachment" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {showActions && editingReportId !== event.id && rObj && (
                      <div className="incident-timeline-actions">
                        {(userRole === "admin" || userRole === "moderator" || isGuestTokenValid || (user && rObj.reporterId === user.id)) && (
                          <button type="button" onClick={() => startEdit(rObj)}>
                            <Edit size={12} /> Edit
                          </button>
                        )}
                        {(userRole === "admin" || isGuestTokenValid || (user && rObj.reporterId === user.id)) && (
                          <button type="button" className="danger" onClick={() => deleteReport(rObj.id)}>
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>
                    )}

                    {guestExpired && (
                      <div className="incident-timeline-locked">
                        This report is locked. Sign in to request changes.
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Verify section ───────────────────────────────── */}
      <div className="incident-verify-section">
        <p className="eyebrow">
          <CheckSquare size={12} />
          Verify this incident
        </p>

        {!user ? (
          <div className="incident-auth-gate">
            <div className="incident-auth-gate-icon">
              <Lock size={20} />
            </div>
            <p className="incident-auth-gate-title">Sign in to verify</p>
            <p className="incident-auth-gate-sub">
              Anyone can submit reports. Verification requires a Google account to
              prevent false data from affecting emergency response.
            </p>
            <button
              type="button"
              className="incident-auth-gate-btn"
              onClick={onOpenAuth}
            >
              <LogIn size={14} />
              Sign in with Google
            </button>
          </div>
        ) : voteSuccess ? (
          <div className="incident-vote-success">
            <CheckCircle2 size={18} />
            <div>
              <p className="incident-vote-success-title">Verification recorded</p>
              <p className="incident-vote-success-sub">
                Voted "{voteOptions.find((v) => v.id === lastVote)?.label}" as {user.name}
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="incident-verify-hint">
              Signed in as <strong>{user.name}</strong>
              {user.isReal ? (
                <span className="incident-google-badge">Google</span>
              ) : (
                <span className="incident-demo-badge">Demo</span>
              )}
            </p>

            <div className="incident-vote-grid">
              {voteOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="incident-vote-btn"
                  style={{ background: opt.bg, color: opt.text, borderColor: opt.border }}
                  disabled={isSubmitting}
                  onClick={() => handleVote(opt.id)}
                >
                  <span className="incident-vote-icon"><opt.icon size={16} /></span>
                  <span>{opt.label}</span>
                  {voteCounts[opt.id] > 0 && (
                    <span className="incident-vote-count">{voteCounts[opt.id]}</span>
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
