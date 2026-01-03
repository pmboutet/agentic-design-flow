import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Debug mode in development
  debug: process.env.NODE_ENV === "development",

  // Environment tag
  environment: process.env.NODE_ENV,

  // Before sending, add context
  beforeSend(event, hint) {
    // Don't send in development unless explicitly enabled
    if (process.env.NODE_ENV === "development" && !process.env.SENTRY_DEBUG) {
      console.log("[Sentry Edge] Would send event:", event.message || event.exception);
      return null;
    }
    return event;
  },
});
