import type { HealthScore } from '@/lib/financial-health'

/**
 * Consume, don't recompute (CLAUDE.md) — gezondheidsscore.
 *
 * De widget-databundel (`loadDashboardData`) berekent de gezondheidsscore
 * ONAFHANKELIJK én altijd persoonlijk, met eigen afgeleide scalars (noodfonds-
 * uitgaven current-month i.p.v. 6-mnd-gemiddelde, freedomPct op de sim-kernel-
 * noemer, geëxtrapoleerd DSTI-inkomen). Daardoor week het widget-cijfer af van
 * de /overzicht-hero, die de perspectief-correcte score uit `horizonData`
 * gebruikt.
 *
 * Deze helper laat de bundel de canonieke, perspectief-correcte score consumeren
 * zodat de GezondheidScoreWidget EXACT hetzelfde cijfer én dezelfde trend toont
 * als de hero-kaart. `canonical` null (bv. horizon-load-fout) → bundel
 * ongewijzigd (fallback op de eigen bundel-score).
 *
 * Gebruikt door components/overview/overzicht-secondary-loader.tsx.
 */
export function withCanonicalHealthScore<T extends { healthScore: HealthScore }>(
  bundle: T,
  canonical: HealthScore | null,
): T {
  return canonical ? { ...bundle, healthScore: canonical } : bundle
}
