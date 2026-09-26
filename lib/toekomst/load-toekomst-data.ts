// lib/toekomst/load-toekomst-data.ts
//
// Server-lading van de /toekomst-landing, getild uit `app/(app)/toekomst/page.tsx`
// (fase 1 "/toekomst in drie katernen", ADR 0179, stroom R — voorbereiding op
// stap 15). De `(katern)`-layout roept deze functie aan, en de katern-pages Doelen en
// Instellingen lezen er hun bundel uit, zodat Plan, Doelen en Instellingen dezelfde
// lading delen.
//
// Ontstaan als PURE MOVE: dezelfde lezingen, in dezelfde `Promise.all`, met dezelfde
// fail-closed-takken en dezelfde afleidingen als voorheen in de page (sinds stap 21
// zonder de rekenhulp-telling van de vervallen navkaart). Het enige
// dat erbij komt is de `cache()`-wrapper om de deel-ladingen: een layout én een page
// die ze in hetzelfde request aanroepen, delen dan één lading. De onderliggende
// loaders (`loadHorizonData`, `readMinimizedMap`, `readPlanReviewState`) keyen hun
// React-`cache()` op het Supabase-client-OBJECT; dat object is per request al één en
// hetzelfde, want `createClient` (lib/supabase/server.ts) is zelf request-gecachet.
//
// Geen `import 'server-only'`: de repo gebruikt dat patroon nergens; de
// `@/lib/supabase/server`-import (next/headers) maakt de module al onbruikbaar in
// een client-bundel.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData, type HorizonPageData } from '@/lib/horizon-data-loader'
import { loadFinData, type FinPageData } from '@/lib/fin-data-loader'
import { loadPlanStatusInput, loadPlanVerdictSentence } from '@/lib/horizon/plan-status-loader'
import type { PlanStatusInput, PlanVerdictSentence } from '@/lib/horizon/plan-status'
import { readMinimizedMap } from '@/lib/page-status/minimized-prefs'
import { katernMinimizedSeed, type KaternMinimizedSeed } from '@/lib/horizon/katern-meldingen'
import { readPlanReviewState } from '@/lib/plan-review/read-state'
import { buildPlanReviewFacts, derivePlanReviewProgress } from '@/lib/plan-review/progress'
import type { PlanReviewProgress } from '@/lib/plan-review/types'
import { loadEigenStrategieEvents } from '@/lib/plan-review/eigen-strategie-events'

/** Alles wat de /toekomst-landing (en straks de katern-layout) doorgeeft. */
export interface ToekomstData {
  /** De tijdas-bundel (kernel-run, perspectief 'personal'). */
  horizonData: HorizonPageData
  /** Doelen + voortgang (katern Doelen en de doelmarkers op de tijdas). */
  finData: FinPageData
  /** Plan-review-voortgang; `null` = geen gebruiker of kolom nog niet uitgerold. */
  planReviewProgress: PlanReviewProgress | null
  /**
   * Server-seed "geminimaliseerd" van de melding per katern (ADR 0179 D6): het
   * stoplichtniveau onder de katern-route in `status_banner_minimized`, of null. De
   * oude losse sleutels (tekort-lening, AOW, eindsituatie) worden niet meer gelezen;
   * hun JSONB-waarden mogen blijven staan.
   */
  katernMinimized: KaternMinimizedSeed
  /** Het plan-oordeel als kop-zin (ADR 0174 D6). */
  planVerdict: PlanVerdictSentence
  /**
   * De invoer van dat oordeel (`loadPlanStatusInput`, mét de geboortedatum-poort):
   * de plan-melding in katern Plan leest hem, zodat melding en kop hetzelfde zeggen.
   * `null` = geen horizon-data, dus geen oordeel.
   */
  planStatusInput: PlanStatusInput | null
}

/**
 * De Supabase-client van dit request — `createClient` zelf, die al per request gecachet
 * is (lib/supabase/server.ts). Geen tweede `cache()` eromheen: die voegde niets toe. De
 * naam blijft, zodat de katern-pages zichtbaar dezelfde client pakken als de deel-ladingen
 * hieronder (de `cache()` van de loaders keyt op dat object).
 */
export const getToekomstClient = createClient

const getToekomstUser = cache(async function getToekomstUser() {
  const supabase = await getToekomstClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/**
 * Deel-ladingen, elk per request gecachet. Waarom los: bij client-navigatie tussen de
 * katernen rendert de layout NIET opnieuw — alleen de page. Een page die
 * `loadToekomstData()` aanroept voor één veld draait dan de hele lading (horizon-kernel,
 * plan-oordeel, plan-review). Doelen leest daarom alleen `loadToekomstFinData`,
 * Instellingen alleen horizon + review. Binnen één request (eerste load) delen layout en
 * page dezelfde uitkomst.
 */
export const loadToekomstHorizonData = cache(async function loadToekomstHorizonData(): Promise<HorizonPageData> {
  return loadHorizonData(await getToekomstClient())
})

export const loadToekomstFinData = cache(async function loadToekomstFinData(): Promise<FinPageData> {
  return loadFinData(await getToekomstClient())
})

/** Plan-review-voortgang; `null` = geen gebruiker of kolom nog niet uitgerold. */
export const loadToekomstPlanReviewProgress = cache(
  async function loadToekomstPlanReviewProgress(): Promise<PlanReviewProgress | null> {
    const supabase = await getToekomstClient()
    const user = await getToekomstUser()
    if (!user) return null
    const [horizonData, planReviewState, eigenStrategieEvents] = await Promise.all([
      loadToekomstHorizonData(),
      // TPR-01 — de plan-review-markering (own-row jsonb-pref). `null` = kolom nog niet
      // uitgerold → geen review-ingang.
      readPlanReviewState(supabase, user.id),
      // TPR-15 — de EIGEN AOW/werk/pensioen-rijen: de life_events-policy is huishoud-gedeeld,
      // en een gedeeld partner-AOW-event mag de AOW-stap niet dichtzetten. Faalt de lezing,
      // dan fail-closed: geen rijen (de AOW-stap toont dan open), nooit de gedeelde bundelrijen.
      loadEigenStrategieEvents(supabase, user.id).catch((err: unknown) => {
        console.error('[toekomst:plan-review:eigen-events]', err)
        return []
      }),
    ])
    if (!planReviewState) return null
    // TPR-01 — voortgang AFGELEID uit markering + profielstaat (A9/A10). Alleen de eigen
    // bezittingen en gebeurtenissen: de policies zijn huishoud-gedeeld en de review gaat
    // over de eigen keuzes.
    return derivePlanReviewProgress(
      planReviewState,
      buildPlanReviewFacts({
        events: eigenStrategieEvents,
        assets: horizonData.assets,
        housingStrategyRaw: horizonData.rawProfile?.housing_strategy_config,
        ownerId: user.id,
      }),
    )
  },
)

/**
 * Laad de /toekomst-data voor de ingelogde gebruiker (de katern-layout). React-`cache()`'d
 * per request (zie de kop van dit bestand).
 */
export const loadToekomstData = cache(async function loadToekomstData(): Promise<ToekomstData> {
  const supabase = await getToekomstClient()
  const user = await getToekomstUser()

  // Het aantal rekenhulpen (count-query op `custom_calculators`) is weg met de
  // Rekenhulp-navkaart (ADR 0179 fase 1 stap 15/21): geen lezer meer.
  const [horizonData, finData, minimizedMap, planReviewProgress, planVerdict, planStatusInput] = await Promise.all([
    loadToekomstHorizonData(),
    loadToekomstFinData(),
    // Server-seed van de "geminimaliseerd"-voorkeur per katern (own-row jsonb-pref,
    // cross-device). Lichte single-row select, parallel aan de zware loaders — zo
    // flikkeren slot en statuspunt niet na hydration.
    user
      ? readMinimizedMap(supabase, user.id)
      : Promise.resolve({} as Record<string, unknown>),
    loadToekomstPlanReviewProgress(),
    // OORDEEL IN DE PAGINATITEL — de dekking van je plan, als zin (ADR 0174 D6).
    // Consume-only: dezelfde invoer als `loadPlanVerdict`, die de plankaart op
    // /overzicht en het menupunt "De toekomst" als stoplicht lezen, dus per
    // constructie hetzelfde oordeel. Kost hier niets extra: `loadHorizonData` en
    // `computeHorizonFireSim` zijn React-`cache()`'d en draaien op deze route toch
    // al (zelfde 'personal'-perspectief als hierboven).
    loadPlanVerdictSentence(supabase, 'personal'),
    // De invoer van datzelfde oordeel, voor de plan-melding (cache()'d: geen tweede run).
    loadPlanStatusInput(supabase, 'personal'),
  ])

  return {
    horizonData,
    finData,
    planReviewProgress,
    katernMinimized: katernMinimizedSeed(minimizedMap),
    planVerdict,
    planStatusInput,
  }
})
