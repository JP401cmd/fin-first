/**
 * Rekenhulp — wekelijkse rate-limit voor AI-generaties en -verfijningen.
 *
 * Flat 10 generaties + 5 verfijningen per ISO-week per gebruiker, twee
 * ONAFHANKELIJKE tellers in één rij van `ai_calculator_usage`
 * (PK = user_id + week_start). Wie door zijn generaties heen is mag zijn
 * bestaande concept dus nog steeds verfijnen.
 *
 * ── Waarom deze module vrijwel niets meer doet ────────────────────────────
 * Tot 3 augustus 2026 deed `checkAndIncrement` hier drie stappen: SELECT de
 * stand → vergelijk met de limiet → UPSERT de in TypeScript berekende
 * `n + 1`. Dat was een TOCTOU (ADR 0076): twee gelijktijdige verzoeken lazen
 * dezelfde stand, zagen allebei ruimte, en schreven allebei dezelfde waarde
 * terug — twee LLM-generaties voor de prijs van één tik. De UPSERT stuurde
 * bovendien de héle rij mee, óók de teller die dít verzoek niet ophoogde,
 * zodat een gelijktijdige verfijning een generatie-ophoging letterlijk kon
 * terugdraaien. De oude docstring beweerde het tegenovergestelde ("geen race
 * dankzij UPSERT-met-+1"); de +1 werd in TypeScript berekend, niet door de
 * database.
 *
 * Sinds `20260803090000_ai_calculator_atomic_weekly_limit_rpc.sql` gebeurt
 * controle én ophoging in ÉÉN `INSERT … ON CONFLICT DO UPDATE … WHERE …
 * RETURNING` binnen `public.reserve_ai_calculator_slot()`. Deze module is nog
 * slechts de vertaling van dat antwoord naar een TypeScript-vorm; ze velt
 * geen eigen oordeel meer over "mag dit door".
 *
 * ── Wat hier bewust NIET meer staat ───────────────────────────────────────
 * · **De limieten.** 10 en 5 wonen in `public.ai_calculator_week_limits()`.
 *   Stonden ze óók hier, dan zou een migratie die de rem verandert de badge
 *   stil laten liegen. Ze komen mee in het antwoord van beide RPC's.
 * · **De weekgrens.** Werd hier berekend met `Intl.DateTimeFormat` in
 *   `Europe/Amsterdam` — dat was correct (anders dan de UTC-dagsleutel van de
 *   banksync), maar het hoort niet af te hangen van de lambda die het verzoek
 *   afhandelt, en lezen en schrijven mogen nooit van mening verschillen over
 *   welke week het is. Nu: `date_trunc('week', now() at time zone
 *   'Europe/Amsterdam')` in de database.
 * · **De gebruiker.** Beide RPC's leiden hem af uit `auth.uid()`. Er is geen
 *   `userId`-parameter meer, dus geen enkele aanroeper kan — ook niet per
 *   ongeluk — op andermans teller uitkomen.
 *
 * Scheiding van zorgen: deze module weet niets van auth of HTTP, alleen van
 * de twee RPC's. De API-route doet `await checkAndIncrement(...)` vóór
 * `buildCalculator(...)`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type UsageKind = 'generation' | 'refinement'

export interface RateLimitResult {
  /**
   * Alleen `true` als de database daadwerkelijk een tik heeft gereserveerd.
   * Bij een fout staat hij op `false` — fail-closed by construction: wie de
   * `error`-controle vergeet, weigert de actie in plaats van hem gratis door
   * te laten.
   */
  allowed: boolean
  /** Resterende calls van deze soort ná deze reservering. */
  remaining: number
  /** De geldende harde limiet voor deze soort, uit de database. */
  limit: number
  /** Stand van deze teller ná de reservering (of de huidige stand bij een weigering). */
  used: number
  /**
   * Gezet wanneer de reservering niet kon worden vastgesteld (DB-fout). Er is
   * dan géén tik gereserveerd; de aanroeper hoort een 500 te geven, geen 429 —
   * "je limiet is bereikt" zou een leugen zijn.
   */
  error?: unknown
}

export interface UsageSnapshot {
  generations: number
  refinements: number
  maxGenerations: number
  maxRefinements: number
  /** Maandag van de ISO-week waarvoor deze standen gelden (YYYY-MM-DD). */
  weekStart: string
  /** Gezet bij een leesfout; de badge hoort zich dan te verbergen, niet te gokken. */
  error?: unknown
}

/** PostgREST levert een table-returning functie als array van rijen. */
function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null
  return (data as T) ?? null
}

/**
 * Lees het verbruik van de actieve week plus de geldende limieten. Levert
 * nullen als er nog geen rij is. Gebruikt door de UI-badge ("nog X van Y").
 *
 * Leest via `ai_calculator_week_usage()` en niet rechtstreeks uit de tabel,
 * zodat de badge dezelfde weekgrens en dezelfde plafonds gebruikt als de
 * reservering. Hier zit geen race — dit is een pure lezing.
 */
export async function getUsage(supabase: SupabaseClient): Promise<UsageSnapshot> {
  const { data, error } = await supabase.rpc('ai_calculator_week_usage')

  const row = firstRow<{
    usage_week_start: string
    usage_generations: number
    usage_refinements: number
    usage_generation_limit: number
    usage_refinement_limit: number
  }>(data)

  if (error || !row) {
    return {
      generations: 0,
      refinements: 0,
      maxGenerations: 0,
      maxRefinements: 0,
      weekStart: '',
      error: error ?? new Error('ai_calculator_week_usage gaf geen rij terug'),
    }
  }

  return {
    generations: row.usage_generations ?? 0,
    refinements: row.usage_refinements ?? 0,
    maxGenerations: row.usage_generation_limit,
    maxRefinements: row.usage_refinement_limit,
    weekStart: row.usage_week_start,
  }
}

/**
 * Reserveer atomair één tik op de teller van `kind`. De database controleert
 * en hoogt op in hetzelfde statement; er bestaat geen toestand tussen
 * "gelezen" en "geschreven" waarin een tweede verzoek zich kan wringen.
 *
 * `kind` kiest WELKE teller ophoogt, nooit HOE HOOG de rem staat — de limiet
 * is met opzet geen argument, omdat de functie via PostgREST voor elke
 * ingelogde gebruiker aanroepbaar is.
 */
export async function checkAndIncrement(
  supabase: SupabaseClient,
  kind: UsageKind,
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc('reserve_ai_calculator_slot', {
    p_kind: kind,
  })

  const row = firstRow<{
    slot_allowed: boolean
    slot_limit: number
    slot_used: number
    slot_remaining: number
  }>(data)

  if (error || !row) {
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      used: 0,
      error: error ?? new Error('reserve_ai_calculator_slot gaf geen rij terug'),
    }
  }

  return {
    allowed: row.slot_allowed === true,
    remaining: row.slot_remaining ?? 0,
    limit: row.slot_limit,
    used: row.slot_used ?? 0,
  }
}
