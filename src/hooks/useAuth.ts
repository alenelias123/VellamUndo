"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AuthUserRole = "admin" | "moderator" | "user";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: AuthUserRole;
  /** true = signed in via real Supabase Google OAuth */
  isReal: boolean;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    if (!supabase) {
      try {
        const raw = window.localStorage.getItem("vu-demo-auth");
        if (raw) setState({ user: JSON.parse(raw), loading: false });
        else setState({ user: null, loading: false });
      } catch {
        setState({ user: null, loading: false });
      }
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setState({
        user: sessionToUser(data.session),
        loading: false
      });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: sessionToUser(session), loading: false });
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      const demoUser: AuthUser = {
        id: "demo-" + Math.random().toString(36).slice(2, 8),
        email: "demo.verifier@vellamundo.org",
        name: "Demo Verifier",
        avatarUrl: undefined,
        role: "user",
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
    role: getUserRole(u),
    isReal: true
  };
}

function resolveRoleValue(userLike: any): string {
  const candidates = [
    userLike?.user_metadata?.role,
    userLike?.app_metadata?.role,
    userLike?.raw_user_meta_data?.role,
    userLike?.raw_app_meta_data?.role
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.toLowerCase();
    }
  }

  return "";
}

function getUserRole(userLike: any): AuthUserRole {
  const normalizedEmail = (userLike?.email ?? "").toLowerCase();
  const normalizedRole = resolveRoleValue(userLike);

  if (normalizedRole === "admin" || normalizedEmail === "admin@vellamundo.org" || normalizedEmail === "9745093032p@gmail.com" || normalizedEmail === "aleneliascherian@gmail.com") {
    return "admin";
  }

  if (
    normalizedRole === "moderator" ||
    normalizedEmail.includes("moderator") ||
    normalizedEmail.endsWith("@volunteer.vellamundo.org")
  ) {
    return "moderator";
  }

  return "user";
}
