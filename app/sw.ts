/// <reference lib="webworker" />
//
// TriFinity service-worker — Phase A (PWA installable, TWA-ready).
//
// Cache strategy is tuned to TriFinity's runtime characteristics:
//
//   - `/api/**`        → NetworkOnly. Supabase auth cookies, AI streaming
//                        endpoints (`streamObject`/`streamText`) and any
//                        write-mutating route MUST never be cached.
//                        Public price endpoints would be safe to cache,
//                        but we currently don't expose any — adding a
//                        `prices-cache` rule pre-emptively breaks if those
//                        endpoints later return user-specific responses.
//                        Keep it strict; relax later, never the reverse.
//   - navigations      → NetworkOnly. Rendered pages carry the user's own
//   + RSC payloads       financial figures; a cache hit would mean stale
//                        numbers without the user noticing, and data that
//                        outlives a logout on the device. Offline, a failed
//                        navigation shows the static `/offline` page (precached,
//                        see serwist.config.mjs) — never an older page.
//                        Owner decision 27 Sep 2026: no offline "last known
//                        state". Until then this was NetworkFirst with a 3 s
//                        timeout, which served the previous HTML on every slow
//                        response (the 3000–3250 ms band in web_vitals).
//   - static assets    → CacheFirst (images, fonts, CSS, and JS but only
//                        under `/_next/static/**`, which Next.js
//                        content-hashes so cache-busting is automatic on
//                        deploy). Other scripts served from a stable URL
//                        (e.g. Speed Insights) are NOT CacheFirst — they
//                        fall through to the network / defaultCache below.
//   - cross-origin     → NetworkOnly (Supabase REST reads are account data).
//   - default fallback → Serwist's defaultCache for anything else.
//
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  CacheFirst,
  NetworkOnly,
} from "serwist";
// Relative on purpose: the Serwist CLI bundles this worker outside Next.js.
import { OFFLINE_URL, deleteUserContentCaches } from "../lib/pwa/sw-caches";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected by `@serwist/next` at build time — list of files to precache.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // skipWaiting + clientsClaim: a freshly deployed SW takes over open tabs
  // immediately on next reload, instead of waiting for every tab to close.
  // Combined with Next.js content-hashing this gives near-instant rollouts.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Auth + user-specific + AI-streaming endpoints: never touch the cache.
    {
      matcher: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    // App pages: always the network, no timeout, never a cache. Offline the
    // `fallbacks` entry below answers with the static offline page.
    {
      matcher: ({ request }: { request: Request }) =>
        request.mode === "navigate",
      handler: new NetworkOnly(),
    },
    // RSC payloads (client-side navigation + prefetch) carry the same figures
    // as the HTML. Serwist's defaultCache would put them NetworkFirst in
    // `pages-rsc` / `pages-rsc-prefetch`; claim them here first. When one fails
    // offline, Next.js falls back to a full navigation, which lands on the
    // offline page above.
    {
      matcher: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) =>
        sameOrigin && request.headers.get("RSC") === "1",
      handler: new NetworkOnly(),
    },
    // Cross-origin: defaultCache ends with a NetworkFirst `cross-origin` cache
    // for every foreign GET — which includes the direct Supabase REST reads
    // from client components. Those URLs are identical for every account (RLS
    // scopes server-side), so a cached response could reach the next account
    // on this device. We self-host fonts and serve no cross-origin assets we
    // need offline, so nothing cross-origin is cached.
    {
      matcher: ({ sameOrigin }: { sameOrigin: boolean }) => !sameOrigin,
      handler: new NetworkOnly(),
    },
    // Static assets — Next.js fingerprints filenames, so cache-first is safe.
    // Scripts are the exception: only `/_next/static/**` chunks are
    // content-hashed by Next.js. Other scripts (e.g. Speed Insights'
    // `/_vercel/speed-insights/script.js`, or its v2 per-project unique
    // path) are served from a stable URL that CacheFirst would never
    // revalidate — a returning PWA user would be stuck on the old script
    // forever. Those fall through to the network (or defaultCache) instead.
    {
      matcher: ({ request, url }: { request: Request; url: URL }) => {
        if (request.destination === "script") {
          return url.pathname.startsWith("/_next/static/");
        }
        return ["image", "font", "style"].includes(request.destination);
      },
      handler: new CacheFirst({
        cacheName: "static-assets",
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_URL,
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

// A worker from before Sep 2026 left rendered pages in `pages-cache` (and
// Serwist's page caches). skipWaiting + clientsClaim make this worker take
// over on the next load; sweep those caches right then, so existing installs
// don't keep account data around until the next logout.
self.addEventListener("activate", (event) => {
  event.waitUntil(deleteUserContentCaches(self.caches));
});

serwist.addEventListeners();
