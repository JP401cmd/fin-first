import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SaleConfig } from '@/lib/sale-config'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runHorizonLedger } from '@/lib/horizon-engine'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import { POT_RULES_DEFAULTS, type PotRulesConfig } from '@/lib/pot-rules'

// Generieke niet-liquide asset-liquidatie in de v2-grootboek-engine — nu gedreven
// door `assets.sale_config` als ENIGE bron (ADR 0020), niet langer door een
// life-event met `linked_asset_id`. Borgt dat een niet-liquide, niet-eigen_huis
// asset volgens zijn `sale_config` wordt verkocht (vast_moment / wanneer_nodig),
// dat `niet_verkopen` 'm laat staan, dat de opbrengst naar de besteedbare pot
// stroomt zonder dubbeltelling, en dat een gekoppeld verkoop-event nog steeds
// alleen de KALIBRATIE (verkoopprijs) + onderhouds-cashflow levert.

// Marijke-achtige fixture (vrije 67-jarige, geen schulden, gestopt met werken).
// Stacaravan = physical, current_value 25k (≠ verkoopprijs 20k → salePricePct 0.8).
function mkAssets(caravanSaleConfig: SaleConfig | null): Asset[] {
  return (
    [
      ['bel', 'Beleggen', 'investment', 320000, 5, null, null],
      ['cash', 'Spaar', 'cash', 50000, 0, null, null],
      ['caravan', 'Stacaravan Drenthe', 'physical', 25000, -5, 5, caravanSaleConfig],
    ] as const
  ).map(
    ([id, name, t, v, r, dep, sc]) =>
      ({
        id,
        name,
        asset_type: t,
        current_value: v,
        expected_return: r,
        is_active: true,
        net_worth_inclusion_pct: 100,
        depreciation_rate: dep,
        sale_config: sc,
      }) as unknown as Asset,
  )
}

const NO_DEBTS: Debt[] = []

/** Onderhouds-/kalibratie-event op leeftijd `age`, gekoppeld aan `assetId`. */
function saleEvent(
  assetId: string | null,
  age: number | null,
  metadata: Record<string, unknown>,
  overrides: Partial<LifeEvent> = {},
): LifeEvent {
  return {
    id: `sale-${assetId ?? 'none'}`,
    name: 'Stacaravan verkopen',
    event_type: 'custom',
    target_age: age,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: -100, // onderhoud valt weg
    monthly_income_change: 0,
    duration_months: 0,
    icon: 'Home',
    is_active: true,
    sort_order: 1,
    is_indexed: false,
    metadata,
    linked_asset_id: assetId,
    ...overrides,
  } as unknown as LifeEvent
}

function build(
  events: LifeEvent[],
  assets: Asset[],
  debts: Debt[] = NO_DEBTS,
  v2 = true,
  potRules?: PotRulesConfig,
) {
  return buildHorizonInput({
    horizonInput: {
      monthlyContributions: 0,
      yearlyMustExpenses: 30000,
      dateOfBirth: '1957-01-01', // ~69 in 2026; sale at 73 is in the future
      monthlyIncome: 0,
    } as never,
    lifeEvents: events,
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    grossReturn: 0.05,
    inflation: 0.02,
    assets,
    debts,
    box3Method: 'forfaitair',
    hasPartner: true,
    horizonEngineV2: v2,
    potRules,
  })
}

const SALE_AGE = 73

describe('generieke niet-liquide asset-liquidatie via sale_config (v2)', () => {
  // AC-1: caravan met sale_config vast_moment 73 → asset €0 op 73, opbrengst naar
  // besteedbare pot, netto vermogen continu (−verkoopkosten), onderhoud blijft.
  it('AC-1: vast_moment 73 → verkocht op 73, opbrengst naar pot, netto vermogen continu', () => {
    const assets = mkAssets({ stand: 'vast_moment', triggerAge: SALE_AGE })
    const built = build([saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 })], assets)!
    expect(built.input.assetLiquidations?.length).toBe(1)
    const liq = built.input.assetLiquidations![0]
    expect(liq.assetId).toBe('caravan')
    expect(liq.trigger).toBe('fixed_age')
    expect(liq.age).toBe(SALE_AGE)
    // salePricePct = verkoopprijs / current_value = 20000/25000 = 0.8 (event-kalibratie)
    expect(liq.salePricePct).toBeCloseTo(0.8, 6)
    // roerend default-verkoopkosten = 0.02
    expect(liq.salesCostsPct).toBeCloseTo(0.02, 6)

    const r = runHorizonLedger(built.input)
    const caravanAt = (age: number) =>
      r.rows.find((x) => x.leeftijd === age)?.assets.find((a) => a.type === 'physical')?.eind ?? 0
    expect(caravanAt(SALE_AGE - 1)).toBeGreaterThan(0) // bestaat nog vóór de verkoop
    expect(caravanAt(SALE_AGE)).toBeLessThan(1) // verkocht
    expect(caravanAt(SALE_AGE + 1)).toBeLessThan(1)

    const saleRow = r.rows.find((x) => x.leeftijd === SALE_AGE)!
    const caravanRow = saleRow.assets.find((a) => a.type === 'physical')!
    const marktwaarde = caravanRow.uitstroom
    expect(marktwaarde).toBeGreaterThan(0)
    const verwachteOpbrengst = marktwaarde * 0.8 * (1 - 0.02)

    const belInstroom = saleRow.assets.find((a) => a.id === 'bel')!.instroom
    expect(belInstroom).toBeGreaterThan(verwachteOpbrengst * 0.9)

    const pre = r.rows.find((x) => x.leeftijd === SALE_AGE - 1)!
    const sprong = Math.abs(saleRow.nettoVermogen - pre.nettoVermogen)
    expect(sprong).toBeLessThan(pre.nettoVermogen * 0.15)
    expect(saleRow.nettoVermogen).toBeLessThanOrEqual(pre.nettoVermogen)

    // De -100/mo onderhouds-cashflow blijft een aparte stroom (cost reduction).
    const onderhoud = built.cashflows.find((c) => c.id === `le-costchange-sale-caravan`)
    expect(onderhoud).toBeDefined()
    expect(onderhoud!.direction).toBe('income') // kostenverlaging telt als income
    expect(onderhoud!.amount).toBeCloseTo(100, 6)
  })

  // A: cash-voorkeur via top-level pot-regels (surplusGroup). De opbrengst van een
  // vast_moment-verkoop volgt de gebruikersvoorkeur "verdeling bij toename".
  describe('A: cash-voorkeur opbrengst (top-level pot-regels, surplusGroup)', () => {
    const cashPotRules: PotRulesConfig = { ...POT_RULES_DEFAULTS, surplusGroup: 'spaargeld' }

    it('surplusGroup=spaargeld → netto-opbrengst belandt bij CASH (niet beleggingen)', () => {
      const assets = mkAssets({ stand: 'vast_moment', triggerAge: SALE_AGE })
      const built = build([saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 })], assets, NO_DEBTS, true, cashPotRules)!
      expect(built.strategyOptions?.surplusTargetTypes).toEqual(['cash', 'savings'])

      const r = runHorizonLedger(built.input, built.strategyOptions)
      const saleRow = r.rows.find((x) => x.leeftijd === SALE_AGE)!
      const cashInstroom = saleRow.assets.find((a) => a.id === 'cash')!.instroom
      const belInstroom = saleRow.assets.find((a) => a.id === 'bel')!.instroom

      const marktwaarde = saleRow.assets.find((a) => a.type === 'physical')!.uitstroom
      const verwachteOpbrengst = marktwaarde * 0.8 * (1 - 0.02)
      expect(cashInstroom).toBeGreaterThan(verwachteOpbrengst * 0.9)
      expect(cashInstroom).toBeGreaterThan(belInstroom)
    })

    it('default surplusGroup (beleggingen) → netto-opbrengst belandt bij BELEGGINGEN', () => {
      const assets = mkAssets({ stand: 'vast_moment', triggerAge: SALE_AGE })
      const built = build([saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 })], assets)!
      expect(built.strategyOptions).toBeUndefined()

      const r = runHorizonLedger(built.input, built.strategyOptions)
      const saleRow = r.rows.find((x) => x.leeftijd === SALE_AGE)!
      const cashInstroom = saleRow.assets.find((a) => a.id === 'cash')!.instroom
      const belInstroom = saleRow.assets.find((a) => a.id === 'bel')!.instroom

      const marktwaarde = saleRow.assets.find((a) => a.type === 'physical')!.uitstroom
      const verwachteOpbrengst = marktwaarde * 0.8 * (1 - 0.02)
      expect(belInstroom).toBeGreaterThan(verwachteOpbrengst * 0.9)
      expect(belInstroom).toBeGreaterThan(cashInstroom)
    })
  })

  // AC-5: geen dubbeltelling — een gekoppeld verkoop-event met one_time_cost
  // (opbrengst-conventie) produceert GEEN aparte opbrengst-cashflow.
  it('AC-5: geen dubbeltelling — geen one_time opbrengst-cashflow voor het verkoop-event', () => {
    const assets = mkAssets({ stand: 'vast_moment', triggerAge: SALE_AGE })
    const ev = saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 }, { one_time_cost: -20000 })
    const built = build([ev], assets)!
    const oneTimeProceeds = built.cashflows.filter(
      (c) => c.id === `le-cost-sale-caravan` && c.type === 'one_time',
    )
    expect(oneTimeProceeds).toHaveLength(0)
    expect(built.input.assetLiquidations?.length).toBe(1)
    expect(built.cashflows.some((c) => c.id === `le-costchange-sale-caravan`)).toBe(true)
  })

  // AC-7: niet_verkopen → geen liquidatie, asset blijft staan tot endAge.
  it('AC-7: sale_config niet_verkopen → geen liquidatie, asset blijft staan', () => {
    const assets = mkAssets({ stand: 'niet_verkopen' })
    const built = build([saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 })], assets)!
    expect(built.input.assetLiquidations ?? []).toHaveLength(0)
    // De onderhouds-cashflow (maand-gevolg) blijft bestaan; alleen een eventuele
    // eenmalige opbrengst wordt onderdrukt (zie M1-test hieronder). Dit event draagt
    // one_time_cost 0, dus er valt niets te onderdrukken.
    expect(built.cashflows.some((c) => c.id === `le-costchange-sale-caravan`)).toBe(true)
    const r = runHorizonLedger(built.input)
    const last = r.rows[r.rows.length - 1]
    expect(last.assets.some((a) => a.type === 'physical' && a.eind > 0)).toBe(true)
  })

  // M1: niet_verkopen + gekoppeld event dat WEL een opbrengst draagt → asset blijft
  // op volle waarde ÉN de eenmalige opbrengst wordt onderdrukt (geen "geld uit het
  // niets"). De maandelijkse gevolgen (wegvallend onderhoud) blijven bestaan.
  it('M1: niet_verkopen + opbrengst-dragend event → asset blijft, geen opbrengst-cashflow', () => {
    const assets = mkAssets({ stand: 'niet_verkopen' })
    // one_time_cost < 0 = opbrengst-conventie (geld erbij).
    const ev = saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 }, { one_time_cost: -20000 })
    const built = build([ev], assets)!

    // Geen liquidatie: het asset wordt niet verkocht.
    expect(built.input.assetLiquidations ?? []).toHaveLength(0)

    // Het event is op het niet_verkopen-pad als afgehandeld gemarkeerd → de
    // eenmalige opbrengst-cashflow ontbreekt (observeerbaar effect van skipEventIds).
    const oneTimeProceeds = built.cashflows.filter(
      (c) => c.id === `le-cost-${ev.id}` && c.type === 'one_time',
    )
    expect(oneTimeProceeds).toHaveLength(0)

    // Maar de onderhouds-cashflow (maand-gevolg) blijft wél bestaan.
    expect(built.cashflows.some((c) => c.id === `le-costchange-${ev.id}`)).toBe(true)

    // En het asset blijft op volle waarde tot het einde (groeit/depreciëert normaal,
    // verdwijnt niet door een verkoop).
    const r = runHorizonLedger(built.input)
    const last = r.rows[r.rows.length - 1]
    expect(last.assets.some((a) => a.type === 'physical' && a.eind > 0)).toBe(true)
  })

  // DEFAULT: geen sale_config (NULL) → resolve-time default wanneer_nodig → on_demand.
  it('DEFAULT: geen sale_config → on_demand-liquidatie (resolve-time default)', () => {
    const assets = mkAssets(null)
    const built = build([], assets)!
    expect(built.input.assetLiquidations?.length).toBe(1)
    const liq = built.input.assetLiquidations![0]
    expect(liq.assetId).toBe('caravan')
    expect(liq.trigger).toBe('on_demand')
    expect(Number.isFinite(liq.age)).toBe(false) // geen plafond
  })

  // AC-8: asset current_value <= 0 → stille skip (geen liquidatie).
  it('AC-8: asset met current_value <= 0 → stille skip', () => {
    const zeroAssets: Asset[] = (
      [
        ['bel', 'Beleggen', 'investment', 320000, 5, null],
        ['cash', 'Spaar', 'cash', 50000, 0, null],
        ['caravan', 'Stacaravan', 'physical', 0, -5, 5],
      ] as const
    ).map(
      ([id, name, t, v, r, dep]) =>
        ({
          id,
          name,
          asset_type: t,
          current_value: v,
          expected_return: r,
          is_active: true,
          net_worth_inclusion_pct: 100,
          depreciation_rate: dep,
          sale_config: { stand: 'vast_moment', triggerAge: SALE_AGE },
        }) as unknown as Asset,
    )
    const built = build([saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 })], zeroAssets)!
    expect(built.input.assetLiquidations ?? []).toHaveLength(0)
  })

  // AC-10: salePricePct-clamp bij ratio > 2 → 2.0 (event-kalibratie).
  it('AC-10: verkoopprijs ≫ marktwaarde → salePricePct geclampt op 2.0', () => {
    const assets = mkAssets({ stand: 'vast_moment', triggerAge: SALE_AGE })
    const built = build([saleEvent('caravan', SALE_AGE, { verkoopprijs: 100000 })], assets)! // 100k/25k = 4
    expect(built.input.assetLiquidations![0].salePricePct).toBeCloseTo(2.0, 6)
  })

  // AC-11: ontbrekende verkoopprijs → salePricePct = 1.0 (val terug op marktwaarde).
  it('AC-11: ontbrekende verkoopprijs → salePricePct = 1.0', () => {
    const assets = mkAssets({ stand: 'vast_moment', triggerAge: SALE_AGE })
    const built = build([saleEvent('caravan', SALE_AGE, { reden: 'geen prijs' })], assets)!
    expect(built.input.assetLiquidations![0].salePricePct).toBeCloseTo(1.0, 6)
  })

  // D: vast_moment met ALLEEN triggerDate (geen triggerAge) → leeftijd afgeleid uit
  // geboortedatum. Geboortedatum 1957-01-01 → verkoop op 2030-06-15 ≈ leeftijd 73.
  describe('D: vast_moment via triggerDate', () => {
    it('triggerDate → leeftijd afgeleid uit geboortedatum, liquidatie ontstaat', () => {
      const assets = mkAssets({ stand: 'vast_moment', triggerDate: '2030-06-15' })
      const built = build([saleEvent('caravan', null, { verkoopprijs: 20000 })], assets)!
      expect(built.input.assetLiquidations?.length).toBe(1)
      const liq = built.input.assetLiquidations![0]
      expect(liq.assetId).toBe('caravan')
      expect(liq.trigger).toBe('fixed_age')
      expect(liq.age).toBe(73)
    })

    it('triggerAge WINT van triggerDate wanneer beide aanwezig zijn', () => {
      const assets = mkAssets({ stand: 'vast_moment', triggerAge: 75, triggerDate: '2030-06-15' })
      const built = build([saleEvent('caravan', null, { verkoopprijs: 20000 })], assets)!
      expect(built.input.assetLiquidations![0].age).toBe(75) // triggerAge, niet 73
    })

    it('vast_moment zónder triggerAge én triggerDate → geen liquidatie (stille skip)', () => {
      const assets = mkAssets({ stand: 'vast_moment' })
      const built = build([saleEvent('caravan', null, { verkoopprijs: 20000 })], assets)!
      expect(built.input.assetLiquidations ?? []).toHaveLength(0)
    })
  })

  // AC-9: payoffDebtIds via sale_config → de gekoppelde schuld wordt afgelost.
  it('AC-9: sale_config.payoffDebtIds lost de gekoppelde schuld af', () => {
    const debtAssets: Asset[] = (
      [
        ['bel', 'Beleggen', 'investment', 320000, 5, null],
        ['cash', 'Spaar', 'cash', 50000, 0, null],
        ['pand', 'Beleggingspand', 'real_estate', 200000, 3, null],
      ] as const
    ).map(
      ([id, name, t, v, r, dep]) =>
        ({
          id,
          name,
          asset_type: t,
          current_value: v,
          expected_return: r,
          is_active: true,
          net_worth_inclusion_pct: 100,
          depreciation_rate: dep,
          sale_config:
            id === 'pand'
              ? { stand: 'vast_moment', triggerAge: SALE_AGE, payoffDebtIds: ['pandlening'] }
              : { stand: 'niet_verkopen' },
        }) as unknown as Asset,
    )
    const debts: Debt[] = [
      {
        id: 'pandlening',
        name: 'Pandlening',
        debt_type: 'other',
        current_balance: 50000,
        interest_rate: 3.0,
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
    const built = build([], debtAssets, debts)!
    expect(built.input.assetLiquidations![0].payoffDebtIds).toContain('pandlening')

    const r = runHorizonLedger(built.input)
    const saleRow = r.rows.find((x) => x.leeftijd === SALE_AGE)!
    const lening = saleRow.schulden.find((d) => d.id === 'pandlening')!
    expect(lening.eind).toBeLessThan(1) // afgelost
    // real_estate-default-verkoopkosten = 0.03
    expect(built.input.assetLiquidations![0].salesCostsPct).toBeCloseTo(0.03, 6)
  })

  // Regressie: een liquide asset (investment) met sale_config wordt NOOIT
  // geliquideerd (alleen niet-liquide types zijn in scope).
  it('regressie: liquide asset (investment) met sale_config wordt niet geliquideerd', () => {
    const assets = (
      [
        ['bel', 'Beleggen', 'investment', 320000, 5],
        ['cash', 'Spaar', 'cash', 50000, 0],
      ] as const
    ).map(
      ([id, name, t, v, r]) =>
        ({
          id,
          name,
          asset_type: t,
          current_value: v,
          expected_return: r,
          is_active: true,
          net_worth_inclusion_pct: 100,
          sale_config: { stand: 'vast_moment', triggerAge: SALE_AGE },
        }) as unknown as Asset,
    )
    const built = build([], assets)!
    expect(built.input.assetLiquidations ?? []).toHaveLength(0)
  })

  // Sanity: skipEventIds onderdrukt UITSLUITEND de opbrengst, niet de
  // monthly_cost_change/monthly_income_change van het event.
  it('skipEventIds onderdrukt alleen de opbrengst, niet de maand-cashflows', () => {
    const ev = saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 }, { one_time_cost: -20000 })
    const skip = new Set([ev.id])
    const flows = lifeEventsToCashflows([ev], skip)
    expect(flows.some((c) => c.id === `le-cost-${ev.id}`)).toBe(false) // opbrengst weg
    expect(flows.some((c) => c.id === `le-costchange-${ev.id}`)).toBe(true) // onderhoud blijft
  })
})
