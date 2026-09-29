// ── De AI-stap van een tijdlijnverversing (Krant 1E, ADR 0190) ───────────────
//
// De enige plek waar de Krant een model aanroept. `ververs` (tijdlijn-run.ts)
// roept de stap aan tussen de matcher en het schrijven, uitsluitend voor een
// lezer met bron 'ai' (bewuste keuze, K2). De volgorde is de opdracht van de
// eigenaar en elke stap is een poort:
//
//   0. niets om toe te lichten           → 'leeg'       (geen call, K5)
//   1. privacy-poort + kill-switch       → 'geweigerd'  (de ROUTE toetst
//      `isCloudAllowed(…, 'nieuws')` en geeft de uitkomst mee; lokaal of
//      privé-modus = niets naar een aanbieder, K6)
//   2. tier-gate (checkTierGate 'ai')    → 'geweigerd'
//   3. geen Krant-account                → 'geweigerd'  (K2; checkTierGate weigert
//      hem ook, dit is de tweede, expliciete toets)
//   4. geen bezwaar                      → 'geweigerd'  (een bezwaar stopt óók de laag)
//   5. quotum: ≤ 5 calls per 7 dagen     → 'quotum'     (geteld in krant_edities, K5)
//   6. het maandtegoed (credit-gate)     → 'geweigerd'
//   7. sanitizeForAI op elk invoerveld   → 'geweigerd'  bij een fout (fail-safe)
//   8. getModel(service, 'krant_ai')     → 'geweigerd'  bij AIConfigError (platform-
//      kill-switch, geen sleutel) — er is dan geen call gedaan
//   9. generateObject met enum-schema    → 'teruggevallen' bij een modelfout
//  10. guards per tekst + maskPIIInOutput (lib/krant/ai-laag.ts)
//  11. schrijven met met_ai = true (door de aanroeper) → daarna recordAiUsage
//
// ELKE fout of weigering = dezelfde verversing ZONDER AI: deze functie gooit
// nooit, en de matcherberichten komen altijd ongewijzigd terug. Een fout in de
// AI-laag maakt nooit een lege verversing.
//
// Geen AI-SDK-aanroep buiten getModel om. Geen prompt-caching: het schema (met
// de artikel-id's van déze aanroep in de enum) staat in de tool vóór de
// systeemprompt, dus de prefix verschilt per aanroep; en de systeemprompt is
// korter dan het cacheminimum (ADR 0186 §3, zelfde reden als de ingest).
//
// euro-only (B2, ADR 0172): dit bestand rekent niets.

import type { SupabaseClient } from '@supabase/supabase-js'
import { generateObject, NoObjectGeneratedError } from 'ai'
import { getModel } from '@/lib/ai/config'
import { checkCreditBudget } from '@/lib/ai/credit-gate'
import { recordAiUsage } from '@/lib/ai-credits'
import type { SanitizeOptions } from '@/lib/ai/sanitize'
import { isNewsOnly, resolveActiveModules } from '@/lib/modules/resolve'
import { checkTierGate } from '@/lib/require-tier'
import {
  AI_AANROEP_UITKOMSTEN,
  AI_LAAG_QUOTUM_DAGEN,
  aiLaagSchema,
  bouwAiLaagInvoer,
  legeTellers,
  quotumOp,
  verwerkAiUitvoer,
  type AiKandidaat,
  type AiLaagTellers,
  type AiUitkomst,
} from './ai-laag'
import { AI_LAAG_SYSTEM_PROMPT, buildAiLaagPrompt } from './ai-laag-prompt'
import type { DuidingV1 } from './duiding-schema'
import type { SchrijfItem } from './editie-schrijver'
import type { EditieItem } from './matcher'
import type { NieuwsprofielV1 } from './profiel'

/** De feature-string voor getModel + token-logging (ai_token_usage, /beheer/ai-verbruik). */
export const KRANT_AI_FEATURE = 'krant_ai' as const

/** Een verversing wacht hoogstens zo lang op het model; daarna zonder AI. */
export const AI_LAAG_TIMEOUT_MS = 45_000

const DAG_MS = 24 * 60 * 60 * 1000

/** Grep-bare reden bij een uitkomst anders dan 'met-ai' — alleen voor tellingen en logs. */
export type AiStapReden =
  | 'leeg'
  | 'privacy'
  | 'tier'
  | 'krant'
  | 'bezwaar'
  | 'quotum'
  | 'quotum-onleesbaar'
  | 'tegoed'
  | 'profiel-onleesbaar'
  | 'sanitize'
  | 'model-config'
  | 'model'
  | 'onbruikbaar'
  | 'guards'
  | 'fout'

export interface AiStapInvoer {
  userId: string
  now: Date
  profiel: NieuwsprofielV1
  /** De matcherberichten van deze verversing (na de hertoets op 'geduid'). */
  items: readonly EditieItem[]
  /** Hoogstens 12 kandidaten die de matcher niet koos (kiesAiKandidaten). */
  kandidaten: readonly AiKandidaat[]
  /** De duiding van een matcherbericht (voor de soort en de grondslag van de nummer-guard). */
  duidingVan: (artikelId: string) => DuidingV1 | null
}

export interface AiStapUitkomst {
  items: SchrijfItem[]
  uitkomst: AiUitkomst
  reden: AiStapReden | null
  tellers: AiLaagTellers
  /** Na een GESLAAGD schrijven aanroepen: de credit-metering (recordAiUsage). Alleen als er een modelcall was. */
  naSchrijven: (() => Promise<void>) | null
}

export type AiStap = (service: SupabaseClient, invoer: AiStapInvoer) => Promise<AiStapUitkomst>

export interface AiStapOpties {
  /**
   * De uitkomst van `isCloudAllowed(…, userId, 'nieuws')`, getoetst door de
   * route vóór deze stap bestaat (de statische privacy-scan eist de gate in de
   * route). false = kill-switch uit, of 'nieuws' staat op lokaal / privé-modus:
   * de stap stuurt dan niets naar een aanbieder.
   */
  cloudToegestaan: boolean
}

/** Tellers en items bij een terugval zonder modelcall of met een onbruikbaar antwoord. */
function zonderAi(items: readonly EditieItem[], uitkomst: AiUitkomst, reden: AiStapReden, naSchrijven: AiStapUitkomst['naSchrijven'] = null): AiStapUitkomst {
  const tellers = legeTellers()
  if (uitkomst === 'teruggevallen') {
    tellers.terugvalLaag = 1
    tellers.terugvalBericht = items.length
  }
  return { items: [...items], uitkomst, reden, tellers, naSchrijven }
}

/** Hoeveel modelcalls deze lezer in het venster al deed (met-ai + teruggevallen). */
export async function telAiAanroepen(service: SupabaseClient, userId: string, now: Date): Promise<number> {
  const sinds = new Date(now.getTime() - AI_LAAG_QUOTUM_DAGEN * DAG_MS).toISOString()
  const { count, error } = await service
    .from('krant_edities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('bron', 'tijdlijn')
    .in('ai_uitkomst', [...AI_AANROEP_UITKOMSTEN])
    .gte('created_at', sinds)
  if (error) throw new Error(`[krant/tijdlijn-ai] quotum lezen mislukt: ${error.message}`)
  return count ?? 0
}

/**
 * Maakt de AI-stap voor één lezer. De route roept dit aan ná de privacy-poort
 * en geeft de uitkomst daarvan mee; de rest van de poorten zit hierin.
 */
export function maakAiStap(opties: AiStapOpties): AiStap {
  return async (service, invoer) => {
    const { userId, now, items, kandidaten } = invoer
    try {
      // 0. Een lege verversing kost geen call (K5).
      if (items.length === 0 && kandidaten.length === 0) return zonderAi(items, 'leeg', 'leeg')

      // 1. Privacy-poort + kill-switch (door de route getoetst).
      if (!opties.cloudToegestaan) return zonderAi(items, 'geweigerd', 'privacy')

      // 2. Tier-gate — weigert ook een Krant-account (reason 'krant').
      const tier = await checkTierGate(service, userId, 'ai')
      if (tier) return zonderAi(items, 'geweigerd', tier.reason === 'krant' ? 'krant' : 'tier')

      // 3 + 4. Krant-account (expliciet) en bezwaar; plus naam/geboortedatum voor de sanitizer.
      const { data: profiel, error: profielFout } = await service
        .from('profiles')
        .select('active_modules, krant_schaduw_bezwaar_at, full_name, date_of_birth')
        .eq('id', userId)
        .maybeSingle()
      if (profielFout || !profiel) return zonderAi(items, 'geweigerd', 'profiel-onleesbaar')
      if (isNewsOnly(resolveActiveModules(profiel))) return zonderAi(items, 'geweigerd', 'krant')
      if (profiel.krant_schaduw_bezwaar_at != null) return zonderAi(items, 'geweigerd', 'bezwaar')

      // 5. Quotum, geteld in de database. Onleesbaar = fail-closed: zonder AI.
      let aanroepen: number
      try {
        aanroepen = await telAiAanroepen(service, userId, now)
      } catch (err) {
        console.error('[krant/tijdlijn-ai] quotum onleesbaar, deze keer zonder AI:', err instanceof Error ? err.message : err)
        return zonderAi(items, 'geweigerd', 'quotum-onleesbaar')
      }
      if (quotumOp(aanroepen)) return zonderAi(items, 'quotum', 'quotum')

      // 6. Het maandtegoed (één bucket over alle AI-features).
      const tegoed = await checkCreditBudget(service, userId, 'news', now)
      if (!tegoed.allowed) return zonderAi(items, 'geweigerd', 'tegoed')

      // 7. Sanitize-in: elk tekstveld, met naam en geboortedatum van de lezer.
      let laagInvoer: ReturnType<typeof bouwAiLaagInvoer>
      try {
        const sanitize: SanitizeOptions = {}
        const naam = typeof profiel.full_name === 'string' ? profiel.full_name.trim() : ''
        if (naam) sanitize.names = [naam]
        if (typeof profiel.date_of_birth === 'string' && profiel.date_of_birth) sanitize.dateOfBirth = profiel.date_of_birth
        laagInvoer = bouwAiLaagInvoer(items, kandidaten, invoer.profiel, now.getUTCFullYear(), sanitize, (id) => invoer.duidingVan(id)?.soort ?? null)
      } catch (err) {
        console.error('[krant/tijdlijn-ai] sanitize faalde, deze keer zonder AI (fail-safe):', err instanceof Error ? err.message : err)
        return zonderAi(items, 'geweigerd', 'sanitize')
      }

      // 8. Het model — altijd via getModel (kill-switch, model per feature, token-logging).
      let model: Awaited<ReturnType<typeof getModel>>
      try {
        model = await getModel(service, KRANT_AI_FEATURE, { userId })
      } catch (err) {
        console.error('[krant/tijdlijn-ai] model niet beschikbaar, deze keer zonder AI:', err instanceof Error ? err.message : err)
        return zonderAi(items, 'geweigerd', 'model-config')
      }

      // Vanaf hier is er een call: die telt voor het quotum en het tegoed, ook als hij mislukt.
      const naSchrijven = () => recordAiUsage(service, userId, 'news')
      const schema = aiLaagSchema(
        laagInvoer.berichten.map((b) => b.artikelId),
        laagInvoer.kandidaten.map((k) => k.artikelId),
      )

      // 9. generateObject. Een schemabreuk kost niet het hele antwoord: de ruwe
      // tekst gaat alsnog door de toets per onderdeel (valideerAiUitvoer).
      let ruw: unknown
      try {
        const { object } = await generateObject({
          model,
          schema,
          system: AI_LAAG_SYSTEM_PROMPT,
          prompt: buildAiLaagPrompt(laagInvoer),
          // De json-tool, net als de duiding (lib/krant/duiding.ts): de strikte
          // output_format kent geen enum-rijke schema's zonder grenzen.
          providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' } },
          maxOutputTokens: 2000,
          abortSignal: AbortSignal.timeout(AI_LAAG_TIMEOUT_MS),
        })
        ruw = object
      } catch (err) {
        if (NoObjectGeneratedError.isInstance(err) && typeof err.text === 'string') {
          try {
            ruw = JSON.parse(err.text)
          } catch {
            return zonderAi(items, 'teruggevallen', 'onbruikbaar', naSchrijven)
          }
        } else {
          console.error('[krant/tijdlijn-ai] modelfout, deze keer zonder AI:', err instanceof Error ? err.message : err)
          return zonderAi(items, 'teruggevallen', 'model', naSchrijven)
        }
      }

      // 10. Grondingstoets, guards per tekst, cap op toevoegingen, PII-masker.
      const verwerkt = verwerkAiUitvoer({ ruw, items, kandidaten, invoer: laagInvoer, duidingVan: invoer.duidingVan })
      return {
        items: verwerkt.items,
        uitkomst: verwerkt.metAi ? 'met-ai' : 'teruggevallen',
        reden: verwerkt.metAi ? null : verwerkt.tellers.schemaTegengehouden > 0 && verwerkt.tellers.toelichtingen === 0 ? 'onbruikbaar' : 'guards',
        tellers: verwerkt.tellers,
        naSchrijven,
      }
    } catch (err) {
      // Een onverwachte fout in een poort (bv. een DB-hik in checkTierGate):
      // nooit de verversing meenemen. Geen call gedaan → telt niet.
      console.error('[krant/tijdlijn-ai] AI-laag onverwacht mislukt, deze keer zonder AI:', err instanceof Error ? err.message : err)
      return zonderAi(items, 'geweigerd', 'fout')
    }
  }
}
