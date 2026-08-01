"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  /** true = signed in via real Supabase Google OAuth */
  isReal: boolean;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  // ── Supabase session bootstrap ──────────────────────────────────────
  useEffect(() => {
    if (!supabase) {
      // No Supabase configured — check for demo session in localStorage
      try {
        const raw = window.localStorage.getItem("vu-demo-auth");
        if (raw) setState({ user: JSON.parse(raw), loading: false });
        else setState({ user: null, loading: false });
      } catch {
        setState({ user: null, loading: false });
      }
      return;
    }

    // Real Supabase: get current session
    supabase.auth.getSession().then(({ data }) => {
      setState({
        user: sessionToUser(data.session),
        loading: false
      });
    });

    // Listen for sign-in / sign-out events
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: sessionToUser(session), loading: false });
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // ── Google OAuth sign-in ────────────────────────────────────────────
  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      // Demo fallback: simulate a signed-in user
      const demoUser: AuthUser = {
        id: "demo-" + Math.random().toString(36).slice(2, 8),
        email: "demo.verifier@vellamundo.org",
        name: "Demo Verifier",
        avatarUrl: undefined,
        isReal: false
      };
      window.localStorage.setItem("vu-demo-auth", JSON.stringify(demoUser));
      setState({ user: demoUser, loading: false });
      return;
    }

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin
      }
    });
  }, []);

  // ── Sign-out ────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    if (!supabase) {
      window.localStorage.removeItem("vu-demo-auth");
      setState({ user: null, loading: false });
      return;
    }
    await supabase.auth.signOut();
    setState({ user: null, loading: false });
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    isAuthenticated: state.user !== null,
    signInWithGoogle,
    signOut
  };
}

function sessionToUser(session: any): AuthUser | null {
  if (!session?.user) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email ?? "",
    name:
      u.user_metadata?.full_name ??
      u.user_metadata?.name ??
      u.email?.split("@")[0] ??
      "User",
    avatarUrl: u.user_metadata?.avatar_url,
    isReal: true
  };
}
