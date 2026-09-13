import { describe, it, expect } from 'vitest'
import { gemiddeldePositie, jaNeeTelling, keuzeTelling, npsScore, schaalGemiddelde } from './resultaten'

const a = (o: { t?: string; s?: number; c?: string }) => ({ answer_text: o.t ?? null, answer_scale: o.s ?? null, answer_choice: o.c ?? null })

describe('resultaten', () => {
  it('schaalGemiddelde', () => {
    expect(schaalGemiddelde([])).toBeNull()
    expect(schaalGemiddelde([a({ s: 4 }), a({ s: 8 })])).toBe(6)
  })

  it('npsScore: promoters 9–10, criticasters 0–6', () => {
    // 2 promoters, 1 passief (7), 1 criticaster (3) → (2-1)/4 = 25
    expect(npsScore([a({ s: 10 }), a({ s: 9 }), a({ s: 7 }), a({ s: 3 })])).toEqual({ score: 25, promoters: 2, passief: 1, criticasters: 1 })
    expect(npsScore([a({ s: 0 }), a({ s: 6 })])?.score).toBe(-100)
    expect(npsScore([])).toBeNull()
  })

  it('jaNeeTelling telt alleen Ja en Nee', () => {
    expect(jaNeeTelling([a({ c: 'Ja' }), a({ c: 'Ja' }), a({ c: 'Nee' }), a({ c: 'Misschien' })])).toEqual({ ja: 2, nee: 1, jaPct: 67 })
    expect(jaNeeTelling([a({ c: 'Misschien' })])).toBeNull()
  })

  it('gemiddeldePositie herschaalt na een verwijderde optie', () => {
    // Oud antwoord met "X" op 1; X bestaat niet meer → B wordt 1, A wordt 2.
    expect(gemiddeldePositie([a({ c: '["X","B","A"]' })], ['A', 'B'])).toEqual([
      { optie: 'B', positie: 1, aantal: 1 },
      { optie: 'A', positie: 2, aantal: 1 },
    ])
  })

  it('keuzeTelling telt meer-antwoorden en verzamelt Anders-teksten', () => {
    const r = keuzeTelling(
      [a({ c: '["A","Anders, namelijk"]', t: 'eigen' }), a({ c: 'B' })],
      ['A', 'B', 'C', 'Anders, namelijk'],
    )
    expect(r.telling).toEqual([['A', 1], ['B', 1], ['C', 0], ['Anders, namelijk', 1]])
    expect(r.anders).toEqual(['eigen'])
  })

  it('gemiddeldePositie sorteert op belang', () => {
    expect(gemiddeldePositie([a({ c: '["B","A","C"]' }), a({ c: '["B","C","A"]' })], ['A', 'B', 'C'])).toEqual([
      { optie: 'B', positie: 1, aantal: 2 },
      { optie: 'A', positie: 2.5, aantal: 2 },
      { optie: 'C', positie: 2.5, aantal: 2 },
    ])
  })
})
