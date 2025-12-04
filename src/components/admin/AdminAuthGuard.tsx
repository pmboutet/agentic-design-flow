"use client";

import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";

interface AdminAuthGuardProps {
  children: ReactNode;
  allowedRoles?: string[];
}

const DEFAULT_ALLOWED_ROLES = ["full_admin", "project_admin", "facilitator", "manager", "admin"];

/**
 * Simplified AdminAuthGuard
 * - Trusts middleware for session check (if page renders, user has session)
 * - Only shows error states for specific issues (wrong role, inactive)
 * - No redirects, no timeouts - let middleware handle protection
 */
export function AdminAuthGuard({ children, allowedRoles = DEFAULT_ALLOWED_ROLES }: AdminAuthGuardProps) {
  const router = useRouter();
  const { status, user, profile, signOut } = useAuth();

  const profileRole = profile?.role ?? user?.profile?.role ?? user?.role ?? "";
  const profileIsActive = profile?.isActive ?? user?.profile?.isActive ?? true;
  const hasProfile = !!profile || !!user?.profile;
  const normalizedRole = profileRole.toLowerCase();

  const accessState = useMemo<"loading" | "no-role" | "forbidden" | "inactive" | "granted">(() => {
    // Trust middleware: if we're here, session was verified server-side
    // Show content while client-side auth loads
    if (status === "loading") {
      return "granted"; // Trust middleware
    }

    // If signed out client-side, show brief loading (middleware will redirect on next request)
    if (status === "signed-out") {
      return "loading";
    }

    // Signed in but profile not loaded yet - trust middleware
    if (status === "signed-in" && !hasProfile) {
      return "granted"; // Profile still loading
    }

    // Profile loaded - check role
    if (hasProfile && normalizedRole) {
      if (!allowedRoles.map(r => r.toLowerCase()).includes(normalizedRole)) {
        return "forbidden";
      }
    }

    // Check active status
    if (hasProfile && !profileIsActive) {
      return "inactive";
    }

    return "granted";
  }, [status, hasProfile, normalizedRole, profileIsActive, allowedRoles]);

  // Granted - show content immediately
  if (accessState === "granted") {
    return <>{children}</>;
  }

  // Loading state (very brief, only when signed-out client-side)
  if (accessState === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-slate-400" />
          <p className="text-slate-400">Chargement...</p>
        </div>
      </div>
    );
  }

  // Forbidden - wrong role
  if (accessState === "forbidden") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="max-w-lg rounded-2xl border border-red-500/40 bg-red-500/10 p-8 text-center">
          <h2 className="text-xl font-semibold text-white">Accès non autorisé</h2>
          <p className="mt-4 text-sm text-slate-300">
            Vous n&apos;avez pas les permissions nécessaires pour accéder à cette page.
          </p>
          <p className="mt-2 text-xs text-slate-400">Rôle actuel: {normalizedRole || "aucun"}</p>
          <div className="mt-6 flex gap-3 justify-center">
            <Button onClick={() => router.push("/")} variant="secondary">
              Retour à l&apos;accueil
            </Button>
            <Button onClick={() => signOut().then(() => router.push("/auth/login"))} variant="outline">
              Se déconnecter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Inactive account
  if (accessState === "inactive") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="max-w-lg rounded-2xl border border-orange-500/40 bg-orange-500/10 p-8 text-center">
          <h2 className="text-xl font-semibold text-white">Compte désactivé</h2>
          <p className="mt-4 text-sm text-slate-300">
            Votre compte a été désactivé. Contactez un administrateur.
          </p>
          <div className="mt-6">
            <Button onClick={() => signOut().then(() => router.push("/auth/login"))} variant="outline">
              Se déconnecter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
