"use client";

import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
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
  setDevUser?: (profile: Profile) => void; // Only available in dev mode
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
 * Manages authentication state, session, and user profile synchronization.
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

  // Fetch user profile from public.profiles
  const fetchProfile = useCallback(async (authUser: User): Promise<Profile | null> => {
    if (isDevBypass) {
      return null;
    }
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, clients(name)")
        .eq("auth_id", authUser.id)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        return null;
      }

      if (!data) {
        return null;
      }

      return {
        id: data.id,
        authId: data.auth_id,
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        fullName: data.full_name,
        role: data.role,
        clientId: data.client_id,
        clientName: data.clients?.name ?? null,
        avatarUrl: data.avatar_url,
        isActive: data.is_active,
        lastLogin: data.last_login,
        jobTitle: data.job_title ?? null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error("Exception fetching profile:", error);
      return null;
    }
  }, [isDevBypass]);

  // Update user state from session
  const updateUserFromSession = useCallback(
    async (session: Session | null) => {
      if (isDevBypass) {
        setUser(DEV_BYPASS_USER);
        setProfile(null);
        setStatus("signed-in");
        return;
      }

      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setStatus("signed-out");
        return;
      }

      const authUser = session.user;
      const userProfile = await fetchProfile(authUser);

      setProfile(userProfile);
      setUser({
        id: authUser.id,
        email: authUser.email ?? "",
        fullName: userProfile?.fullName ?? authUser.user_metadata?.fullName ?? authUser.email ?? "Unknown",
        avatarUrl: userProfile?.avatarUrl ?? authUser.user_metadata?.avatarUrl ?? null,
        role: userProfile?.role ?? null,
        profile: userProfile,
      });
      setStatus("signed-in");
    },
    [fetchProfile, isDevBypass]
  );

  // Function to set dev user (only in dev mode)
  const setDevUser = useCallback((profile: Profile) => {
    if (!isDevBypass) return;
    
    setProfile(profile);
    setUser({
      id: profile.authId || profile.id,
      email: profile.email,
      fullName: profile.fullName || `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || profile.email,
      avatarUrl: profile.avatarUrl,
      role: profile.role,
      profile: profile,
    });
    setStatus("signed-in");
    setSession(null);
  }, [isDevBypass]);

  // Initialize auth state
  useEffect(() => {
    if (isDevBypass) {
      // Try to load user from localStorage
      const storedUserId = typeof window !== "undefined" ? localStorage.getItem("dev_selected_user") : null;
      
      if (storedUserId) {
        // User will be loaded by DevUserSwitcher component
        // For now, use default dev user
        setStatus("signed-in");
        setUser(DEV_BYPASS_USER);
        setProfile(null);
        setSession(null);
      } else {
        setStatus("signed-in");
        setUser(DEV_BYPASS_USER);
        setProfile(null);
        setSession(null);
      }
      setIsProcessing(false);
      return;
    }

    let isMounted = true;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) {
        return;
      }
      setSession(session);
      updateUserFromSession(session);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) {
        return;
      }
      setSession(session);
      await updateUserFromSession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isDevBypass, updateUserFromSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (isDevBypass) {
      setStatus("signed-in");
      setUser(DEV_BYPASS_USER);
      setProfile(null);
      setSession(null);
      return {};
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (data.session) {
        setSession(data.session);
        await updateUserFromSession(data.session);
      }

      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : "An error occurred during sign in" };
    } finally {
      setIsProcessing(false);
    }
  }, [isDevBypass, updateUserFromSession]);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      metadata?: { fullName?: string; firstName?: string; lastName?: string }
    ) => {
      if (isDevBypass) {
        setStatus("signed-in");
        setUser(DEV_BYPASS_USER);
        setProfile(null);
        setSession(null);
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

        if (error) {
          return { error: error.message };
        }

        // If email confirmation is disabled, the user will be signed in immediately
        if (data.session) {
          setSession(data.session);
          await updateUserFromSession(data.session);
        }

        return {};
      } catch (error) {
        return { error: error instanceof Error ? error.message : "An error occurred during sign up" };
      } finally {
        setIsProcessing(false);
      }
    },
    [isDevBypass, updateUserFromSession]
  );

  const signInWithGoogle = useCallback(async (redirectTo?: string) => {
    if (isDevBypass) {
      setStatus("signed-in");
      setUser(DEV_BYPASS_USER);
      setProfile(null);
      setSession(null);
      return {};
    }

    setIsProcessing(true);
    try {
      if (typeof window === "undefined") {
        setIsProcessing(false);
        return { error: "Google sign in is only available in the browser" };
      }

      const url = new URL(window.location.href);
      const searchParamRedirect = url.searchParams.get("redirectTo");
      const nextParam = url.searchParams.get("next");

      const fallbackDestination = "/admin";

      const sanitizeDestination = (destination: string, { logOnError }: { logOnError: boolean }) => {
        try {
          const candidateUrl = new URL(destination, window.location.origin);
          if (candidateUrl.origin !== window.location.origin) {
            return null;
          }

          const normalizedDestination = `${candidateUrl.pathname}${candidateUrl.search}${candidateUrl.hash}`;
          return normalizedDestination === "/" ? null : normalizedDestination;
        } catch (error) {
          if (logOnError) {
            console.warn("Invalid redirect destination provided for Google sign-in", error);
          }
          return null;
        }
      };

      const nextDestination = (
        [
          { value: redirectTo, logOnError: true },
          { value: searchParamRedirect, logOnError: true },
          { value: nextParam, logOnError: true },
          { value: `${url.pathname}${url.search}${url.hash}`, logOnError: false },
        ]
          .map((candidate) => {
            if (!candidate.value) {
              return null;
            }

            return sanitizeDestination(candidate.value, { logOnError: candidate.logOnError });
          })
          .find((candidate) => candidate !== null)) ?? fallbackDestination;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextDestination)}`,
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

      // OAuth redirect will happen, no need to set isProcessing to false
      return {};
    } catch (error) {
      setIsProcessing(false);
      return { error: error instanceof Error ? error.message : "An error occurred during Google sign in" };
    }
  }, [isDevBypass]);

  const signOut = useCallback(async () => {
    if (isDevBypass) {
      console.info("Dev auth bypass enabled; skipping Supabase sign out.");
      setStatus("signed-in");
      setUser(DEV_BYPASS_USER);
      setProfile(null);
      setSession(null);
      return;
    }

    setIsProcessing(true);
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      setStatus("signed-out");
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [isDevBypass]);

  const refreshProfile = useCallback(async () => {
    if (isDevBypass) {
      return;
    }
    if (!session?.user) {
      return;
    }
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

  const value = useMemo<AuthContextValue>(
    () => ({
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
    }),
    [status, user, session, profile, isProcessing, signIn, signUp, signInWithGoogle, signOut, refreshProfile, isDevBypass, setDevUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
