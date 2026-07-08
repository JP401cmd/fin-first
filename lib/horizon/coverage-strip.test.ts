import { describe, it, expect } from 'vitest'
import { buildCoverageStrip } from './coverage-strip'
import type { UnifiedProjectionRow } from '../unified-projection'

/** Minimale synthetische rij — alleen de velden die buildCoverageStrip leest. */
function mkRow(p: Partial<UnifiedProjectionRow> & { age: number; phase: UnifiedProjectionRow['phase'] }): UnifiedProjectionRow {
  return p as unknown as UnifiedProjectionRow
}

describe('buildCoverageStrip', () => {
  it('accumulatie-jaren zijn 100% (groen)', () => {
    const rows = [40, 45, 50].map(age => mkRow({ age, phase: 'accumulation' }))
    const nodes = buildCoverageStrip(rows, { sampleEveryYears: 5 })
    expect(nodes.every(n => n.coveragePct === 100 && n.status === 'green')).toBe(true)
  })

  it('brugjaar met tekort valt onder 100% en herstelt na AOW', () => {
    const rows: UnifiedProjectionRow[] = [
      mkRow({ age: 60, phase: 'accumulation' }),
      // Brug: geen AOW/pensioen, onttrekking dekt maar deel van de behoefte → rood.
      mkRow({
        age: 64,
        phase: 'transition',
        withdrawal: 30_000,
        withdrawalNeed: { totaalNeed: 40_000 } as UnifiedProjectionRow['withdrawalNeed'],
        grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 0 },
      }),
      // Post-AOW: hoge vaste inkomsten → boven 100% groen.
      mkRow({
        age: 70,
        phase: 'withdrawal',
        withdrawal: 5_000,
        withdrawalNeed: { totaalNeed: 40_000 } as UnifiedProjectionRow['withdrawalNeed'],
        grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 38_000 },
      }),
    ]
    const nodes = buildCoverageStrip(rows, { sampleEveryYears: 5 })
    const brug = nodes.find(n => n.age === 64)!
    const post = nodes.find(n => n.age === 70)!
    expect(brug.coveragePct).toBe(75)
    expect(brug.status).toBe('red')
    expect(post.coveragePct).toBeGreaterThanOrEqual(100)
    expect(post.status).toBe('green')
    expect(brug.coveragePct).toBeLessThan(post.coveragePct)
  })

  it('fase-overgangsleeftijden komen altijd voor als knoop', () => {
    const rows: UnifiedProjectionRow[] = [
      mkRow({ age: 61, phase: 'accumulation' }),
      mkRow({ age: 63, phase: 'transition', withdrawal: 20_000, withdrawalNeed: { totaalNeed: 40_000 } as UnifiedProjectionRow['withdrawalNeed'], grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 0 } }),
      mkRow({ age: 67, phase: 'withdrawal', withdrawal: 10_000, withdrawalNeed: { totaalNeed: 40_000 } as UnifiedProjectionRow['withdrawalNeed'], grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 30_000 } }),
    ]
    const ages = buildCoverageStrip(rows).map(n => n.age)
    expect(ages).toContain(63) // brug begint
    expect(ages).toContain(67) // AOW-instap
  })
})
