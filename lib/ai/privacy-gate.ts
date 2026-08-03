// ── Server-side privé-modus-gate: de beslissende laag ───────────────────────
//
// Eén helper die per uitvoergroep bepaalt of deze gebruiker nú naar de cloud-AI
// mag. Staat de groep op 'lokaal', dan komt er een 403 `privacy_mode_active`
// TERUG VÓÓRDAT er data richting promptopbouw of getModel() gaat.
//
// Dit is bewust de beslissende laag en niet "een extra check": de client kiest
// weliswaar zelf het lokale pad, maar alleen de server kan garanderen dat er
// niets naar een AI-leverancier vertrekt. Een omgebouwde client, een oude tab of
// een direct curl-verzoek stuiten hier op dezelfde muur.
//
// GEEN STILLE TERUGVAL: bij 'lokaal' geeft deze helper altijd 403 — hij probeert
// nooit alsnog de cloud "omdat het lokale model toevallig niet klaar is". Dat is
// precies de belofte die de gebruiker koopt.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api/respond'
import {
  executionGroupInfo,
  resolveExecutionMode,
  type AiExecutionGroup,
  type AiExecutionPrefsRow,
} from './execution-groups'

/** De stabiele foutcode waarop de client de privé-blokkade herkent. */
export const PRIVACY_GATE_CODE = 'privacy_mode_active'

/** Postgres-foutcode voor "kolom bestaat niet" (undefined_column). */
const UNDEFINED_COLUMN = '42703'

/**
 * Leest de twee profielvelden die samen de keuze bepalen.
 *
 * Defensief bij een ONTBREKENDE KOLOM (de migratie kan in een omgeving nog niet
 * zijn toegepast): dan vallen we terug op het oude gedrag. Dat is verantwoord
 * omdat een kolom die niet bestaat per definitie ook geen voorkeur van iemand
 * kan bevatten — we negeren dus geen bestaande keuze. Elke ÁNDERE leesfout
 * gooit bewust door naar de catch van de route (500), zodat een tijdelijke
 * DB-storing nooit stilzwijgend een privé-modus opent.
 */
async function readPrefsRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<AiExecutionPrefsRow> {
  const { data, error } = await supabase
    .from('profiles')
    .select('privacy_mode, ai_execution_prefs')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      // Nieuwe kolom ontbreekt nog: probeer alleen de oude hoofdschakelaar.
      const fallback = await supabase
        .from('profiles')
        .select('privacy_mode')
        .eq('id', userId)
        .maybeSingle()
      if (fallback.error) {
        if (fallback.error.code === UNDEFINED_COLUMN) return { privacy_mode: false }
        throw fallback.error
      }
      const row = fallback.data as { privacy_mode?: boolean | null } | null
      return { privacy_mode: row?.privacy_mode ?? false }
    }
    throw error
  }

  const row = data as {
    privacy_mode?: boolean | null
    ai_execution_prefs?: AiExecutionPrefsRow['ai_execution_prefs']
  } | null

  return {
    privacy_mode: row?.privacy_mode ?? false,
    ai_execution_prefs: row?.ai_execution_prefs ?? {},
  }
}

/**
 * Geeft een 403-respons zodra deze groep lokaal moet draaien, anders `null`.
 *
 * Gebruik bovenaan elke AI-route, VÓÓR de tier-gate, de credit-gate en elke
 * dataophaling:
 *
 *   const gate = await assertCloudAllowed(supabase, user.id, 'briefing')
 *   if (gate) return gate
 *
 * De volgorde is bewust: privé-modus is de meest fundamentele keuze van de
 * gebruiker ("mijn gegevens verlaten dit toestel niet") en hoort vóór
 * commerciële gating. Bovendien verbruikt een geblokkeerde call zo geen credits
 * en krijgt de client een eenduidige oorzaak in plaats van een tier-fout die de
 * echte reden maskeert.
 */
export async function assertCloudAllowed(
  supabase: SupabaseClient,
  userId: string,
  group: AiExecutionGroup,
): Promise<NextResponse | null> {
  const row = await readPrefsRow(supabase, userId)
  if (resolveExecutionMode(row, group) === 'cloud') return null

  const info = executionGroupInfo(group)
  return errorResponse(
    `Privé-modus actief: ${info.label.toLowerCase()} draait lokaal op je apparaat.`,
    403,
    PRIVACY_GATE_CODE,
  )
}

/**
 * Variant zonder respons — voor routes die de blokkade zelf willen vormgeven
 * (bv. /api/report, waar alleen de optionele AI-inleiding vervalt en het
 * deterministische rapport gewoon door moet).
 */
export async function isCloudAllowed(
  supabase: SupabaseClient,
  userId: string,
  group: AiExecutionGroup,
): Promise<boolean> {
  const row = await readPrefsRow(supabase, userId)
  return resolveExecutionMode(row, group) === 'cloud'
}
