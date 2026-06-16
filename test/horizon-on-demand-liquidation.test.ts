import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { AssetLiquidation, UnifiedProjectionInput } from '@/lib/unified-projection'
import { runHorizonLedger } from '@/lib/horizon-engine'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'

// ── In-loop "wanneer nodig"-verkoop IN de engine (Optie A, ADR 0020) ──────────
//
// De engine verkoopt een `on_demand`-niet-liquide asset zodra de liquide pot een
// tekort niet meer dekt — en pas dan. De verkoopvolgorde bij meerdere on_demand-
// assets = de bestaande onttrekkingsvolgorde (minst-liquide laatst, eigen_huis
// allerlaatst). `fixed_age` blijft op zijn vaste leeftijd verkopen.

function mk(
  rows: [id: string, name: string, type: Asset['asset_type'], value: number, ret: number, dep: number | null][],
): Asset[] {
  return rows.map(
    ([id, name, asset_type, current_value, expected_return, depreciation_rate]) =>
      ({
        id,
        name,
        asset_type,
        current_value,
        expected_return,
        depreciation_rate,
        is_active: true,
        net_worth_inclusion_pct: 100,
      }) as unknown as Asset,
  )
}

/** Basis-input: gestopt met werken (forcedFireAge=startAge), deplete, geen events. */
function baseInput(
  assets: Asset[],
  liquidations: AssetLiquidation[] | undefined,
  overrides: Partial<UnifiedProjectionInput> = {},
): UnifiedProjectionInput {
  return {
    assets,
    debts: [],
    currentAge: 67,
    endAge: 90,
    yearlyExpenses: 30000,
    annualSavings: 0,
    monthlySurplus: 0,
    monthlyIncome: 0,
    incomeGrowthRate: 0,
    grossReturn: 0.05,
    inflationRate: 0.02,
    box3Method: 'forfaitair',
    cashflows: [],
    strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    forcedFireAge: 67, // direct in onttrekkingsfase
    hasPartner: true,
    bankAccountCash: 0,
    assetLiquidations: liquidations,
    ...overrides,
  }
}

const physicalAt = (r: ReturnType<typeof runHorizonLedger>, age: number, type: Asset['asset_type']) =>
  r.rows.find((x) => x.leeftijd === age)?.assets.find((a) => a.type === type)?.eind ?? 0

describe('on-demand asset-liquidatie in de engine (Optie A)', () => {
  // AC-A: on_demand wordt verkocht zodra liquide tekortschiet. Liquide buffer
  // (75k cash) dekt ~2 jaar uitgaven (30k/jr) → de caravan wordt pas in een later
  // jaar verkocht (niet meteen jaar 1), zodat het vóór/ná-onderscheid betekenis heeft.
  it('AC-A: on_demand verkocht zodra liquide pot tekortschiet, netto vermogen continu', () => {
    const assets = mk([
      ['cash', 'Spaar', 'cash', 75000, 0, null],
      ['caravan', 'Stacaravan', 'physical', 200000, 0, null],
    ])
    const liq: AssetLiquidation[] = [
      { assetId: 'caravan', age: Number.POSITIVE_INFINITY, trigger: 'on_demand', salePricePct: 1, salesCostsPct: 0.02, payoffDebtIds: [] },
    ]
    const r = runHorizonLedger(baseInput(assets, liq))

    // Caravan staat er aanvankelijk nog (verkoopt niet meteen in jaar 1, want de
    // 10k cash dekt het eerste tekort grotendeels). Maar binnen de horizon wordt
    // hij verkocht zodra het nodig is.
    const sold = r.rows.find((x) => (x.assets.find((a) => a.type === 'physical')?.uitstroom ?? 0) > 0)
    expect(sold).toBeDefined()
    const saleAge = sold!.leeftijd

    // Vóór de verkoop bestaat de caravan nog; ná de verkoop is hij weg.
    expect(physicalAt(r, saleAge - 1, 'physical')).toBeGreaterThan(0)
    expect(physicalAt(r, saleAge, 'physical')).toBeLessThan(1)

    // Netto vermogen continu over het verkoopjaar (alleen −verkoopkosten −uitgaven;
    // geen sprong omhoog uit het niets).
    const pre = r.rows.find((x) => x.leeftijd === saleAge - 1)!
    const at = r.rows.find((x) => x.leeftijd === saleAge)!
    expect(at.nettoVermogen).toBeLessThanOrEqual(pre.nettoVermogen)
    expect(Math.abs(at.nettoVermogen - pre.nettoVermogen)).toBeLessThan(pre.nettoVermogen * 0.2)
  })

  // AC-A2: verkoop dekt het tekort MEER dan nodig (lumpy) → overschot blijft als
  // liquide pot staan voor latere jaren (geen tweede onnodige verkoop).
  it('AC-A2: lumpy verkoop → overschot blijft liquide, geen onnodige tweede verkoop', () => {
    const assets = mk([
      ['cash', 'Spaar', 'cash', 5000, 0, null],
      ['caravan', 'Stacaravan', 'physical', 200000, 0, null],
    ])
    const liq: AssetLiquidation[] = [
      { assetId: 'caravan', age: Number.POSITIVE_INFINITY, trigger: 'on_demand', salePricePct: 1, salesCostsPct: 0.02, payoffDebtIds: [] },
    ]
    const r = runHorizonLedger(baseInput(assets, liq))
    const saleYears = r.rows.filter((x) => (x.assets.find((a) => a.type === 'physical')?.uitstroom ?? 0) > 0)
    // De caravan wordt precies één keer verkocht.
    expect(saleYears.length).toBe(1)
    // In het jaar ná de verkoop is er nog liquide vermogen (overschot bleef staan).
    const after = r.rows.find((x) => x.leeftijd === saleYears[0].leeftijd + 1)
    expect(after?.liquideVermogen ?? 0).toBeGreaterThan(0)
  })

  // AC-B: niet_verkopen-equivalent: GEEN liquidatie-entry → asset blijft staan,
  // byte-identiek aan huidig gedrag (geen in-loop verkoop).
  it('AC-B: geen liquidatie-entry → asset blijft staan tot endAge', () => {
    const assets = mk([
      ['cash', 'Spaar', 'cash', 10000, 0, null],
      ['caravan', 'Stacaravan', 'physical', 200000, 0, null],
    ])
    const r = runHorizonLedger(baseInput(assets, undefined))
    const last = r.rows[r.rows.length - 1]
    expect(last.assets.some((a) => a.type === 'physical' && a.eind > 0)).toBe(true)
  })

  // AC-C: fixed_age → asset eind ~€0 op leeftijd X, onafhankelijk van tekort.
  it('AC-C: fixed_age verkoopt op de vaste leeftijd ongeacht liquiditeit', () => {
    const assets = mk([
      ['cash', 'Spaar', 'cash', 500000, 0, null], // ruim genoeg liquide; geen tekort
      ['caravan', 'Stacaravan', 'physical', 25000, 0, null],
    ])
    const liq: AssetLiquidation[] = [
      { assetId: 'caravan', age: 73, trigger: 'fixed_age', salePricePct: 1, salesCostsPct: 0.02, payoffDebtIds: [] },
    ]
    const r = runHorizonLedger(baseInput(assets, liq))
    expect(physicalAt(r, 72, 'physical')).toBeGreaterThan(0)
    expect(physicalAt(r, 73, 'physical')).toBeLessThan(1)
  })

  // AC-D: meerdere on_demand-assets → deterministische volgorde. Met een vehicle
  // én een physical: de onttrekkingsvolgorde (DEFAULT_WITHDRAWAL_ORDER) zet
  // vehicle vóór physical. Bij een tekort wordt vehicle EERST verkocht.
  it('AC-D: meerdere on_demand → volgorde volgt withdrawalOrder (vehicle vóór physical)', () => {
    const assets = mk([
      ['cash', 'Spaar', 'cash', 5000, 0, null],
      ['auto', 'Auto', 'vehicle', 40000, 0, null],
      ['caravan', 'Stacaravan', 'physical', 200000, 0, null],
    ])
    const liq: AssetLiquidation[] = [
      { assetId: 'auto', age: Number.POSITIVE_INFINITY, trigger: 'on_demand', salePricePct: 1, salesCostsPct: 0.02, payoffDebtIds: [] },
      { assetId: 'caravan', age: Number.POSITIVE_INFINITY, trigger: 'on_demand', salePricePct: 1, salesCostsPct: 0.02, payoffDebtIds: [] },
    ]
    const r = runHorizonLedger(baseInput(assets, liq))
    const autoSale = r.rows.find((x) => (x.assets.find((a) => a.id === 'auto')?.uitstroom ?? 0) > 0)!
    const caravanSale = r.rows.find((x) => (x.assets.find((a) => a.id === 'caravan')?.uitstroom ?? 0) > 0)!
    expect(autoSale).toBeDefined()
    expect(caravanSale).toBeDefined()
    // Vehicle (eerder in de volgorde) wordt vóór de physical verkocht.
    expect(autoSale.leeftijd).toBeLessThanOrEqual(caravanSale.leeftijd)
  })

  // AC-E: determinisme — twee identieke runs leveren identieke uitkomsten.
  it('AC-E: twee identieke runs → identiek', () => {
    const assets = mk([
      ['cash', 'Spaar', 'cash', 5000, 0, null],
      ['auto', 'Auto', 'vehicle', 40000, 0, null],
      ['caravan', 'Stacaravan', 'physical', 200000, 0, null],
    ])
    const liq: AssetLiquidation[] = [
      { assetId: 'auto', age: Number.POSITIVE_INFINITY, trigger: 'on_demand', salePricePct: 1, salesCostsPct: 0.02, payoffDebtIds: [] },
      { assetId: 'caravan', age: Number.POSITIVE_INFINITY, trigger: 'on_demand', salePricePct: 1, salesCostsPct: 0.02, payoffDebtIds: [] },
    ]
    const r1 = runHorizonLedger(baseInput(assets, liq))
    const r2 = runHorizonLedger(baseInput(assets, liq))
    expect(JSON.stringify(r1.rows)).toBe(JSON.stringify(r2.rows))
  })

  // AC-F: payoffDebtIds → de gekoppelde schuld wordt bij de on_demand-verkoop
  // afgelost, residu naar de liquide pot.
  it('AC-F: on_demand met payoffDebtIds lost de schuld af', () => {
    const assets = mk([
      ['cash', 'Spaar', 'cash', 5000, 0, null],
      ['pand', 'Beleggingspand', 'real_estate', 200000, 3, null],
    ])
    const debts: Debt[] = [
      {
        id: 'pandlening',
        name: 'Pandlening',
        debt_type: 'other',
        current_balance: 50000,
        interest_rate: 3,
        monthly_payment: 300,
        repayment_type: 'annuiteit',
        is_tax_deductible: false,
        linked_asset_id: 'pand',
        end_date: null,
        net_worth_inclusion_pct: 100,
        include_aflossing_in_savings: false,
        is_active: true,
      } as unknown as Debt,
    ]
    const liq: AssetLiquidation[] = [
      { assetId: 'pand', age: Number.POSITIVE_INFINITY, trigger: 'on_demand', salePricePct: 1, salesCostsPct: 0.03, payoffDebtIds: ['pandlening'] },
    ]
    const r = runHorizonLedger(baseInput(assets, liq, { debts }))
    const sale = r.rows.find((x) => (x.assets.find((a) => a.id === 'pand')?.uitstroom ?? 0) > 0)!
    expect(sale).toBeDefined()
    const lening = sale.schulden.find((d) => d.id === 'pandlening')!
    expect(lening.eind).toBeLessThan(1) // afgelost bij de verkoop
  })
})
