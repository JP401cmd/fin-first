import { describe, it, expect } from 'vitest'
import { compareMortgageVsInvest, type HvBParams } from '@/lib/hypotheek-vs-beleggen'

/**
 * FASE 6, item 5 — convergentie-routing van de HvB-FIRE-impact.
 *
 * Harde eis: routing UIT (geen argument / `kernelEnabled: false`) is byte-identiek
 * aan de bestaande v2-aanroep. Met FIRE-params + `kernelEnabled` + dob draait de
 * FIRE-impact op de horizon-kernel zonder te crashen.
 */

// Volledige params INCL. de optionele FIRE-velden (de dashboard-loader-samenvatting
// laat die weg → engine-arm onbereikt; deze test vult ze wél om de kernel-tak te raken).
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

describe('compareMortgageVsInvest — convergentie-routing', () => {
  it('geen routing ≡ kernelEnabled:false (byte-identiek)', () => {
    const noRouting = compareMortgageVsInvest(FIRE_PARAMS)
    const explicitOff = compareMortgageVsInvest(FIRE_PARAMS, { kernelEnabled: false })
    expect(noRouting).toEqual(explicitOff)
  })

  it('v2-tak levert een berekende FIRE-impact (fundament voor de A/B)', () => {
    const res = compareMortgageVsInvest(FIRE_PARAMS)
    expect(res.fireImpactMaanden).not.toBeNull()
    expect(typeof res.fireImpactMaanden).toBe('number')
  })

  it('kernelEnabled + dob draait de FIRE-impact op de kernel zonder te crashen', () => {
    const res = compareMortgageVsInvest(FIRE_PARAMS, { kernelEnabled: true, dateOfBirth: DOB })
    expect(res.fireImpactMaanden).not.toBeNull()
    expect(typeof res.fireImpactMaanden).toBe('number')
  })

  it('breakeven + aanbeveling zijn routing-onafhankelijk (deterministische schema’s)', () => {
    const v2 = compareMortgageVsInvest(FIRE_PARAMS)
    const kernel = compareMortgageVsInvest(FIRE_PARAMS, { kernelEnabled: true, dateOfBirth: DOB })
    // Alleen fireImpactMaanden mag per engine verschillen; de rest niet.
    expect(kernel.breakevenRendement).toBe(v2.breakevenRendement)
    expect(kernel.aanbeveling).toBe(v2.aanbeveling)
    expect(kernel.aflossing).toEqual(v2.aflossing)
    expect(kernel.beleggen).toEqual(v2.beleggen)
  })
})
