import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring - adjust in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session Replay - captures user actions before errors
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Debug mode in development
  debug: process.env.NODE_ENV === "development",

  // Environment tag
  environment: process.env.NODE_ENV,

  // Filter out noisy errors
  ignoreErrors: [
    // Browser extensions
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    // Network errors that are expected
    "Network request failed",
    "Failed to fetch",
    // User cancelled
    "AbortError",
  ],

  // Add integrations
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Before sending, add context
  beforeSend(event, hint) {
    // Don't send in development unless explicitly enabled
    if (process.env.NODE_ENV === "development" && !process.env.SENTRY_DEBUG) {
      console.log("[Sentry] Would send event:", event.message || event.exception);
      return null;
    }
    return event;
  },
});
