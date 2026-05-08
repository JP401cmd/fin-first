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
//   - static assets    → CacheFirst (images, fonts, CSS, JS). Hashed by
//                        Next.js so cache-busting is automatic on deploy.
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
    {
      matcher: ({ request }: { request: Request }) =>
        ["image", "font", "style", "script"].includes(request.destination),
      handler: new CacheFirst({
        cacheName: "static-assets",
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
