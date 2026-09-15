/**
 * Lab-doelen versus het huidige plan (spec lab-haalbaarheid §4).
 *
 * Pure, isomorfe module: GEEN `'use client'`, geen Supabase, geen server-imports. Zowel
 * de server-loader (`lib/fin-data-loader.ts`) als de client-component
 * (`components/future/doelen-view.tsx`) importeert hieruit — vandaar dat het type
 * `LabPlanContext` hier woont en niet in de loader.
 */

/**
 * Het HUIDIGE plan-anker voor de lab-doelkaarten (spec §4.1): naam en subregel van
 * "Plan gedekt" volgen het plan, niet de metadata van het moment van vastleggen.
 * Doorgegeven uit `VrijheidsgetalSnapshot` (stopAnchor/stopAge/endAge).
 */
export interface LabPlanContext {
  stopAnker: 'solved' | 'aow' | 'now' | 'age'
  stopLeeftijd: number | null
  eindleeftijd: number | null
}

/**
 * Lab-doelen die niet meer bij het plan passen (spec §4.2): een doel uit het lab
 * (`metadata.bron === 'parameter'`) dat de sync een n.v.t.-reden gaf (fire_age onder
 * een vast anker, plan_coverage onder solved — lib/goal-current-value.ts).
 * Knop-doelen (spaarquote, rendement) krijgen nooit een reden (§4.3) en tellen dus nooit.
 * Het vrijheidsgetal-doel is geen lab-doel en telt hier niet, ook al draagt het een reden.
 */
export function selectLabDoelenBuitenPlan<T extends { metadata?: unknown; notApplicableReason?: string | null }>(
  goals: readonly T[],
): T[] {
  return goals.filter((g) => {
    const m = g.metadata
    const lab = typeof m === 'object' && m !== null && (m as Record<string, unknown>).bron === 'parameter'
    return lab && typeof g.notApplicableReason === 'string' && g.notApplicableReason.length > 0
  })
}
