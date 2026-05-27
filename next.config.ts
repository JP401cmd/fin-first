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
   * /will redirect naar /overzicht: WillLanding wordt nu gerenderd op
   * /overzicht (zie app/(app)/overzicht/page.tsx) dus de oude route is
   * duplicate. /dashboard redirect ook direct (was eerder zelf een
   * redirect naar /will, slaan we nu een hop over).
   */
  async redirects() {
    return [
      { source: '/core', destination: '/overzicht', permanent: false },
      { source: '/horizon', destination: '/toekomst', permanent: false },
      { source: '/identity', destination: '/mijn', permanent: false },
      { source: '/will', destination: '/overzicht', permanent: false },
      { source: '/dashboard', destination: '/overzicht', permanent: false },

      // ── Alias-opschoning (route-audit categorie 2) ──────────────
      // Legacy-pagina's worden door de nieuwe routes ge-re-export
      // (build-time module-import → geen redirect-loop). We sturen de
      // legacy-URL's naar hun canonieke /mijn- resp. /toekomst-tegenhanger
      // zodat er per functie één URL overblijft.
      { source: '/identity/profiel', destination: '/mijn/profiel', permanent: false },
      { source: '/identity/koppelingen', destination: '/mijn/koppelingen', permanent: false },
      { source: '/identity/delen', destination: '/mijn/delen', permanent: false },
      { source: '/horizon/samengestelde-interest', destination: '/toekomst/samengestelde-interest', permanent: false },
      { source: '/horizon/inflatie-koopkracht', destination: '/toekomst/inflatie-koopkracht', permanent: false },

      // Budgetten-dedup (beslissing 1): de budget-OVERZICHT-pagina is
      // identiek aan de Budget-view op /overzicht/cashflow (zelfde
      // BudgetsClient). Index redirect; de detail-/nieuw-subroutes
      // (/core/budgets/[id], /core/budgets/new) blijven los bestaan
      // (exact-match redirect raakt die niet).
      { source: '/core/budgets', destination: '/overzicht/cashflow', permanent: false },
    ]
  },
};

export default nextConfig;
