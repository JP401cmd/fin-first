import type { HealthScore } from '@/lib/financial-health'
import type { EmergencyFundDisplay } from '@/lib/emergency-fund'

/**
 * Consume, don't recompute (CLAUDE.md) — de /overzicht-kerngetallen.
 *
 * De widget-databundel (`loadDashboardData`) leidt drie getallen ONAFHANKELIJK
 * én altijd persoonlijk af, met eigen scalars en een eigen assets-query:
 * de gezondheidsscore, het vrijheids-% en het noodfonds. Daardoor sprak
 * /overzicht zichzelf binnen één scroll tegen (bevinding H4):
 *
 *  | onderwerp      | gezondheidsmodal          | elders op hetzelfde scherm |
 *  |----------------|---------------------------|----------------------------|
 *  | noodfonds      | "compleet, 4,6 × salaris" | briefing: "vraagt aandacht"|
 *  | FIRE-voortgang | "kritiek 11%"             | FIRE-widget: "24,2%"       |
 *
 * Deze helper laat de bundel de canonieke, perspectief-correcte waarden uit
 * `horizonData` consumeren, zodat elke widget die ze RECHTSTREEKS leest —
 * GezondheidScoreWidget (`healthScore`), FirePrognoseWidget /
 * VrijheidsvoortgangWidget / VrijheidsmijlpalenWidget (`freedomPct`),
 * NoodfondsWidget en de briefing (`emergencyFund`) — exact hetzelfde cijfer
 * toont als de hero-kaart en de kassabon erboven.
 *
 * `canonical` null (bv. horizon-load-fout) → bundel ongewijzigd (fallback op de
 * eigen bundel-waarden). Er wordt niets herberekend: alleen doorgegeven.
 *
 * Gebruikt door components/overview/overzicht-secondary-loader.tsx.
 */

/**
 * De canonieke kerngetallen zoals `HorizonPageData` ze draagt. Structureel
 * getypt (geen import van de loader) zodat deze module puur blijft.
 */
export interface CanonicalOverviewFigures {
  healthScore: HealthScore
  /** Kernel-genoemde vrijheidsvoortgang (0..100) uit dezelfde run als /toekomst. */
  freedomPct: number
  /** Noodfonds op dezelfde rijen en norm als de `emergency_fund`-pijler. */
  emergencyFund: EmergencyFundDisplay
}

/**
 * Bundel-vorm van de drie velden die overschreven worden. Elke bundel die deze
 * velden draagt (in de praktijk `DashboardData`) voldoet.
 */
export interface OverviewFigureCarrier {
  healthScore: HealthScore
  freedomPct: number
  emergencyFund: {
    currentAmount: number
    targetAmount: number
    monthsCovered: number
    targetMonths: number
    isComplete: boolean
    runwayMonths?: number
    source?: 'salary' | 'expenses'
  }
}

export function withCanonicalOverviewFigures<T extends OverviewFigureCarrier>(
  bundle: T,
  canonical: CanonicalOverviewFigures | null,
): T {
  if (!canonical) return bundle
  return {
    ...bundle,
    healthScore: canonical.healthScore,
    freedomPct: canonical.freedomPct,
    emergencyFund: canonical.emergencyFund,
  }
}
