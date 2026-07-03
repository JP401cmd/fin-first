import { describe, it, expect } from 'vitest'
import type { StackedRow } from '@/lib/wealth-composition'
import type { HousingContext } from '@/lib/housing-strategy'
import { applyHousingToComposition, type ApplyHousingCompositionOpts } from './wealth-composition-housing'

/**
 * FIX 2 — `applyHousingToComposition` was kernel-onbewust. De horizon-kernel houdt
 * huis + hypotheek voor ELKE woonstrategie in het grootboek (net als v2, maar óók bij
 * exclude_from_fire). Een kernel-gebruiker met `horizonEngineV2 === false` viel in het
 * v1-injectie-pad → huis dubbel in de Opbouw-balken. Deze suite bewijst dat
 * `houseInLedger: true` (kernel) élke injectie overslaat, terwijl v1/v2 ongewijzigd
 * blijven.
 */

// Eén eigen-huis-asset (€400k, groeit) + één hypotheek (€200k, amortiseert).
const CTX: HousingContext = {
  hasEigenHuis: true,
  eigenHuisAssets: [
    { id: 'huis', asset_type: 'eigen_huis', is_active: true, current_value: 400_000, expected_return: 2, woz_value: 380_000, net_worth_inclusion_pct: 100 },
  ] as unknown as HousingContext['eigenHuisAssets'],
  eigenHuisMortgages: [
    { id: 'hyp', current_balance: 200_000, interest_rate: 3, monthly_payment: 900, repayment_type: 'annuity' },
  ] as unknown as HousingContext['eigenHuisMortgages'],
  eigenHuisValue: 400_000,
  wozValue: 380_000,
  mortgageBalance: 200_000,
  mortgageMonthlyPayment: 900,
} as unknown as HousingContext

function baseRows(): StackedRow[] {
  return [
    { age: 40, spaargeld: 10_000, beleggingen: 50_000, pensioen: 0, vastgoed: 0, overig: 0, schulden: 0, netWorth: 60_000 },
    { age: 45, spaargeld: 12_000, beleggingen: 70_000, pensioen: 0, vastgoed: 0, overig: 0, schulden: 0, netWorth: 82_000 },
  ] as unknown as StackedRow[]
}

function opts(over: Partial<ApplyHousingCompositionOpts>): ApplyHousingCompositionOpts {
  return {
    housingCfg: { mode: 'exclude_from_fire' },
    ctx: CTX,
    displayEvents: [],
    currentAgeFloor: 40,
    fireEndAge: 90,
    isV2: false,
    ...over,
  }
}

describe('applyHousingToComposition — kernel (houseInLedger)', () => {
  it('exclude_from_fire + houseInLedger → GEEN injectie (huis al in de rijen)', () => {
    const rows = baseRows()
    const out = applyHousingToComposition(rows, opts({ houseInLedger: true, housingCfg: { mode: 'exclude_from_fire' } }))
    // Byte-identiek aan de engine-rijen: vastgoed/schulden ongewijzigd.
    expect(out.map((r) => r.vastgoed)).toEqual([0, 0])
    expect(out.map((r) => r.schulden)).toEqual([0, 0])
  })

  it('downsize + houseInLedger → GEEN injectie', () => {
    const rows = baseRows()
    const out = applyHousingToComposition(rows, opts({
      houseInLedger: true,
      housingCfg: { mode: 'downsize', trigger: 'fixed_age', triggerAge: 70, depletionThresholdYears: 0, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null },
    }))
    expect(out.map((r) => r.vastgoed)).toEqual([0, 0])
  })
})

describe('applyHousingToComposition — v1/v2 ongewijzigd (houseInLedger afwezig)', () => {
  it('v1 exclude_from_fire → huis + hypotheek WEL geïnjecteerd (bestaand gedrag)', () => {
    const rows = baseRows()
    const out = applyHousingToComposition(rows, opts({ isV2: false, housingCfg: { mode: 'exclude_from_fire' } }))
    // Huis groeit → vastgoed > 0 op beide rijen; hypotheek → schulden negatief.
    expect(out[0].vastgoed).toBeGreaterThan(0)
    expect(out[0].schulden).toBeLessThan(0)
  })

  it('v2 downsize → GEEN injectie (bestaand gedrag, ongewijzigd)', () => {
    const rows = baseRows()
    const out = applyHousingToComposition(rows, opts({
      isV2: true,
      housingCfg: { mode: 'downsize', trigger: 'fixed_age', triggerAge: 70, depletionThresholdYears: 0, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null },
    }))
    expect(out.map((r) => r.vastgoed)).toEqual([0, 0])
  })
})
