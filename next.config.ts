import type { NextConfig } from "next";

// Only use static export for Tauri production builds (not dev)
// TAURI_ENV_PLATFORM is set by Tauri, but we only want export during build
const isTauriBuild = process.env.TAURI_ENV_PLATFORM && process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // For Tauri production builds, enable static export
  // API routes will be handled by Tauri commands in production
  output: isTauriBuild ? "export" : undefined,

  // Images need to be unoptimized for static export
  images: {
    unoptimized: true,
  },

  // Ensure trailing slashes for static file serving
  trailingSlash: true,
};

export default nextConfig;
