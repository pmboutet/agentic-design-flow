"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginForm } from "@/components/auth/LoginForm";

function LoginPageContent() {
  const { status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams?.get("redirectTo") ?? null;

  // Track if we've already attempted a redirect to prevent loops
  const hasAttemptedRedirect = useRef(false);
  const [isStable, setIsStable] = useState(false);

  const redirectTo = useMemo(() => {
    if (!requestedRedirect) {
      return "/admin";
    }

    if (!requestedRedirect.startsWith("/")) {
      return "/admin";
    }

    if (requestedRedirect.startsWith("//")) {
      return "/admin";
    }

    return requestedRedirect;
  }, [requestedRedirect]);

  // Check if we're in dev mode
  const isDevMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    const rawValue = (process.env.NEXT_PUBLIC_IS_DEV ?? "").toString().toLowerCase();
    return rawValue === "true" || rawValue === "1";
  }, []);

  // Wait for auth state to stabilize before allowing redirects
  // This prevents redirect loops when middleware and client disagree
  useEffect(() => {
    if (status !== "loading") {
      // Give a small delay to ensure auth state is truly stable
      const timeout = setTimeout(() => {
        setIsStable(true);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [status]);

  useEffect(() => {
    // In dev mode, don't auto-redirect - let user choose via DevUserSwitcher
    if (isDevMode) {
      return;
    }

    // Don't redirect until auth state is stable
    if (!isStable) {
      return;
    }

    // Only redirect once to prevent loops
    if (hasAttemptedRedirect.current) {
      return;
    }

    if (status === "signed-in") {
      hasAttemptedRedirect.current = true;
      console.log("[Login] Auth stable and signed-in, redirecting to:", redirectTo);
      router.push(redirectTo);
    }
  }, [status, router, redirectTo, isDevMode, isStable]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Sign In</h1>
          <p className="text-gray-600">Welcome back! Please sign in to continue.</p>
          {isDevMode && (
            <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
              <p className="font-medium">🛠️ Mode développement activé</p>
              <p className="mt-1">Utilisez le bandeau en haut de la page pour choisir un utilisateur sans vous connecter.</p>
            </div>
          )}
        </div>

        <div className="bg-white shadow-lg rounded-lg p-8">
          <LoginForm redirectTo={redirectTo} />

          <div className="mt-6 text-center text-sm text-gray-600">
            Don't have an account?{" "}
            <Link href="/auth/signup" className="text-blue-600 hover:text-blue-700 font-medium">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-gray-600">Loading...</div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}

