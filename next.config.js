/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for better performance
  experimental: {
    serverComponentsExternalPackages: [],
  },
  // Configure image domains if needed
  images: {
    domains: ['localhost'],
  },
  // API routes configuration
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
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
