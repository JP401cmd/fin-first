// lib/beheer/run-tokens.ts
//
// Tokenverbruik en geschatte kosten per achtergrondtaak-run, voor /beheer/jobs.
//
// ── Waarom op tijdvenster en niet op een sleutel ────────────────────────────
// `ai_token_usage` heeft geen `job_run_id`, en die erbij zetten zou de run-
// context door de hele aanroepketen tot in de model-middleware moeten dragen
// (`logAiTokens` weet niets van job-runs). Dat is een migratie plus een
// invasieve doorgifte voor een beheerscherm. Het kan bijna gratis, omdat de
// middleware systeemcalls met `user_id = null` logt (zie lib/ai/token-usage.ts):
// een run claimt de systeem-aanroepen die binnen zijn eigen tijdvenster vallen.
//
// ── Waar dat NIET klopt, expliciet ──────────────────────────────────────────
//  1. Een handmatige aanroep door een ingelogde beheerder (de ingest-knop op
//     /beheer/nieuws) logt MET `user_id`, valt dus buiten elk venster en komt
//     hier niet terug. Bewust: anders zou de tokens van een beheerder aan een
//     cron worden toegeschreven.
//  2. Twee gelijktijdige crons zouden elkaars tokens claimen. Vandaag lopen ze
//     na elkaar (`integraties-health` start ~37 ms ná `holdings-prices`), maar
//     het venster is de aanname — niet een garantie. `overlaptMetAndereRun`
//     markeert dat, zodat het scherm een dubbeltelling niet stil presenteert.
//  3. Een run zonder `finished_at` (afgebroken) krijgt geen venster en dus geen
//     tokens; dat toont als "—", niet als nul.
//  4. De token-logging is fire-and-forget (`void logAiTokens(...)` in
//     lib/ai/token-usage.ts) en doet éérst een `auth.getUser()` over het netwerk
//     vóór de insert. De `created_at` van de laatste aanroep van een run kan
//     daardoor ná `finished_at` landen en net buiten het venster vallen. Gemeten
//     26 sep 2026 over tien dagen productie: 298 van 299 systeemrijen vielen
//     binnen precies één venster, één erbuiten. Geen levend defect, wel de reden
//     dat dit een aanname blijft en geen boekhouding.
//  5. `user_id = null` is niet strikt "systeem". Diezelfde `auth.getUser()`
//     achteraf kan bij een gebruikersaanroep mislukken, en dan logt die óók met
//     `user_id = null`. Gemeten 26 sep 2026 over 30 dagen: 5 van 325 null-rijen
//     kwamen van een gebruiker (`abonnementen_analyse`, `rekenhulp_bouwen`).
//     Valt zo'n aanroep in een cron-venster, dan telt hij daar mee. Dat is een
//     toerekeningsfout, geen privacylek: we lezen geen `user_id` of `feature`.

import type { SupabaseClient } from '@supabase/supabase-js'
import { estimateCostUsd } from '@/lib/ai/token-prices'

/** De velden van een job-run die deze module nodig heeft. */
export interface RunVenster {
  id: string
  started_at: string
  finished_at: string | null
}

interface TokenRij {
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  created_at: string
}

export interface RunTokens {
  /** Aantal AI-aanroepen binnen het venster van deze run. */
  calls: number
  /** Inputtokens ("heen"). */
  input: number
  /** Outputtokens ("terug"). */
  output: number
  /**
   * Geschatte kosten in USD, of `null` wanneer minstens één aanroep op een
   * model liep waarvan we het tarief niet kennen. Nooit 0 als dekmantel voor
   * "onbekend" — zie `estimateCostUsd`.
   */
  costUsd: number | null
  /** Modellen binnen deze run waarvoor geen tarief bekend is. */
  onbekendeModellen: string[]
  /** Waar het venster van deze run dat van een andere run overlapt. */
  overlaptMetAndereRun: boolean
}

/**
 * Uitkomst van `loadRunTokens`. `leesfout` is er omdat een mislukte query en
 * "deze runs deden geen AI-aanroepen" op het scherm anders dezelfde streepjes
 * opleveren — en dan leest een storing als een rustige dag.
 */
export interface RunTokensResultaat {
  tokens: Map<string, RunTokens>
  leesfout: boolean
}

/** Lege uitkomst — één plek, zodat "geen tokens" overal dezelfde vorm heeft. */
function leegRunTokens(): RunTokens {
  return {
    calls: 0,
    input: 0,
    output: 0,
    costUsd: 0,
    onbekendeModellen: [],
    overlaptMetAndereRun: false,
  }
}

/**
 * Bepaalt welke runs elkaars tijdvenster overlappen. Zo'n paar kan niet
 * betrouwbaar worden toegewezen: dezelfde aanroep valt dan in twee vensters.
 */
function overlappendeRunIds(runs: RunVenster[]): Set<string> {
  const uit = new Set<string>()
  const met = runs.filter((r) => r.finished_at !== null)
  for (let i = 0; i < met.length; i++) {
    for (let j = i + 1; j < met.length; j++) {
      const a = met[i]
      const b = met[j]
      const aStart = Date.parse(a.started_at)
      const aEind = Date.parse(a.finished_at!)
      const bStart = Date.parse(b.started_at)
      const bEind = Date.parse(b.finished_at!)
      if (!Number.isFinite(aStart) || !Number.isFinite(bStart)) continue
      if (aStart <= bEind && bStart <= aEind) {
        uit.add(a.id)
        uit.add(b.id)
      }
    }
  }
  return uit
}

/**
 * Wijst systeem-AI-aanroepen toe aan de runs waarbinnen ze vielen.
 *
 * Pure functie, los van de DB, zodat de toewijzingsregel zelf te testen is
 * zonder Supabase te mocken.
 */
export function wijsTokensToe(
  runs: RunVenster[],
  rijen: TokenRij[],
): Map<string, RunTokens> {
  const overlap = overlappendeRunIds(runs)
  const uit = new Map<string, RunTokens>()

  for (const run of runs) {
    if (run.finished_at === null) continue
    const start = Date.parse(run.started_at)
    const eind = Date.parse(run.finished_at)
    if (!Number.isFinite(start) || !Number.isFinite(eind)) continue

    const agg = leegRunTokens()
    agg.overlaptMetAndereRun = overlap.has(run.id)
    const onbekend = new Set<string>()

    for (const rij of rijen) {
      const t = Date.parse(rij.created_at)
      if (!Number.isFinite(t) || t < start || t > eind) continue
      agg.calls += 1
      agg.input += rij.input_tokens
      agg.output += rij.output_tokens
      const kosten = estimateCostUsd(
        rij.provider,
        rij.model,
        rij.input_tokens,
        rij.output_tokens,
      )
      if (kosten === null) onbekend.add(rij.model)
      else if (agg.costUsd !== null) agg.costUsd += kosten
    }

    // Eén onbekend model maakt het TOTAAL onbekend: een deelsom presenteren als
    // het geheel is precies de stille onderschatting die we willen vermijden.
    if (onbekend.size > 0) {
      agg.costUsd = null
      agg.onbekendeModellen = [...onbekend].sort()
    }
    uit.set(run.id, agg)
  }

  return uit
}

/**
 * Leest de systeem-AI-aanroepen rond een set runs en wijst ze toe.
 *
 * Eén query over het hele bereik (oudste start t/m nieuwste eind) in plaats van
 * één per run; de toewijzing gebeurt daarna in geheugen. Gepagineerd, want
 * PostgREST kapt stil af op `max_rows` (1000, ADR 0050) — en een afgekapte lijst
 * zou hier als "minder tokens" tonen in plaats van als leesfout.
 *
 * Vereist de service-role: beheer leest cross-user nooit via RLS (ADR 0006).
 * Leest uitsluitend `user_id is null` (vrijwel altijd systeemcalls, zie punt 5
 * bovenaan) en alleen gebruiksmeta — geen `user_id`, geen `feature`.
 */
export async function loadRunTokens(
  service: SupabaseClient,
  runs: RunVenster[],
): Promise<RunTokensResultaat> {
  const metVenster = runs.filter((r) => r.finished_at !== null)
  if (metVenster.length === 0) return { tokens: new Map(), leesfout: false }

  const starts = metVenster.map((r) => Date.parse(r.started_at)).filter(Number.isFinite)
  const einden = metVenster.map((r) => Date.parse(r.finished_at!)).filter(Number.isFinite)
  if (starts.length === 0 || einden.length === 0) return { tokens: new Map(), leesfout: false }

  const vanaf = new Date(Math.min(...starts)).toISOString()
  const tot = new Date(Math.max(...einden)).toISOString()

  const rijen: TokenRij[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service
      .from('ai_token_usage')
      .select('provider, model, input_tokens, output_tokens, created_at')
      .is('user_id', null)
      .gte('created_at', vanaf)
      .lte('created_at', tot)
      .order('created_at', { ascending: false })
      .range(from, from + 999)
    // Een leesfout is GEEN lege uitkomst. Een lege Map zou op het scherm als
    // "geen AI-aanroepen" tonen — dezelfde streepjes als een rustige dag —
    // terwijl de crons wél factureren. De vlag dwingt de pagina te melden dat
    // ze hier even geen zicht op heeft.
    if (error) return { tokens: new Map(), leesfout: true }
    const pagina = (data ?? []) as TokenRij[]
    rijen.push(...pagina)
    if (pagina.length < 1000) break
  }

  return { tokens: wijsTokensToe(metVenster, rijen), leesfout: false }
}
