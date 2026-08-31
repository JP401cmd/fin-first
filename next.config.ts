import type { NextConfig } from "next";

/**
 * Content-Security-Policy (Optie A — SOEPEL, zie Notion-kaart "Security
 * response-headers"). Bewust `'unsafe-inline'` op script-src: de app draait
 * volledig statisch/cache-vriendelijk zonder per-request nonce (dat is de
 * niet-gekozen Optie B/middleware-variant). Bronnen zijn afgeleid uit de
 * werkelijke code:
 *   - script/frame/connect challenges.cloudflare.com → Turnstile (app/check).
 *   - connect *.supabase.co (REST/auth) + wss (Realtime); img data:/blob:/https:
 *     dekt Supabase-storage-avatars.
 *   - connect vitals.vercel-insights.com → Vercel Speed Insights (beacon).
 *   - connect huggingface.co + *.hf.co → lokale privé-modus (ADR 0043): de
 *     on-device Gemma 4 E2B-modeldownload haalt de config/tokenizer van
 *     huggingface.co en de grote ONNX-shards van de LFS-/Xet-CDN's
 *     (cdn-lfs*.huggingface.co en cas-bridge/transfer.xethub.hf.co →
 *     afgedekt door de host-families *.huggingface.co / *.hf.co). Alleen nodig
 *     wanneer een gebruiker de privé-modus aanzet. NB: self-hosten van de
 *     modelgewichten onder onze eigen origin is de nettere eindoplossing (dan
 *     kunnen deze HF-hosts wéér uit de CSP) — dat volgt in een latere fase.
 *   - worker blob: → PWA service worker; JSON-LD (faq) is data, geen script.
 * frame-ancestors 'self' i.c.m. X-Frame-Options SAMEORIGIN houdt de beheer-
 * mobielpreview-iframe (components/app/beheer/mobile-preview-frame.tsx) heel.
 *
 * Wordt eerst als Content-Security-Policy-Report-Only uitgeleverd (rustige
 * meekijk-periode). VERVOLGSTAP: na de meekijk-periode `CSP_REPORT_ONLY` op
 * false zetten — dat schakelt in één zet de enforce-header ín én
 * `upgrade-insecure-requests` terug aan (zie hieronder).
 */
const CSP_REPORT_ONLY = true;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://vitals.vercel-insights.com https://huggingface.co https://*.huggingface.co https://*.hf.co",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  // `upgrade-insecure-requests` is per spec INERT in een report-only policy: de
  // browser negeert 'm daar en logt dat als console-error op élke pagina (kostte
  // ons structureel Lighthouse Best practices 96 i.p.v. 100). Daarom hangt de
  // directive aan de enforce-schakelaar i.p.v. dat we 'm hard meesturen; hij
  // komt vanzelf terug zodra CSP_REPORT_ONLY op false gaat.
  ...(CSP_REPORT_ONLY ? [] : ['upgrade-insecure-requests']),
].join('; ');

/**
 * Beveiligingsheaders op álle responses. Fase 1 (nul app-risico) staat direct
 * te enforcen; de CSP staat bewust op Report-Only tot de meekijk-periode klaar
 * is. X-Frame-Options = SAMEORIGIN (NIET DENY) zodat de beheer-mobielpreview
 * blijft werken.
 */
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
  {
    key: CSP_REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    value: CONTENT_SECURITY_POLICY,
  },
];

// Serwist (the PWA service-worker layer) is wired in via `serwist.config.js`
// and runs as a post-build step (`npm run build` → `next build && serwist
// build`). We deliberately do NOT use the `withSerwist()` Next.js wrapper:
// in Next.js 16 the build runs through Turbopack by default, which the
// webpack-based `@serwist/next` plugin can't hook into. Configurator-mode
// keeps the SW build framework-agnostic and Turbopack-compatible.
const nextConfig: NextConfig = {
  /**
   * React Compiler (ADR 0055 — fase 4, T4.3). Automatische, correcte
   * memoïsatie op build-time; neemt de gebroken handmatige memo-ketens uit de
   * juli-performance-audit structureel weg (318 bestanden met useMemo/
   * useCallback/memo). In Next.js 16 is dit een STABIELE, top-level optie
   * (gepromoveerd uit `experimental`). Next past de compiler via een
   * SWC-voorfilter alléén toe op relevante (JSX/hook-)bestanden, dus dit werkt
   * native onder Turbopack — géén webpack-wrapper nodig (spiegelt de Serwist-
   * keuze hierboven). Dependency: `babel-plugin-react-compiler` (devDep).
   * Health-check-spike vóór activatie: 1517/1517 componenten compileren,
   * 0 incompatibele libraries; bails vallen veilig terug op de bestaande
   * handmatige memo's (geen gedragswijziging). Omkeerbaar via deze ene vlag.
   */
  reactCompiler: true,
  experimental: {
    turbopackFileSystemCacheForDev: false,
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  compress: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,

  /**
   * Security response-headers op alle routes (Optie A). Zie SECURITY_HEADERS /
   * CONTENT_SECURITY_POLICY hierboven voor de bron-onderbouwing per directive.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ]
  },

  /**
   * Top-level route-redirects voor de navigatie-migratie van oude module-
   * namen (Kern/Wil/Horizon/Identity) naar de nieuwe architectuur
   * (Overzicht/Toekomst/Mijn).
   *
   * Sub-routes (bv. /core/assets/holdings/[id]) blijven werken op hun
   * huidige paden totdat ze individueel gemigreerd zijn — alleen
   * exact-matches voor de hoofdpagina's redirecten nu. De redirect-only
   * sub-routes (/core/cash, /horizon/whatif, /horizon/strategie,
   * /horizon/uitgaven-na-pensioen, /toekomst/strategie,
   * /toekomst/uitgaven-na-pensioen) zijn inmiddels wél gemigreerd — zie het
   * #310-blok hieronder.
   *
   * `permanent: false` tijdens migratie (307 Temporary Redirect, met
   * method-preservation) zodat we later naar `permanent: true` (308) kunnen
   * wisselen zonder SEO-rommel — en zodat browsers de migratie-URL's niet
   * blijvend cachen zolang we nog kunnen terugdraaien.
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

      // ── Legacy-routes die géén React-tree meer renderen (React #310) ─────
      // Deze twee waren server-componenten die bij élke render meteen
      // `redirect()` aanriepen. Dat lijkt onschuldig, maar het duwt de
      // client-router bij een SPA-navigatie het harde-navigatie-pad in
      // (`pushRef.mpaNavigation`). Next.js' eigen AppRouter gooit in dat pad
      // middenin zijn hook-lijst (`throw unresolvedThenable`,
      // node_modules/next/dist/client/components/app-router.js) en rendert bij
      // een volgende render wél alle hooks — "Rendered more hooks than during
      // the previous render", React #310. Next erkent dat zelf in de comment
      // ernaast: "violates the rules of hooks".
      //
      // Bewijs uit productie (error_logs): élk React #310-event ooit — 4 op
      // /core/cash, 2 op /horizon/whatif — kwam van precies deze twee routes;
      // nul op een echte pagina. Op de routing-laag redirecten haalt de
      // trigger weg: er wordt geen React-boom meer gebouwd om vervolgens weg
      // te gooien, en het scheelt bovendien een RSC-round-trip.
      { source: '/core/cash', destination: '/overzicht/cashflow', permanent: false },

      // Volgorde is functioneel: de dreamgate-variant moet vóór de
      // catch-all staan, anders vangt de tweede regel hem af. Spiegelt de
      // twee takken van de oude server-component 1-op-1 — met `via=dreamgate`
      // toont /toekomst/whatif de volledige ervaring, zonder valt hij terug
      // op de tijdas met de what-if-modal open.
      {
        source: '/horizon/whatif',
        has: [{ type: 'query', key: 'via', value: 'dreamgate' }],
        destination: '/toekomst/whatif?via=dreamgate',
        permanent: false,
      },
      { source: '/horizon/whatif', destination: '/toekomst?whatif=open', permanent: false },

      // Derde lichting (31 aug 2026, UR2-11) — /toekomst/whatif was de LAATSTE
      // route van deze familie die zijn redirect nog op render-tijd deed: de
      // server-component riep zonder `?via=dreamgate` meteen
      // `redirect('/toekomst?whatif=open')` aan. Dat is exact de trigger
      // hierboven (harde-navigatie-pad → React #310), en verklaart de transiënte
      // HTTP 500 die de UAT op /toekomst/whatif zag. De redirect verhuist
      // daarom naar de routing-laag; de dreamgate-tak blijft een échte pagina.
      //
      // `missing` i.p.v. `has`: de regel matcht wanneer `via` afwezig is ÓF een
      // andere waarde heeft (Next: `!missing.some(hasMatch)`), zodat alleen
      // `?via=dreamgate` de volledige what-if-ervaring bereikt — precies de
      // twee takken van de oude server-component.
      {
        source: '/toekomst/whatif',
        missing: [{ type: 'query', key: 'via', value: 'dreamgate' }],
        destination: '/toekomst?whatif=open',
        permanent: false,
      },

      // Tweede lichting (11 aug 2026) — dezelfde behandeling voor de vier
      // resterende redirect-only server-componenten. Ze waren latent: geen
      // enkel #310-event stond op hun naam, maar ze droegen exact dezelfde
      // trigger als /core/cash en /horizon/whatif en zouden hem bij het eerste
      // bezoek opnieuw kunnen afvuren.
      { source: '/horizon/strategie', destination: '/toekomst?strategie=open', permanent: false },
      {
        source: '/horizon/uitgaven-na-pensioen',
        destination: '/toekomst?uitgaven=open',
        permanent: false,
      },
      {
        source: '/toekomst/uitgaven-na-pensioen',
        destination: '/toekomst?uitgaven=open',
        permanent: false,
      },

      // /toekomst/strategie?focus=aow|pensioen|huis opende de bijbehorende
      // levensstrategie op de Gebeurtenissen-tab. Die vertakking gaat mee naar
      // de routing-laag via een named capture group in `has` — dezelfde
      // volgorde-eis als bij /horizon/whatif: de gerichte variant MOET vóór de
      // catch-all staan, anders landt elke deeplink op `aow`. Een onbekende
      // (of ontbrekende) focus valt bewust terug op `aow`, precies zoals de
      // oude server-component deed.
      {
        source: '/toekomst/strategie',
        has: [{ type: 'query', key: 'focus', value: '(?<focus>aow|pensioen|huis)' }],
        destination: '/toekomst/gebeurtenissen?strategie=:focus',
        permanent: false,
      },
      {
        source: '/toekomst/strategie',
        destination: '/toekomst/gebeurtenissen?strategie=aow',
        permanent: false,
      },

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
