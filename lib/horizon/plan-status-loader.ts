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
//                 solved de stop-vandaag-run), plus — alleen in de eigen blik en bij een
//                 haalbaar plan — of het VASTGELEGDE doel reikt (`vastgelegdDoelGedekt`,
//                 ADR 0175): één extra kernel-run, alleen voor wie een doel met
//                 stopleeftijd vastlegde.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perspective } from '@/lib/household-data'
import type { LeverageStatus } from '@/lib/leverage-status'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { computeHorizonFireSim } from '@/lib/fire-target-shared'
import { isFixedAnchor } from '@/lib/fire-strategy'
import { ageAtDate } from '@/lib/horizon-data'
import { buildBaselineOverrides } from '@/lib/whatif-overrides'
import { vastgelegdDoelGedekt } from '@/lib/horizon/doel-oordeel'
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
 *
 * React-`cache()`'d: op /toekomst lezen de kop (pagina) en het menupunt (layout) allebei
 * deze invoer; de doel-run (ADR 0175) draait zo één keer per request.
 */
const loadPlanStatusInput = cache(async function loadPlanStatusInputInner(
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
  const solvedReachable = run?.sim.fireReachable ?? null

  // ADR 0175 — onder solved weegt het vastgelegde doel mee, maar alleen in de EIGEN blik:
  // het doel is de stand van het eigen lab op /toekomst (dat altijd `personal` draait), en de
  // huishoud-run rekent op andere potten plus een partnerblok dat het lab niet kent. Alleen
  // bij een haalbaar plan: een onhaalbaar plan blijft rood, wat het doel ook zegt.
  let doelGedekt: boolean | null = null
  const doel = horizonData.toekomstScenarioPrefs?.doel
  const dob = horizonData.effectiveInput?.dateOfBirth
  if (!anchorFixed && perspective === 'personal' && solvedReachable === true && doel != null && run != null && dob) {
    doelGedekt = vastgelegdDoelGedekt({
      doel,
      rawContext: run.rawContext,
      // Dezelfde baseline als de lab-host (`horizon-client.tsx#whatIfBaseline`).
      baseline: buildBaselineOverrides(
        horizonData.effectiveInput,
        horizonData.fireParams.grossReturn,
        horizonData.healthScoreInput.effectiveSavingsRatePct,
      ),
      currentAge: ageAtDate(dob),
    })
  }

  return {
    anchorFixed,
    coveragePct: dekkingBekend ? (horizonData.healthScoreInput?.freedomPct ?? null) : null,
    solvedReachable,
    doelGedekt,
  }
})

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
