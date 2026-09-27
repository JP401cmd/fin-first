"use client";

// Onzichtbare client-reporter voor onze eigen web-vitals / RUM-collectie (feature 884).
// Meet Core Web Vitals in de browser en beacon't ze fire-and-forget naar de API-route.
// Bewust GEEN UI (return null): puur telemetrie, dus geen vrijheidstijd-framing,
// geen KPI-cards, geen gating. Gemount in de root-layout zodat ook pre-auth
// (landing/login/check) meetelt voor volle-funnel-RUM.
//
// Privacy/dataminimalisatie: we sturen alleen grove, niet-identificerende context
// (pad zonder query, grove device-categorie + viewport-bucket, netwerk-effectiveType).
// De server scrubt het pad nog eens. Alle fouten blijven stil (NFR4).

import { useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";
import {
  WEB_VITALS_ENDPOINT,
  WEB_VITALS_SAMPLE_RATE,
  WEB_VITAL_METRICS,
  viewportBucket,
  type WebVitalMetric,
} from "@/lib/web-vitals/config";
import {
  serverTimingBeacons,
  type LayoutServerTimings,
  type ServerTimingMetric,
} from "@/lib/web-vitals/server-timing";

const ALLOWED_METRICS = new Set<string>(WEB_VITAL_METRICS);

/** Eén meting fire-and-forget naar de ontvanger, met dezelfde grove context. */
function beaconMetric(payload: {
  metric: WebVitalMetric | ServerTimingMetric;
  value: number;
  rating?: string;
  navigationType?: string;
}) {
  try {
    const width = window.innerWidth;
    const isMobile =
      window.matchMedia("(pointer: coarse)").matches || width < 768;
    const effectiveType = (
      navigator as Navigator & {
        connection?: { effectiveType?: string };
      }
    ).connection?.effectiveType;

    const body = JSON.stringify({
      metric: payload.metric,
      value: payload.value,
      rating: payload.rating,
      navigationType: payload.navigationType,
      route: window.location.pathname,
      device: isMobile ? "mobile" : "desktop",
      viewportBucket: viewportBucket(width),
      effectiveType,
    });

    // Fire-and-forget, niet-blokkerend. Eén metric per beacon (niet batchen).
    const beacon =
      typeof navigator.sendBeacon === "function"
        ? navigator.sendBeacon(
            WEB_VITALS_ENDPOINT,
            new Blob([body], { type: "application/json" }),
          )
        : false;

    if (!beacon) {
      // Fallback wanneer sendBeacon ontbreekt of false teruggeeft.
      void fetch(WEB_VITALS_ENDPOINT, {
        method: "POST",
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Alle fouten stil — telemetrie mag de app nooit storen (NFR4).
  }
}

/**
 * Navigatietype van de documentlading, in de spelling van `web-vitals`
 * (`back_forward` → `back-forward`), zodat de SRV_*-rijen naast de TTFB-rij
 * van dezelfde lading passen.
 */
function documentNavigation(): { type: string | undefined; loadedAt: number | null } {
  const nav = performance.getEntriesByType("navigation")[0] as
    | (PerformanceNavigationTiming & { activationStart?: number })
    | undefined;
  if (!nav) return { type: undefined, loadedAt: null };
  const doc = document as Document & { prerendering?: boolean; wasDiscarded?: boolean };
  const type = doc.wasDiscarded
    ? "restore"
    : doc.prerendering || (nav.activationStart ?? 0) > 0
      ? "prerender"
      : nav.type.replace(/_/g, "-");
  return { type, loadedAt: performance.timeOrigin + nav.responseEnd };
}

/**
 * Stuurt de server-opsplitsing van de (app)-layout (Snelheid 0) eenmaal per
 * mount mee naar dezelfde tabel. De beslissing (te oud → niets; zachte
 * navigatie → 'soft') staat in `serverTimingBeacons`.
 */
export function ServerTimingReporter({ timings }: { timings: LayoutServerTimings }) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    try {
      if (Math.random() >= WEB_VITALS_SAMPLE_RATE) return;
      const nav = documentNavigation();
      const plan = serverTimingBeacons(timings, {
        now: Date.now(),
        documentLoadedAt: nav.loadedAt,
        navigationType: nav.type,
      });
      if (!plan) return;
      for (const m of plan.metrics) {
        beaconMetric({ ...m, navigationType: plan.navigationType });
      }
    } catch {
      // Stil (NFR4).
    }
  }, [timings]);

  return null;
}

export function WebVitalsReporter() {
  // Sample-beslissing eenmalig per mount: niet elke metric opnieuw dobbelen.
  // useRef-init draait pas op de client (in de effect-driven callback nooit),
  // maar Math.random is SSR-veilig; er wordt hier geen window/navigator aangeraakt.
  const inSampleRef = useRef<boolean | null>(null);

  useReportWebVitals((metric) => {
    // Eerste metric van deze mount bepaalt of de sessie in de steekproef valt.
    if (inSampleRef.current === null) {
      inSampleRef.current = Math.random() < WEB_VITALS_SAMPLE_RATE;
    }
    if (!inSampleRef.current) return;

    // Alleen de metrics die zender én ontvanger delen.
    if (!ALLOWED_METRICS.has(metric.name)) return;

    beaconMetric({
      metric: metric.name as WebVitalMetric,
      value: metric.value,
      rating: metric.rating,
      navigationType: metric.navigationType,
    });
  });

  return null;
}
