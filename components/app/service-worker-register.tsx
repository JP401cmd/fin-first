'use client';

import { useEffect } from 'react';

/**
 * Minimal client-side service-worker registrar.
 *
 * Why a hand-rolled `useEffect` instead of `<SerwistProvider>` from
 * `@serwist/next/react`?
 *   - The provider would have to wrap the entire app shell in a Client
 *     Component, forcing the root `<html>` boundary to ship its runtime
 *     even on routes that never trigger SW interactions. We don't need
 *     the React-context plumbing (`useSerwist`) anywhere yet.
 *   - All we need is the equivalent of the one-shot
 *     `navigator.serviceWorker.register('/sw.js', { scope: '/' })` call,
 *     guarded for SSR and for the dev environment (where Serwist doesn't
 *     emit `sw.js` and a 404 would log noise to the console).
 *
 * Once we add background-sync, push-notifications or another feature that
 * benefits from the provider's bookkeeping, swap this for `<SerwistProvider>`.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Skip in development: the Serwist CLI only emits `public/sw.js`
    // during `next build && serwist build`, so dev would 404.
    if (process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        // Log but don't surface to the user — failed SW registration is
        // never user-blocking, the webapp keeps working without it.
        console.warn('[trifinity] service-worker registration failed:', err);
      });
  }, []);

  return null;
}
