// lib/horizon/plan-status-loader.ts
//
// Server-side: het plan-stoplicht voor één gebruiker en perspectief. De ÉNE plek
// die de invoer voor `resolvePlanStatus` bij elkaar zoekt — de plankaart op
// /overzicht en het menupunt "De toekomst" lezen allebei deze functie, zodat ze
// nooit een ander oordeel geven.
//
// Consume-only en request-gededuped: `loadHorizonData` en `computeHorizonFireSim`
// zijn React-`cache()`'d. Op /overzicht en /toekomst betaalt dit dus niets extra;
// elders draait de canonieke run één keer — daarom streamt de layout dit na.
//
// Grondslag (zie lib/horizon/plan-status.ts):
//  - vast anker → `healthScoreInput.freedomPct` (de plan-dekking, ADR 0129 B3);
//  - solved     → `sim.fireReachable` van de hoofdrun (NIET de runway: dat is onder
//                 solved de stop-vandaag-run).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perspective } from '@/lib/household-data'
import type { LeverageStatus } from '@/lib/leverage-status'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { computeHorizonFireSim } from '@/lib/fire-target-shared'
import { isFixedAnchor } from '@/lib/fire-strategy'
import { resolvePlanVerdict, type PlanVerdict } from '@/lib/horizon/plan-status'

/**
 * Het plan-oordeel in woorden én kleur — de paginatitel van /toekomst
 * (`PageVerdictOpening`) leest deze functie, de plankaart en het menupunt lezen
 * `loadPlanStatus` hieronder, dat er een dunne wrapper omheen is. Eén
 * invoer-verzameling, dus per constructie nooit twee oordelen.
 */
export async function loadPlanVerdict(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<PlanVerdict> {
  const [horizonData, run] = await Promise.all([
    loadHorizonData(supabase, perspective).catch(() => null),
    computeHorizonFireSim(supabase, perspective).catch(() => null),
  ])
  if (!horizonData) return { label: null, status: 'neutral' }
  const planAnchor = horizonData.firePlan?.anchor ?? null
  const anchorFixed = planAnchor != null && isFixedAnchor({ anchor: planAnchor })
  // Onder een vast anker is `freedomPct` alleen een échte dekking mét kernel-run én
  // geboortedatum; anders zet de horizon-loader 'm op 0 als "onbekend"
  // (`computeFreedomPctForPlan`, gepind in horizon-data-loader.anker.test.ts). Die 0
  // mag hier geen rood worden — geen run = geen oordeel.
  const dekkingBekend = run != null && Boolean(horizonData.effectiveInput?.dateOfBirth)
  return resolvePlanVerdict({
    anchorFixed,
    coveragePct: dekkingBekend ? (horizonData.healthScoreInput?.freedomPct ?? null) : null,
    solvedReachable: run?.sim.fireReachable ?? null,
  })
}

export async function loadPlanStatus(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<LeverageStatus> {
  return (await loadPlanVerdict(supabase, perspective)).status
}
