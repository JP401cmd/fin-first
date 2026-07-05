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
      { source: '/horizon/samengestelde-interest', destination: '/toekomst/samengestelde-interest', permanent: false },
      { source: '/horizon/inflatie-koopkracht', destination: '/toekomst/inflatie-koopkracht', permanent: false },

      // Budgetten-dedup (beslissing 1): de budget-OVERZICHT-pagina is
      // identiek aan de Budget-view op /overzicht/cashflow (zelfde
      // BudgetsClient). Index redirect; de detail-/nieuw-subroutes
      // (/core/budgets/[id], /core/budgets/new) blijven los bestaan
      // (exact-match redirect raakt die niet).
      { source: '/core/budgets', destination: '/overzicht/cashflow', permanent: false },

      // Belasting-dedup (beslissing 3): de volledige Box 3-pagina is nu
      // compact als Box3Detail op /overzicht/belasting (zelfde pure
      // box3-data-engine via /api/household/box3). Index redirect.
      { source: '/core/belasting', destination: '/overzicht/belasting', permanent: false },

      // Parameters-migratie (beslissing 5): eindstrategie/onttrekking/
      // inflatie/rendement leven inline onder de Voorkeuren-tab op
      // /toekomst. Volgorde/verdeling/afname zijn nog placeholders zonder
      // engine-koppeling; tot die tijd landt iedere /identity/parameters-
      // link op de Voorkeuren-tab waar de 4 werkende editors zitten.
      { source: '/identity/parameters', destination: '/toekomst/voorkeuren', permanent: false },

      // Instellingen-monolith retirement (beslissing 4 voltooid): alle zes
      // tabs leven op /mijn/* (geavanceerd, privacy, profiel, uiterlijk,
      // notificaties, plus huishouden-privacy op profiel). De legacy URL
      // landt op de Mijn-hub. Eventuele stale anchors (#fire-parameters,
      // #housing-strategy, #onttrekking) worden door Next gestript — die
      // editors hebben geen directe URL, ze leven in de strategie-modal
      // op /toekomst.
      { source: '/identity/instellingen', destination: '/mijn', permanent: false },

      // Restanten van het /identity-tijdperk — voortgang en widgets-
      // configuratie zijn opgegaan in de Mijn-hub.
      { source: '/identity/voortgang', destination: '/mijn', permanent: false },
      { source: '/identity/widgets', destination: '/mijn', permanent: false },

      // Tips & acties op één scherm: /overzicht/tips is canoniek.
      // Tips (pending recommendations) bovenaan, open acties eronder.
      // Voorstellen ontstaan in Will-chat maar blijven pending tot
      // beslissing — zichtbaar op deze pagina én in de chat.
      { source: '/overzicht/acties', destination: '/overzicht/tips', permanent: false },
    ]
  },
};

export default nextConfig;
