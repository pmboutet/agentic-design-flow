"use client";

import React, { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import HomePage from "./HomePage";

/**
 * Loading component for Suspense boundary
 */
function LoadingPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Card className="max-w-md w-full">
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">Loading application...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Main page component wrapped with Suspense for useSearchParams()
 */
export default function Page() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <HomePage />
    </Suspense>
  );
}
