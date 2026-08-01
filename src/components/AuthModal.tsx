"use client";

import { useState } from "react";
import { LogIn, ShieldAlert, UserCheck, X } from "lucide-react";
import type { UserSession } from "@/hooks/useEmergencyStore";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (email: string, role: "user" | "admin") => void;
};

export function AuthModal({ isOpen, onClose, onLogin }: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    if (role === "admin" && password !== "admin123" && !email.includes("admin")) {
      // Allow flexible admin login with passkey or admin email
      if (password && password.length < 4) {
        setErrorMsg("Admin passkey must be at least 4 characters.");
        return;
      }
    }

    onLogin(email.trim(), role);
    onClose();
  }

  function quickDemoLogin(asRole: "user" | "admin") {
    const demoEmail = asRole === "admin" ? "admin@vellamundo.org" : "reporter@kerala.org";
    onLogin(demoEmail, asRole);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="auth-modal-card">
        <div className="modal-header">
          <div className="header-title">
            <LogIn size={22} />
            <h3>{role === "admin" ? "Admin Sign In" : "User Login Required"}</h3>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="modal-intro">
          {role === "admin"
            ? "Sign in as administrator to manage & delete reported flood locations."
            : "Please sign in to post new flood reports to Supabase database."}
        </p>

        <div className="role-selector">
          <button
            type="button"
            className={role === "user" ? "active" : ""}
            onClick={() => {
              setRole("user");
              setErrorMsg("");
            }}
          >
            <UserCheck size={16} /> Citizen / User
          </button>
          <button
            type="button"
            className={role === "admin" ? "active" : ""}
            onClick={() => {
              setRole("admin");
              setErrorMsg("");
            }}
          >
            <ShieldAlert size={16} /> Administrator
          </button>
        </div>

        {errorMsg ? <div className="error-alert">{errorMsg}</div> : null}

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email Address
            <input
              type="email"
              required
              placeholder={role === "admin" ? "admin@vellamundo.org" : "user@gmail.com"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label>
            Password / Passkey
            <input
              type="password"
              placeholder={role === "admin" ? "Default: admin123" : "Password..."}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button type="submit" className="submit-btn primary-action">
            <LogIn size={18} /> Sign In
          </button>
        </form>

        <div className="quick-login-section">
          <span className="divider-text">Or Quick Login</span>
          <div className="quick-buttons">
            <button
              type="button"
              className="quick-btn user-btn"
              onClick={() => quickDemoLogin("user")}
            >
              👤 Quick Citizen User
            </button>
            <button
              type="button"
              className="quick-btn admin-btn"
              onClick={() => quickDemoLogin("admin")}
            >
              🛡️ Quick Admin User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
