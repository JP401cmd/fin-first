import { describe, it, expect } from 'vitest'
import { buildCoverageStrip } from './coverage-strip'
import type { UnifiedProjectionRow } from '../unified-projection'
import { NL_SWR } from '../constants'

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

  it('brug leunt op VEILIGE onttrekking (SWR×belegbaar); huis + feitelijke withdrawal tellen niet', () => {
    const spendable = 200_000
    const totaalNeed = 40_000
    const rows: UnifiedProjectionRow[] = [
      mkRow({ age: 60, phase: 'accumulation' }),
      // Brug: geen AOW/pensioen; huis (600k) telt NIET mee, belegbaar 200k.
      // Feitelijke withdrawal is hoog (95k) maar mag de dekking NIET opblazen.
      mkRow({
        age: 64,
        phase: 'transition',
        withdrawal: 95_000,
        withdrawalNeed: { totaalNeed } as UnifiedProjectionRow['withdrawalNeed'],
        grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 0 },
        assetBuckets: { investment: { endValue: spendable }, eigen_huis: { endValue: 600_000 } } as unknown as UnifiedProjectionRow['assetBuckets'],
      }),
      // Post-AOW + verzilverd vermogen: vaste inkomsten dekken bijna alles → ~100% groen.
      mkRow({
        age: 70,
        phase: 'withdrawal',
        withdrawal: 5_000,
        withdrawalNeed: { totaalNeed } as UnifiedProjectionRow['withdrawalNeed'],
        grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 38_000 },
        assetBuckets: { investment: { endValue: 900_000 } } as unknown as UnifiedProjectionRow['assetBuckets'],
      }),
    ]
    const nodes = buildCoverageStrip(rows, { sampleEveryYears: 5 })
    const brug = nodes.find(n => n.age === 64)!
    const post = nodes.find(n => n.age === 70)!
    const verwachtBrug = Math.round((Math.min(NL_SWR * spendable, totaalNeed) / totaalNeed) * 100)
    expect(brug.coveragePct).toBe(verwachtBrug)
    expect(brug.coveragePct).toBeLessThan(100) // interen → onder 100, niet 200%+
    expect(post.coveragePct).toBeGreaterThanOrEqual(100)
    expect(post.coveragePct).toBeLessThanOrEqual(105)
    expect(brug.coveragePct).toBeLessThan(post.coveragePct)
  })

  it('de eigen woning telt niet als belegbaar vermogen (brug-krapte)', () => {
    const nodes = buildCoverageStrip([
      mkRow({ age: 60, phase: 'accumulation' }),
      mkRow({
        age: 64,
        phase: 'transition',
        withdrawal: 0,
        withdrawalNeed: { totaalNeed: 40_000 } as UnifiedProjectionRow['withdrawalNeed'],
        grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 0 },
        assetBuckets: { eigen_huis: { endValue: 1_000_000 } } as unknown as UnifiedProjectionRow['assetBuckets'],
      }),
    ])
    const brug = nodes.find(n => n.age === 64)!
    expect(brug.coveragePct).toBe(0) // geen inkomen én huis telt niet → geen dekking
    expect(brug.status).toBe('red')
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
