// ── Lokale (on-device) categorisatie-resolver ─────────────────────────────────
//
// Implementeert exact het bestaande `aiResolver`-contract van
// runCombinedCategorization: (batch: CombinedAiBatchItem[]) =>
// Promise<CombinedAiResult[]> (lib/auto-categorize.ts). Zo blijft de orkestrator
// ongewijzigd en is de resolver het enige omschakelpunt tussen cloud en lokaal
// (ADR 0043, scope A).
//
// Kernafspraken (ADR 0043 / POC-lessen):
//  - Model = Gemma 4 E2B (LiteRT-LM/WebGPU, runtime lib/ai/local/litert-runtime.ts;
//    zie het L1-meetrapport spikes/litert-lm/meetrapport-v1.md), dynamisch geladen.
//  - Interne batchgrootte 10: de `unaligned accesses`-crash trad op bij batch 20;
//    de sheet levert batches ≤20 via het contract → we splitsen intern in ≤10.
//  - Sessieherstel: per interne batch vangen we runtime-fouten; bij een crash →
//    dispose + verse sessie, één keer opnieuw; faalt het weer → throw, zodat de
//    bestaande failedBatches/retry-flow van runCombinedCategorization het opvangt.
//    NOOIT een stille cloud-fallback (privacy fail-closed, FR-3.6).
//  - Prompt single-source: buildCategorizeSystemPrompt (ongewijzigd) +
//    buildCategorizeUserPrompt met {idEcho, kort} aan. Géén sanitizeForAI: er is
//    geen egress, en saniteren zou legitiem on-device-signaal strippen (FR-3.5).
//  - Slug-validatie via resolveSlug (gedeeld met het cloud-pad).

import {
  buildCategorizeSystemPrompt,
  buildCategorizeUserPrompt,
  batchItemId,
  type CategorizeBudgetOption,
  type CategorizeUserPromptTx,
} from '@/lib/ai/categorize-system-prompt'
import { resolveSlug } from '@/lib/ai/categorize-budget-options'
import type { CombinedAiBatchItem, CombinedAiResult } from '@/lib/auto-categorize'
import { parseLocalCategorizations, type LocalParseResult, type RawLocalCategorization } from './parse'
// Statische import: litert-runtime laadt de zware @litert-lm/core-WASM-bundel pas
// lazy in zijn eigen functies (dynamic import), dus dit trekt die bundel NIET
// eager mee. De statische import maakt de generatie-callsite bovendien expliciet
// zodat de sanitize-scan ('m op de allowlist) 'm herkent (ADR 0035/0043).
import { loadModelSession, disposeSession } from './litert-runtime'

/**
 * Confidence-drempel voor het lokale pad — architect-besluit (ADR 0043): dít is
 * de single source van deze constante (bewust NIET in lib/constants.ts; het is
 * een AI-/categorisatie-domeinconstante). Strenger dan de cloud-conventie (0,5)
 * omdat het 2B-model op de residustaart zwak is.
 *
 * Drempelcurve uit het fase-0-meetrapport (residu-gouden-set): precisie stijgt
 * van ~39% @ confidence 0,5 naar ~57% @ 0,9, maar de dekking daalt navenant
 * (≥0,9 dekt nog ~12% van de staart; ≥0,8 ≈ 39% precisie bij ~28% dekking).
 * Resultaten onder deze drempel → budget_id null ("onbekend"), geen gok.
 *
 * Eigenaarsbesluit 19 jul 2026 (na eerste live-gebruik): verlaagd van de
 * startwaarde 0,9 naar 0,8 — de ~12%-dekking voelde als "te weinig voorstellen";
 * dekking weegt nu zwaarder dan maximale precisie. Blijft ruim strenger dan de
 * cloud-conventie (0,5) en alles blijft assistief via de review-UI.
 */
export const LOCAL_MIN_CONFIDENCE = 0.8

/**
 * Interne batchgrootte. De crash-vrije waarde uit de POC (batch 20 gaf de
 * `unaligned accesses`-crash; batch 10 met verse sessie omzeilt 'm volledig).
 */
export const LOCAL_INTERNAL_BATCH_SIZE = 10

/**
 * max_new_tokens-schatting voor de 'kort'-uitvoer (geen reasoning): ~28 tokens
 * per transactie + 96 marge. Ruim genoeg om afkapping te voorkomen zonder
 * onnodig lange decode.
 */
export function suggestLocalMaxNewTokens(batchSize: number): number {
  return Math.min(4096, Math.max(128, batchSize * 28 + 96))
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function toPromptTx(item: CombinedAiBatchItem): CategorizeUserPromptTx {
  return {
    description: item.description,
    counterparty_name: item.counterparty_name,
    amount: item.amount,
    date: item.date,
    reference: item.reference,
  }
}

/**
 * PUUR: map de geparste modeloutput van één interne batch terug op de aangeboden
 * transacties.
 *
 *  - Id-echo-mapping: koppel elk resultaat via het teruggeechode "id" (t1..tN),
 *    niet positioneel. Ontbrekend/onbekend id → die transactie blijft onbekend.
 *    Duplicaat-id → het eerste telt.
 *  - Slug-validatie tegen de aangeboden set (resolveSlug); onbekende slug → null.
 *  - Drempel: confidence < LOCAL_MIN_CONFIDENCE → budget_id null (assistief).
 *
 * Elke aangeboden transactie krijgt exact één CombinedAiResult terug (budget_id
 * null wanneer onbekend/onzeker), zodat de mapping in de orkestrator eenduidig is.
 */
export function mapLocalChunkResults(
  chunkItems: CombinedAiBatchItem[],
  parsed: LocalParseResult,
  validSlugs: Set<string>,
  slugToId: Map<string, string>,
): CombinedAiResult[] {
  const idToIndex = new Map<string, number>()
  chunkItems.forEach((_, i) => idToIndex.set(batchItemId(i), i))

  const assigned: (RawLocalCategorization | null)[] = new Array(chunkItems.length).fill(null)
  const seen = new Set<string>()
  if (parsed.items) {
    for (const item of parsed.items) {
      if (item.id === null) continue // ontbrekend id
      const idx = idToIndex.get(item.id)
      if (idx === undefined) continue // onbekend id
      if (seen.has(item.id)) continue // duplicaat → eerste telt
      seen.add(item.id)
      assigned[idx] = item
    }
  }

  return chunkItems.map((item, i) => {
    const raw = assigned[i]
    const confidence = raw ? raw.confidence : 0
    const slug = raw ? resolveSlug(raw.budget_slug, validSlugs) : null
    const belowThreshold = confidence < LOCAL_MIN_CONFIDENCE
    const budget_id = slug && !belowThreshold ? (slugToId.get(slug) ?? null) : null
    return {
      id: item.id,
      budget_id,
      confidence,
      reasoning: raw?.reasoning ?? null,
    }
  })
}

/**
 * Bouwt een lokale resolver rond de aangeboden budgetten. Verwacht dat elke
 * optie een `id` draagt (het lokale pad zet die via
 * buildBudgetOptions.slugToId — zie de sheet); zonder id kan een geldige slug
 * niet naar een budget_id worden gemapt en blijft de transactie onbekend.
 */
export function createLocalAiResolver(
  budgets: CategorizeBudgetOption[],
  opts?: {
    /**
     * Wordt aangeroepen rond het laden van de on-device sessie: 'starten' vlak
     * vóór loadModelSession(), 'klaar' zodra die resolved. De eerste (koude)
     * sessie-load is de trage GPU-warmup (~45-60s, volledig stil); dit signaal
     * laat de UI daar feedback op tonen zodat het niet als een hang voelt.
     * loadModelSession cachet, dus na de eerste chunk is starten→klaar vrijwel
     * instant — dat is prima.
     */
    onSessionState?: (s: 'starten' | 'klaar') => void
  },
): (batch: CombinedAiBatchItem[]) => Promise<CombinedAiResult[]> {
  const onSessionState = opts?.onSessionState
  const validSlugs = new Set(budgets.map((b) => b.slug))
  const slugToId = new Map<string, string>()
  for (const b of budgets) {
    if (b.id) slugToId.set(b.slug, b.id)
  }
  const system = buildCategorizeSystemPrompt(budgets)

  const runChunk = async (chunkItems: CombinedAiBatchItem[]): Promise<LocalParseResult> => {
    onSessionState?.('starten')
    const session = await loadModelSession()
    onSessionState?.('klaar')
    const user = buildCategorizeUserPrompt(chunkItems.map(toPromptTx), { idEcho: true, kort: true })
    const text = await session.generate(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      suggestLocalMaxNewTokens(chunkItems.length),
    )
    return parseLocalCategorizations(text)
  }

  const runChunkWithRecovery = async (chunkItems: CombinedAiBatchItem[]): Promise<LocalParseResult> => {
    try {
      return await runChunk(chunkItems)
    } catch (err) {
      // Mogelijke device-loss/poisoned session → dispose + verse sessie, één
      // keer opnieuw. Faalt het weer, propageer de fout (→ failedBatches).
      // ALTIJD loggen (les 19 jul): zonder deze regels is een lokale-AI-fout
      // voor gebruiker én support volstrekt onzichtbaar — de UI toont alleen
      // een generieke melding.
      console.error('[lokale-ai] chunk-fout — sessieherstel + één retry volgt:', err)
      await disposeSession()
      try {
        return await runChunk(chunkItems)
      } catch (err2) {
        console.error('[lokale-ai] chunk-fout ná sessieherstel — batch faalt definitief:', err2)
        throw err2
      }
    }
  }

  return async (batch: CombinedAiBatchItem[]): Promise<CombinedAiResult[]> => {
    const results: CombinedAiResult[] = []
    for (const internal of chunk(batch, LOCAL_INTERNAL_BATCH_SIZE)) {
      const parsed = await runChunkWithRecovery(internal)
      results.push(...mapLocalChunkResults(internal, parsed, validSlugs, slugToId))
    }
    return results
  }
}
