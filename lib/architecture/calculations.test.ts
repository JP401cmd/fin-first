import { describe, expect, it } from 'vitest'
import { buildArchimateModel } from './archimate-model'
import {
  CALCULATIONS,
  CALC_DOMAINS,
  calculationsByDomain,
  calculationsForElement,
  validateCalculations,
} from './calculations'

const model = buildArchimateModel({
  version: '0', generatedDate: '2026-06-10',
  stats: { api: 1, components: 1, providers: 1, tables: 1, migrations: 1 },
})

describe('calculations — catalogus', () => {
  it('is valide tegen het model (elementIds bestaan, ids uniek, bron aanwezig)', () => {
    expect(validateCalculations(model)).toEqual([])
  })

  it('dekt alle vier de domeinen', () => {
    const domains = new Set(CALCULATIONS.map((c) => c.domain))
    for (const d of CALC_DOMAINS) expect(domains.has(d)).toBe(true)
  })

  it('groepeert per domein in vaste volgorde', () => {
    const grouped = calculationsByDomain()
    expect(grouped.map((g) => g.domain)).toEqual(CALC_DOMAINS.filter((d) => CALCULATIONS.some((c) => c.domain === d)))
    expect(grouped.reduce((s, g) => s + g.items.length, 0)).toBe(CALCULATIONS.length)
  })

  it('kent de spaarquote-keten met de juiste bron', () => {
    const sq = CALCULATIONS.find((c) => c.id === 'spaarquote')!
    expect(sq.files).toContain('lib/savings-source.ts')
    expect(sq.elementIds).toContain('as-budget')
  })

  it('koppelt de unified projection aan de planningsdienst', () => {
    const cs = calculationsForElement('as-planning')
    expect(cs.some((c) => c.id === 'unified-projection')).toBe(true)
  })

  it('elke berekening heeft invoer en uitvoer', () => {
    for (const c of CALCULATIONS) {
      expect(c.inputs.length, `${c.id} mist invoer`).toBeGreaterThan(0)
      expect(c.outputs.length, `${c.id} mist uitvoer`).toBeGreaterThan(0)
    }
  })
})
