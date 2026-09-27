// Server-opsplitsing van de (app)-layout naar de eigen web-vitals-tabel
// (Snelheid 0, plan docs/superpowers/plans/2026-09-26-ttfb-oorzaak-en-plan.md §4).
//
// Vercel Hobby geeft geen functieduur of cold start per route. De layout meet
// daarom zelf hoe lang zijn laadstappen duren en geeft dat mee aan een klein
// client-component, dat de getallen als extra metrics naar /api/web-vitals
// beacon't. Ze landen in dezelfde tabel en met dezelfde route/device-dimensies
// als de TTFB, zodat per route te zien is of de tijd in cold start, auth of de
// waterval zit (kaart Snelheid C beslist daarop).
//
// Bewust los van WEB_VITAL_METRICS: dit zijn geen Core Web Vitals, ze hebben
// geen drempels en horen niet op /beheer/webprestaties. De route accepteert de
// unie van beide lijsten.

/** De server-metrics. Tijden in ms; SRV_COLD is 1 (cold start) of 0. */
export const SERVER_TIMING_METRICS = [
  "SRV_AUTH_MS",
  "SRV_BATCH_MS",
  "SRV_LEVER_MS",
  "SRV_GUIDE_MS",
  "SRV_TOTAL_MS",
  "SRV_COLD",
] as const;
export type ServerTimingMetric = (typeof SERVER_TIMING_METRICS)[number];

/** Wat de layout meet en als prop aan de reporter geeft. */
export interface LayoutServerTimings {
  authMs: number;
  batchMs: number;
  /** getServerPerspective + loadLeverScores. */
  leverMs: number;
  /** loadWelcomeGuideSeed; 0 wanneer de gids is afgesloten (dan draait hij niet). */
  guideMs: number;
  totalMs: number;
  /** Eerste request op deze serverinstantie. */
  cold: boolean;
  /** Date.now() op de server, aan het eind van de layout-render. */
  renderedAt: number;
}

/**
 * Ouder dan dit en de meting is niet van déze lading: de service worker heeft
 * gecachte HTML geserveerd (Snelheid A), en die zou de oude getallen anders als
 * nieuwe meting insturen.
 */
export const SERVER_TIMING_MAX_AGE_MS = 60_000;

/**
 * Speling voor klokverschil tussen server en toestel bij het herkennen van een
 * zachte navigatie (render ná de documentlading).
 */
export const SOFT_NAVIGATION_MARGIN_MS = 5_000;

/** navigation_type voor een layout-render die via een client-navigatie binnenkwam. */
export const SOFT_NAVIGATION_TYPE = "soft";

/**
 * Beslist of en hoe de metingen verstuurd worden.
 *
 * - `null` wanneer de render te oud is (gecachte HTML) — niets versturen.
 * - Anders zes metrics. `navigationType` is die van de documentlading, tenzij de
 *   layout duidelijk ná die lading renderde: dan kwam hij binnen via een
 *   client-navigatie (bv. login → /overzicht) en krijgt hij `'soft'`, zodat hij
 *   niet naast een TTFB-rij van een ándere lading wordt gelegd.
 *
 * `documentLoadedAt` = epoch-ms waarop het document binnen was
 * (performance.timeOrigin + responseEnd).
 */
export function serverTimingBeacons(
  timings: LayoutServerTimings,
  ctx: { now: number; documentLoadedAt: number | null; navigationType: string | undefined },
): { metrics: Array<{ metric: ServerTimingMetric; value: number }>; navigationType: string | undefined } | null {
  if (ctx.now - timings.renderedAt > SERVER_TIMING_MAX_AGE_MS) return null;

  const soft =
    ctx.documentLoadedAt != null &&
    timings.renderedAt > ctx.documentLoadedAt + SOFT_NAVIGATION_MARGIN_MS;

  const ms = (v: number) => Math.max(0, Math.round(v));
  return {
    navigationType: soft ? SOFT_NAVIGATION_TYPE : ctx.navigationType,
    metrics: [
      { metric: "SRV_AUTH_MS", value: ms(timings.authMs) },
      { metric: "SRV_BATCH_MS", value: ms(timings.batchMs) },
      { metric: "SRV_LEVER_MS", value: ms(timings.leverMs) },
      { metric: "SRV_GUIDE_MS", value: ms(timings.guideMs) },
      { metric: "SRV_TOTAL_MS", value: ms(timings.totalMs) },
      { metric: "SRV_COLD", value: timings.cold ? 1 : 0 },
    ],
  };
}
