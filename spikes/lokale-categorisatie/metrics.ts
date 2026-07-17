// Metriek-aggregatie uit de per-transactie-uitkomsten + per-batch-timings.

import type { BatchTiming, TxResult } from './types.ts'

export type Metrics = {
  total: number
  parsed: number
  // Metriek 1 — accuracy vs. ground truth.
  accuracy: number | null // correct / total
  accuracyOnValid: number | null // correct / valid
  // Metriek 9 — output-validiteit.
  validityPct: number
  // Metriek 3 — confidence-kalibratie.
  calibration: {
    highConf: { n: number; correctPct: number | null }
    lowConf: { n: number; correctPct: number | null }
  }
  // Metriek 6 — doorvoer.
  throughput: {
    avgTtftMs: number | null
    avgDecodeTokPerSec: number | null
    totalWallMs: number
    totalGeneratedTokens: number
    batches: number
  }
  // Extra: hoe presteert het model op de bewuste randgevallen?
  edgeCaseAccuracy: number | null
}

function pct(numer: number, denom: number): number | null {
  return denom > 0 ? (numer / denom) * 100 : null
}

export function computeMetrics(txs: TxResult[], batches: BatchTiming[]): Metrics {
  const total = txs.length
  const valid = txs.filter((t) => t.valid)
  const correct = txs.filter((t) => t.correct).length

  const high = txs.filter((t) => t.confidence >= 0.5)
  const low = txs.filter((t) => t.confidence < 0.5)
  const highCorrect = high.filter((t) => t.correct).length
  const lowCorrect = low.filter((t) => t.correct).length

  const edges = txs.filter((t) => t.edge_case)
  const edgeCorrect = edges.filter((t) => t.correct).length

  const ttfts = batches.map((b) => b.ttftMs).filter((v): v is number => v != null)
  const decodeRates = batches.map((b) => b.decodeTokPerSec).filter((v): v is number => v != null)
  const totalWallMs = batches.reduce((s, b) => s + b.wallMs, 0)
  const totalGeneratedTokens = batches.reduce((s, b) => s + b.generatedTokens, 0)

  return {
    total,
    parsed: valid.length,
    accuracy: pct(correct, total),
    accuracyOnValid: pct(correct, valid.length),
    validityPct: total > 0 ? (valid.length / total) * 100 : 0,
    calibration: {
      highConf: { n: high.length, correctPct: pct(highCorrect, high.length) },
      lowConf: { n: low.length, correctPct: pct(lowCorrect, low.length) },
    },
    throughput: {
      avgTtftMs: ttfts.length ? ttfts.reduce((a, b) => a + b, 0) / ttfts.length : null,
      avgDecodeTokPerSec: decodeRates.length ? decodeRates.reduce((a, b) => a + b, 0) / decodeRates.length : null,
      totalWallMs,
      totalGeneratedTokens,
      batches: batches.length,
    },
    edgeCaseAccuracy: pct(edgeCorrect, edges.length),
  }
}
