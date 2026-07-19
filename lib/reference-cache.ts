/**
 * Module-level TTL-cache voor statische referentiedata (AOW-tabel + NIBUD-
 * referenties). Deze data wijzigt hooguit jaarlijks (AOW-cohorten, NIBUD-
 * budgetcijfers) maar werd tot nu toe op ELKE pageload opnieuw uit de database
 * gehaald: de `aow_leeftijd`-tabel op 4 call-sites en `nibud_reference_data`
 * op meerdere AI-context/aandachtspunten-call-sites.
 *
 * BEWUST geen `unstable_cache`: de Supabase-client hier is cookie-/request-
 * gebonden, terwijl deze referentiedata niet gebruikersgebonden is (RLS:
 * authenticated read-all). Een simpele module-scoped cache — die per
 * lambda-instance/server-proces leeft — is dan veiliger en eenvoudiger dan
 * Next.js' request-scoped cache-machinerie.
 *
 * Ontwerp: de cache slaat de RUIMSTE kolomset op (elke call-site projecteert
 * zelf de kolommen die het nodig heeft) en gooit door bij een query-fout
 * zonder de cache te vullen — de volgende aanroep probeert dan gewoon
 * opnieuw, identiek aan het gedrag van een rauwe `supabase.from().select()`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { NibudHouseholdType } from '@/lib/nibud/types'

type CacheEntry<T> = { value: T; expiresAt: number }

const TTL_MS = 24 * 60 * 60 * 1000

// ── AOW-leeftijd ─────────────────────────────────────────────────────────

let aowCache: CacheEntry<AowLeeftijdRow[]> | null = null

/**
 * Haal de volledige AOW-leeftijd-referentietabel op (gecachet, TTL 24 uur).
 * Selecteert `*` — de ruimste kolomset over de 4 bestaande call-sites — zodat
 * elke aanroeper zelf kan projecteren op de kolommen die het nodig heeft.
 *
 * Gooit door bij een query-fout (geen cache-vulling), zodat de aanroeper zijn
 * bestaande foutafhandeling (log-en-val-terug, of try/catch) ongewijzigd kan
 * toepassen — spiegelt het gedrag van de rauwe `supabase.from().select()`-call.
 */
export async function getAowLeeftijden(supabase: SupabaseClient): Promise<AowLeeftijdRow[]> {
  if (aowCache && Date.now() < aowCache.expiresAt) return aowCache.value

  const { data, error } = await supabase
    .from('aow_leeftijd')
    .select('*')
    .order('birth_date_from', { ascending: true })
  if (error) throw error

  const value = (data ?? []) as unknown as AowLeeftijdRow[]
  aowCache = { value, expiresAt: Date.now() + TTL_MS }
  return value
}

// ── NIBUD-referenties ────────────────────────────────────────────────────

/** Ruwe NIBUD-referentierij zoals opgehaald uit de database (vóór Number()-conversie). */
export interface NibudReferenceDbRow {
  nibud_category_key: string
  nibud_category_name: string
  basis_amount: number | string
  voorbeeld_amount: number | string | null
  mapped_budget_slug: string | null
}

const nibudCache = new Map<string, CacheEntry<NibudReferenceDbRow[]>>()

function nibudCacheKey(householdType: NibudHouseholdType, year: number): string {
  return `${householdType}:${year}`
}

/**
 * Haal de NIBUD-referentierijen op voor een huishoudtype+jaar-combinatie
 * (gecachet, TTL 24 uur, sleutel = `huishoudtype:jaar`). Zelfde kolomset,
 * filters en volgorde als de bestaande query in `lib/nibud/reference-data.ts`.
 *
 * Gooit door bij een query-fout (geen cache-vulling) — mirrors `getAowLeeftijden`.
 */
export async function getNibudReferenceRows(
  supabase: SupabaseClient,
  householdType: NibudHouseholdType,
  year: number,
): Promise<NibudReferenceDbRow[]> {
  const key = nibudCacheKey(householdType, year)
  const cached = nibudCache.get(key)
  if (cached && Date.now() < cached.expiresAt) return cached.value

  const { data, error } = await supabase
    .from('nibud_reference_data')
    .select('nibud_category_key, nibud_category_name, basis_amount, voorbeeld_amount, mapped_budget_slug')
    .eq('household_composition', householdType)
    .eq('year', year)
    .order('nibud_category_key')
  if (error) throw error

  const value = (data ?? []) as unknown as NibudReferenceDbRow[]
  nibudCache.set(key, { value, expiresAt: Date.now() + TTL_MS })
  return value
}

// ── Test-hulp ────────────────────────────────────────────────────────────

/** Test-only: reset beide caches (AOW + NIBUD). */
export function _clearReferenceCacheForTests(): void {
  aowCache = null
  nibudCache.clear()
}
