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

  /**
   * Top-level route-redirects voor de navigatie-migratie van oude module-
   * namen (Kern/Wil/Horizon/Identity) naar de nieuwe architectuur
   * (Overzicht/Toekomst/Mijn).
   *
   * Sub-routes (bv. /core/assets/holdings/[id], /horizon/whatif) blijven
   * werken op hun huidige paden totdat ze individueel gemigreerd zijn —
   * alleen exact-matches voor de hoofdpagina's redirecten nu.
   *
   * `permanent: false` tijdens migratie (308 met method-preservation) zodat
   * we later naar `permanent: true` kunnen wisselen zonder SEO-rommel.
   *
   * /will is BEWUST NIET geredirected: de widget-dashboard die nu op /will
   * leeft moet eerst naar /overzicht verhuizen. Tot dan blijft /will werken
   * voor de gebruiker. /dashboard redirect direct door naar /overzicht
   * (was eerder zelf een redirect naar /will, slaan we nu een hop over).
   */
  async redirects() {
    return [
      { source: '/core', destination: '/overzicht', permanent: false },
      { source: '/horizon', destination: '/toekomst', permanent: false },
      { source: '/identity', destination: '/mijn', permanent: false },
      { source: '/dashboard', destination: '/overzicht', permanent: false },
    ]
  },
};

export default nextConfig;
