import { describe, it, expect } from 'vitest'
import { deriveRealMonthTotals, isIncomeRow } from './cashflow-month-totals'
import { deriveRealMonthTotals as reExported } from './cashflow-kpis'
import { currentMonthSavingsRate } from './cashflow-cards'
import { savingsRateFromAggregates } from './savings-source'

// ── Bevinding H6 — "Twee schermen, één begrip, tegengesteld teken" ───────────
//
// De figures-strip op /overzicht/budget draaide een EIGEN tel-lus die op vier
// assen afweek van de canonieke maandmotor. Deze suite legt per as vast wat de
// canonieke uitkomst is, met een rijenset die alle vier tegelijk raakt — precies
// de probe uit de kaart-analyse.
//
// TOLERANTIE: exact (`toBe` op afgeronde centen / `toBeCloseTo` met 2 decimalen
// waar een deling in het spel is). Dat is bewust ABSOLUUT en niet relatief: dit
// zijn bedragen van enkele duizenden euro's waar het verschil dat we bewaken
// (€11,88 in de bevinding, hier €161,88) ordes van grootte boven een centafronding
// ligt. Een relatieve tolerantie zou juist dít soort residu wegpoetsen — dat is
// de foutklasse waar H6 over gaat.

/** De rijenset uit de bevinding: één maand, vier afwijkende assen tegelijk. */
const ROWS = [
  // Gewone uitgaven — beide conventies zijn het eens.
  { amount: -2_446.45, is_income: false, transaction_type: null, account_id: 'acc-1' },
  { amount: -1_000.00, is_income: false, transaction_type: null, account_id: 'acc-1' },
  // Gewoon inkomen.
  { amount: 950.00, is_income: true, transaction_type: null, account_id: 'acc-1' },
  // AS (a): positief bedrag met is_income=false. Canoniek = INKOMEN (teken),
  // de oude strip telde 'm als uitgave.
  { amount: 150.00, is_income: false, transaction_type: null, account_id: 'acc-1' },
  // AS (b): joint_transfer. Canoniek = genegeerd; de oude strip filterde alleen
  // op 'transfer' en telde deze dus als echte uitgave mee.
  { amount: -11.88, is_income: false, transaction_type: 'joint_transfer', account_id: 'acc-1' },
  // AS (c): rij zonder getrackte rekening. Canoniek = telt mee; de oude strip
  // scoopte op `.in('account_id', accountIds)` en liet 'm vallen.
  { amount: -100.00, is_income: false, transaction_type: null, account_id: null },
  // Gewone transfer — beide conventies negeren deze.
  { amount: -500.00, is_income: false, transaction_type: 'transfer', account_id: 'acc-1' },
]

/**
 * De strip-pass ZOALS HIJ WAS, letterlijk nagebouwd — puur als tegenhanger in
 * deze test. Staat bewust hier en niet in productiecode: hij bestaat alleen om
 * te bewijzen dát de vier assen een verschil maakten, zodat een toekomstige
 * "vereenvoudiging" terug naar `is_income` meteen rood wordt.
 */
function legacyStripPass(
  rows: typeof ROWS,
  trackedAccountIds: string[],
): { income: number; expenses: number; savingsRatePct: number } {
  const scoped = rows.filter((r) => r.account_id != null && trackedAccountIds.includes(r.account_id))
  const nonTransfer = scoped.filter((r) => r.transaction_type !== 'transfer')
  const income = nonTransfer.filter((r) => r.is_income).reduce((s, r) => s + r.amount, 0)
  const expenses = nonTransfer.filter((r) => !r.is_income).reduce((s, r) => s + Math.abs(r.amount), 0)
  const net = income - expenses
  return { income, expenses, savingsRatePct: income > 0 ? (net / income) * 100 : 0 }
}

describe('deriveRealMonthTotals — de canonieke maandtotalen (H6)', () => {
  it('classificeert op het TEKEN van amount, niet op is_income', () => {
    const totals = deriveRealMonthTotals([
      { amount: 150, transaction_type: null },
      { amount: -150, transaction_type: null },
    ])
    expect(totals).toEqual({ income: 150, expenses: 150 })

    // Het predicaat los, zodat oppervlakken met een eigen onderverdeling
    // (budget-oprol, dag-grafiek, kassabon) dezelfde grens gebruiken.
    expect(isIncomeRow({ amount: 150 })).toBe(true)
    expect(isIncomeRow({ amount: -150 })).toBe(false)
    // Nul is geen inkomen — het valt in de uitgaven-tak (Math.abs(0) = 0), dus
    // het beïnvloedt geen van beide totalen.
    expect(isIncomeRow({ amount: 0 })).toBe(false)
    expect(deriveRealMonthTotals([{ amount: 0, transaction_type: null }])).toEqual({ income: 0, expenses: 0 })
  })

  it('negeert ZOWEL transfer ALS joint_transfer', () => {
    const totals = deriveRealMonthTotals([
      { amount: -100, transaction_type: 'transfer' },
      { amount: -200, transaction_type: 'joint_transfer' },
      { amount: -300, transaction_type: null },
    ])
    expect(totals).toEqual({ income: 0, expenses: 300 })
  })

  it('accepteert numerieke strings (Supabase levert NUMERIC als string)', () => {
    // MCP/PostgREST kunnen NUMERIC als JSON-string leveren; zonder Number() zou
    // '150' + 0 hier '1500' worden. Deze assertie pint de cast vast.
    const totals = deriveRealMonthTotals([
      { amount: '150.50', transaction_type: null },
      { amount: '-99.50', transaction_type: null },
    ])
    expect(totals.income).toBeCloseTo(150.5, 2)
    expect(totals.expenses).toBeCloseTo(99.5, 2)
  })

  it('scoopt NIET op rekening — een rij zonder account_id telt gewoon mee', () => {
    const totals = deriveRealMonthTotals([
      { amount: -100, transaction_type: null },
      { amount: -50, transaction_type: null },
    ])
    expect(totals.expenses).toBe(150)
  })

  it('lib/cashflow-kpis.ts re-exporteert exact dezelfde functie na de verhuizing', () => {
    // Bewijst dat de verplaatsing naar de bladmodule geen tweede implementatie
    // heeft opgeleverd — de identiteit, niet alleen de uitkomst.
    expect(reExported).toBe(deriveRealMonthTotals)
  })
})

describe('H6 — de vier assen samen, op één rijenset', () => {
  const canonical = deriveRealMonthTotals(ROWS)
  const legacy = legacyStripPass(ROWS, ['acc-1'])

  it('canoniek: inkomen telt het positieve bedrag met is_income=false mee', () => {
    // 950 + 150 = 1.100
    expect(canonical.income).toBeCloseTo(1_100.0, 2)
  })

  it('canoniek: uitgaven laten beide transfer-types vallen en nemen de rij zonder rekening mee', () => {
    // 2.446,45 + 1.000 + 100 = 3.546,45 (de joint_transfer van 11,88 en de
    // transfer van 500 tellen niet mee; de 150 is inkomen geworden).
    expect(canonical.expenses).toBeCloseTo(3_546.45, 2)
  })

  it('de oude strip-pass kwam op ANDERE cijfers uit — dát was de bug', () => {
    // 950 in; uitgaven 2.446,45 + 1.000 + 150 + 11,88 = 3.608,33.
    expect(legacy.income).toBeCloseTo(950.0, 2)
    expect(legacy.expenses).toBeCloseTo(3_608.33, 2)

    const canonicalNet = canonical.income - canonical.expenses
    const legacyNet = legacy.income - legacy.expenses
    expect(canonicalNet).toBeCloseTo(-2_446.45, 2)
    expect(legacyNet).toBeCloseTo(-2_658.33, 2)
    // Het residu is de optelsom van de drie eerste assen — de vorm van de €11,88
    // uit de bevinding. Absolute tolerantie: zie de kop van dit bestand.
    expect(legacyNet - canonicalNet).toBeCloseTo(-211.88, 2)
  })

  it('de spaarquote verschilt navenant, en de canonieke loopt via één formule', () => {
    const canonicalRate = currentMonthSavingsRate(canonical.income, canonical.expenses)
    const legacyRate = legacy.savingsRatePct

    // Canoniek: (1100 − 3546,45) / 1100 × 100 ≈ −222,4%
    expect(canonicalRate).not.toBeNull()
    expect(canonicalRate as number).toBeCloseTo(-222.4, 1)
    // Oud: (950 − 3608,33) / 950 × 100 ≈ −279,8% — de familie waar de −381% uit
    // de bevinding uit komt.
    expect(legacyRate).toBeCloseTo(-279.8, 1)

    // En de canonieke waarde is letterlijk de canonieke formule, niet een eigen
    // deling die er toevallig op lijkt.
    expect(canonicalRate).toBe(savingsRateFromAggregates(canonical.income, canonical.expenses, 0))
  })
})

describe('currentMonthSavingsRate — de gedeelde maand-spaarquote (H6)', () => {
  it('geeft null bij €0 inkomen — "niet te zeggen", niet "0% gespaard"', () => {
    expect(currentMonthSavingsRate(0, 1_200)).toBeNull()
    expect(currentMonthSavingsRate(0, 0)).toBeNull()
  })

  it('is de canonieke formule zonder aflossings- of spaarbudget-correctie', () => {
    expect(currentMonthSavingsRate(4_000, 3_000)).toBeCloseTo(25, 6)
    expect(currentMonthSavingsRate(4_000, 3_000)).toBe(savingsRateFromAggregates(4_000, 3_000, 0))
  })

  it('een tekortmaand geeft een negatieve quote, niet een klem op 0', () => {
    expect(currentMonthSavingsRate(950, 4_446.45)).toBeLessThan(-300)
  })
})
