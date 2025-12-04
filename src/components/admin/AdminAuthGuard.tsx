"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";

interface AdminAuthGuardProps {
  children: ReactNode;
  /**
   * Optional: specific roles allowed. Defaults to admin roles.
   */
  allowedRoles?: string[];
}

const DEFAULT_ALLOWED_ROLES = ["full_admin", "project_admin", "facilitator", "manager", "admin"];

/**
 * AdminAuthGuard wraps admin pages to ensure proper authentication
 * and authorization before rendering content.
 *
 * This prevents:
 * - Unauthenticated access
 * - API calls before auth is ready
 * - "Lost profile" issues when navigating between admin pages
 */
export function AdminAuthGuard({ children, allowedRoles = DEFAULT_ALLOWED_ROLES }: AdminAuthGuardProps) {
  const router = useRouter();
  const { status, user, profile, signOut } = useAuth();

  const profileRole = profile?.role ?? user?.profile?.role ?? user?.role ?? "";
  const profileIsActive = profile?.isActive ?? user?.profile?.isActive ?? true;
  const hasProfile = !!profile || !!user?.profile;

  const normalizedRole = useMemo(() => {
    return profileRole.toLowerCase();
  }, [profileRole]);

  // Timeout to prevent indefinite loading state
  const [hasLoadingTimeout, setHasLoadingTimeout] = useState(false);
  const [hasExtendedTimeout, setHasExtendedTimeout] = useState(false);
  const verificationStartRef = useRef<number | null>(null);

  // Check if we're in dev mode
  const isDevMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    const rawValue = (process.env.NEXT_PUBLIC_IS_DEV ?? "").toString().toLowerCase();
    return rawValue === "true" || rawValue === "1";
  }, []);

  useEffect(() => {
    // Track when verification started
    if (status === "loading" && verificationStartRef.current === null) {
      verificationStartRef.current = Date.now();
    }

    if (status === "loading") {
      // Set a timeout of 5 seconds to trigger redirect attempt
      const timeoutId = setTimeout(() => {
        console.warn("[AdminAuthGuard] Auth loading timed out after 5s");
        setHasLoadingTimeout(true);
      }, 5000);

      // Extended timeout of 8s to show retry options
      const extendedTimeoutId = setTimeout(() => {
        console.warn("[AdminAuthGuard] Extended timeout reached");
        setHasExtendedTimeout(true);
      }, 8000);

      return () => {
        clearTimeout(timeoutId);
        clearTimeout(extendedTimeoutId);
      };
    } else {
      // Reset timeout flags when status changes
      setHasLoadingTimeout(false);
      setHasExtendedTimeout(false);
      verificationStartRef.current = null;
    }
  }, [status]);

  const accessState = useMemo<"checking" | "signed-out" | "inactive" | "forbidden" | "profile-missing" | "granted">(() => {
    // Trust the middleware while auth loads
    if (status === "signed-out") {
      return "signed-out";
    }

    // While loading, trust middleware (it already verified session server-side)
    if (!hasLoadingTimeout) {
      if (status === "loading") {
        return "checking"; // Show loading UI while auth initializes
      }
      if (status === "signed-in" && (!hasProfile || !normalizedRole)) {
        return "checking"; // Still loading profile
      }
    }

    // If loading timed out
    if (hasLoadingTimeout) {
      if (status === "loading") {
        return "signed-out";
      }
      if (status === "signed-in" && !hasProfile) {
        return "profile-missing";
      }
    }

    // Role check
    if (!normalizedRole || !allowedRoles.map(r => r.toLowerCase()).includes(normalizedRole)) {
      return "forbidden";
    }

    if (!profileIsActive) {
      return "inactive";
    }

    return "granted";
  }, [status, normalizedRole, profileIsActive, hasProfile, hasLoadingTimeout, allowedRoles]);

  // Redirect if signed out
  const hasRedirectedRef = useRef(false);
  useEffect(() => {
    if (isDevMode) return;

    if (accessState === "signed-out" && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login?redirectTo=" + encodeURIComponent(window.location.pathname);
      } else {
        router.replace("/auth/login");
      }
    }
  }, [accessState, isDevMode, router]);

  // Render based on access state
  if (accessState === "checking") {
    if (hasExtendedTimeout) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center p-4">
          <div className="max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center">
            <div className="mb-4 flex justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold text-white">Vérification en cours...</h2>
            <p className="mt-3 text-sm text-slate-400">
              La vérification prend plus de temps que prévu.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                onClick={() => window.location.reload()}
                variant="secondary"
              >
                Actualiser la page
              </Button>
              <Button
                onClick={async () => {
                  await signOut();
                  window.location.href = "/auth/login?redirectTo=" + encodeURIComponent(window.location.pathname);
                }}
                variant="outline"
              >
                Se reconnecter
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Normal loading state
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-slate-400" />
          <p className="text-slate-400">Vérification des accès...</p>
        </div>
      </div>
    );
  }

  if (accessState === "signed-out") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-slate-400" />
          <p className="text-slate-400">Redirection vers la connexion...</p>
        </div>
      </div>
    );
  }

  if (accessState === "profile-missing") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="max-w-lg rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-8 text-center">
          <h2 className="text-xl font-semibold text-white">Profil non disponible</h2>
          <p className="mt-4 text-sm text-slate-300">
            Impossible de charger votre profil utilisateur.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              onClick={() => window.location.reload()}
              variant="secondary"
            >
              Réessayer
            </Button>
            <Button
              onClick={async () => {
                await signOut();
                window.location.href = "/auth/login";
              }}
              variant="outline"
            >
              Se reconnecter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (accessState === "forbidden") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="max-w-lg rounded-2xl border border-red-500/40 bg-red-500/10 p-8 text-center">
          <h2 className="text-xl font-semibold text-white">Accès non autorisé</h2>
          <p className="mt-4 text-sm text-slate-300">
            Vous n&apos;avez pas les permissions nécessaires pour accéder à cette page.
          </p>
          <div className="mt-6">
            <Button
              onClick={() => router.push("/")}
              variant="secondary"
            >
              Retour à l&apos;accueil
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (accessState === "inactive") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="max-w-lg rounded-2xl border border-orange-500/40 bg-orange-500/10 p-8 text-center">
          <h2 className="text-xl font-semibold text-white">Compte désactivé</h2>
          <p className="mt-4 text-sm text-slate-300">
            Votre compte a été désactivé. Contactez un administrateur.
          </p>
        </div>
      </div>
    );
  }

  // accessState === "granted"
  return <>{children}</>;
}
