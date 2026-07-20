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

import { useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";
import {
  WEB_VITALS_ENDPOINT,
  WEB_VITALS_SAMPLE_RATE,
  WEB_VITAL_METRICS,
  viewportBucket,
  type WebVitalMetric,
} from "@/lib/web-vitals/config";

const ALLOWED_METRICS = new Set<string>(WEB_VITAL_METRICS);

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
        metric: metric.name as WebVitalMetric,
        value: metric.value,
        rating: metric.rating,
        navigationType: metric.navigationType,
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
  });

  return null;
}
