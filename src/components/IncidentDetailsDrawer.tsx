"use client";

import { useState } from "react";
import {
  CheckCircle2,
  CheckSquare,
  Clock,
  Loader2,
  Lock,
  LogIn,
  Pencil,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  X
} from "lucide-react";
import { formatRelativeTime, incidentTypeMeta, severityColorMeta } from "@/lib/floodReports";
import type { AuthUser } from "@/hooks/useAuth";
import type { Incident, IncidentType, SeverityLevel, IncidentStatus, VerificationVote } from "@/lib/types";

type IncidentDetailsDrawerProps = {
  incident: Incident;
  user: AuthUser | null;
  onVerify: (incidentId: string, vote: VerificationVote, reporter: string) => Promise<void> | void;
  onEdit: (
    incidentId: string,
    updates: Partial<Incident> & { latitude?: number; longitude?: number }
  ) => Promise<void> | void;
  onDelete: (incidentId: string) => Promise<void> | void;
  onClose: () => void;
  onOpenAuth: () => void;
};

const incidentTypeOptions = Object.keys(incidentTypeMeta) as IncidentType[];
const severityOptions = Object.keys(severityColorMeta) as SeverityLevel[];
const statusOptions: IncidentStatus[] = ["active", "receding", "resolved", "archived"];

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

// Count votes of each type
function countVotes(incident: Incident) {
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
}

// Detect if the incident is considered "community verified" (≥2 same-direction votes)
function getVerificationSummary(incident: Incident): {
  isVerified: boolean;
  dominant: VerificationVote | null;
  total: number;
} {
  const counts = countVotes(incident);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  if (total === 0) return { isVerified: false, dominant: null, total: 0 };

  const entries = Object.entries(counts) as [VerificationVote, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [dominant, topCount] = entries[0];
  return { isVerified: topCount >= 2, dominant, total };
}

export function IncidentDetailsDrawer({
  incident,
  user,
  onVerify,
  onEdit,
  onDelete,
  onClose,
  onOpenAuth
}: IncidentDetailsDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastVote, setLastVote] = useState<VerificationVote | null>(null);
  const [voteSuccess, setVoteSuccess] = useState(false);

  // ── Edit / delete state ───────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
    type: incident.type,
    severity: incident.severity,
    status: incident.status,
    roadName: incident.roadName,
    landmark: incident.landmark,
    district: incident.district
  });

  const typeMeta = incidentTypeMeta[incident.type] ?? { label: incident.type, icon: "📍" };
  const sevMeta = severityColorMeta[incident.severity];
  const verif = getVerificationSummary(incident);
  const voteCounts = countVotes(incident);

  const allPhotos =
    incident.reports?.flatMap((r) => r.photos ?? []) ?? [];

  async function handleVote(vote: VerificationVote) {
    if (!user) { onOpenAuth(); return; }
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
    setIsSavingEdit(true);
    setEditError("");
    try {
      await onEdit(incident.id, editForm);
      setIsEditing(false);
    } catch (err) {
      console.warn("Edit failed:", err);
      setEditError("Could not save changes. Try again.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleConfirmDelete() {
    setIsSavingEdit(true);
    setEditError("");
    try {
      await onDelete(incident.id);
      onClose();
    } catch (err) {
      console.warn("Delete failed:", err);
      setEditError("Could not delete incident. Try again.");
      setIsDeleteConfirming(false);
      setIsSavingEdit(false);
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
          <p className="incident-landmark">Near {incident.landmark}</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      {/* ── Status badges ───────────────────────────────── */}
      <div className="incident-badges">
        <span
          className="incident-severity-badge"
          style={{ background: sevMeta.color }}
        >
          {sevMeta.label}
        </span>

        <span className="incident-confidence-badge">
          <ShieldCheck size={12} />
          {incident.confidence}% confidence
        </span>

        <span className="incident-status-badge" data-status={incident.status}>
          {incident.status}
        </span>

        {/* Community verified badge */}
        {verif.isVerified ? (
          <span className="incident-verified-badge">
            <CheckCircle2 size={12} />
            Community verified
          </span>
        ) : null}
      </div>

      {/* ── Management actions (authenticated only) ──────── */}
      {user ? (
        !isEditing && !isDeleteConfirming ? (
          <div className="incident-manage-bar">
            <button type="button" className="incident-manage-btn" onClick={startEditing}>
              <Pencil size={13} />
              Edit
            </button>
            <button
              type="button"
              className="incident-manage-btn incident-manage-btn--danger"
              onClick={() => { setIsDeleteConfirming(true); setEditError(""); }}
            >
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        ) : null
      ) : (
        <div className="incident-auth-gate incident-auth-gate--compact">
          <div className="incident-auth-gate-icon"><Lock size={13} /></div>
          <div>
            <p className="incident-auth-gate-title">Sign in to edit or delete this report</p>
            <p className="incident-auth-gate-sub">
              Managing reports is restricted to authenticated accounts.
            </p>
          </div>
          <button type="button" className="incident-auth-gate-btn" onClick={onOpenAuth}>
            <LogIn size={15} />
            Sign in with Google
          </button>
        </div>
      )}

      {isDeleteConfirming ? (
        <div className="incident-delete-confirm">
          <p className="incident-delete-confirm-title">Delete this incident?</p>
          <p className="incident-delete-confirm-sub">
            This permanently removes “{incident.roadName}” and all its reports.
          </p>
          {editError ? <p className="incident-edit-error">{editError}</p> : null}
          <div className="incident-delete-confirm-actions">
            <button
              type="button"
              className="incident-manage-btn"
              onClick={() => { setIsDeleteConfirming(false); setEditError(""); }}
              disabled={isSavingEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              className="incident-manage-btn incident-manage-btn--danger"
              onClick={() => void handleConfirmDelete()}
              disabled={isSavingEdit}
            >
              {isSavingEdit ? <><Loader2 size={13} className="report-spin" /> Deleting…</> : (<><Trash2 size={13} /> Delete permanently</>)}
            </button>
          </div>
        </div>
      ) : null}

      {isEditing ? (
        <form className="incident-edit-form" onSubmit={handleSaveEdit}>
          <p className="eyebrow">Edit incident</p>

          <label>
            Road / River
            <input
              value={editForm.roadName}
              onChange={(e) => setEditForm((f) => ({ ...f, roadName: e.target.value }))}
            />
          </label>

          <label>
            Landmark
            <input
              value={editForm.landmark}
              onChange={(e) => setEditForm((f) => ({ ...f, landmark: e.target.value }))}
            />
          </label>

          <label>
            District
            <input
              value={editForm.district}
              onChange={(e) => setEditForm((f) => ({ ...f, district: e.target.value }))}
            />
          </label>

          <label>
            Incident Type
            <select
              value={editForm.type}
              onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value as IncidentType }))}
            >
              {incidentTypeOptions.map((t) => (
                <option key={t} value={t}>{incidentTypeMeta[t].icon} {t}</option>
              ))}
            </select>
          </label>

          <label>
            Severity
            <select
              value={editForm.severity}
              onChange={(e) => setEditForm((f) => ({ ...f, severity: e.target.value as SeverityLevel }))}
            >
              {severityOptions.map((s) => (
                <option key={s} value={s}>{severityColorMeta[s].label}</option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              value={editForm.status}
              onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as IncidentStatus }))}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          {editError ? <p className="incident-edit-error">{editError}</p> : null}

          <div className="incident-edit-form-actions">
            <button
              type="button"
              className="incident-manage-btn"
              onClick={() => { setIsEditing(false); setEditError(""); }}
              disabled={isSavingEdit}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="incident-manage-btn incident-manage-btn--primary"
              disabled={isSavingEdit}
            >
              {isSavingEdit ? <><Loader2 size={13} className="report-spin" /> Saving…</> : (<><Save size={13} /> Save changes</>)}
            </button>
          </div>
        </form>
      ) : null}

      {/* ── Verification summary bar ─────────────────────── */}
      {verif.total > 0 ? (
        <div className="incident-verif-bar">
          <p className="incident-verif-bar-label">
            <CheckSquare size={12} />
            {verif.total} community verification{verif.total > 1 ? "s" : ""}
            {verif.dominant ? ` — most say "${voteOptions.find(v => v.id === verif.dominant)?.label}"` : ""}
          </p>
          <div className="incident-verif-votes">
            {voteOptions.map((opt) => {
              const count = voteCounts[opt.id];
              if (count === 0) return null;
              return (
                <span
                  key={opt.id}
                  className="incident-verif-vote-chip"
                  style={{ background: opt.bg, color: opt.text, borderColor: opt.border }}
                >
                  {opt.icon} {opt.label} <strong>×{count}</strong>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Photo gallery ───────────────────────────────── */}
      {allPhotos.length > 0 ? (
        <div className="incident-photos">
          <p className="eyebrow">Evidence photos</p>
          <div className="incident-photo-scroll">
            {allPhotos.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="incident-photo-thumb"
              >
                <img src={url} alt={`Evidence ${i + 1}`} />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Report timeline ─────────────────────────────── */}
      <div className="incident-timeline">
        <p className="eyebrow">
          <Clock size={12} />
          Report timeline ({incident.reports?.length ?? 0})
        </p>

        <div className="incident-timeline-list">
          {(incident.reports ?? []).map((report, idx) => (
            <article key={report.id} className="incident-timeline-item">
              <div className="incident-timeline-avatar">#{idx + 1}</div>
              <div className="incident-timeline-body">
                <div className="incident-timeline-meta">
                  <span className="incident-timeline-reporter">
                    <Users size={11} />
                    {report.reporter}
                  </span>
                  <span className="incident-timeline-time">
                    {formatRelativeTime(report.createdAt)}
                  </span>
                </div>
                <span
                  className="incident-timeline-severity"
                  style={{ background: severityColorMeta[report.severity].color }}
                >
                  {severityColorMeta[report.severity].label}
                </span>
                {report.notes ? (
                  <p className="incident-timeline-notes">{report.notes}</p>
                ) : (
                  <p className="incident-timeline-notes incident-timeline-notes--empty">
                    No notes
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* ── Verification section ─────────────────────────── */}
      <div className="incident-verify-section">
        <p className="eyebrow">
          <CheckSquare size={12} />
          Verify this incident
        </p>

        {!user ? (
          /* Not signed in — prompt */
          <div className="incident-auth-gate">
            <div className="incident-auth-gate-icon">🔒</div>
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
              <LogIn size={15} />
              Sign in with Google
            </button>
          </div>
        ) : voteSuccess ? (
          /* Success state */
          <div className="incident-vote-success">
            <CheckCircle2 size={20} />
            <div>
              <p className="incident-vote-success-title">
                Verification recorded
              </p>
              <p className="incident-vote-success-sub">
                Voted "{voteOptions.find(v => v.id === lastVote)?.label}" as {user.name}
              </p>
            </div>
          </div>
        ) : (
          /* Vote buttons */
          <>
            <p className="incident-verify-hint">
              Signed in as <strong>{user.name}</strong>
              {user.isReal ? (
                <span className="incident-google-badge">
                  <ShieldCheck size={10} /> Google
                </span>
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
                  <span className="incident-vote-icon">{opt.icon}</span>
                  <span>{opt.label}</span>
                  {voteCounts[opt.id] > 0 ? (
                    <span className="incident-vote-count">{voteCounts[opt.id]}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
