// lib/toekomst/load-toekomst-data.ts
//
// Server-lading van de /toekomst-landing, getild uit `app/(app)/toekomst/page.tsx`
// (fase 1 "/toekomst in drie katernen", ADR 0179, stroom R — voorbereiding op
// stap 15). Straks roept de `(katern)`-layout deze functie aan, zodat Plan, Doelen
// en Instellingen dezelfde lading delen; tot dan roept de page hem aan en rendert
// hij identiek.
//
// PURE MOVE: dezelfde zeven lezingen, in dezelfde `Promise.all`, met dezelfde
// fail-closed-takken en dezelfde afleidingen als voorheen in de page. Het enige
// dat erbij komt is de `cache()`-wrapper om de hele lading: een layout én een page
// die hem in hetzelfde request aanroepen, delen dan één lading. Dat is nodig
// omdat de React-`cache()` van de onderliggende loaders (`loadHorizonData`,
// `readMinimizedMap`, `readPlanReviewState`) op het Supabase-client-OBJECT keyt —
// twee aanroepers met elk een eigen `createClient()` zouden anders alles dubbel
// ophalen.
//
// Geen `import 'server-only'`: de repo gebruikt dat patroon nergens; de
// `@/lib/supabase/server`-import (next/headers) maakt de module al onbruikbaar in
// een client-bundel.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData, type HorizonPageData } from '@/lib/horizon-data-loader'
import { loadFinData, type FinPageData } from '@/lib/fin-data-loader'
import { loadPlanVerdictSentence } from '@/lib/horizon/plan-status-loader'
import type { PlanVerdictSentence } from '@/lib/horizon/plan-status'
import { readMinimizedMap } from '@/lib/page-status/minimized-prefs'
import {
  DEFICIT_NOTICE_MINIMIZE_KEY,
  asDeficitMinimizedPeak,
} from '@/lib/horizon/deficit-loan-minimize'
import { AOW_NOTICE_MINIMIZE_KEY, asAowMinimizedFlag } from '@/lib/horizon/aow-notice-minimize'
import {
  EINDSITUATIE_NOTICE_MINIMIZE_KEY,
  asEindsituatieMinimizedFlag,
} from '@/lib/horizon/eindsituatie-notice-minimize'
import { readPlanReviewState } from '@/lib/plan-review/read-state'
import { buildPlanReviewFacts, derivePlanReviewProgress } from '@/lib/plan-review/progress'
import type { PlanReviewProgress } from '@/lib/plan-review/types'
import { loadEigenStrategieEvents } from '@/lib/plan-review/eigen-strategie-events'

/** Alles wat de /toekomst-landing (en straks de katern-layout) doorgeeft. */
export interface ToekomstData {
  /** De tijdas-bundel (kernel-run, perspectief 'personal'). */
  horizonData: HorizonPageData
  /** Doelen + voortgang (Doelen-navkaart en de doelmarkers op de tijdas). */
  finData: FinPageData
  /** Aantal eigen rekenhulpen (count-query, geen rijen). */
  calculatorCount: number
  /** Plan-review-voortgang; `null` = geen gebruiker of kolom nog niet uitgerold. */
  planReviewProgress: PlanReviewProgress | null
  /** Server-seed "geminimaliseerd" van de tekort-lening-melding (piek of null). */
  deficitMinimizedPeak: number | null
  /** Server-seed "geminimaliseerd" van de "AOW ontbreekt"-melding (vlag of null). */
  aowMinimizedFlag: number | null
  /** Server-seed "geminimaliseerd" van de eindsituatie-uitleg (vlag of null). */
  eindsituatieMinimizedFlag: number | null
  /** Het plan-oordeel als kop-zin (ADR 0174 D6). */
  planVerdict: PlanVerdictSentence
}

/**
 * Laad de /toekomst-data voor de ingelogde gebruiker. React-`cache()`'d per
 * request (zie de kop van dit bestand).
 */
export const loadToekomstData = cache(async function loadToekomstData(): Promise<ToekomstData> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [horizonData, finData, calcCountRes, minimizedMap, planReviewState, eigenStrategieEvents, planVerdict] = await Promise.all([
    loadHorizonData(supabase),
    loadFinData(supabase),
    user
      ? supabase
          .from('custom_calculators')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
      : Promise.resolve({ count: 0 }),
    // Server-seed van de "geminimaliseerd"-voorkeur voor de tekort-lening-melding
    // (own-row jsonb-pref, cross-device). Lichte single-row select, parallel aan
    // de zware loaders — zo flikkert de melding/het statuspunt niet na hydration.
    user
      ? readMinimizedMap(supabase, user.id)
      : Promise.resolve({} as Record<string, unknown>),
    // TPR-01 — de plan-review-markering (own-row jsonb-pref). `null` = kolom nog niet
    // uitgerold → geen review-ingang.
    user ? readPlanReviewState(supabase, user.id) : Promise.resolve(null),
    // TPR-15 — de EIGEN AOW/werk/pensioen-rijen: de life_events-policy is huishoud-gedeeld,
    // en een gedeeld partner-AOW-event mag de AOW-stap niet dichtzetten. Faalt de lezing,
    // dan fail-closed: geen rijen (de AOW-stap toont dan open), nooit de gedeelde bundelrijen.
    user
      ? loadEigenStrategieEvents(supabase, user.id).catch((err: unknown) => {
          console.error('[toekomst:plan-review:eigen-events]', err)
          return []
        })
      : Promise.resolve([]),
    // OORDEEL IN DE PAGINATITEL — de dekking van je plan, als zin (ADR 0174 D6).
    // Consume-only: dezelfde invoer als `loadPlanVerdict`, die de plankaart op
    // /overzicht en het menupunt "De toekomst" als stoplicht lezen, dus per
    // constructie hetzelfde oordeel. Kost hier niets extra: `loadHorizonData` en
    // `computeHorizonFireSim` zijn React-`cache()`'d en draaien op deze route toch
    // al (zelfde 'personal'-perspectief als hierboven).
    loadPlanVerdictSentence(supabase, 'personal'),
  ])
  // TPR-01 — voortgang AFGELEID uit markering + profielstaat (A9/A10). Alleen de eigen
  // bezittingen en gebeurtenissen: de policies zijn huishoud-gedeeld en de review gaat over
  // de eigen keuzes.
  const planReviewProgress =
    user && planReviewState
      ? derivePlanReviewProgress(
          planReviewState,
          buildPlanReviewFacts({
            events: eigenStrategieEvents,
            assets: horizonData.assets,
            housingStrategyRaw: horizonData.rawProfile?.housing_strategy_config,
            ownerId: user.id,
          }),
        )
      : null

  return {
    horizonData,
    finData,
    calculatorCount: calcCountRes.count ?? 0,
    planReviewProgress,
    deficitMinimizedPeak: asDeficitMinimizedPeak(minimizedMap[DEFICIT_NOTICE_MINIMIZE_KEY]),
    // TPR-04 — zelfde server-seed voor de "AOW ontbreekt"-melding (vlag 1 of null).
    aowMinimizedFlag: asAowMinimizedFlag(minimizedMap[AOW_NOTICE_MINIMIZE_KEY]),
    // Plan 17 sep (D) — zelfde server-seed voor de eindsituatie-uitleg (vlag 1 of null).
    eindsituatieMinimizedFlag: asEindsituatieMinimizedFlag(
      minimizedMap[EINDSITUATIE_NOTICE_MINIMIZE_KEY],
    ),
    planVerdict,
  }
})
