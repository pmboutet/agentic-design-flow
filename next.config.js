/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for better performance
  experimental: {
    serverComponentsExternalPackages: ["jsonrepair"],
  },
  // Configure image domains if needed
  images: {
    domains: ['localhost'],
  },
  // Webpack configuration for file uploads (still needed for Turbopack compatibility)
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
  // Turbopack is now default in Next.js 16, but webpack config is still supported
};

module.exports = nextConfig;
