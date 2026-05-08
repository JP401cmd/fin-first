import type { NextConfig } from "next";

// Serwist (the PWA service-worker layer) is wired in via `serwist.config.js`
// and runs as a post-build step (`npm run build` → `next build && serwist
// build`). We deliberately do NOT use the `withSerwist()` Next.js wrapper:
// in Next.js 16 the build runs through Turbopack by default, which the
// webpack-based `@serwist/next` plugin can't hook into. Configurator-mode
// keeps the SW build framework-agnostic and Turbopack-compatible.
const nextConfig: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev: false,
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  compress: true,
  productionBrowserSourceMaps: false,
};

export default nextConfig;
