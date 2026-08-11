import { describe, it, expect } from 'vitest'
import { buildPensionProjection } from './pension-projection'
import { computeBox1Tax } from '@/lib/box1-tax'
import type { LifeEvent } from '@/lib/horizon-data'

function pot(overrides: Partial<LifeEvent>): LifeEvent {
  return {
    id: overrides.id ?? 'p1',
    name: overrides.name ?? 'Bedrijfspensioen',
    event_type: 'pension',
    target_age: overrides.target_age ?? 67,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: overrides.monthly_income_change ?? 1000,
    duration_months: overrides.duration_months ?? 0,
    icon: 'Landmark',
    is_active: true,
    sort_order: 0,
    is_indexed: overrides.is_indexed ?? false,
    metadata: overrides.metadata,
  }
}

describe('buildPensionProjection', () => {
  it('returns empty rows for empty input', () => {
    expect(
      buildPensionProjection({ pensionEvents: [], currentAge: 40, inflationRate: 0.02, year: 2026 }),
    ).toEqual([])
  })

  it('starts at the earliest ingangsleeftijd and ends at maxAge', () => {
    const rows = buildPensionProjection({
      pensionEvents: [pot({ target_age: 67 }), pot({ id: 'p2', target_age: 65 })],
      currentAge: 40,
      inflationRate: 0,
      year: 2026,
      maxAge: 90,
    })
    expect(rows[0]!.age).toBe(65)
    expect(rows[rows.length - 1]!.age).toBe(90)
  })

  it('respects the active window: start at target_age, stop after duration', () => {
    // 10-jaar tijdelijke pot vanaf 67 → actief 67..76 (77 exclusief).
    const rows = buildPensionProjection({
      pensionEvents: [pot({ target_age: 67, duration_months: 120, monthly_income_change: 1000 })],
      currentAge: 67,
      inflationRate: 0,
      year: 2026,
    })
    const at66 = rows.find((r) => r.age === 66)
    expect(at66).toBeUndefined() // projectie begint pas bij 67
    expect(rows.find((r) => r.age === 67)!.brutoNominaal).toBe(12_000)
    expect(rows.find((r) => r.age === 76)!.brutoNominaal).toBe(12_000)
    expect(rows.find((r) => r.age === 77)!.brutoNominaal).toBe(0)
  })

  it('treats duration_months = 0 as lifelong', () => {
    const rows = buildPensionProjection({
      pensionEvents: [pot({ target_age: 67, duration_months: 0, monthly_income_change: 1000 })],
      currentAge: 67,
      inflationRate: 0,
      year: 2026,
      maxAge: 90,
    })
    expect(rows.find((r) => r.age === 90)!.brutoNominaal).toBe(12_000)
  })

  it('sums multiple overlapping pots per age', () => {
    const rows = buildPensionProjection({
      pensionEvents: [
        pot({ id: 'a', target_age: 67, monthly_income_change: 1000 }),
        pot({ id: 'b', target_age: 67, monthly_income_change: 500 }),
      ],
      currentAge: 67,
      inflationRate: 0,
      year: 2026,
    })
    expect(rows.find((r) => r.age === 67)!.brutoNominaal).toBe(18_000)
  })

  it('compounds indexation from currentAge', () => {
    const rows = buildPensionProjection({
      pensionEvents: [pot({ target_age: 67, monthly_income_change: 1000 })],
      currentAge: 47,
      inflationRate: 0.02,
      year: 2026,
    })
    const at67 = rows.find((r) => r.age === 67)!
    // brutoNominaal is flat; geïndexeerd = 12000 * 1.02^(67-47).
    expect(at67.brutoNominaal).toBe(12_000)
    expect(at67.brutoGeindexeerd).toBeCloseTo(12_000 * Math.pow(1.02, 20), 2)
    expect(at67.brutoGeindexeerd).toBeGreaterThan(at67.brutoNominaal)
  })

  it('does not deflate before "nu" (age < currentAge guarded to factor 1)', () => {
    // currentAge boven de ingangsleeftijd → indexFactor moet 1 zijn (geen deflatie).
    const rows = buildPensionProjection({
      pensionEvents: [pot({ target_age: 67, monthly_income_change: 1000 })],
      currentAge: 80,
      inflationRate: 0.02,
      year: 2026,
    })
    const at67 = rows.find((r) => r.age === 67)!
    expect(at67.brutoGeindexeerd).toBe(at67.brutoNominaal)
  })

  it('netto is below bruto via Box 1 tax (consume computeBox1Tax)', () => {
    // Hoog genoeg bruto (€60k/jr) zodat er ook ná AOW-heffingskortingen
    // daadwerkelijk Box 1-belasting overblijft; bij een bescheiden pensioen is
    // de belasting voor een AOW-gerechtigde terecht ~0 (kortingen).
    const rows = buildPensionProjection({
      pensionEvents: [pot({ target_age: 67, monthly_income_change: 5000 })],
      currentAge: 67,
      inflationRate: 0,
      year: 2026,
    })
    const at67 = rows.find((r) => r.age === 67)!
    // `arbeidsinkomen: 0` — een pensioenuitkering geeft géén recht op
    // arbeidskorting. VERWACHTING BIJGESTELD (11 aug 2026): deze assertie
    // spiegelde tot dan de motor-aanroep zónder grondslag en pinde daarmee een
    // te lage heffing; de oude waarde was fout, niet de test.
    const expectedTax = computeBox1Tax({
      grossYearlyIncome: at67.brutoGeindexeerd,
      year: 2026,
      aow: true,
      arbeidsinkomen: 0,
    }).tax
    expect(at67.nettoGeindexeerd).toBeCloseTo(at67.brutoGeindexeerd - expectedTax, 2)
    expect(at67.nettoGeindexeerd).toBeLessThan(at67.brutoGeindexeerd)
    expect(expectedTax).toBeGreaterThan(0)
    // De projectie kent aantoonbaar géén arbeidskorting meer toe over pensioen:
    // met de oude grondslag viel de heffing zichtbaar lager uit.
    const zonderGrondslag = computeBox1Tax({
      grossYearlyIncome: at67.brutoGeindexeerd,
      year: 2026,
      aow: true,
    }).tax
    expect(expectedTax).toBeGreaterThan(zonderGrondslag)
  })

  it('is deterministic for identical input', () => {
    const args = {
      pensionEvents: [pot({ target_age: 67, monthly_income_change: 1500 })],
      currentAge: 50,
      inflationRate: 0.02,
      year: 2026 as const,
    }
    expect(buildPensionProjection(args)).toEqual(buildPensionProjection(args))
  })
})
