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
  availableUsers: AuthUser[];
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  switchUser: (userId: string | null) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LOCAL_STORAGE_KEY = "dev-auth-user-id";

// Mirrors the seed users defined in DATABASE_SETUP.md so we can impersonate real project roles during development.
const DEV_USERS: AuthUser[] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440011",
    email: "pierre.marie@techcorp.com",
    fullName: "Pierre-Marie Boutet",
    role: "facilitator",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440012",
    email: "sarah.manager@techcorp.com",
    fullName: "Sarah Martin",
    role: "manager",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440013",
    email: "dev.team@techcorp.com",
    fullName: "Alex Developer",
    role: "participant",
  },
];

function readStoredUserId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LOCAL_STORAGE_KEY);
}

function persistUserId(userId: string | null) {
  if (typeof window === "undefined") return;
  if (userId) {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, userId);
  } else {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  }
}

/**
 * Temporary mock authentication provider.
 * Sets up the context structure that will later be backed by Supabase auth.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const availableUsers = useMemo(() => DEV_USERS, []);

  useEffect(() => {
    const storedUserId = readStoredUserId();
    if (storedUserId) {
      const storedUser = availableUsers.find(candidate => candidate.id === storedUserId) ?? null;
      if (storedUser) {
        setUser(storedUser);
        setStatus("signed-in");
        return;
      }
    }
    setStatus("signed-out");
  }, [availableUsers]);

  const switchUser = useCallback(
    async (userId: string | null) => {
      if (isProcessing) return;

      setIsProcessing(true);

      await new Promise(resolve => setTimeout(resolve, 200));

      if (!userId) {
        setUser(null);
        setStatus("signed-out");
        persistUserId(null);
        setIsProcessing(false);
        return;
      }

      const nextUser = availableUsers.find(candidate => candidate.id === userId) ?? null;

      if (nextUser) {
        setUser(nextUser);
        setStatus("signed-in");
        persistUserId(nextUser.id);
      } else {
        setUser(null);
        setStatus("signed-out");
        persistUserId(null);
      }

      setIsProcessing(false);
    },
    [availableUsers, isProcessing]
  );

  const signIn = useCallback(async () => {
    const defaultUser = availableUsers[0];
    await switchUser(defaultUser?.id ?? null);
  }, [availableUsers, switchUser]);

  const signOut = useCallback(async () => {
    await switchUser(null);
  }, [switchUser]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, isProcessing, availableUsers, signIn, signOut, switchUser }),
    [status, user, isProcessing, availableUsers, signIn, signOut, switchUser]
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
