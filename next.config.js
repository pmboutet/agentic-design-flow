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

module.exports = nextConfig;
