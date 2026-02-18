import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  // Disable Turbopack completely to avoid Windows cache corruption
  // Set via --no-turbopack flag or NEXT_PRIVATE_LOCAL_WEBPACK env
};

export default nextConfig;
