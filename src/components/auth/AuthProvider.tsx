"use client";

import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from "react";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  role?: string | null;
};

type AuthStatus = "loading" | "signed-out" | "signed-in";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  isProcessing: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Temporary mock authentication provider.
 * Sets up the context structure that will later be backed by Supabase auth.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Simulate reading the session from storage/backend
  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus("signed-out");
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  const signIn = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    await new Promise(resolve => setTimeout(resolve, 600));

    setUser({
      id: "demo-user",
      email: "demo.user@example.com",
      fullName: "Demo User",
      avatarUrl: null,
      role: "facilitator",
    });
    setStatus("signed-in");
    setIsProcessing(false);
  }, [isProcessing]);

  const signOut = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    await new Promise(resolve => setTimeout(resolve, 300));

    setUser(null);
    setStatus("signed-out");
    setIsProcessing(false);
  }, [isProcessing]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, isProcessing, signIn, signOut }),
    [status, user, isProcessing, signIn, signOut]
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
