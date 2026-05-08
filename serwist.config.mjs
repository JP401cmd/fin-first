// Serwist build configuration — Phase A (PWA installable, TWA-ready).
//
// Why this lives here instead of inside `next.config.ts`:
//   Next.js 16 builds with Turbopack by default, and `@serwist/next`'s webpack
//   integration can't hook into Turbopack builds (it silently no-ops, leaving
//   no `public/sw.js`). Serwist's "configurator mode" works around this by
//   running `@serwist/cli build` as a separate step that consumes the Next.js
//   build output and emits sw.js — independent of which bundler Next.js used.
//
// Wiring: `npm run build` calls `next build && serwist build serwist.config.mjs`.
// The CLI reads this file, calls the helper from `@serwist/next/config`, and
// writes `public/sw.js`. In dev (`npm run dev`) and tests no SW is produced.
import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Don't precache prerendered HTML pages — TriFinity has 600+ test routes
  // that we don't want eagerly downloaded on first install. Runtime
  // NetworkFirst/CacheFirst handlers in `app/sw.ts` cover those instead.
  precachePrerendered: false,
  // Override the default glob: only the static brand assets that the app
  // shell genuinely depends on. Keeps the precache manifest small (a few KB
  // instead of 15+ MB), which means a faster first-install + lower data use
  // for users on metered connections. Hashed JS/CSS chunks live behind the
  // `static-assets` runtime cache — same end result, lazier population.
  globDirectory: "public",
  globPatterns: [
    "manifest.json",
    "icon-192.png",
    "icon-512.png",
    "icon-512-maskable.png",
    "apple-touch-icon.png",
  ],
});
