import { describe, it, expect } from 'vitest'
import { selectParityFacts } from './parity-facts'

// Defensieve-selector-test: het rapport is los getypeerd JSON dat oud, leeg of
// afwezig kan zijn. De selector mag NOOIT crashen en moet altijd een geldige,
// getypeerde vorm teruggeven — met een neutrale lege-staat waar niets bruikbaars
// is. (Volledige coverage doet de tester later; dit borgt de kernvormen.)

const FULL = {
  generatedAt: '2026-07-24T22:21:28.487Z',
  manifestGeneratedAt: '2026-07-24T22:10:46.710Z',
  inSync: true,
  dnaSubBudget: 2000,
  dnaEstimatedTokens: 490,
  dnaTokenSource: 'live',
  sources: [
    {
      file: 'lib/ai/dna/base.ts',
      storedSha256: 'aaa',
      liveSha256: 'aaa',
      inSync: true,
    },
    {
      file: 'lib/ai/dna/wil.ts',
      storedSha256: 'bbb',
      liveSha256: 'ccc',
      inSync: false,
    },
  ],
}

describe('selectParityFacts', () => {
  it('leest een volledig rapport correct uit', () => {
    const facts = selectParityFacts(FULL)
    expect(facts.neverGenerated).toBe(false)
    expect(facts.generatedAt).toBe('2026-07-24T22:21:28.487Z')
    expect(facts.manifestGeneratedAt).toBe('2026-07-24T22:10:46.710Z')
    expect(facts.inSync).toBe(true)
    expect(facts.dnaSubBudget).toBe(2000)
    expect(facts.dnaEstimatedTokens).toBe(490)
    expect(facts.dnaTokenSource).toBe('live')
    expect(facts.sources).toHaveLength(2)
    expect(facts.sources[0]).toEqual({
      file: 'lib/ai/dna/base.ts',
      storedSha256: 'aaa',
      liveSha256: 'aaa',
      inSync: true,
    })
    expect(facts.sources[1].inSync).toBe(false)
  })

  it('geeft de neutrale lege-staat bij een leeg object', () => {
    const facts = selectParityFacts({})
    expect(facts.neverGenerated).toBe(true)
    expect(facts.generatedAt).toBe('')
    expect(facts.inSync).toBe(false)
    expect(facts.sources).toEqual([])
  })

  it('geeft de neutrale lege-staat bij null/undefined zonder te crashen', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      const facts = selectParityFacts(bad)
      expect(facts.neverGenerated).toBe(true)
      expect(facts.sources).toEqual([])
    }
  })

  it('geeft een lege sources-array als de sources-key ontbreekt', () => {
    const facts = selectParityFacts({
      generatedAt: '2026-07-24T22:21:28.487Z',
      inSync: true,
    })
    expect(facts.neverGenerated).toBe(false)
    expect(facts.sources).toEqual([])
    expect(facts.inSync).toBe(true)
  })

  it('coerceert verkeerde veldtypes defensief en filtert bronnen zonder file weg', () => {
    const facts = selectParityFacts({
      generatedAt: '2026-07-24T22:21:28.487Z',
      inSync: 'ja', // geen echte boolean → false
      dnaSubBudget: '2000', // geen number → 0
      dnaEstimatedTokens: null,
      dnaTokenSource: 5, // geen string → ''
      sources: [
        { file: '', storedSha256: 'x' }, // geen file → weggefilterd
        { file: 'lib/ai/dna/base.ts', inSync: 'ja' }, // inSync geen boolean → false
        'nonsense',
      ],
    })
    expect(facts.inSync).toBe(false)
    expect(facts.dnaSubBudget).toBe(0)
    expect(facts.dnaEstimatedTokens).toBe(0)
    expect(facts.dnaTokenSource).toBe('')
    expect(facts.sources).toHaveLength(1)
    expect(facts.sources[0].file).toBe('lib/ai/dna/base.ts')
    expect(facts.sources[0].inSync).toBe(false)
    expect(facts.sources[0].storedSha256).toBe('')
  })
})
