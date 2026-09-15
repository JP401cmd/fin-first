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
import { resolvePlanStatus } from '@/lib/horizon/plan-status'

export async function loadPlanStatus(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<LeverageStatus> {
  const [horizonData, run] = await Promise.all([
    loadHorizonData(supabase, perspective).catch(() => null),
    computeHorizonFireSim(supabase, perspective).catch(() => null),
  ])
  if (!horizonData) return 'neutral'
  const planAnchor = horizonData.firePlan?.anchor ?? null
  const anchorFixed = planAnchor != null && isFixedAnchor({ anchor: planAnchor })
  // Onder een vast anker is `freedomPct` alleen een échte dekking mét kernel-run én
  // geboortedatum; anders zet de horizon-loader 'm op 0 als "onbekend"
  // (`computeFreedomPctForPlan`, gepind in horizon-data-loader.anker.test.ts). Die 0
  // mag hier geen rood worden — geen run = geen oordeel.
  const dekkingBekend = run != null && Boolean(horizonData.effectiveInput?.dateOfBirth)
  return resolvePlanStatus({
    anchorFixed,
    coveragePct: dekkingBekend ? (horizonData.healthScoreInput?.freedomPct ?? null) : null,
    solvedReachable: run?.sim.fireReachable ?? null,
  })
}
