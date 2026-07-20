// Single source voor de eigen web-vitals / RUM-collectie.
// Gedeeld door de client-reporter (verzenden) en de API-route (accepteren),
// zodat "toegestane metric" nooit uiteenloopt tussen zender en ontvanger.
// Bewust NIET in lib/constants.ts: dat is de single source voor financiële
// aannames — een endpoint-URL/sample-rate hoort daar niet.

/** Waar de client-reporter zijn metingen naartoe beacon't, en waar de route luistert. */
export const WEB_VITALS_ENDPOINT = "/api/web-vitals";

/**
 * Fractie sessies die vitals verstuurt (1 = alles). Omlaag tunebaar zonder
 * code-changes elders wanneer het volume te hoog wordt.
 */
export const WEB_VITALS_SAMPLE_RATE = 1.0;

/** De Core Web Vitals die we verzamelen. Client-toegestaan == server-geaccepteerd. */
export const WEB_VITAL_METRICS = ["LCP", "CLS", "INP", "FCP", "TTFB"] as const;
export type WebVitalMetric = (typeof WEB_VITAL_METRICS)[number];

/**
 * Bovengrens voor een plausibele metric-waarde (ms). Eén uur is ruim boven elke
 * echte web-vital; CLS is unitless en valt hier vanzelf binnen. Dient als
 * plausibiliteitscheck tegen malafide payloads.
 */
export const MAX_METRIC_VALUE = 3_600_000;

/** De ratings die web-vitals meelevert. */
export const WEB_VITAL_RATINGS = ["good", "needs-improvement", "poor"] as const;
export type WebVitalRating = (typeof WEB_VITAL_RATINGS)[number];

/** Grove device-categorie — dataminimalisatie: geen volledige user-agent. */
export const WEB_VITAL_DEVICES = ["mobile", "desktop"] as const;
export type WebVitalDevice = (typeof WEB_VITAL_DEVICES)[number];

/** Grove viewport-buckets — dataminimalisatie: geen exacte pixelmaten. */
export const VIEWPORT_BUCKETS = ["xs", "sm", "md", "lg", "xl"] as const;
export type ViewportBucket = (typeof VIEWPORT_BUCKETS)[number];

/**
 * Officiële Core Web Vitals-drempels (good/poor) per metric. Waarden zijn in
 * milliseconden, behalve CLS (unitless layout-shift-score). Een p75 ≤ `good`
 * is groen, > `poor` is rood, ertussenin oranje ("needs improvement").
 * Single source voor zowel de RUM-inzichtpagina als eventuele latere consumers,
 * zodat de classificatie nooit uiteenloopt. Bron: web.dev/vitals.
 */
export const WEB_VITAL_THRESHOLDS: Record<
  WebVitalMetric,
  { good: number; poor: number }
> = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
};

/**
 * Classificeer een (p75-)waarde tegen de CWV-drempels van de metric.
 * ≤ good → 'good', > poor → 'poor', anders 'needs-improvement'.
 */
export function ratingForValue(
  metric: WebVitalMetric,
  value: number,
): WebVitalRating {
  const t = WEB_VITAL_THRESHOLDS[metric];
  if (value <= t.good) return "good";
  if (value > t.poor) return "poor";
  return "needs-improvement";
}

/**
 * Metric-bewuste formattering van een (p75-)waarde. CLS is unitless en toont
 * twee decimalen; de overige zijn tijden in milliseconden (0 decimalen + ' ms').
 */
export function formatVitalValue(metric: WebVitalMetric, value: number): string {
  if (metric === "CLS") {
    return value.toLocaleString("nl-NL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return `${Math.round(value).toLocaleString("nl-NL")} ms`;
}

/**
 * Zet een viewport-breedte om in een grove bucket (Tailwind-achtige grenzen).
 * Bewust grof zodat er geen herleidbare schermafmeting wordt opgeslagen.
 */
export function viewportBucket(width: number): ViewportBucket {
  if (width < 640) return "xs";
  if (width < 768) return "sm";
  if (width < 1024) return "md";
  if (width < 1280) return "lg";
  return "xl";
}
