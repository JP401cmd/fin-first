import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LocalChatMessage } from './transformers-runtime'

// ── Mock de Transformers.js-laag ──────────────────────────────────────────────
// De pure delen (id-mapping, drempel, parse) testen we direct; de resolver-
// integratie (interne batchsplitsing 10, sessieherstel) met een gemockte
// generate/dispose. Geen model-download.

let generateImpl: (messages: LocalChatMessage[], maxNewTokens: number) => Promise<string>
const disposeSpy = vi.fn(async () => {})
const generateSpy = vi.fn((messages: LocalChatMessage[], maxNewTokens: number) => generateImpl(messages, maxNewTokens))

vi.mock('./transformers-runtime', () => ({
  loadModelSession: async () => ({
    generate: (messages: LocalChatMessage[], maxNewTokens: number) => generateSpy(messages, maxNewTokens),
  }),
  disposeSession: () => disposeSpy(),
}))

import {
  createLocalAiResolver,
  mapLocalChunkResults,
  suggestLocalMaxNewTokens,
  LOCAL_MIN_CONFIDENCE,
} from './local-categorize-resolver'
import { parseLocalCategorizations } from './parse'
import { batchItemId } from '@/lib/ai/categorize-system-prompt'
import type { CombinedAiBatchItem } from '@/lib/auto-categorize'

function item(id: string, over: Partial<CombinedAiBatchItem> = {}): CombinedAiBatchItem {
  return { id, description: `desc ${id}`, counterparty_name: 'X', amount: -10, reference: null, date: null, ...over }
}

/** Bouw een schone modeloutput die t1..tN echoot met de meegegeven slug/confidence. */
function echoOutput(n: number, slug: string | null, confidence: number): string {
  const arr = Array.from({ length: n }, (_, i) => ({ id: batchItemId(i), budget_slug: slug, confidence }))
  return JSON.stringify(arr)
}

const validSlugs = new Set(['boodschappen', 'ov'])
const slugToId = new Map<string, string>([['boodschappen', 'b-1'], ['ov', 'b-2']])

beforeEach(() => {
  disposeSpy.mockClear()
  generateSpy.mockClear()
  generateImpl = async () => '[]'
})

describe('mapLocalChunkResults — id-mapping, drempel, slug-validatie', () => {
  it('mapt op teruggeechood id (niet positioneel) en valideert de slug', () => {
    const chunk = [item('tx-a'), item('tx-b')]
    // Model geeft de items in omgekeerde volgorde terug (t2 dan t1) — id koppelt.
    const raw = JSON.stringify([
      { id: 't2', budget_slug: 'ov', confidence: 0.95 },
      { id: 't1', budget_slug: 'boodschappen', confidence: 0.92 },
    ])
    const out = mapLocalChunkResults(chunk, parseLocalCategorizations(raw), validSlugs, slugToId)
    expect(out).toEqual([
      { id: 'tx-a', budget_id: 'b-1', confidence: 0.92, reasoning: '' },
      { id: 'tx-b', budget_id: 'b-2', confidence: 0.95, reasoning: '' },
    ])
  })

  it('onder de drempel (0.9) → budget_id null (assistief: liever niets dan ruis)', () => {
    const chunk = [item('tx-a')]
    const raw = JSON.stringify([{ id: 't1', budget_slug: 'boodschappen', confidence: 0.89 }])
    const out = mapLocalChunkResults(chunk, parseLocalCategorizations(raw), validSlugs, slugToId)
    expect(out[0].budget_id).toBeNull()
    expect(out[0].confidence).toBe(0.89)
  })

  it('op de drempel (=0.9) → wél toegewezen', () => {
    const chunk = [item('tx-a')]
    const raw = JSON.stringify([{ id: 't1', budget_slug: 'boodschappen', confidence: LOCAL_MIN_CONFIDENCE }])
    const out = mapLocalChunkResults(chunk, parseLocalCategorizations(raw), validSlugs, slugToId)
    expect(out[0].budget_id).toBe('b-1')
  })

  it('onbekende slug → null; duplicaat-id → eerste telt; onbekend id → genegeerd', () => {
    const chunk = [item('tx-a'), item('tx-b')]
    const raw = JSON.stringify([
      { id: 't1', budget_slug: 'verzonnen-slug', confidence: 0.99 },
      { id: 't1', budget_slug: 'ov', confidence: 0.99 }, // duplicaat t1 → genegeerd
      { id: 't9', budget_slug: 'ov', confidence: 0.99 }, // onbekend id → genegeerd
    ])
    const out = mapLocalChunkResults(chunk, parseLocalCategorizations(raw), validSlugs, slugToId)
    expect(out[0].budget_id).toBeNull() // verzonnen slug
    expect(out[1].budget_id).toBeNull() // tx-b kreeg niets (t2 ontbrak)
  })

  it('elke transactie krijgt exact één resultaat terug, ook bij lege output', () => {
    const chunk = [item('tx-a'), item('tx-b'), item('tx-c')]
    const out = mapLocalChunkResults(chunk, parseLocalCategorizations('geen json'), validSlugs, slugToId)
    expect(out.map((r) => r.id)).toEqual(['tx-a', 'tx-b', 'tx-c'])
    expect(out.every((r) => r.budget_id === null)).toBe(true)
  })
})

describe('createLocalAiResolver — interne batchsplitsing (10)', () => {
  it('splitst een batch van 15 in twee interne batches (10 + 5)', async () => {
    const budgets = [
      { slug: 'boodschappen', name: 'Boodschappen', parentName: null, type: 'expense' as const, id: 'b-1' },
    ]
    generateImpl = async (messages) => {
      // Tel de t{n}:-ids in de user-message om de juiste chunkgrootte te echoën.
      const user = messages[1].content
      const n = (user.match(/(^|\n)t\d+:/g) ?? []).length
      return echoOutput(n, 'boodschappen', 0.95)
    }
    const resolver = createLocalAiResolver(budgets)
    const batch = Array.from({ length: 15 }, (_, i) => item(`tx-${i}`))
    const out = await resolver(batch)

    expect(generateSpy).toHaveBeenCalledTimes(2) // 10 + 5
    expect(out).toHaveLength(15)
    expect(out.every((r) => r.budget_id === 'b-1')).toBe(true)
  })
})

describe('createLocalAiResolver — sessieherstel', () => {
  it('herstelt eenmaal na een crash (dispose + verse sessie), dan succes', async () => {
    const budgets = [
      { slug: 'ov', name: 'OV', parentName: null, type: 'expense' as const, id: 'b-2' },
    ]
    let call = 0
    generateImpl = async (messages) => {
      call++
      if (call === 1) throw new Error('operation does not support unaligned accesses')
      const user = messages[1].content
      const n = (user.match(/(^|\n)t\d+:/g) ?? []).length
      return echoOutput(n, 'ov', 0.95)
    }
    const resolver = createLocalAiResolver(budgets)
    const out = await resolver([item('tx-a')])

    expect(disposeSpy).toHaveBeenCalledTimes(1)
    expect(generateSpy).toHaveBeenCalledTimes(2) // crash + retry
    expect(out[0].budget_id).toBe('b-2')
  })

  it('faalt de retry óók → throw (naar failedBatches van de orkestrator)', async () => {
    const budgets = [
      { slug: 'ov', name: 'OV', parentName: null, type: 'expense' as const, id: 'b-2' },
    ]
    generateImpl = async () => {
      throw new Error('device lost, opnieuw')
    }
    const resolver = createLocalAiResolver(budgets)
    await expect(resolver([item('tx-a')])).rejects.toThrow()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })
})

describe('suggestLocalMaxNewTokens', () => {
  it('schaalt met de batchgrootte binnen redelijke grenzen', () => {
    expect(suggestLocalMaxNewTokens(1)).toBeGreaterThanOrEqual(124)
    expect(suggestLocalMaxNewTokens(10)).toBe(10 * 28 + 96)
    expect(suggestLocalMaxNewTokens(1000)).toBeLessThanOrEqual(4096)
  })
})
