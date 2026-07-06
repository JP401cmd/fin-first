import { describe, it, expect } from 'vitest'
import type { UnifiedProjectionRow, DebtBalanceDetail } from '@/lib/unified-projection'
import { detectDeficitLoanFromRows } from './deficit-loan-display'

/**
 * FIX 3 — V7-zichtbaarheid: detecteer de aangesproken tekort-lening uit de rijen
 * (eerste leeftijd + piek) zodat /toekomst er een stoplicht-melding bij kan tonen.
 */

function bal(endBalance: number): DebtBalanceDetail {
  return { startBalance: 0, interestPaid: 0, principalPaid: 0, endBalance }
}

function row(age: number, deficit?: number): UnifiedProjectionRow {
  return {
    year: age - 40,
    age,
    phase: 'withdrawal',
    assetBuckets: {},
    debtBalances: deficit !== undefined ? { 'tekort-lening': bal(deficit) } : {},
    totalAssets: 0,
    totalDebts: 0,
    netWorth: 0,
    startNetWorth: 0,
    grossIncome: 0,
    savings: 0,
    withdrawal: 0,
    withdrawalByType: {},
    cashflowNet: 0,
    oneTimeNet: 0,
    totalGrowth: 0,
    totalBox3: 0,
    cumulativeBox3: 0,
    inflationFactor: 1,
  } as UnifiedProjectionRow
}

describe('detectDeficitLoanFromRows', () => {
  it('leidt eerste leeftijd + piek af uit de rijen', () => {
    const rows = [row(40), row(41), row(42, 5_000), row(43, 12_000), row(44, 8_000)]
    const out = detectDeficitLoanFromRows(rows)
    expect(out).not.toBeNull()
    expect(out!.firstAge).toBe(42)
    expect(out!.peak).toBe(12_000)
  })

  it('negeert 0-saldo-rijen (sleutel aanwezig maar niet aangesproken)', () => {
    const rows = [row(40, 0), row(41, 0), row(42, 3_000)]
    const out = detectDeficitLoanFromRows(rows)
    expect(out!.firstAge).toBe(42)
    expect(out!.peak).toBe(3_000)
  })

  it('geen tekort-lening in de rijen → null', () => {
    expect(detectDeficitLoanFromRows([row(40), row(41), row(42)])).toBeNull()
  })

  it('lege/afwezige rijen → null', () => {
    expect(detectDeficitLoanFromRows([])).toBeNull()
    expect(detectDeficitLoanFromRows(null)).toBeNull()
    expect(detectDeficitLoanFromRows(undefined)).toBeNull()
  })
})

/**
 * Besluit 4 juli 2026 (eigenaar): bij een "Vermogen opeten"-eindstrategie
 * (bv. fire_end_age 93) ontstaat na de eindleeftijd per definitie een enorme
 * tekort-lening-staart — dat is modelmarge, geen meldenswaardig feit. De
 * tekort-lening telt daarom alleen mee t/m endAge − 1; rijen op/na endAge
 * worden genegeerd, ook voor de piek-bepaling.
 *
 * `endAge` null/undefined ⇒ exact het bestaande gedrag hierboven (geen cutoff).
 */
describe('detectDeficitLoanFromRows — endAge-cutoff (besluit 4 juli 2026)', () => {
  it('a. owner-patroon: lening start ruim vóór het venster-einde, staart ná endAge telt niet mee in de piek', () => {
    const rows = [
      row(75, 1_000),
      row(80, 5_000),
      row(85, 10_000),
      row(90, 15_000),
      row(92, 18_000), // laatste rij binnen het venster (endAge 93 → cutoff 92)
      row(93, 50_000), // endAge zelf — modelmarge, telt niet mee
      row(95, 80_000),
      row(100, 120_000), // staart-piek — mag NOOIT de gerapporteerde piek zijn
    ]
    const out = detectDeficitLoanFromRows(rows, { endAge: 93 })
    expect(out).not.toBeNull()
    expect(out!.firstAge).toBe(75)
    expect(out!.peak).toBe(18_000)
  })

  it('b. alleen-staart: saldo > 0 uitsluitend op rijen age >= endAge → null', () => {
    const rows = [
      row(85, 0),
      row(90, 0),
      row(92, 0), // laatste rij binnen het venster, nog steeds 0
      row(93, 5_000), // pas vanaf endAge aangesproken
      row(96, 9_000),
    ]
    expect(detectDeficitLoanFromRows(rows, { endAge: 93 })).toBeNull()
  })

  it('c. boundary: eerste saldo > 0 op exact age = endAge - 1 → wél getoond, piek beperkt tot het venster', () => {
    const rows = [
      row(90, 0),
      row(91, 0),
      row(92, 7_000), // = endAge - 1, laatste rij binnen het venster
      row(93, 9_000), // hoger, maar buiten het venster → mag piek niet worden
    ]
    const out = detectDeficitLoanFromRows(rows, { endAge: 93 })
    expect(out).not.toBeNull()
    expect(out!.firstAge).toBe(92)
    expect(out!.peak).toBe(7_000)
  })

  it('d. alleen-laatste-jaar: eerste saldo > 0 op exact age = endAge → null (modelmarge, geen melding)', () => {
    const rows = [row(90, 0), row(91, 0), row(92, 0), row(93, 4_000)]
    expect(detectDeficitLoanFromRows(rows, { endAge: 93 })).toBeNull()
  })

  it('e. fallback zonder endAge: oud gedrag (piek over álle rijen, incl. de staart)', () => {
    const rows = [
      row(75, 1_000),
      row(80, 5_000),
      row(85, 10_000),
      row(90, 15_000),
      row(92, 18_000),
      row(93, 50_000),
      row(95, 80_000),
      row(100, 120_000),
    ]
    // Zelfde rijen als case a — zónder opts (of endAge: null/undefined) blijft
    // het bestaande gedrag intact: de staart-piek (120.000 op leeftijd 100)
    // telt gewoon mee. Dit demonstreert expliciet dat cutoff en fallback
    // verschillend uitpakken op identieke input.
    const withoutOpts = detectDeficitLoanFromRows(rows)
    expect(withoutOpts!.firstAge).toBe(75)
    expect(withoutOpts!.peak).toBe(120_000)

    const explicitNull = detectDeficitLoanFromRows(rows, { endAge: null })
    expect(explicitNull!.firstAge).toBe(75)
    expect(explicitNull!.peak).toBe(120_000)

    const explicitUndefined = detectDeficitLoanFromRows(rows, { endAge: undefined })
    expect(explicitUndefined!.firstAge).toBe(75)
    expect(explicitUndefined!.peak).toBe(120_000)
  })

  it('f. bestaand gedrag blijft: geen tekort-lening-sleutel / lege rijen → null, óók met endAge gezet', () => {
    expect(detectDeficitLoanFromRows([row(90), row(91), row(92)], { endAge: 93 })).toBeNull()
    expect(detectDeficitLoanFromRows([], { endAge: 93 })).toBeNull()
    expect(detectDeficitLoanFromRows(null, { endAge: 93 })).toBeNull()
    expect(detectDeficitLoanFromRows(undefined, { endAge: 93 })).toBeNull()
  })
})

/**
 * BUG 1 — €1-materialiteitsgate: een rauw tekort-lening-restsaldo van float-ruis
 * (€0,003) óf een reële sub-euro (€0,30) leverde een banner met "piek € 0
 * (0 dagen)". Een rij telt daarom alléén mee voor `firstAge` én `peak` wanneer het
 * eindsaldo op hele euro's afgerond ≥ €1 is (`Math.round(endBalance) >= 1`, d.w.z.
 * saldo ≥ €0,50). Is er binnen het venster geen enkele rij ≥ €1, dan `null`.
 * De gate werkt bínnen het bestaande endAge-venster (besluit 4 juli 2026).
 */
describe('detectDeficitLoanFromRows — €1-materialiteitsgate (bug 1)', () => {
  it('float-ruis €0,003 → null (rondt naar €0, geen "piek € 0"-banner)', () => {
    expect(detectDeficitLoanFromRows([row(40), row(41), row(42, 0.003)])).toBeNull()
  })

  it('reële sub-euro €0,30 → null (rondt naar €0)', () => {
    expect(detectDeficitLoanFromRows([row(60, 0.3), row(61, 0.3)])).toBeNull()
  })

  it('€0,49 → null (Math.round(0.49) = 0)', () => {
    expect(detectDeficitLoanFromRows([row(60, 0.49)])).toBeNull()
  })

  it('€0,50 → { firstAge, peak: 1 } (Math.round(0.5) = 1, expliciete grens)', () => {
    const out = detectDeficitLoanFromRows([row(60, 0.5)])
    expect(out).not.toBeNull()
    expect(out!.firstAge).toBe(60)
    expect(out!.peak).toBe(1)
  })

  it('firstAge landt op de eerste ≥€1-rij, niet op een eerdere sub-euro-ruisrij', () => {
    // €0,02 op 68 (ruis) → mag firstAge NIET zetten; eerste materiële ≥€1 op 71.
    const rows = [row(68, 0.02), row(69, 0.4), row(70, 0), row(71, 1_500)]
    const out = detectDeficitLoanFromRows(rows)
    expect(out).not.toBeNull()
    expect(out!.firstAge).toBe(71)
    expect(out!.peak).toBe(1_500)
  })

  it('materieel geval (€1.234) → banner intact, peak ongewijzigd t.o.v. huidig gedrag', () => {
    const out = detectDeficitLoanFromRows([row(50, 1_234)])
    expect(out).not.toBeNull()
    expect(out!.firstAge).toBe(50)
    expect(out!.peak).toBe(1_234)
  })

  it('gate werkt bínnen het endAge-venster: sub-euro vóór cutoff telt niet, ≥€1 wel', () => {
    // endAge 93 → cutoff 92. €0,30 op 80 (ruis), ≥€1 vanaf 85, staart op 95 buiten venster.
    const rows = [row(80, 0.3), row(85, 2_000), row(92, 3_000), row(95, 99_000)]
    const out = detectDeficitLoanFromRows(rows, { endAge: 93 })
    expect(out).not.toBeNull()
    expect(out!.firstAge).toBe(85)
    expect(out!.peak).toBe(3_000)
  })
})
