/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimize chunk loading and improve stability
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Moved from experimental to root level as per warning
  serverExternalPackages: [],

  // Configure chunking behavior to avoid large server chunks
  experimental: {
    // Updated serverActions to be an object instead of boolean
    serverActions: {
      bodySizeLimit: "2mb",
      allowedOrigins: ["localhost:5173"],
    },
  },

};

export default nextConfig;
