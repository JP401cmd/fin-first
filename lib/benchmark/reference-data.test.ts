import { describe, it, expect } from 'vitest'
import { getCohortReference } from '@/lib/benchmark/nl-reference'
import { wealthTopPercent, incomeTopPercent } from '@/lib/benchmark/global-reference'

// ── getCohortReference — zonder huishoudtype (pure CBS-leeftijdscijfers) ──

describe('getCohortReference — zonder huishoudtype', () => {
  it('35-45 + null → householdAdjusted:false', () => {
    const ref = getCohortReference('35-45', null)
    expect(ref.householdAdjusted).toBe(false)
  })

  it('retourneert de onbewerkte CBS-mediaan voor 35-45', () => {
    const ref = getCohortReference('35-45', null)
    // CBS Materiële welvaart 2024 — vermogen (mediaan) voor 35-45 = 120_100
    expect(ref.netWorthMedian).toBe(120_100)
    expect(ref.netWorthMean).toBe(246_400)
    expect(ref.incomeMedian).toBe(39_000)
    expect(ref.savingsRatePct).toBe(11)
  })

  it('elke band retourneert positieve mediaan en gemiddelde', () => {
    const bands = ['tot25', '25-35', '35-45', '45-55', '55-65', '65-75', '75plus'] as const
    for (const band of bands) {
      const ref = getCohortReference(band, null)
      expect(ref.netWorthMedian).toBeGreaterThanOrEqual(0)
      expect(ref.netWorthMean).toBeGreaterThan(0)
      expect(ref.incomeMedian).toBeGreaterThan(0)
      expect(ref.savingsRatePct).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── getCohortReference — met huishoudtype (correctie-factor) ──

describe('getCohortReference — met huishoudtype', () => {
  it('35-45 + alleenstaand → householdAdjusted:true', () => {
    const ref = getCohortReference('35-45', 'alleenstaand')
    expect(ref.householdAdjusted).toBe(true)
  })

  it('alleenstaand heeft lager netWorthMedian dan base (factor 0.55)', () => {
    const base = getCohortReference('35-45', null)
    const solo = getCohortReference('35-45', 'alleenstaand')
    expect(solo.netWorthMedian).toBeLessThan(base.netWorthMedian)
  })

  it('paar heeft hoger netWorthMedian dan base (factor 1.30)', () => {
    const base = getCohortReference('35-45', null)
    const paar = getCohortReference('35-45', 'paar')
    expect(paar.netWorthMedian).toBeGreaterThan(base.netWorthMedian)
  })

  it('ordening alleenstaand < base < paar voor netWorthMedian', () => {
    const base = getCohortReference('35-45', null)
    const solo = getCohortReference('35-45', 'alleenstaand')
    const paar = getCohortReference('35-45', 'paar')
    expect(solo.netWorthMedian).toBeLessThan(base.netWorthMedian)
    expect(paar.netWorthMedian).toBeGreaterThan(base.netWorthMedian)
  })

  it('ordening alleenstaand < base < paar voor incomeMedian', () => {
    const base = getCohortReference('35-45', null)
    const solo = getCohortReference('35-45', 'alleenstaand')
    const paar = getCohortReference('35-45', 'paar')
    expect(solo.incomeMedian).toBeLessThan(base.incomeMedian)
    expect(paar.incomeMedian).toBeGreaterThan(base.incomeMedian)
  })

  it('savingsRatePct verandert NIET door huishoudtype-correctie', () => {
    const base = getCohortReference('35-45', null)
    const solo = getCohortReference('35-45', 'alleenstaand')
    const paar = getCohortReference('35-45', 'paar')
    expect(solo.savingsRatePct).toBe(base.savingsRatePct)
    expect(paar.savingsRatePct).toBe(base.savingsRatePct)
  })

  it('uitkomst is een geheel getal (Math.round toegepast)', () => {
    const ref = getCohortReference('35-45', 'alleenstaand')
    expect(Number.isInteger(ref.netWorthMedian)).toBe(true)
    expect(Number.isInteger(ref.incomeMedian)).toBe(true)
  })

  it('gezin_jong heeft hogere inkomenstoerekening dan alleenstaand', () => {
    const solo = getCohortReference('45-55', 'alleenstaand')
    const gezin = getCohortReference('45-55', 'gezin_jong')
    expect(gezin.incomeMedian).toBeGreaterThan(solo.incomeMedian)
  })
})

// ── wealthTopPercent — monotonie en grenzen ───────────────

describe('wealthTopPercent', () => {
  it('retourneert null voor 0', () => {
    expect(wealthTopPercent(0)).toBeNull()
  })

  it('retourneert null voor negatieve waarden', () => {
    expect(wealthTopPercent(-10_000)).toBeNull()
  })

  it('retourneert null voor waarden onder de laagste drempel (< €1.000)', () => {
    expect(wealthTopPercent(500)).toBeNull()
  })

  it('€1.000 → top 70%', () => {
    expect(wealthTopPercent(1_000)).toBe(70)
  })

  it('€9.000 → top 50%', () => {
    expect(wealthTopPercent(9_000)).toBe(50)
  })

  it('€2.000.000 → top 1%', () => {
    expect(wealthTopPercent(2_000_000)).toBe(1)
  })

  it('topPercent neemt NIET toe bij stijgend vermogen (monotoon dalend)', () => {
    const values = [1_000, 9_000, 35_000, 90_000, 230_000, 450_000, 850_000, 2_000_000]
    const results = values.map(v => wealthTopPercent(v)!)
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeLessThanOrEqual(results[i - 1])
    }
  })

  it('€850.000 (drempel) → top 1%', () => {
    expect(wealthTopPercent(850_000)).toBe(1)
  })

  it('€849.999 (net onder drempel) → hoger dan top 1%', () => {
    const result = wealthTopPercent(849_999)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(1)
  })
})

// ── incomeTopPercent — monotonie en grenzen ───────────────

describe('incomeTopPercent', () => {
  it('retourneert null voor 0', () => {
    expect(incomeTopPercent(0)).toBeNull()
  })

  it('retourneert null voor negatief inkomen', () => {
    expect(incomeTopPercent(-5_000)).toBeNull()
  })

  it('retourneert null voor inkomen onder de laagste drempel (< €5.000)', () => {
    expect(incomeTopPercent(3_000)).toBeNull()
  })

  it('€5.000 → top 30%', () => {
    expect(incomeTopPercent(5_000)).toBe(30)
  })

  it('€100.000 → top 1%', () => {
    expect(incomeTopPercent(100_000)).toBe(1)
  })

  it('€55.000 (drempel) → top 1%', () => {
    expect(incomeTopPercent(55_000)).toBe(1)
  })

  it('topPercent neemt NIET toe bij stijgend inkomen (monotoon dalend)', () => {
    const values = [5_000, 9_000, 14_000, 22_000, 35_000, 55_000, 100_000]
    const results = values.map(v => incomeTopPercent(v)!)
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeLessThanOrEqual(results[i - 1])
    }
  })

  it('€22.000 → top 5%', () => {
    expect(incomeTopPercent(22_000)).toBe(5)
  })

  it('waarde precies op drempel is inclusief die drempel', () => {
    // €14.000 = drempel top 10%
    expect(incomeTopPercent(14_000)).toBe(10)
  })
})
