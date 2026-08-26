/**
 * Server-zijde bron voor de vrijheidsgetal-doelsynchronisatie (bevinding C10).
 *
 * Deze module haalt géén eigen cijfers op en rekent niets uit: hij bundelt de
 * bestaande canonieke bronnen en voert ze aan `buildVrijheidsgetalSnapshot`.
 *
 *   • `computeHorizonFireSim` (lib/fire-target-shared.ts) — DE canonieke
 *     kernel-run, React-`cache()`'d, één solve per request. Levert
 *     `fireAgeFractional` + beide FIRE-doelbedragen (Prognose!J en Prognose!I).
 *   • `loadHorizonData` — de grondslag-context (netto vermogen, FIRE-eligible
 *     vermogen, huisstrategie) en de scalar-terugval wanneer de kernel niet kon
 *     draaien. Óók `cache()`'d, en op /overzicht al warm.
 *
 * Beide worden hoe dan ook al geladen door /overzicht; op /toekomst/doelen is dit
 * de enige aanroeper, en daarom roepen de loaders 'm LAZY aan: alleen wanneer er
 * daadwerkelijk een actief vrijheidsgetal-doel is. Zonder zo'n doel kost deze
 * module niets — hetzelfde patroon als `injectParameterGoalCurrentValues`.
 */

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeHorizonFireSim } from '@/lib/fire-target-shared'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { inclHomeTargetFromScalar } from '@/lib/core-metrics'
import { isHomeExcludedFromFire } from '@/lib/housing-strategy'
import { ageAtDate } from '@/lib/horizon-data'
import {
  buildVrijheidsgetalSnapshot,
  type VrijheidsgetalSnapshot,
} from '@/lib/goals/vrijheidsgetal-goal'

/**
 * De canonieke FIRE-stand voor het vrijheidsgetal-doel. `null` wanneer de
 * horizon-context niet geladen kon worden — de aanroeper laat de opgeslagen
 * doelwaarden dan staan.
 *
 * Wrapped in React `cache()`: het doelen-scherm en de /overzicht-doelenwidget
 * binnen hetzelfde request delen zo letterlijk dezelfde cijfers.
 */
export const loadVrijheidsgetalSnapshot = cache(async function loadVrijheidsgetalSnapshot(
  supabase: SupabaseClient,
): Promise<VrijheidsgetalSnapshot | null> {
  let horizon
  try {
    horizon = await loadHorizonData(supabase)
  } catch {
    return null
  }

  // Kernel-run mag falen (geen geboortedatum, geen uitgaven): dan blijft de
  // scalar-terugval van de horizon-loader over — exact dezelfde terugval die
  // /overzicht gebruikt wanneer de sim niet kon draaien.
  const run = await computeHorizonFireSim(supabase).catch(() => null)

  // Netto vermogen incl. eigen woning: dezelfde perspectief-gewogen aggregaten
  // waarmee de horizon-loader zelf `freedomPct` berekent (regel ~844) — geen
  // tweede optelling over assets/debts.
  const netWorthInclHome = horizon.effectiveInput.totalAssets - horizon.effectiveInput.totalDebts

  const requiredPortfolioExclHome =
    (run && run.sim.requiredFirePortfolio > 0 ? run.sim.requiredFirePortfolio : null) ??
    horizon.requiredPortfolioExclHome
  const requiredNetWorthInclHome =
    (run && (run.sim.requiredFireNetWorth ?? 0) > 0 ? run.sim.requiredFireNetWorth! : null) ??
    inclHomeTargetFromScalar(
      requiredPortfolioExclHome,
      netWorthInclHome,
      horizon.fireEligibleNetWorth,
    )

  const dob = horizon.effectiveInput.dateOfBirth

  return buildVrijheidsgetalSnapshot({
    homeExcludedFromFire:
      horizon.housingContext.hasEigenHuis && isHomeExcludedFromFire(horizon.housingStrategy),
    netWorthInclHome,
    fireEligibleNetWorth: horizon.fireEligibleNetWorth,
    requiredNetWorthInclHome,
    requiredPortfolioExclHome,
    fireAgeFractional: run?.sim.fireAgeFractional ?? null,
    currentAge: dob ? ageAtDate(dob) : null,
  })
})
