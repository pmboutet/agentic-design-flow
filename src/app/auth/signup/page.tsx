"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { SignupForm } from "@/components/auth/SignupForm";

const ADMIN_ROLES = ["full_admin", "client_admin", "facilitator", "manager"];

export default function SignupPage() {
  const { status, profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed-in") {
      // If user already has admin role, redirect to admin dashboard
      const role = profile?.role?.toLowerCase() ?? "";
      if (ADMIN_ROLES.includes(role)) {
        router.push("/admin");
      } else {
        // New users (participants) go to onboarding to create their client
        router.push("/onboarding");
      }
    }
  }, [status, profile, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h1>
          <p className="text-gray-600">Sign up to get started.</p>
        </div>

        <div className="bg-white shadow-lg rounded-lg p-8">
          <SignupForm />

          <div className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-blue-600 hover:text-blue-700 font-medium">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

