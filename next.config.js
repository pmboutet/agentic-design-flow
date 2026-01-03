const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server external packages (moved from experimental in Next.js 16)
  serverExternalPackages: ["jsonrepair"],
  // Configure image remote patterns (replaces domains in Next.js 16)
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
  // Turbopack configuration (empty to use default behavior)
  turbopack: {},
  // Webpack configuration for file uploads (fallback for non-Turbopack builds)
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // Suppress source map upload logs in CI
  silent: !process.env.CI,

  // Organization and project from env vars
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Auth token for source map uploads
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload source maps only in production builds
  widenClientFileUpload: true,

  // Automatically tree-shake Sentry logger in production
  disableLogger: true,

  // Hide source maps from users
  hideSourceMaps: true,

  // Tunnel Sentry events to avoid ad blockers (optional)
  // tunnelRoute: "/monitoring",
};

// Only wrap with Sentry if DSN is configured
const hasSentryDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

module.exports = hasSentryDsn
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
