import { describe, it, expect } from 'vitest'
import { parseLocalCategorizations, normalizeLocalItem } from './parse'

describe('parseLocalCategorizations', () => {
  it('parseert een schone JSON-array met id-echo', () => {
    const text = '[{"id":"t1","budget_slug":"boodschappen","confidence":0.95},{"id":"t2","budget_slug":null,"confidence":0.2}]'
    const r = parseLocalCategorizations(text)
    expect(r.truncated).toBe(false)
    expect(r.salvaged).toBe(false)
    expect(r.items).toHaveLength(2)
    expect(r.items![0]).toMatchObject({ id: 't1', budget_slug: 'boodschappen', confidence: 0.95 })
    expect(r.items![1]).toMatchObject({ id: 't2', budget_slug: null })
  })

  it('stript markdown-fences', () => {
    const text = '```json\n[{"id":"t1","budget_slug":"ov","confidence":0.8}]\n```'
    const r = parseLocalCategorizations(text)
    expect(r.hadFence).toBe(true)
    expect(r.items).toHaveLength(1)
    expect(r.items![0].budget_slug).toBe('ov')
  })

  it('stript een <think>-preamble', () => {
    const text = '<think>even nadenken…</think>[{"id":"t1","budget_slug":"loon","confidence":0.9}]'
    const r = parseLocalCategorizations(text)
    expect(r.hadThink).toBe(true)
    expect(r.items).toHaveLength(1)
    expect(r.items![0].budget_slug).toBe('loon')
  })

  it('bergt complete objecten uit een AFGEKAPTE array (salvage)', () => {
    // Tweede object is afgekapt (geen sluithaak) → eerste moet alsnog geborgen.
    const text = '[{"id":"t1","budget_slug":"boodschappen","confidence":0.95},{"id":"t2","budget_slug":"ov"'
    const r = parseLocalCategorizations(text)
    expect(r.truncated).toBe(true)
    expect(r.salvaged).toBe(true)
    expect(r.items).toHaveLength(1)
    expect(r.items![0].id).toBe('t1')
  })

  it('geeft items:null bij volstrekt onbruikbare output', () => {
    const r = parseLocalCategorizations('sorry ik weet het niet')
    expect(r.items).toBeNull()
  })
})

describe('normalizeLocalItem', () => {
  it('normaliseert confidence naar [0,1] en de string "null" naar null', () => {
    expect(normalizeLocalItem({ id: 't1', budget_slug: 'null', confidence: 5 })).toEqual({
      id: 't1', budget_slug: null, confidence: 1, reasoning: '',
    })
  })

  it('behandelt ontbrekend id als null en niet-eindige confidence als 0', () => {
    expect(normalizeLocalItem({ budget_slug: 'x', confidence: 'abc' })).toEqual({
      id: null, budget_slug: 'x', confidence: 0, reasoning: '',
    })
  })

  it('weigert objecten zonder budget_slug én zonder confidence', () => {
    expect(normalizeLocalItem({ foo: 'bar' })).toBeNull()
  })
})
