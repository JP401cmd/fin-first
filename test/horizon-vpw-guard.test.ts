/**
 * Regressie — VPW × legacy/perpetual/pensioen is onverenigbaar (engine-level guard).
 *
 * VPW (`applyVpw`, lib/withdrawal-strategy.ts) onttrekt per definitie het volledige
 * restant binnen de horizon (vpwRate = 1.0 in het laatste jaar → portfolio → ~€0),
 * wat structureel botst met nalatenschap (legacy), eeuwigdurend vermogensbehoud
 * (perpetual) en de vaste pensioen-onttrekking. v1 had hiervoor een expliciet
 * block (fire-simulation.ts, vóór 1417a4568); v2 (`runHorizonLedger`) miste het,
 * waardoor:
 *   • vpw×legacy   → fireReachable=false ("verhoog je spaarquote", misleidend);
 *   • vpw×perpetual → stil fireReachable=true op fireAge=100 met €0 eindvermogen.
 *
 * De guard retourneert nu een leeg/onbereikbaar resultaat (rows:[], fireAge:null,
 * fireReachable:false). VPW × deplete blijft gewoon bereikbaar (control).
 */

import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'
import { runHorizonLedger } from '@/lib/horizon-engine'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'

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
    withdrawalStrategy: { ...WITHDRAWAL_DEFAULTS, strategy: 'vpw' },
    hasPartner: false,
    ...over,
  }
}

describe('VPW × eindstrategie-guard (engine-level)', () => {
  it('vpw × legacy → onbereikbaar + leeg (geen misleidende "spaar meer")', () => {
    const r = runHorizonLedger(
      mkInput({ strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount: 50_000 } }),
    )
    expect(r.fireReachable).toBe(false)
    expect(r.fireAge).toBeNull()
    expect(r.fireAgeFractional).toBeNull()
    expect(r.rows).toHaveLength(0)
    expect(r.vNodig).toHaveLength(0)
    expect(r.legacyTargetUnavoidablyExceeded).toBe(false)
    // De resultaat-shape blijft compleet (drop-in voor de adapter/toSimResult).
    expect(r.strategy).toBe('legacy')
    expect(r.displayEndAge).toBe(90)
  })

  it('vpw × perpetual → onbereikbaar + leeg (niet langer stil fireAge=100 op €0)', () => {
    const r = runHorizonLedger(
      mkInput({ strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 } }),
    )
    expect(r.fireReachable).toBe(false)
    expect(r.fireAge).toBeNull()
    expect(r.rows).toHaveLength(0)
    expect(r.vNodig).toHaveLength(0)
    expect(r.strategy).toBe('perpetual')
  })

  it('vpw × pensioen → onbereikbaar + leeg', () => {
    const r = runHorizonLedger(
      mkInput({
        forcedFireAge: 67,
        strategyConfig: { strategy: 'pensioen', endAge: 90, legacyAmount: 0 },
      }),
    )
    expect(r.fireReachable).toBe(false)
    expect(r.fireAge).toBeNull()
    expect(r.rows).toHaveLength(0)
  })

  it('CONTROL — vpw × deplete blijft gewoon bereikbaar (geen guard)', () => {
    const r = runHorizonLedger(
      mkInput({ strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 } }),
    )
    expect(r.fireReachable).toBe(true)
    expect(r.fireAge).not.toBeNull()
    expect(r.rows.length).toBeGreaterThan(0)
  })

  it('CONTROL — static × legacy/perpetual is NIET geblokkeerd (alleen vpw)', () => {
    const legacyStatic = runHorizonLedger(
      mkInput({
        withdrawalStrategy: { ...WITHDRAWAL_DEFAULTS, strategy: 'static' },
        annualSavings: 30_000,
        monthlySurplus: 30_000 / 12,
        strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount: 50_000 },
      }),
    )
    // De guard mag static niet raken: rows blijven gevuld (bereikbaarheid hangt
    // af van de spaarkracht, niet van een onverenigbaarheid).
    expect(legacyStatic.rows.length).toBeGreaterThan(0)
  })
})
