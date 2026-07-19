// Dataset-runner voor het LiteRT-LM-harnas.
//
// Spiegelt de fase-0-runner (spikes/lokale-categorisatie/runner.ts) maar draait op
// de LiteRT-LM-engine-facade. HERGEBRUIKT de fase-0-bouwstenen 1-op-1 zodat de
// meting appels-met-appels is met de Transformers.js-spike:
//   - prompt-bouw   → ../lokale-categorisatie/prompt.ts (volle budgetlijst, idEcho)
//   - JSON-parse    → ../lokale-categorisatie/parse.ts   (fence/think/salvage)
//   - metriek-aggr. → ../lokale-categorisatie/metrics.ts (accuracy vs. labels)
//   - types         → ../lokale-categorisatie/types.ts
//
// Elke conversatie wordt VERS aangemaakt per batch (systeemprompt als preface),
// dus geen geschiedenis-opbouw tussen batches. De user-prompt gebruikt de
// `kort`-uitvoer (idEcho + {id, budget_slug, confidence}) — de snelheidsvariant.

import type { CategorizeBudgetOption } from '../../lib/ai/categorize-system-prompt.ts'
import type { BatchTiming, DevTransaction, TxResult } from '../lokale-categorisatie/types.ts'
import { batchItemId, buildFullSystemPrompt, buildUserMessage } from '../lokale-categorisatie/prompt.ts'
import { parseCategorizations, type RawCategorization } from '../lokale-categorisatie/parse.ts'
import { computeMetrics } from '../lokale-categorisatie/metrics.ts'
import type { LitertEngine } from './litert-engine.ts'
import { metric, roundMs } from './metric.ts'

export type LitertRunResult = {
  txResults: TxResult[]
  batches: BatchTiming[]
  systemPromptChars: number
  batchSize: number
}

export type RunParams = {
  engine: LitertEngine
  transactions: DevTransaction[]
  options: CategorizeBudgetOption[]
  batchSize: number
  /** 1-based index van deze run (voor de `[metric]`-regels bij ?runs=N). */
  runIndex: number
  onProgress?: (done: number, total: number, last?: BatchTiming) => void
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Grove tokenschatting = tekens / 4 (geen tokenizer op web beschikbaar). */
function estTokens(chars: number): number {
  return Math.round(chars / 4)
}

/**
 * Draai de volledige dataset één keer. Fouten per batch worden gevangen en
 * gelogd (`[metric] error`) i.p.v. de hele run te laten crashen; die batch levert
 * dan lege/ongeldige uitkomsten en de run gaat door.
 */
export async function runDatasetOnce(params: RunParams): Promise<LitertRunResult> {
  const { engine, transactions, options, batchSize, runIndex, onProgress } = params

  const validSlugs = new Set(options.map((o) => o.slug))
  const system = buildFullSystemPrompt(options)
  const inputTokensEst = estTokens(system.length) // vaste prefill-schatting per batch (systeemdeel)

  const batches = chunk(transactions, batchSize)
  const txResults: TxResult[] = []
  const timings: BatchTiming[] = []
  let done = 0

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    const userMessage = buildUserMessage(batch, 'kort')

    // ── Modelaanroep (streaming) met foutafvang per batch ─────────────────────
    let text = ''
    let ttftMs: number | null = null
    let wallMs = 0
    try {
      const gen = await engine.runBatch(system, userMessage)
      text = gen.text
      ttftMs = gen.ttftMs
      wallMs = gen.wallMs
    } catch (e) {
      metric('error', {
        where: 'runBatch',
        run: runIndex,
        batch: b,
        message: e instanceof Error ? e.message : String(e),
      })
      // Lege uitkomst voor deze batch; de per-tx-lus hieronder markeert alles invalid.
    }

    const parse = parseCategorizations(text)
    const parsed = parse.items
    const parseOk = parsed !== null

    // ── Id-echo-mapping (i.p.v. positioneel) ──────────────────────────────────
    // Koppel elk resultaat aan zijn transactie via het teruggeechode id (t1..tN).
    // Ontbrekend/onbekend id → transactie blijft ongedekt (invalid); duplicaat → eerste telt.
    const idToIndex = new Map<string, number>()
    batch.forEach((_, i) => idToIndex.set(batchItemId(i), i))
    const assigned: (RawCategorization | null)[] = new Array(batch.length).fill(null)
    const seen = new Set<string>()
    if (parsed) {
      for (const item of parsed) {
        if (item.id === null) continue
        const idx = idToIndex.get(item.id)
        if (idx === undefined) continue
        if (seen.has(item.id)) continue
        seen.add(item.id)
        assigned[idx] = item
      }
    }
    const covered = seen.size

    // ── Parse-uitkomst per batch (geldige items, nulls) ───────────────────────
    const items = parsed ?? []
    const validSlugItems = items.filter((i) => i.budget_slug !== null && validSlugs.has(i.budget_slug)).length
    const nullSlugItems = items.filter((i) => i.budget_slug === null).length

    const generatedTokensEst = estTokens(text.length)
    // decode-vensters: liefst wandklok ná TTFT (zuivere decode); anders hele wandklok.
    const decodeMs = ttftMs !== null ? wallMs - ttftMs : wallMs
    const tokPerSec = decodeMs > 0 && generatedTokensEst > 0 ? generatedTokensEst / (decodeMs / 1000) : null

    const timing: BatchTiming = {
      index: b,
      size: batch.length,
      ttftMs,
      decodeTokPerSec: tokPerSec,
      wallMs,
      inputTokens: inputTokensEst + estTokens(userMessage.length),
      generatedTokens: generatedTokensEst,
      parseOk,
      rawOutput: text,
      diagnostics: {
        hadFence: parse.hadFence,
        hadThink: parse.hadThink,
        truncated: parse.truncated,
        salvaged: parse.salvaged,
        itemCount: covered,
        expectedCount: batch.length,
      },
    }
    timings.push(timing)

    // ── Per-transactie-beoordeling (identiek aan fase-0) ──────────────────────
    batch.forEach((tx, i) => {
      const rawItem = assigned[i]
      const rawSlug = rawItem ? rawItem.budget_slug : null
      const slugKnown = rawSlug === null || validSlugs.has(rawSlug)
      const valid = rawItem !== null && slugKnown
      const validatedSlug = rawSlug !== null && validSlugs.has(rawSlug) ? rawSlug : null
      const correct = validatedSlug === (tx.label_slug ?? null)

      txResults.push({
        id: tx.id,
        batchIndex: b,
        expected: tx.label_slug ?? null,
        rawSlug,
        validatedSlug,
        valid,
        correct,
        confidence: rawItem ? rawItem.confidence : 0,
        reasoning: rawItem ? rawItem.reasoning : '',
        edge_case: tx.edge_case,
        bron: tx.bron ?? null,
      })
    })

    // ── Per-batch-metriek (JSON) ──────────────────────────────────────────────
    metric('batch', {
      run: runIndex,
      index: b,
      size: batch.length,
      ttftMs: roundMs(ttftMs),
      wallMs: roundMs(wallMs),
      perTxMs: roundMs(batch.length > 0 ? wallMs / batch.length : null),
      outputChars: text.length,
      estOutputTokens: generatedTokensEst,
      tokPerSec: tokPerSec != null ? Math.round(tokPerSec * 10) / 10 : null,
      parseOk,
      items: items.length,
      validSlugItems,
      nullSlugItems,
      coveredTx: covered,
      expectedTx: batch.length,
      diagnostics: timing.diagnostics,
    })

    done += batch.length
    onProgress?.(done, transactions.length, timing)
  }

  // ── Run-samenvatting (accuracy vs. dev-set-labels, zoals fase-0) ────────────
  const m = computeMetrics(txResults, timings)
  metric('run', {
    run: runIndex,
    batchSize,
    totalTx: m.total,
    correct: txResults.filter((t) => t.correct).length,
    accuracyPct: m.accuracy,
    accuracyOnValidPct: m.accuracyOnValid,
    validityPct: Math.round(m.validityPct * 10) / 10,
    edgeCaseAccuracyPct: m.edgeCaseAccuracy,
    batches: timings.length,
    totalWallMs: roundMs(m.throughput.totalWallMs),
    avgTtftMs: roundMs(m.throughput.avgTtftMs),
    avgTokPerSec: m.throughput.avgDecodeTokPerSec != null ? Math.round(m.throughput.avgDecodeTokPerSec * 10) / 10 : null,
    totalEstTokens: m.throughput.totalGeneratedTokens,
  })

  // Compacte per-transactie-dump voor drempelcurve/bron-splitsing in de analyse:
  // [id, verwacht, gekregen(gevalideerd), confidence, bron, correct]. Bewust ná de
  // run-samenvatting — grote regel, alleen voor offline-analyse.
  metric('txdump', {
    run: runIndex,
    items: txResults.map((t) => [t.id, t.expected, t.validatedSlug, Math.round((t.confidence ?? 0) * 100) / 100, t.bron ?? null, t.correct]),
  })

  return { txResults, batches: timings, systemPromptChars: system.length, batchSize }
}
