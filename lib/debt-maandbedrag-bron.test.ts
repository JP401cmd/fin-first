/**
 * Het opgeslagen maandbedrag is de bron; de einddatum is een plan.
 *
 * Een schuldrij kan twee dingen tegelijk beweren: een `monthly_payment` (wat er
 * werkelijk van de rekening gaat) en een `end_date` (wanneer het klaar zou
 * moeten zijn). Die twee kunnen elkaar tegenspreken, en dan moet één winnen.
 *
 * Er waren drie antwoorden in omloop:
 *   - `debtProjection`               → maandbedrag wint
 *   - `computeRenteAflossingsSplit`  → einddatum wint (herrekende PMT)
 *   - `debtRemainingMonths`          → einddatum wint
 *
 * Gemeten op één schuld (€ 9.000, 5%, € 125 p/m, einddatum 2036) leverde dat
 * 85, 119 én 103 maanden op. Op productie liep het door tot in de spaarquote en
 * de FIRE-datum: een hypotheek met € 1.742,57 p/m werd door de split als
 * € 2.121,84 gerekend — € 379 per maand aan aflossing die niemand betaalt.
 *
 * Dit is de tweede helft van bug H2 (aug 2026); de eerste helft (de wizard die
 * een einddatum verzon) is toen wél gerepareerd. Zie de curatie in
 * `lib/architecture/calculations.ts`.
 *
 * Norm: is er een maandbedrag, dan is dát de bron en volgt de looptijd eruit.
 * De einddatum is de terugval voor rijen zónder maandbedrag.
 */
import { describe, it, expect } from 'vitest'
import { computeRenteAflossingsSplit, debtProjection, deriveRemainingMonths, type Debt } from './debt-data'
import { debtRemainingMonths } from './debt-remaining-term'

const base = {
  id: 'd', user_id: 'u', name: 'test', original_amount: 15000,
  creditor: null, notes: null, is_active: true, sort_order: 0,
  created_at: '', updated_at: '', subtype: null, is_tax_deductible: null,
  fixed_rate_end_date: null, nhg: null, linked_asset_id: null, credit_limit: null,
  draagkrachtmeting_date: null, tax_year: null, has_payment_plan: false,
  has_written_agreement: false, ownership: 'personal', household_id: null,
  partner_split_pct: null, net_worth_inclusion_pct: 100,
  include_aflossing_in_savings: false, custom_aflossing_amount: null,
  has_hypotheekplanner_tracking: false, start_date: '2023-01-01',
} as unknown as Debt

const mk = (over: Partial<Debt>): Debt => ({ ...base, ...over }) as Debt

/** Ver in de toekomst, zodat de einddatum een ándere looptijd impliceert. */
const VER_WEG = '2036-08-12'

describe('maandbedrag wint van einddatum', () => {
  it('lineair: de split rekent met het opgeslagen maandbedrag, niet met saldo/looptijd', () => {
    const d = mk({ debt_type: 'dga_schuld', repayment_type: 'lineair', current_balance: 9000, interest_rate: 5, monthly_payment: 125, end_date: VER_WEG })
    const split = computeRenteAflossingsSplit(d)!
    expect(split.monthlyPayment).toBe(125)
    // rente = 9000 × 5% / 12 = 37,50 → aflossing = 125 − 37,50
    expect(split.currentRente).toBeCloseTo(37.5, 2)
    expect(split.currentAflossing).toBeCloseTo(87.5, 2)
  })

  it('annuïteit: idem — geen PMT-herberekening over de einddatum', () => {
    const d = mk({ debt_type: 'mortgage', repayment_type: 'annuiteit', current_balance: 300000, interest_rate: 3.1, monthly_payment: 1280, end_date: '2044-06-01' })
    const split = computeRenteAflossingsSplit(d)!
    expect(split.monthlyPayment).toBe(1280)
    expect(split.currentRente).toBeCloseTo(775, 0)
    expect(split.currentAflossing).toBeCloseTo(505, 0)
  })

  it('zonder maandbedrag valt de split terug op de einddatum', () => {
    const d = mk({ debt_type: 'mortgage', repayment_type: 'annuiteit', current_balance: 300000, interest_rate: 3.1, monthly_payment: 0, end_date: '2044-06-01' })
    const split = computeRenteAflossingsSplit(d)!
    // PMT over de resterende looptijd — beter een plan dan geen getal.
    expect(split.monthlyPayment).toBeGreaterThan(1500)
  })

  it('de resterende looptijd volgt het maandbedrag, niet de einddatum', () => {
    const d = mk({ debt_type: 'dga_schuld', repayment_type: 'lineair', current_balance: 9000, interest_rate: 5, monthly_payment: 125, end_date: VER_WEG })
    const now = new Date('2026-09-06T00:00:00Z')
    // 9000 / (125 − 37,50) = 103 maanden; de einddatum zou 119 zeggen.
    expect(debtRemainingMonths(d, now)).toBe(103)
  })

  it('zonder maandbedrag blijft de einddatum de bron voor de looptijd', () => {
    const d = mk({ debt_type: 'dga_schuld', repayment_type: 'lineair', current_balance: 9000, interest_rate: 5, monthly_payment: 0, end_date: VER_WEG })
    const now = new Date('2026-09-06T00:00:00Z')
    expect(debtRemainingMonths(d, now)).toBeGreaterThan(100)
  })
})

describe('één afleiding voor de lineaire looptijd', () => {
  /**
   * `debtProjection` benaderde de lineaire looptijd met de HALVE rente
   * (`payment − balance × maandrente / 2`, een gemiddelde-rente-aanname),
   * terwijl `deriveRemainingMonths` de volle rente over het huidige saldo
   * aftrekt. Bij lineair is het opgeslagen maandbedrag de HUIDIGE termijn —
   * dus de volle rente — en dat is de afleiding die wint.
   */
  it('debtProjection en deriveRemainingMonths geven dezelfde looptijd', () => {
    const d = mk({ debt_type: 'dga_schuld', repayment_type: 'lineair', current_balance: 9000, interest_rate: 5, monthly_payment: 125, end_date: null })
    const proj = debtProjection(d)
    const derived = deriveRemainingMonths(9000, 125, 5, 'lineair', new Date())
    expect(proj.isPayable).toBe(true)
    expect(proj.monthsToPayoff).toBe(derived)
  })

  it('en ook mét einddatum, want die telt niet meer mee', () => {
    const d = mk({ debt_type: 'dga_schuld', repayment_type: 'lineair', current_balance: 9000, interest_rate: 5, monthly_payment: 125, end_date: VER_WEG })
    const split = computeRenteAflossingsSplit(d)!
    expect(split.remainingMonths).toBe(debtProjection(d).monthsToPayoff)
  })
})

/**
 * De plausibiliteitsgrens (600 maanden) en "de betaling dekt de rente niet"
 * zijn twee verschillende dingen. `deriveRemainingMonths` geeft op allebei
 * `null`; een caller die dat als één ding leest, noemt een gezonde schuld
 * onbetaalbaar. Dat gebeurde: de lineaire tak van `debtProjection` gaf een
 * rood alarm én voedde Fin met "betaling dekt rente niet!" voor een schuld die
 * € 479 per maand aflost.
 */
describe('lange looptijd is geen onbetaalbaarheid', () => {
  const lang = mk({
    debt_type: 'mortgage', repayment_type: 'lineair',
    current_balance: 350000, interest_rate: 3.5, monthly_payment: 1500, end_date: '2045-01-01',
  })

  it('een lineaire schuld boven de 600-maandsgrens blijft aflosbaar', () => {
    const proj = debtProjection(lang)
    expect(proj.isPayable).toBe(true)
    expect(proj.unpayableReason).toBeUndefined()
    // rente € 1.020,83 → aflossing € 479,17 → 731 maanden
    expect(proj.monthsToPayoff).toBe(731)
  })

  it('de KPI haakt daar bewust wél af — dat is de grens, geen tegenspraak', () => {
    expect(debtRemainingMonths(lang, new Date())).not.toBe(731)
  })
})

describe('remainingMonths van de split is altijd een bruikbaar getal', () => {
  it('geen NaN bij 0% rente boven de grens', () => {
    const d = mk({
      debt_type: 'other', repayment_type: 'annuiteit',
      current_balance: 100000, interest_rate: 0, monthly_payment: 100, end_date: '2036-01-01',
    })
    const split = computeRenteAflossingsSplit(d)!
    expect(Number.isFinite(split.remainingMonths)).toBe(true)
    expect(split.remainingMonths).toBeLessThanOrEqual(600)
  })

  it('geen absurde looptijd wanneer de aflossing tegen nul aan ligt', () => {
    const d = mk({
      debt_type: 'mortgage', repayment_type: 'lineair',
      current_balance: 500000, interest_rate: 3.5, monthly_payment: 1458.34, end_date: null,
    })
    const split = computeRenteAflossingsSplit(d)!
    expect(split.remainingMonths).toBeLessThanOrEqual(600)
  })

  it('valt terug op de einddatum als de betaling de rente niet dekt', () => {
    // € 900 p/m op € 300.000 à 4% — de rente alleen al is € 1.000.
    const d = mk({
      debt_type: 'mortgage', repayment_type: 'annuiteit',
      current_balance: 300000, interest_rate: 4, monthly_payment: 900, end_date: '2045-01-01',
    })
    const split = computeRenteAflossingsSplit(d)!
    // 0 zou als "afgelost" lezen; de einddatum is dan het eerlijkste getal.
    expect(split.remainingMonths).toBeGreaterThan(100)
    expect(split.currentAflossing).toBe(0)
  })

  it('rentePercentage blijft binnen [0,100] voor de gestapelde balk', () => {
    const d = mk({
      debt_type: 'mortgage', repayment_type: 'annuiteit',
      current_balance: 300000, interest_rate: 4, monthly_payment: 900, end_date: null,
    })
    const split = computeRenteAflossingsSplit(d)!
    expect(split.rentePercentage).toBeLessThanOrEqual(100)
    expect(split.rentePercentage).toBeGreaterThanOrEqual(0)
  })
})
