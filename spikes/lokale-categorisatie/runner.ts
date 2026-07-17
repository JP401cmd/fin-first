// Dataset-runner: draait de categorisatie in batches en verzamelt per-transactie-
// uitkomsten + per-batch-timings + output-diagnose.

import type { CategorizeBudgetOption } from '../../lib/ai/categorize-system-prompt.ts'
import type { LoadedModel } from './loader.ts'
import type {
  BatchTiming,
  ChatMessage,
  DevTransaction,
  OutputVariant,
  PromptVariant,
  TxResult,
} from './types.ts'
import { batchItemId, buildCompactSystemPrompt, buildFullSystemPrompt, buildUserMessage } from './prompt.ts'
import { parseCategorizations, type RawCategorization } from './parse.ts'

export type RunResult = {
  txResults: TxResult[]
  batches: BatchTiming[]
  systemPromptChars: number
  variant: PromptVariant
  output: OutputVariant
  batchSize: number
}

export type RunParams = {
  model: LoadedModel
  transactions: DevTransaction[]
  options: CategorizeBudgetOption[]
  batchSize: number
  variant: PromptVariant
  output: OutputVariant
  maxNewTokens: number
  onProgress: (done: number, total: number, lastBatch?: BatchTiming) => void
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function runDataset(params: RunParams): Promise<RunResult> {
  const { model, transactions, options, batchSize, variant, output, maxNewTokens, onProgress } = params

  const validSlugs = new Set(options.map((o) => o.slug))
  const system = variant === 'full' ? buildFullSystemPrompt(options) : buildCompactSystemPrompt(options)

  const batches = chunk(transactions, batchSize)
  const txResults: TxResult[] = []
  const timings: BatchTiming[] = []
  let done = 0

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: buildUserMessage(batch, output) },
    ]

    const gen = await model.runChat(messages, { maxNewTokens })
    const parse = parseCategorizations(gen.text)
    const parsed = parse.items
    const parseOk = parsed !== null

    // ── Id-echo-mapping (i.p.v. positioneel) ──────────────────────────────────
    // Het model kan minder/meer/geschudde items teruggeven; we koppelen elk
    // resultaat aan zijn transactie via het teruggeechode "id" (t1..tN), net als
    // de cloud-route met import_hash. Ontbrekend/onbekend id → genegeerd (die
    // transactie blijft ongedekt → invalid). Duplicaat-id → eerste telt.
    const idToIndex = new Map<string, number>()
    batch.forEach((_, i) => idToIndex.set(batchItemId(i), i))
    const assigned: (RawCategorization | null)[] = new Array(batch.length).fill(null)
    const seen = new Set<string>()
    if (parsed) {
      for (const item of parsed) {
        const id = item.id
        if (id === null) continue // ontbrekend id
        const idx = idToIndex.get(id)
        if (idx === undefined) continue // onbekend id
        if (seen.has(id)) continue // duplicaat → eerste telt
        seen.add(id)
        assigned[idx] = item
      }
    }
    const matched = seen.size

    const timing: BatchTiming = {
      index: b,
      size: batch.length,
      ttftMs: gen.ttftMs,
      decodeTokPerSec: gen.decodeTokPerSec,
      wallMs: gen.wallMs,
      inputTokens: gen.inputTokens,
      generatedTokens: gen.generatedTokens,
      parseOk,
      rawOutput: gen.text,
      diagnostics: {
        hadFence: parse.hadFence,
        hadThink: parse.hadThink,
        truncated: parse.truncated,
        salvaged: parse.salvaged,
        itemCount: matched,
        expectedCount: batch.length,
      },
    }
    timings.push(timing)

    batch.forEach((tx, i) => {
      const rawItem = assigned[i]
      const rawSlug = rawItem ? rawItem.budget_slug : null
      // valid (metriek 9): item parsebaar én slug is null of bestaat in de lijst.
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

    done += batch.length
    onProgress(done, transactions.length, timing)
  }

  return {
    txResults,
    batches: timings,
    systemPromptChars: system.length,
    variant,
    output,
    batchSize,
  }
}
