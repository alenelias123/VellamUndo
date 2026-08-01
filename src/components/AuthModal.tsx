"use client";

import { LogIn, LogOut, ShieldCheck, User, X } from "lucide-react";
import type { AuthUser } from "@/hooks/useAuth";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
  loading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
};

export function AuthModal({
  isOpen,
  onClose,
  user,
  loading,
  onSignIn,
  onSignOut
}: AuthModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="auth-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Authentication"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="header-title">
            <ShieldCheck size={22} className="text-teal-700" />
            <h3>{user ? "Signed In" : "Sign In to Verify"}</h3>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="auth-loading">
            <span className="auth-spinner" />
            <span>Checking session…</span>
          </div>
        ) : user ? (
          /* ── Signed-in state ──────────────────────────── */
          <div className="auth-signed-in">
            <div className="auth-avatar-row">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="auth-avatar"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="auth-avatar auth-avatar--placeholder">
                  <User size={22} />
                </div>
              )}
              <div>
                <p className="auth-user-name">{user.name}</p>
                <p className="auth-user-email">{user.email}</p>
                {user.isReal ? (
                  <span className="auth-verified-tag">
                    <ShieldCheck size={11} /> Google verified
                  </span>
                ) : (
                  <span className="auth-demo-tag">Demo session</span>
                )}
              </div>
            </div>

            <p className="auth-capability-note">
              ✅ You can now verify flood reports and help emergency teams keep information accurate.
            </p>

            <button type="button" className="auth-signout-btn" onClick={() => { onSignOut(); onClose(); }}>
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        ) : (
          /* ── Sign-in state ────────────────────────────── */
          <div className="auth-signin-panel">
            <p className="auth-intro">
              Sign in with Google to verify flood reports. Viewers can add reports
              without signing in — verification requires an account to prevent spam.
            </p>

            <div className="auth-feature-list">
              <div className="auth-feature-row">
                <span className="auth-feature-icon auth-feature-icon--yes">✅</span>
                <span>Anyone can submit flood reports</span>
              </div>
              <div className="auth-feature-row">
                <span className="auth-feature-icon auth-feature-icon--lock">🔒</span>
                <span>Verification requires sign-in</span>
              </div>
              <div className="auth-feature-row">
                <span className="auth-feature-icon auth-feature-icon--yes">🏅</span>
                <span>Verified reports show a trust badge</span>
              </div>
            </div>

            <button type="button" className="auth-google-btn" onClick={() => { onSignIn(); onClose(); }}>
              {/* Google logo SVG */}
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
              </svg>
              Continue with Google
            </button>

            <p className="auth-privacy-note">
              Only your name and email are used. No flood data is shared with Google.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
