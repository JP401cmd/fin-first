/**
 * Integratie-test: Werk-strategie kasstromen door de v2-grootboek-engine.
 *
 * Verifieert dat (1) salarisgroei de vrijheidsleeftijd vervroegt, (2) minder
 * werken die verlaat, en (3) de `onlyWhileWorking`-gate salaris-inkomen NIET de
 * onttrekkingsfase in laat lekken (gegate = minder optimistisch dan ongegate).
 */
import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'
import type { SimCashflow } from '@/lib/fire-simulation'
import { runHorizonLedger } from '@/lib/horizon-engine'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { werkMetadataToCashflows } from '@/lib/werk-strategie'

function mkInput(over: Partial<UnifiedProjectionInput> = {}): UnifiedProjectionInput {
  const assets = [
    {
      id: 'a1',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: 120_000,
      expected_return: 7,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: null,
    } as unknown as Asset,
  ]
  return {
    assets,
    debts: [],
    currentAge: 40,
    endAge: 90,
    yearlyExpenses: 30_000,
    annualSavings: 15_000,
    monthlySurplus: 1_250,
    monthlyIncome: 5_000,
    incomeGrowthRate: 0,
    grossReturn: 0.07,
    inflationRate: 0.02,
    box3Method: 'forfaitair',
    cashflows: [],
    strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: { ...WITHDRAWAL_DEFAULTS },
    hasPartner: false,
    ...over,
  }
}

const ctx = { eventId: 'w', name: 'Werk', currentAge: 40 }

describe('Werk-strategie — engine-impact', () => {
  it('salarisgroei vervroegt (of behoudt) de vrijheidsleeftijd', () => {
    const base = runHorizonLedger(mkInput())
    const groei = runHorizonLedger(
      mkInput({
        cashflows: werkMetadataToCashflows(
          { huidigNettoMaand: 3000, reeleGroeiPct: 0.03, faseStappen: [], sprongen: [] },
          ctx,
        ),
      }),
    )
    expect(base.fireAge).not.toBeNull()
    expect(groei.fireAge).not.toBeNull()
    expect(groei.fireAge!).toBeLessThanOrEqual(base.fireAge!)
    // Op gelijke leeftijd in de opbouw: meer vermogen mét groei.
    expect(groei.rows[8]!.liquideVermogen).toBeGreaterThan(base.rows[8]!.liquideVermogen)
  })

  it('minder werken stelt de vrijheidsleeftijd uit (of behoudt)', () => {
    const base = runHorizonLedger(mkInput())
    const deeltijd = runHorizonLedger(
      mkInput({
        cashflows: werkMetadataToCashflows(
          { huidigNettoMaand: 3000, reeleGroeiPct: 0, faseStappen: [{ fromAge: 45, pct: 60 }], sprongen: [] },
          ctx,
        ),
      }),
    )
    expect(base.fireAge).not.toBeNull()
    if (deeltijd.fireAge != null) {
      expect(deeltijd.fireAge).toBeGreaterThanOrEqual(base.fireAge!)
    }
  })

  it('onlyWhileWorking-gate: gegate salaris-inkomen lekt niet de onttrekkingsfase in', () => {
    // Eenzelfde recurring inkomensstroom, één keer werk-gebonden en één keer niet.
    const flow = (onlyWhileWorking: boolean): SimCashflow[] => [
      {
        id: 'cf',
        name: 'extra',
        type: 'recurring',
        direction: 'income',
        amount: 1500,
        fromAge: 40,
        toAge: null,
        indexed: true,
        onlyWhileWorking,
      },
    ]
    const gated = runHorizonLedger(mkInput({ cashflows: flow(true) }))
    const ungated = runHorizonLedger(mkInput({ cashflows: flow(false) }))
    expect(gated.fireAge).not.toBeNull()
    expect(ungated.fireAge).not.toBeNull()
    // Ongegate inkomen blijft ná FIRE de onttrekking aanvullen → optimistischer
    // (vroegere) FIRE. De gate maakt het realistischer (later of gelijk).
    expect(gated.fireAge!).toBeGreaterThanOrEqual(ungated.fireAge!)
  })

  it('nul-traject = geen kasstromen = identiek aan baseline', () => {
    const base = runHorizonLedger(mkInput())
    const inert = runHorizonLedger(
      mkInput({
        cashflows: werkMetadataToCashflows(
          { huidigNettoMaand: 3000, reeleGroeiPct: 0, faseStappen: [], sprongen: [] },
          ctx,
        ),
      }),
    )
    expect(inert.fireAge).toBe(base.fireAge)
  })
})
