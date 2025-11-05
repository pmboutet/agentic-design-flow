"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginForm } from "@/components/auth/LoginForm";

function LoginPageContent() {
  const { status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams?.get("redirectTo") ?? null;

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

  useEffect(() => {
    // In dev mode, don't auto-redirect - let user choose via DevUserSwitcher
    if (isDevMode) {
      return;
    }
    if (status === "signed-in") {
      router.push(redirectTo);
    }
  }, [status, router, redirectTo, isDevMode]);

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

