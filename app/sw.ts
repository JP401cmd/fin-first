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
//   - navigations      → NetworkFirst with a 3s timeout, so the user sees
//                        cached HTML when offline / on flaky 4G but always
//                        prefers fresh markup when the server responds.
//   - static assets    → CacheFirst (images, fonts, CSS, and JS but only
//                        under `/_next/static/**`, which Next.js
//                        content-hashes so cache-busting is automatic on
//                        deploy). Other scripts served from a stable URL
//                        (e.g. Speed Insights) are NOT CacheFirst — they
//                        fall through to the network / defaultCache below.
//   - default fallback → Serwist's defaultCache for anything else.
//
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  NetworkFirst,
  CacheFirst,
  NetworkOnly,
} from "serwist";

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
    // App pages: try the network first (3s budget), fall back to cache.
    {
      matcher: ({ request }: { request: Request }) =>
        request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages-cache",
        networkTimeoutSeconds: 3,
      }),
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
});

serwist.addEventListeners();
