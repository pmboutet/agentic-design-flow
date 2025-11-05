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
    
    const startTime = Date.now();
    
    try {
      // Add timeout to prevent indefinite hanging
      // Use Promise.race to implement timeout
      const profilePromise = supabase
        .from("profiles")
        .select("*, clients(name)")
        .eq("auth_id", authUser.id)
        .single();

      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
        setTimeout(() => {
          resolve({ data: null, error: { message: "Profile fetch timeout" } });
        }, 8000);
      });

      // Race between the actual request and timeout
      const result = await Promise.race([profilePromise, timeoutPromise]);
      const elapsed = Date.now() - startTime;

      // Handle timeout
      if (result.error?.message === "Profile fetch timeout") {
        console.warn(`Profile fetch timed out after ${elapsed}ms. Continuing without profile.`);
        return null;
      }

      // Handle Supabase errors
      if (result.error) {
        console.error("Error fetching profile:", result.error);
        return null;
      }

      // Handle missing data
      if (!result.data) {
        console.log(`Profile fetch completed in ${elapsed}ms, but no data returned`);
        return null;
      }

      console.log(`Profile fetch completed successfully in ${elapsed}ms`);
      return {
        id: result.data.id,
        authId: result.data.auth_id,
        email: result.data.email,
        firstName: result.data.first_name,
        lastName: result.data.last_name,
        fullName: result.data.full_name,
        role: result.data.role,
        clientId: result.data.client_id,
        clientName: result.data.clients?.name ?? null,
        avatarUrl: result.data.avatar_url,
        isActive: result.data.is_active,
        lastLogin: result.data.last_login,
        jobTitle: result.data.job_title ?? null,
        createdAt: result.data.created_at,
        updatedAt: result.data.updated_at,
      };
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      console.error(`Exception fetching profile after ${elapsed}ms:`, {
        error: error?.message || error,
        name: error?.name,
      });
      // Always return null to prevent crashes - the app can work without profile
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

      // If profile is null (timeout or error), we still set the user but without profile
      // The AdminDashboard will check for profile and deny access if missing
      setProfile(userProfile);
      setUser({
        id: authUser.id,
        email: authUser.email ?? "",
        fullName: userProfile?.fullName ?? authUser.user_metadata?.fullName ?? authUser.email ?? "Unknown",
        avatarUrl: userProfile?.avatarUrl ?? authUser.user_metadata?.avatarUrl ?? null,
        role: userProfile?.role ?? null,
        profile: userProfile,
      });
      
      // Always set to signed-in even if profile is missing
      // The access control will handle missing profile by denying access
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

    // Verify Supabase configuration
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase configuration missing:", {
        hasUrl: !!supabaseUrl,
        hasAnonKey: !!supabaseAnonKey
      });
      setSession(null);
      setUser(null);
      setProfile(null);
      setStatus("signed-out");
      return;
    }

    // Set a timeout to prevent indefinite loading state
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn("Session check timed out after 10s, treating as signed-out. This may indicate:", {
          issue: "getSession() is not responding",
          possibleCauses: [
            "Network connectivity issues",
            "Supabase URL/Key misconfiguration",
            "CORS issues",
            "Cookie/session storage problems"
          ]
        });
        setSession(null);
        setUser(null);
        setProfile(null);
        setStatus("signed-out");
      }
    }, 10000); // 10 seconds timeout

    // Get initial session with better error handling
    const startTime = Date.now();
    supabase.auth.getSession()
      .then(async ({ data: { session }, error }) => {
        const elapsed = Date.now() - startTime;
        clearTimeout(timeoutId);
        
        if (!isMounted) {
          return;
        }

        if (error) {
          console.error("Error in getSession response:", error);
          setSession(null);
          setUser(null);
          setProfile(null);
          setStatus("signed-out");
          return;
        }

        console.log(`Session check completed in ${elapsed}ms`, {
          hasSession: !!session,
          hasUser: !!session?.user
        });

        try {
          setSession(session);
          await updateUserFromSession(session);
        } catch (error) {
          console.error("Error updating user from session:", error);
          if (!isMounted) {
            return;
          }
          // On error, treat as signed-out
          setSession(null);
          setUser(null);
          setProfile(null);
          setStatus("signed-out");
        }
      })
      .catch((error) => {
        const elapsed = Date.now() - startTime;
        clearTimeout(timeoutId);
        console.error(`Error getting session after ${elapsed}ms:`, {
          error,
          message: error?.message,
          stack: error?.stack
        });
        if (!isMounted) {
          return;
        }
        // On error, treat as signed-out
        setSession(null);
        setUser(null);
        setProfile(null);
        setStatus("signed-out");
      });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) {
        return;
      }
      try {
        setSession(session);
        await updateUserFromSession(session);
      } catch (error) {
        console.error("Error in auth state change:", error);
        if (!isMounted) {
          return;
        }
        // On error, treat as signed-out
        setSession(null);
        setUser(null);
        setProfile(null);
        setStatus("signed-out");
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
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
