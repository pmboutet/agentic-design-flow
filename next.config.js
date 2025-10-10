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
  // Webpack configuration for file uploads
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
};

module.exports = nextConfig;
