import { describe, it, expect } from 'vitest'
import { compareMortgageVsInvest, type HvBParams } from '@/lib/hypotheek-vs-beleggen'

/**
 * FASE 6 stap 5A — hypotheek-vs-beleggen kernel-only contract-tests.
 *
 * De v2-A/B-routing (`kernelEnabled` op `HvBKernelRouting`) is fysiek verwijderd samen met
 * de v2-grootboek-engine. `compareMortgageVsInvest` heeft nu de signatuur
 * `(params, routing?: { dateOfBirth?: string | null })` — de FIRE-impact draait
 * onvoorwaardelijk op de horizon-kernel; de enige gate is de aanwezigheid van
 * `dateOfBirth` (de kernel kan zonder geboortedatum geen tijdas bouwen). De vorige
 * "A/B-routing"-cases (geen routing ≡ kernelEnabled:false, v2-tak levert impact) zijn
 * vervangen: er is geen tweede motor meer om tegen te vergelijken — enkel het
 * aanwezig/afwezig-contract van `dateOfBirth`.
 */

// Volledige params INCL. de optionele FIRE-velden (de dashboard-loader-samenvatting
// laat die weg → geen kernel-run bereikt; deze test vult ze wél om de kernel-tak te raken).
const FIRE_PARAMS: HvBParams = {
  extraBedrag: 200,
  hypotheekBalance: 300_000,
  rente: 3.5,
  repaymentType: 'annuity',
  restLooptijd: 300,
  isTaxDeductible: true,
  marginaalTarief: 0.3697,
  verwachtRendement: 0.07,
  inflatie: 0.02,
  hasPartner: false,
  horizonJaren: 10,
  currentAge: 40,
  currentPortfolio: 250_000,
  yearlyExpenses: 30_000,
  annualSavings: 24_000,
  cashflows: [],
}

const DOB = '1986-01-01'

describe('compareMortgageVsInvest — kernel-only FIRE-impact', () => {
  it('geen routing → fireImpactMaanden null (geen geboortedatum, geen kernel-tijdas)', () => {
    const res = compareMortgageVsInvest(FIRE_PARAMS)
    expect(res.fireImpactMaanden).toBeNull()
  })

  it('routing zonder dateOfBirth → fireImpactMaanden null (zelfde gate)', () => {
    const res = compareMortgageVsInvest(FIRE_PARAMS, {})
    expect(res.fireImpactMaanden).toBeNull()
  })

  it('routing met dateOfBirth → fireImpactMaanden is een getal (kernel draait zonder te crashen)', () => {
    const res = compareMortgageVsInvest(FIRE_PARAMS, { dateOfBirth: DOB })
    expect(res.fireImpactMaanden).not.toBeNull()
    expect(typeof res.fireImpactMaanden).toBe('number')
    expect(Number.isFinite(res.fireImpactMaanden)).toBe(true)
  })

  it('meer sparen (beleggen-scenario) brengt FIRE nooit later dan het aflossen-scenario', () => {
    // extraBedrag > 0 verhoogt annualSavings in het beleggen-scenario; bij gelijk
    // rendement/uitgaven kan dat de FIRE-leeftijd nooit verslechteren.
    const res = compareMortgageVsInvest(FIRE_PARAMS, { dateOfBirth: DOB })
    expect(res.fireImpactMaanden).not.toBeNull()
    expect(res.fireImpactMaanden as number).toBeGreaterThanOrEqual(0)
  })

  it('breakeven + aanbeveling + aflossing/beleggen-scenario zijn routing-onafhankelijk (deterministische schema’s)', () => {
    const zonderDob = compareMortgageVsInvest(FIRE_PARAMS)
    const metDob = compareMortgageVsInvest(FIRE_PARAMS, { dateOfBirth: DOB })
    // Alleen fireImpactMaanden mag verschillen (null vs. kernel-getal); de rest niet —
    // aflossing/beleggen/breakeven/aanbeveling draaien op deterministische amortisatie-/
    // groeischema's, niet op de FIRE-engine.
    expect(metDob.breakevenRendement).toBe(zonderDob.breakevenRendement)
    expect(metDob.aanbeveling).toBe(zonderDob.aanbeveling)
    expect(metDob.aflossing).toEqual(zonderDob.aflossing)
    expect(metDob.beleggen).toEqual(zonderDob.beleggen)
    expect(metDob.jaarlijkseVergelijking).toEqual(zonderDob.jaarlijkseVergelijking)
    expect(metDob.verschil).toBe(zonderDob.verschil)
  })

  it('extraBedrag=0 → early-return blijft ongewijzigd (fireImpactMaanden altijd null, ook mét dob)', () => {
    const params: HvBParams = { ...FIRE_PARAMS, extraBedrag: 0 }
    const res = compareMortgageVsInvest(params, { dateOfBirth: DOB })
    expect(res.fireImpactMaanden).toBeNull()
    expect(res.aanbeveling).toBe('gelijk')
  })

  it('ontbrekende FIRE-basisvelden (geen currentAge) → fireImpactMaanden null, ook met dob', () => {
    const { currentAge: _currentAge, ...rest } = FIRE_PARAMS
    const res = compareMortgageVsInvest(rest as HvBParams, { dateOfBirth: DOB })
    expect(res.fireImpactMaanden).toBeNull()
  })
})
