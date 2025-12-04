"use client";

import React, { createContext, useContext, useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Session, User, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/types";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  role?: string | null;
  profile?: Profile | null;
};

type AuthStatus = "loading" | "signed-out" | "signed-in";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  session: Session | null;
  profile: Profile | null;
  isProcessing: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, metadata?: { fullName?: string; firstName?: string; lastName?: string }) => Promise<{ error?: string }>;
  signInWithGoogle: (redirectTo?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setDevUser?: (profile: Profile) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEV_BYPASS_USER: AuthUser = {
  id: "dev-bypass-user",
  email: "dev@example.com",
  fullName: "Dev User",
  role: "admin",
  avatarUrl: null,
  profile: null,
};

/**
 * AuthProvider with Supabase Auth integration.
 * - Manages authentication state and session
 * - Debounces auth state changes to prevent rapid updates
 * - Redirects after sign out
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isDevBypass = useMemo(() => {
    const rawValue = (process.env.NEXT_PUBLIC_IS_DEV ?? "").toString().toLowerCase();
    return rawValue === "true" || rawValue === "1";
  }, []);

  const [status, setStatus] = useState<AuthStatus>(isDevBypass ? "signed-in" : "loading");
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(isDevBypass ? DEV_BYPASS_USER : null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Refs to prevent duplicate processing
  const initRef = useRef(false);
  const lastProcessedSessionId = useRef<string | null>(null);
  const lastEventRef = useRef<{ event: AuthChangeEvent; timestamp: number } | null>(null);
  const isSigningOutRef = useRef(false);

  // Simple profile fetch
  const fetchProfile = useCallback(async (authUser: User): Promise<Profile | null> => {
    if (isDevBypass) return null;

    console.log("[Auth] Fetching profile for:", authUser.email);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_id", authUser.id)
        .single();

      if (error) {
        console.warn("[Auth] Profile fetch error:", error.message);
        return null;
      }

      if (!data) {
        console.warn("[Auth] No profile found");
        return null;
      }

      // Fetch client name if needed
      let clientName: string | null = null;
      if (data.client_id) {
        const clientResult = await supabase
          .from("clients")
          .select("name")
          .eq("id", data.client_id)
          .single();
        clientName = clientResult.data?.name ?? null;
      }

      const profileData: Profile = {
        id: data.id,
        authId: data.auth_id,
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        fullName: data.full_name,
        role: data.role,
        clientId: data.client_id,
        clientName: clientName,
        avatarUrl: data.avatar_url,
        isActive: data.is_active,
        lastLogin: data.last_login,
        jobTitle: data.job_title ?? null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      console.log("[Auth] Profile loaded:", profileData.role);
      return profileData;
    } catch (error) {
      console.error("[Auth] Profile fetch exception:", error);
      return null;
    }
  }, [isDevBypass]);

  // Process session - with deduplication
  const processSession = useCallback(async (newSession: Session | null, event?: AuthChangeEvent) => {
    // Skip if signing out
    if (isSigningOutRef.current) {
      console.log("[Auth] Skipping processSession - signing out");
      return;
    }

    if (isDevBypass) {
      setUser(DEV_BYPASS_USER);
      setProfile(null);
      setStatus("signed-in");
      return;
    }

    const sessionId = newSession?.access_token ?? null;

    // Skip if same session (for TOKEN_REFRESHED events)
    if (event === "TOKEN_REFRESHED" && sessionId === lastProcessedSessionId.current) {
      console.log("[Auth] Skipping TOKEN_REFRESHED - same session");
      return;
    }

    // Debounce rapid events (within 1 second)
    const now = Date.now();
    if (lastEventRef.current && event) {
      const timeSinceLastEvent = now - lastEventRef.current.timestamp;
      if (timeSinceLastEvent < 1000 && lastEventRef.current.event === event) {
        console.log("[Auth] Debouncing rapid event:", event);
        return;
      }
    }

    if (event) {
      lastEventRef.current = { event, timestamp: now };
    }

    lastProcessedSessionId.current = sessionId;

    if (!newSession?.user) {
      console.log("[Auth] No session, setting signed-out");
      setUser(null);
      setProfile(null);
      setStatus("signed-out");
      return;
    }

    // Only fetch profile for SIGNED_IN or INITIAL_SESSION events, not TOKEN_REFRESHED
    const shouldFetchProfile = !event || event === "SIGNED_IN" || event === "INITIAL_SESSION";

    const authUser = newSession.user;
    let userProfile = profile; // Keep existing profile by default

    if (shouldFetchProfile) {
      userProfile = await fetchProfile(authUser);
      setProfile(userProfile);
    }

    setUser({
      id: authUser.id,
      email: authUser.email ?? "",
      fullName: userProfile?.fullName ?? authUser.user_metadata?.fullName ?? authUser.email ?? "Unknown",
      avatarUrl: userProfile?.avatarUrl ?? authUser.user_metadata?.avatarUrl ?? null,
      role: userProfile?.role ?? null,
      profile: userProfile,
    });

    console.log("[Auth] Session processed, status: signed-in");
    setStatus("signed-in");
  }, [fetchProfile, isDevBypass, profile]);

  // Dev user setter
  const setDevUser = useCallback((devProfile: Profile) => {
    if (!isDevBypass) return;

    setProfile(devProfile);
    setUser({
      id: devProfile.authId || devProfile.id,
      email: devProfile.email,
      fullName: devProfile.fullName || `${devProfile.firstName || ""} ${devProfile.lastName || ""}`.trim() || devProfile.email,
      avatarUrl: devProfile.avatarUrl,
      role: devProfile.role,
      profile: devProfile,
    });
    setStatus("signed-in");
  }, [isDevBypass]);

  // Initialize auth state - runs once
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    if (isDevBypass) {
      console.log("[Auth] Dev mode enabled");
      setStatus("signed-in");
      setUser(DEV_BYPASS_USER);
      return;
    }

    // Verify Supabase configuration
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error("[Auth] Supabase configuration missing");
      setStatus("signed-out");
      return;
    }

    let isMounted = true;

    // Get initial session
    console.log("[Auth] Getting initial session...");
    supabase.auth.getSession()
      .then(async ({ data: { session: initialSession }, error }) => {
        if (!isMounted) return;

        if (error) {
          console.error("[Auth] getSession error:", error);
          setStatus("signed-out");
          return;
        }

        console.log("[Auth] Initial session:", initialSession ? "exists" : "none");
        setSession(initialSession);
        await processSession(initialSession, "INITIAL_SESSION");
      })
      .catch((error) => {
        console.error("[Auth] getSession exception:", error);
        if (isMounted) setStatus("signed-out");
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      console.log("[Auth] Auth state changed:", event);

      // Handle SIGNED_OUT immediately
      if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        setProfile(null);
        setStatus("signed-out");
        lastProcessedSessionId.current = null;
        return;
      }

      setSession(newSession);
      await processSession(newSession, event);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isDevBypass, processSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (isDevBypass) {
      setStatus("signed-in");
      setUser(DEV_BYPASS_USER);
      return {};
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };

      if (data.session) {
        setSession(data.session);
        await processSession(data.session, "SIGNED_IN");
      }
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Sign in failed" };
    } finally {
      setIsProcessing(false);
    }
  }, [isDevBypass, processSession]);

  const signUp = useCallback(async (
    email: string,
    password: string,
    metadata?: { fullName?: string; firstName?: string; lastName?: string }
  ) => {
    if (isDevBypass) {
      setStatus("signed-in");
      setUser(DEV_BYPASS_USER);
      return {};
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: metadata?.fullName,
            fullName: metadata?.fullName,
            first_name: metadata?.firstName,
            firstName: metadata?.firstName,
            last_name: metadata?.lastName,
            lastName: metadata?.lastName,
          },
        },
      });

      if (error) return { error: error.message };

      if (data.session) {
        setSession(data.session);
        await processSession(data.session, "SIGNED_IN");
      }
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Sign up failed" };
    } finally {
      setIsProcessing(false);
    }
  }, [isDevBypass, processSession]);

  const signInWithGoogle = useCallback(async (redirectTo?: string) => {
    if (isDevBypass) {
      setStatus("signed-in");
      setUser(DEV_BYPASS_USER);
      return {};
    }

    setIsProcessing(true);
    try {
      if (typeof window === "undefined") {
        return { error: "Google sign in is only available in the browser" };
      }

      const currentUrl = new URL(window.location.href);
      const nextParam = redirectTo || currentUrl.searchParams.get("next") || "/admin";

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextParam)}`,
          skipBrowserRedirect: false,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          }
        }
      });

      if (error) {
        setIsProcessing(false);
        return { error: error.message };
      }
      return {};
    } catch (error) {
      setIsProcessing(false);
      return { error: error instanceof Error ? error.message : "Google sign in failed" };
    }
  }, [isDevBypass]);

  const signOut = useCallback(async () => {
    if (isDevBypass) {
      console.log("[Auth] Dev mode: skipping sign out");
      return;
    }

    console.log("[Auth] Signing out...");
    isSigningOutRef.current = true;
    setIsProcessing(true);

    try {
      // Clear state immediately
      setSession(null);
      setUser(null);
      setProfile(null);
      setStatus("signed-out");
      lastProcessedSessionId.current = null;

      // Call Supabase signOut
      await supabase.auth.signOut();
      console.log("[Auth] Signed out successfully");

      // Redirect to login page
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login";
      }
    } catch (error) {
      console.error("[Auth] Sign out error:", error);
      // Still redirect even if there's an error
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login";
      }
    } finally {
      isSigningOutRef.current = false;
      setIsProcessing(false);
    }
  }, [isDevBypass]);

  const refreshProfile = useCallback(async () => {
    if (isDevBypass || !session?.user) return;

    const userProfile = await fetchProfile(session.user);
    setProfile(userProfile);
    if (user) {
      setUser({
        ...user,
        fullName: userProfile?.fullName ?? user.fullName,
        avatarUrl: userProfile?.avatarUrl ?? user.avatarUrl,
        role: userProfile?.role ?? user.role,
        profile: userProfile,
      });
    }
  }, [fetchProfile, isDevBypass, session, user]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    session,
    profile,
    isProcessing,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    refreshProfile,
    setDevUser: isDevBypass ? setDevUser : undefined,
  }), [status, user, session, profile, isProcessing, signIn, signUp, signInWithGoogle, signOut, refreshProfile, isDevBypass, setDevUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
