// ── Server-side AI-gate: de beslissende laag ────────────────────────────────
//
// Eén helper die per uitvoergroep twee vragen beantwoordt, in deze volgorde:
//
//   1. MAG ER ÜBERHAUPT AI DRAAIEN? De kill-switch `profiles.ai_enabled` ("AI
//      uit" op /mijn/privacy) → 403 `ai_disabled`.
//   2. MAG DEZE GROEP NAAR DE CLOUD? Staat de groep op 'lokaal', dan komt er een
//      403 `privacy_mode_active` TERUG VÓÓRDAT er data richting promptopbouw of
//      getModel() gaat.
//
// DE KILL-SWITCH STAAT BEWUST VOOROP (M26). Hij werd tot deze ronde UITSLUITEND
// op het lokale pad gehandhaafd — de hook (lib/ai/local/use-execution-mode.ts)
// en de vijf `local-*`-routes. Op het cloudpad, de default voor vrijwel elk
// account, checkte geen enkele laag hem: wie AI uitzette kreeg gewoon een
// AI-antwoord in de chat, zijn transacties werden alsnog door de cloud
// gecategoriseerd, en de belofte "de app werkt als puur financieel dashboard"
// (components/mijn/ai-privacy-settings.tsx) klopte niet. Deze helper is de plek
// waar dat één keer dicht gaat voor álle cloud-AI-routes, huidige en
// toekomstige — precies zoals de privé-modus dat al deed.
//
// Volgorde 1 vóór 2 omdat de kill-switch de fundamentelere uitspraak is: "geen
// AI" is geen plaatsingskeuze. Wie AI zelf heeft uitgezet hoort geen melding te
// krijgen over privé-modus of een abonnement, maar over zijn eigen knop.
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
import { AI_ERROR_CODE, AI_DISABLED_GATE_MESSAGE } from './error-copy'
import {
  executionGroupInfo,
  resolveExecutionMode,
  type AiExecutionGroup,
  type AiExecutionPrefsRow,
} from './execution-groups'

/**
 * De stabiele foutcode waarop de client de privé-blokkade herkent.
 *
 * De waarde komt uit `lib/ai/error-copy.ts` — dáár staat de canonieke tabel
 * code → tekst → affordance (H27). Dit blijft een re-export zodat bestaande
 * importeurs (`app/api/report`, `app/api/calculators/publish`, de tests)
 * ongewijzigd blijven werken.
 */
export const PRIVACY_GATE_CODE = AI_ERROR_CODE.privacyGate

/**
 * De stabiele foutcode voor de kill-switch. Bewust NIET `privacy_mode_active`:
 * dit is een andere oorzaak met een andere weg terug (de AI-schakelaar op
 * /mijn/privacy, niet de uitvoerkeuze), en een client die beide op één code
 * moet onderscheiden gaat op de meldingstekst matchen.
 */
export const AI_DISABLED_CODE = AI_ERROR_CODE.aiDisabled

/**
 * De 403-tekst bij een uitgezette kill-switch. Eén formulering voor alle
 * cloud-AI-routes: hij benoemt de oorzaak (eigen keuze) én de weg terug.
 * Woont in `error-copy.ts` (client én server delen hem); hier alleen
 * doorgegeven.
 */
export { AI_DISABLED_GATE_MESSAGE }

/** Postgres-foutcode voor "kolom bestaat niet" (undefined_column). */
const UNDEFINED_COLUMN = '42703'

/**
 * De profielvelden die deze gate leest: de twee die de PLAATSING bepalen
 * (`AiExecutionPrefsRow`) plus de kill-switch. Bewust apart gehouden — net als
 * in app/api/ai-execution-prefs/route.ts: `resolveExecutionMode` beantwoordt
 * "wáár draait het", niet "mag het überhaupt". Die twee vragen door elkaar halen
 * is precies hoe een uitgezette kill-switch stil als uitvoerkeuze ging gelden.
 */
type ProfileGateRow = AiExecutionPrefsRow & { ai_enabled: boolean }

/**
 * Leest de drie profielvelden die samen bepalen of en waar er AI mag draaien.
 *
 * Defensief bij een ONTBREKENDE KOLOM (de migratie kan in een omgeving nog niet
 * zijn toegepast): dan vallen we terug op het oude gedrag. Dat is verantwoord
 * omdat een kolom die niet bestaat per definitie ook geen voorkeur van iemand
 * kan bevatten — we negeren dus geen bestaande keuze. Elke ÁNDERE leesfout
 * gooit bewust door naar de catch van de route (500), zodat een tijdelijke
 * DB-storing nooit stilzwijgend een privé-modus opent.
 *
 * De terugval-cascade splitst bewust PER AS. Een 42703 op de brede select zegt
 * alleen "één van deze drie kolommen bestaat niet", niet wélke — en de twee
 * assen mogen elkaars antwoord niet bepalen. Vraag je in de terugval opnieuw
 * twee kolommen samen op, dan gooit een ontbrekende kill-switch de per-groep-map
 * weg (of andersom), en dat is fail-OPEN op de as die nog wél leesbaar was:
 * iemand met `{gesprek: 'lokaal'}` zou dan alsnog naar de cloud gaan. Daarom
 * lezen we de plaatsing en de kill-switch in dat pad los van elkaar.
 *
 * `ai_enabled` leest `!== false` en niet `=== true`: de kolom is NULLABLE met
 * default `true`, en een omgeving waar hij nog ontbreekt levert `undefined`.
 * NULL en undefined zijn allebei "geen uitspraak", niet "uit" — dezelfde lezing
 * als app/api/ai-execution-prefs/route.ts en lib/dashboard-data-loader.ts.
 */
async function readPrefsRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileGateRow> {
  const { data, error } = await supabase
    .from('profiles')
    .select('privacy_mode, ai_execution_prefs, ai_enabled')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      // Bewust NA elkaar en niet in een Promise.all: dit pad draait alleen in een
      // omgeving met een achterlopende migratie, en de winst van één parallelle
      // round-trip weegt niet op tegen een niet-deterministische leesvolgorde.
      const placement = await readPlacement(supabase, userId)
      const aiEnabled = await readAiEnabled(supabase, userId)
      return { ...placement, ai_enabled: aiEnabled }
    }
    throw error
  }

  const row = data as {
    privacy_mode?: boolean | null
    ai_execution_prefs?: AiExecutionPrefsRow['ai_execution_prefs']
    ai_enabled?: boolean | null
  } | null

  return {
    privacy_mode: row?.privacy_mode ?? false,
    ai_execution_prefs: row?.ai_execution_prefs ?? {},
    ai_enabled: row?.ai_enabled !== false,
  }
}

/**
 * Terugvalpad, alleen de PLAATSINGS-as: de per-groep-map met de hoofdschakelaar
 * eronder. Ontbreekt ook `privacy_mode`, dan is er niets gekozen en geldt het
 * gedrag van vóór de privé-modus.
 */
async function readPlacement(
  supabase: SupabaseClient,
  userId: string,
): Promise<AiExecutionPrefsRow> {
  const { data, error } = await supabase
    .from('profiles')
    .select('privacy_mode, ai_execution_prefs')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    if (error.code !== UNDEFINED_COLUMN) throw error
    const bare = await supabase
      .from('profiles')
      .select('privacy_mode')
      .eq('id', userId)
      .maybeSingle()
    if (bare.error) {
      if (bare.error.code === UNDEFINED_COLUMN) return { privacy_mode: false, ai_execution_prefs: {} }
      throw bare.error
    }
    const bareRow = bare.data as { privacy_mode?: boolean | null } | null
    return { privacy_mode: bareRow?.privacy_mode ?? false, ai_execution_prefs: {} }
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
 * Terugvalpad, alleen de KILL-SWITCH-as. Bestaat de kolom niet, dan kan hij ook
 * niemands keuze bevatten: "geen uitspraak" = aan.
 */
async function readAiEnabled(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('ai_enabled')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    if (error.code === UNDEFINED_COLUMN) return true
    throw error
  }
  const row = data as { ai_enabled?: boolean | null } | null
  return row?.ai_enabled !== false
}

/**
 * Geeft een 403-respons zodra AI uit staat of deze groep lokaal moet draaien,
 * anders `null`.
 *
 * Gebruik bovenaan elke AI-route, VÓÓR de tier-gate, de credit-gate en elke
 * dataophaling:
 *
 *   const gate = await assertCloudAllowed(supabase, user.id, 'briefing')
 *   if (gate) return gate
 *
 * De volgorde is bewust: de kill-switch en de privé-modus zijn de meest
 * fundamentele keuzes van de gebruiker ("geen AI" / "mijn gegevens verlaten dit
 * toestel niet") en horen vóór commerciële gating. Bovendien verbruikt een
 * geblokkeerde call zo geen credits en krijgt de client een eenduidige oorzaak
 * in plaats van een tier-fout die de echte reden maskeert.
 */
export async function assertCloudAllowed(
  supabase: SupabaseClient,
  userId: string,
  group: AiExecutionGroup,
): Promise<NextResponse | null> {
  const row = await readPrefsRow(supabase, userId)
  if (!row.ai_enabled) return errorResponse(AI_DISABLED_GATE_MESSAGE, 403, AI_DISABLED_CODE)
  if (resolveExecutionMode(row, group) === 'cloud') return null

  const info = executionGroupInfo(group)
  return errorResponse(
    `Privé-modus actief: ${info.label.toLowerCase()} draait lokaal op je apparaat.`,
    403,
    PRIVACY_GATE_CODE,
  )
}

/**
 * Alleen de kill-switch, zonder groep — voor routes die het LOKALE pad
 * ondersteunen en dus nooit bij `assertCloudAllowed` langskomen (bv. de
 * stap-variant van /api/briefing/refresh, die alleen bestaat wanneer de groep
 * lokaal draait).
 *
 * WAAROM APART: "mag deze groep naar de cloud" en "mag er AI draaien" zijn twee
 * vragen. Een route die de eerste met `nee` beantwoord ziet, mag daar niet uit
 * concluderen dat het lokale pad open staat — bij een uitgezette kill-switch is
 * het antwoord op beide vragen `nee`.
 */
export async function assertAiEnabled(
  supabase: SupabaseClient,
  userId: string,
): Promise<NextResponse | null> {
  const row = await readPrefsRow(supabase, userId)
  if (row.ai_enabled) return null
  return errorResponse(AI_DISABLED_GATE_MESSAGE, 403, AI_DISABLED_CODE)
}

/**
 * Variant zonder respons — voor routes die de blokkade zelf willen vormgeven
 * (bv. /api/report, waar alleen de optionele AI-inleiding vervalt en het
 * deterministische rapport gewoon door moet).
 *
 * Staat de kill-switch uit, dan is het antwoord `false`: er mag dan sowieso geen
 * cloud-AI draaien. LET OP bij de omgekeerde lezing — `false` betekent NIET "dan
 * mag het lokale pad wel". Wie dat wil weten gebruikt `assertAiEnabled`.
 */
export async function isCloudAllowed(
  supabase: SupabaseClient,
  userId: string,
  group: AiExecutionGroup,
): Promise<boolean> {
  const row = await readPrefsRow(supabase, userId)
  if (!row.ai_enabled) return false
  return resolveExecutionMode(row, group) === 'cloud'
}
