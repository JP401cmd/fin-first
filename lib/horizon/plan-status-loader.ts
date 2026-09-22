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
import {
  resolvePlanVerdict,
  resolvePlanVerdictSentence,
  type PlanStatusInput,
  type PlanVerdict,
  type PlanVerdictSentence,
} from '@/lib/horizon/plan-status'

/**
 * De ÉNE invoer-verzameling voor het plan-stoplicht. `null` = geen horizon-data,
 * dus geen oordeel. Beide loaders hieronder lezen deze functie, zodat de zin op
 * /toekomst en het stoplicht elders per constructie hetzelfde zeggen.
 */
async function loadPlanStatusInput(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<PlanStatusInput | null> {
  const [horizonData, run] = await Promise.all([
    loadHorizonData(supabase, perspective).catch(() => null),
    computeHorizonFireSim(supabase, perspective).catch(() => null),
  ])
  if (!horizonData) return null
  const planAnchor = horizonData.firePlan?.anchor ?? null
  const anchorFixed = planAnchor != null && isFixedAnchor({ anchor: planAnchor })
  // Onder een vast anker is `freedomPct` alleen een échte dekking mét kernel-run én
  // geboortedatum; anders zet de horizon-loader 'm op 0 als "onbekend"
  // (`computeFreedomPctForPlan`, gepind in horizon-data-loader.anker.test.ts). Die 0
  // mag hier geen rood worden — geen run = geen oordeel.
  const dekkingBekend = run != null && Boolean(horizonData.effectiveInput?.dateOfBirth)
  return {
    anchorFixed,
    coveragePct: dekkingBekend ? (horizonData.healthScoreInput?.freedomPct ?? null) : null,
    solvedReachable: run?.sim.fireReachable ?? null,
  }
}

/**
 * Het plan-oordeel in woorden én kleur, in de korte vorm ("Plan dekt 96%"). De
 * plankaart en het menupunt lezen `loadPlanStatus` hieronder, dat er een dunne
 * wrapper omheen is.
 */
export async function loadPlanVerdict(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<PlanVerdict> {
  const input = await loadPlanStatusInput(supabase, perspective)
  if (!input) return { label: null, status: 'neutral' }
  return resolvePlanVerdict(input)
}

/**
 * Het plan-oordeel als kop-ZIN — de paginatitel van /toekomst
 * (`PageVerdictOpening`, ADR 0174 D6). Zelfde invoer als `loadPlanVerdict`.
 */
export async function loadPlanVerdictSentence(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<PlanVerdictSentence> {
  const input = await loadPlanStatusInput(supabase, perspective)
  if (!input) return { sentence: null, status: 'neutral' }
  return resolvePlanVerdictSentence(input)
}

export async function loadPlanStatus(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<LeverageStatus> {
  return (await loadPlanVerdict(supabase, perspective)).status
}
