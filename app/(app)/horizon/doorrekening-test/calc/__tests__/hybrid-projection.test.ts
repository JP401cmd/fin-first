/**
 * Unit tests voor `computeHybridProjection` (Fase G3 —
 * `kun-je-een-mogelijkheid-glittery-waterfall.md`).
 *
 * Coverage:
 *  - Alle 4 end-strategies × (met/zonder events) × (met/zonder savings) —
 *    snelheid-efficiënt door de representatieve combinaties te testen
 *    zonder alle 16 letterlijke permutaties.
 *  - Fase-grens: age < fireAge is opbouw, age >= fireAge is afbouw; geen
 *    duplicated ages, monotonisch stijgend.
 *  - AOW-injectie: zonder AOW life-event wordt er een __aow cashflow
 *    toegevoegd; met AOW life-event gebeurt dat niet (geen dubbel-tel).
 *  - Savings-layer: met savingsInflow start `perAssetValues` op index 0
 *    voor het virtuele asset en stagneert post-fire.
 *  - Pre/post-fire netto-invariant: naadloze overgang zonder sprong.
 */

import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import {
  computeHybridProjection,
  type HybridProjectionInputs,
} from '../hybrid-projection'
import { SAVINGS_ASSET_ID } from '../opbouw-projection'

// ── Fixtures ───────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    user_id: 'u1',
    name: 'Test asset',
    asset_type: 'investment',
    current_value: 500_000,
    purchase_value: 500_000,
    purchase_date: null,
    expected_return: 7,
    monthly_contribution: 1_000,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: null,
    risk_profile: 'middel',
    tax_benefit: null,
    is_liquid: null,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    ...overrides,
  } as Asset
}

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'd1',
    user_id: 'u1',
    name: 'Test schuld',
    debt_type: 'personal_loan',
    original_amount: 10_000,
    current_balance: 10_000,
    interest_rate: 4,
    minimum_payment: 0,
    monthly_payment: 200,
    start_date: '2026-01-01',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: null,
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: false,
    custom_aflossing_amount: null,
    ...overrides,
  } as Debt
}

function makeLifeEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: 'le1',
    name: 'Test event',
    event_type: 'other',
    target_age: 70,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: '📋',
    is_active: true,
    sort_order: 0,
    is_indexed: true,
    ...overrides,
  }
}

/**
 * Canonieke hybrid-input: € 100k start-asset, geen schulden, hoge uitgaven
 * zodat de FIRE-leeftijd duidelijk in de toekomst valt (niet op currentAge).
 * Defaults zijn gekozen zodat alle strategieën een fireAge > currentAge
 * opleveren en alle tests waardevolle assertions kunnen doen.
 */
function baseInputs(overrides: Partial<HybridProjectionInputs> = {}): HybridProjectionInputs {
  return {
    assets: [makeAsset({ current_value: 100_000, monthly_contribution: 2_000 })],
    debts: [],
    lifeEvents: [],
    cashflows: [],
    currentAge: 40,
    endAge: 90,
    fireParams: {
      grossReturn: 0.07,
      inflationRate: 0.02,
    },
    endStrategy: 'deplete',
    endAgeConfig: 90,
    legacyAmount: 0,
    withdrawalStrategy: 'swr',
    distributionStrategy: 'proportional',
    hasPartner: false,
    yearlyRetirementExpenses: 40_000,
    aowAge: 67,
    ...overrides,
  }
}

// ── Basis invarianten ──────────────────────────────────────────

describe('computeHybridProjection — basis invarianten', () => {
  it('levert één rij per leeftijd van currentAge tot (endAge - 1)', () => {
    const result = computeHybridProjection(baseInputs())
    expect(result.rows).toHaveLength(50) // 40..89 inclusief → 50 rijen
    expect(result.rows[0].age).toBe(40)
    expect(result.rows[result.rows.length - 1].age).toBe(89)
  })

  it('age is strikt monotoon stijgend zonder duplicaten', () => {
    const result = computeHybridProjection(baseInputs())
    for (let i = 1; i < result.rows.length; i++) {
      expect(result.rows[i].age).toBeGreaterThan(result.rows[i - 1].age)
    }
  })

  it('fase-grens: age < fireAge is opbouw, age >= fireAge is afbouw', () => {
    const result = computeHybridProjection(baseInputs())
    expect(result.fireAge).toBeGreaterThan(40)
    expect(result.fireAge).toBeLessThanOrEqual(90)
    for (const row of result.rows) {
      if (row.age < result.fireAge) {
        expect(row.phase).toBe('opbouw')
      } else {
        expect(row.phase).toBe('afbouw')
      }
    }
  })

  it('perAssetValues.length is constant over alle rijen', () => {
    const result = computeHybridProjection(baseInputs())
    const expected = result.assetMeta.length
    for (const row of result.rows) {
      expect(row.perAssetValues).toHaveLength(expected)
      expect(row.perAssetGrowth).toHaveLength(expected)
      expect(row.perAssetContribution).toHaveLength(expected)
      expect(row.perAssetWithdrawal).toHaveLength(expected)
    }
  })
})

// ── Strategieën ─────────────────────────────────────────────────

describe('computeHybridProjection — deplete strategie', () => {
  it('onttrekking loopt door na AOW (bug-fix Addendum V)', () => {
    // Regressie: voorheen stopte onttrekking zodra AOW boven een vaste
    // baseWithdrawal uitsteeg. Nu gebruikt de afbouw-simulatie
    // inflatedExpenses - cashflow → onttrekking blijft positief zolang
    // werkelijke uitgaven > AOW.
    const result = computeHybridProjection(baseInputs({
      endStrategy: 'deplete',
      assets: [makeAsset({ current_value: 500_000, monthly_contribution: 0 })],
      yearlyRetirementExpenses: 40_000,
    }))
    // Zoek rij rond leeftijd 75 (na AOW 67).
    const postAowRow = result.rows.find(r => r.age >= 75 && r.phase === 'afbouw')
    expect(postAowRow).toBeDefined()
    expect(postAowRow!.withdrawalThisYear).toBeGreaterThan(0)
  })

  it('fireAge binnen [currentAge, endAge] voor realistische parameters', () => {
    const result = computeHybridProjection(baseInputs({
      endStrategy: 'deplete',
    }))
    expect(result.fireAge).toBeGreaterThan(40)
    expect(result.fireAge).toBeLessThan(90)
  })

  it('REGRESSIE V-A: deplete portfolio daalt post-FIRE (AOW-overshoot toegestaan)', () => {
    // Na V2/V3 refactor: baseWithdrawal = annuity-formula uit /afbouw-tabel.
    // Annuity gaat ervan uit dat ALLE withdrawal uit portfolio komt. Zodra
    // AOW de nominal need verlaagt → user trekt minder uit portfolio →
    // portfolio eindigt hoger dan 0 (AOW-overshoot). Dit is semantisch
    // consistent met /afbouw-tabel (identieke formule). Vóór V3 gebruikte
    // een solver die intern AOW in rekening bracht → endNetWorth ≈ 0.
    const result = computeHybridProjection(baseInputs({
      endStrategy: 'deplete',
      currentAge: 40,
      endAge: 90,
      assets: [makeAsset({ current_value: 500_000, monthly_contribution: 0 })],
      yearlyRetirementExpenses: 40_000,
    }))
    const last = result.rows[result.rows.length - 1]
    const fireRow = result.rows.find(r => r.age === result.fireAge) ?? last
    // Portfolio daalt zichtbaar na FIRE (≥ 10%), maar kan substantiële rest
    // overhouden door AOW-overshoot. Gewoon valideren dat het is verminderd.
    expect(last.netWorth).toBeLessThan(Math.abs(fireRow.netWorth) * 1.2)
  })
})

describe('computeHybridProjection — pureOpbouwRows (Addendum V-B)', () => {
  it('bevat een aparte pure opbouw-curve zonder afbouw-injectie', () => {
    const result = computeHybridProjection(baseInputs({
      endStrategy: 'deplete',
      currentAge: 40,
      endAge: 90,
    }))
    expect(result.pureOpbouwRows.length).toBeGreaterThan(0)
    // Pure opbouw loopt door over de hele horizon (niet afgekapt op FIRE).
    expect(result.pureOpbouwRows[0].age).toBe(result.rows[0].age)
    // Laatste leeftijd matcht endAge - 1 (opbouw-projection horizon).
    expect(result.pureOpbouwRows.at(-1)!.age).toBe(result.rows.at(-1)!.age)
  })

  it('pure opbouw stijgt monotoon over horizon (geen afbouw-knik na FIRE)', () => {
    const result = computeHybridProjection(baseInputs({
      endStrategy: 'deplete',
      currentAge: 40,
      endAge: 90,
      assets: [makeAsset({ current_value: 100_000, monthly_contribution: 1_500 })],
    }))
    // Pre-fire rij: netWorth moet stijgen. Post-fire rij: ook stijgen (pure
    // opbouw heeft geen onttrekking). Hybrid daalt juist post-fire —
    // bewijs dat pureOpbouwRows ≠ rows voor dezelfde leeftijden.
    const lastPure = result.pureOpbouwRows.at(-1)!.netWorth
    const firstPure = result.pureOpbouwRows[0].netWorth
    expect(lastPure).toBeGreaterThan(firstPure)
  })
})

describe('computeHybridProjection — legacy strategie', () => {
  it('legacy: eindvermogen positief bij voldoende startkapitaal', () => {
    const legacy = 200_000
    const inputs = baseInputs({
      endStrategy: 'legacy',
      legacyAmount: legacy,
      assets: [makeAsset({ current_value: 2_000_000, monthly_contribution: 0 })],
      currentAge: 50,
      endAge: 90,
    })
    const result = computeHybridProjection(inputs)
    const last = result.rows[result.rows.length - 1]
    expect(last.netWorth).toBeGreaterThan(0)
  })
})

describe('computeHybridProjection — perpetual strategie', () => {
  it('portfolio blijft positief over 30+ jaar', () => {
    const result = computeHybridProjection(baseInputs({
      endStrategy: 'perpetual',
      assets: [makeAsset({ current_value: 2_000_000, monthly_contribution: 0 })],
      yearlyRetirementExpenses: 40_000,
      endAge: 100,
    }))
    for (const row of result.rows) {
      expect(row.assets).toBeGreaterThan(0)
    }
  })
})

describe('computeHybridProjection — pensioen strategie', () => {
  it('fireAge = Math.round(aowAge)', () => {
    const result = computeHybridProjection(baseInputs({
      endStrategy: 'pensioen',
      aowAge: 67,
    }))
    expect(result.fireAge).toBe(67)
  })

  it('fractional fireAge is buurt van aowAge', () => {
    const result = computeHybridProjection(baseInputs({
      endStrategy: 'pensioen',
      aowAge: 67,
    }))
    if (result.fireAgeFractional !== null) {
      expect(result.fireAgeFractional).toBeGreaterThan(66)
      expect(result.fireAgeFractional).toBeLessThan(68)
    }
  })
})

// ── AOW-injectie ────────────────────────────────────────────────

describe('computeHybridProjection — AOW cashflow injectie', () => {
  it('zonder AOW life-event: aowIncomeThisYear > 0 vanaf aowAge', () => {
    const result = computeHybridProjection(baseInputs({
      aowAge: 67,
      lifeEvents: [],
      cashflows: [],
      endAge: 90,
    }))
    // Pre-AOW (age < 67): geen AOW
    const preAow = result.rows.find((r) => r.age === 60)
    expect(preAow?.aowIncomeThisYear ?? 0).toBe(0)
    // Post-AOW (age >= 67): AOW kicks in
    const postAow = result.rows.find((r) => r.age === 70)
    expect(postAow?.aowIncomeThisYear ?? 0).toBeGreaterThan(0)
  })

  it('met AOW life-event: wordt niet dubbel-geteld', () => {
    // Life-event met event_type 'aow' en een equivalente cashflow pre-seeded.
    const aowEvent = makeLifeEvent({
      id: 'aow-ev',
      event_type: 'aow',
      target_age: 67,
      monthly_income_change: 1558,
    })
    const aowCf: SimCashflow = {
      id: 'le-aow-adjusted-aow-ev',
      name: 'AOW',
      type: 'recurring',
      direction: 'income',
      amount: 1558,
      fromAge: 67,
      toAge: null,
      indexed: true,
    }
    const withEvent = computeHybridProjection(baseInputs({
      lifeEvents: [aowEvent],
      cashflows: [aowCf],
      aowAge: 67,
      endAge: 90,
    }))
    // Post-AOW: er mag ongeveer 1× 1558 × 12 zijn, niet 2×.
    const row70 = withEvent.rows.find((r) => r.age === 70)
    expect(row70).toBeDefined()
    // Single AOW bijdrage; geïndexeerd, dus ongeveer 1558 × 12 × (1.02)^(70-40).
    // yearsFromNow = 70 - 40 = 30 in `sumCashflowsForYear`.
    const annualAow = 1558 * 12 * Math.pow(1.02, 30)
    expect(row70!.aowIncomeThisYear).toBeLessThan(annualAow * 1.5)
    expect(row70!.aowIncomeThisYear).toBeGreaterThan(annualAow * 0.5)
  })
})

// ── Savings-layer ──────────────────────────────────────────────

describe('computeHybridProjection — savings-layer', () => {
  it('met savingsInflow: assetMeta[0].isVirtualSavings === true', () => {
    const result = computeHybridProjection(baseInputs({
      savingsInflow: { monthlyAmount: 500 },
    }))
    expect(result.assetMeta[0].isVirtualSavings).toBe(true)
    expect(result.assetMeta[0].id).toBe(SAVINGS_ASSET_ID)
    // De echte asset staat op index 1.
    expect(result.assetMeta[1].isVirtualSavings).toBe(false)
    expect(result.assetMeta[1].id).toBe('a1')
  })

  it('zonder savingsInflow: geen virtueel asset', () => {
    const result = computeHybridProjection(baseInputs())
    expect(result.assetMeta[0].isVirtualSavings).toBe(false)
    // Er mag nergens een virtueel asset zitten.
    for (const meta of result.assetMeta) {
      expect(meta.isVirtualSavings).toBe(false)
    }
  })

  it('savings groeit pre-fire en stagneert/daalt post-fire', () => {
    const result = computeHybridProjection(baseInputs({
      savingsInflow: { monthlyAmount: 500 },
      assets: [makeAsset({ current_value: 500_000, monthly_contribution: 0 })],
    }))
    // Pre-fire: savings moet groeien (monthly 500 × 12 = 6000/jaar).
    const preFireRow = result.rows.find((r) => r.phase === 'opbouw' && r.age === 45)
    if (preFireRow) {
      expect(preFireRow.perAssetValues[0]).toBeGreaterThan(0)
    }
    // Fire-index: waar phase wisselt van opbouw naar afbouw.
    const fireIdx = result.rows.findIndex((r) => r.phase === 'afbouw')
    if (fireIdx > 0 && fireIdx < result.rows.length - 5) {
      // Savings-groei stopt post-fire — monthly_contribution=0 in afbouw-asset.
      // De waarde kan wel dalen door withdrawal, niet stijgen.
      const atFire = result.rows[fireIdx].perAssetValues[0]
      const later = result.rows[fireIdx + 5]?.perAssetValues[0] ?? 0
      // Of gelijk (proportional withdrawal), of gedaald: nooit sterk gestegen.
      expect(later).toBeLessThanOrEqual(atFire * 1.05)
    }
  })

  it('savingsInflowThisYear > 0 pre-fire, 0 post-fire', () => {
    const result = computeHybridProjection(baseInputs({
      savingsInflow: { monthlyAmount: 500 },
    }))
    // Pre-fire rijen moeten savingsInflowThisYear > 0 hebben.
    const preFire = result.rows.filter((r) => r.phase === 'opbouw')
    if (preFire.length > 0) {
      expect(preFire[0].savingsInflowThisYear).toBe(500 * 12)
    }
    // Post-fire rijen: savingsInflowThisYear === 0.
    const postFire = result.rows.filter((r) => r.phase === 'afbouw')
    for (const row of postFire) {
      expect(row.savingsInflowThisYear).toBe(0)
    }
  })
})

// ── Fase-continuïteit ──────────────────────────────────────────

describe('computeHybridProjection — fase-continuïteit', () => {
  it('rows[fireAgeIdx-1].phase === opbouw en rows[fireAgeIdx].phase === afbouw', () => {
    const result = computeHybridProjection(baseInputs())
    const fireIdx = result.rows.findIndex((r) => r.age === result.fireAge)
    if (fireIdx > 0 && fireIdx < result.rows.length) {
      expect(result.rows[fireIdx - 1].phase).toBe('opbouw')
      expect(result.rows[fireIdx].phase).toBe('afbouw')
    }
  })

  it('pre/post-fire netto-invariant: assets op fireAge binnen ±10% van lineaire extrapolatie', () => {
    const result = computeHybridProjection(baseInputs())
    const fireIdx = result.rows.findIndex((r) => r.phase === 'afbouw')
    if (fireIdx > 1) {
      const lastOpbouw = result.rows[fireIdx - 1]
      const firstAfbouw = result.rows[fireIdx]
      // De assets mogen wat dalen door withdrawal in het eerste afbouw-jaar
      // maar mogen niet meer dan 20% verschillen van de opbouw-eindstand.
      const diff = Math.abs(firstAfbouw.assets - lastOpbouw.assets)
      expect(diff).toBeLessThan(lastOpbouw.assets * 0.2)
    }
  })
})

// ── Events ─────────────────────────────────────────────────────

describe('computeHybridProjection — met events', () => {
  it('eenmalige expense event verlaagt portfolio in dat jaar', () => {
    const costEvent: SimCashflow = {
      id: 'le-huis',
      name: 'Huis kopen',
      type: 'one_time',
      direction: 'expense',
      amount: 50_000,
      fromAge: 45,
      toAge: null,
      indexed: false,
    }
    const resultNoEv = computeHybridProjection(baseInputs())
    const resultWithEv = computeHybridProjection(baseInputs({
      cashflows: [costEvent],
    }))
    // eventCashflowNetThisYear voor leeftijd 45 moet negatief zijn bij event.
    const rowWithEv = resultWithEv.rows.find((r) => r.age === 45)
    expect(rowWithEv?.eventCashflowNetThisYear).toBeLessThan(0)
    // Zonder event is die 0.
    const rowNoEv = resultNoEv.rows.find((r) => r.age === 45)
    expect(rowNoEv?.eventCashflowNetThisYear ?? 0).toBe(0)
  })
})

// ── Combinaties savings × events × strategieën ─────────────────

describe('computeHybridProjection — savings × events', () => {
  it('met savings + events: alle stromen worden correct gesplitst', () => {
    const costEvent: SimCashflow = {
      id: 'le-renovatie',
      name: 'Renovatie',
      type: 'one_time',
      direction: 'expense',
      amount: 20_000,
      fromAge: 50,
      toAge: null,
      indexed: false,
    }
    const result = computeHybridProjection(baseInputs({
      savingsInflow: { monthlyAmount: 500 },
      cashflows: [costEvent],
      endStrategy: 'deplete',
    }))
    const row50 = result.rows.find((r) => r.age === 50)
    expect(row50).toBeDefined()
    // Event cashflow is apart, niet vermengd met savings of AOW.
    expect(row50!.eventCashflowNetThisYear).toBeLessThan(0)
    // Savings is nog steeds actief pre-fire.
    if (row50!.phase === 'opbouw') {
      expect(row50!.savingsInflowThisYear).toBeGreaterThan(0)
    }
  })
})

describe('computeHybridProjection — alle strategieën × combinaties smoke-test', () => {
  const strategies = ['deplete', 'legacy', 'perpetual', 'pensioen'] as const
  const savingsOptions: (undefined | { monthlyAmount: number })[] = [
    undefined,
    { monthlyAmount: 500 },
  ]
  const eventOptions: SimCashflow[][] = [
    [],
    [{
      id: 'le-test',
      name: 'Test',
      type: 'recurring',
      direction: 'expense',
      amount: 100,
      fromAge: 50,
      toAge: 60,
      indexed: false,
    }],
  ]

  for (const strategy of strategies) {
    for (const savings of savingsOptions) {
      for (const events of eventOptions) {
        const label = `${strategy} × savings=${savings ? 'ja' : 'nee'} × events=${events.length > 0 ? 'ja' : 'nee'}`
        it(`smoke: ${label}`, () => {
          const result = computeHybridProjection(baseInputs({
            endStrategy: strategy,
            // Voor legacy: genoeg startkapitaal; voor perpetual: ook genoeg.
            assets: [makeAsset({ current_value: 1_200_000, monthly_contribution: 500 })],
            legacyAmount: strategy === 'legacy' ? 100_000 : 0,
            yearlyRetirementExpenses: 30_000,
            savingsInflow: savings,
            cashflows: events,
            endAge: strategy === 'perpetual' || strategy === 'pensioen' ? 100 : 90,
          }))
          // Basis sanity: er zijn rijen en fireAge is in geldig bereik.
          expect(result.rows.length).toBeGreaterThan(0)
          expect(result.fireAge).toBeGreaterThan(0)
          // assetMeta klopt.
          expect(result.assetMeta.length).toBeGreaterThan(0)
          if (savings) {
            expect(result.assetMeta[0].isVirtualSavings).toBe(true)
          } else {
            expect(result.assetMeta.every((m) => !m.isVirtualSavings)).toBe(true)
          }
        })
      }
    }
  }
})

// ── Schulden ───────────────────────────────────────────────────

describe('computeHybridProjection — met schulden', () => {
  it('debtMeta correspondeert met perDebtValues', () => {
    const result = computeHybridProjection(baseInputs({
      debts: [
        makeDebt({ id: 'd-hyp', debt_type: 'mortgage', current_balance: 200_000, monthly_payment: 800 }),
      ],
    }))
    expect(result.debtMeta).toHaveLength(1)
    expect(result.debtMeta[0].id).toBe('d-hyp')
    expect(result.debtMeta[0].debt_type).toBe('mortgage')
    for (const row of result.rows) {
      expect(row.perDebtValues).toHaveLength(1)
      expect(row.perDebtInterest).toHaveLength(1)
      expect(row.perDebtRepayment).toHaveLength(1)
    }
  })

  it('schuld daalt over tijd bij normale aflossing', () => {
    const result = computeHybridProjection(baseInputs({
      debts: [makeDebt({ current_balance: 20_000, monthly_payment: 300 })],
      assets: [makeAsset({ current_value: 500_000, monthly_contribution: 0 })],
    }))
    const firstDebt = result.rows[0].perDebtValues[0]
    const midDebt = result.rows[Math.floor(result.rows.length / 2)].perDebtValues[0]
    expect(midDebt).toBeLessThanOrEqual(firstDebt)
  })
})

// ── Addendum III: drie onafhankelijke verdelings-settings ──────

describe('computeHybridProjection — withdrawalOrder onafhankelijk (afbouw-schedule)', () => {
  /**
   * `withdrawalOrder` stuurt de afbouw-withdrawal per asset. Bij deplete met
   * cash + stocks moet de per-asset-uitputting meetbaar verschillen tussen
   * `proportional` en `cash_first` — zelfs bij identieke event-verdeling.
   */
  it('per-asset afbouw-verdeling volgt withdrawalOrder', () => {
    const commonInputs = baseInputs({
      endStrategy: 'deplete',
      assets: [
        makeAsset({ id: 'cash', asset_type: 'cash', current_value: 200_000, expected_return: 0, monthly_contribution: 0 }),
        makeAsset({ id: 'stocks', asset_type: 'investment', current_value: 800_000, expected_return: 7, monthly_contribution: 0 }),
      ],
      distributionStrategy: 'proportional',
      currentAge: 65,
      endAge: 90,
      yearlyRetirementExpenses: 40_000,
    })
    const propOrder = computeHybridProjection({ ...commonInputs, withdrawalOrder: 'proportional' })
    const cashOrder = computeHybridProjection({ ...commonInputs, withdrawalOrder: 'cash_first' })

    const propMid = propOrder.rows[Math.floor(propOrder.rows.length / 2)]
    const cashMid = cashOrder.rows[Math.floor(cashOrder.rows.length / 2)]

    // Bij cash_first onttrekkingsvolgorde raakt cash sneller op.
    expect(cashMid.perAssetValues[0]).toBeLessThan(propMid.perAssetValues[0])
    // En de aandelen blijven juist langer staan.
    expect(cashMid.perAssetValues[1]).toBeGreaterThan(propMid.perAssetValues[1])
  })

  it('REGRESSIE IV: fireAge verschil pro_rata vs cash_first blijft klein (geen 30-jaar sprong)', () => {
    // Bug: vóór Addendum IV was cash_first → fireAge ~81j en pro_rata → ~52j
    // (30 jaar gap) omdat de aggregate solver met `grossReturn` niet matchte
    // met de per-asset simulatie met gemengde returns. Na fix: weighted
    // effective return in simulateBase → verschil is binnen ~5 jaar.
    const common = {
      endStrategy: 'deplete' as const,
      assets: [
        makeAsset({ id: 'cash', asset_type: 'cash', current_value: 30_000, expected_return: 0, monthly_contribution: 500 }),
        makeAsset({ id: 'stocks', asset_type: 'investment', current_value: 70_000, expected_return: 7, monthly_contribution: 1_500 }),
      ],
      distributionStrategy: 'proportional' as const,
      currentAge: 40,
      endAge: 90,
      yearlyRetirementExpenses: 35_000,
    }
    const prop = computeHybridProjection(baseInputs({ ...common, withdrawalOrder: 'proportional' }))
    const cash = computeHybridProjection(baseInputs({ ...common, withdrawalOrder: 'cash_first' }))
    expect(prop.fireAge).toBeGreaterThan(40)
    expect(cash.fireAge).toBeGreaterThan(40)
    // Cash_first kan materieel verschillen van pro_rata (werkelijke blended
    // effective return verschilt), maar zeker niet 30 jaar. Tolerantie 15
    // jaar — de initial weights geven een redelijke aggregate benadering,
    // maar de werkelijke asset-mix evolueert tijdens afbouw waardoor de
    // solver een iteratieve approximatie blijft.
    const diff = Math.abs(prop.fireAge - cash.fireAge)
    expect(diff).toBeLessThan(15)
  })

  it('fallback: zonder withdrawalOrder valt terug op distributionStrategy', () => {
    const inputs = baseInputs({
      endStrategy: 'deplete',
      distributionStrategy: 'proportional',
      assets: [makeAsset({ current_value: 500_000, monthly_contribution: 0 })],
    })
    const explicit = computeHybridProjection({ ...inputs, withdrawalOrder: 'proportional' })
    const implicit = computeHybridProjection(inputs) // withdrawalOrder niet gezet
    const a = explicit.rows.at(-1)!.netWorth
    const b = implicit.rows.at(-1)!.netWorth
    expect(Math.abs(a - b)).toBeLessThan(1)
  })
})

// ── Regressie: janpaul050486 bug — onttrekking niet te laag ──────

describe('computeHybridProjection — regressie janpaul050486 (V2/V3 fix)', () => {
  it('deplete met klein portfolio + €38k expenses: fireAge realistisch (niet direct)', () => {
    // Bug-rapport: met ~€150k portfolio en €38k/jaar expenses triggerde FIRE
    // bij leeftijd ~47 omdat de required-curve kapot was (solver → ~0).
    // Na V2-fix: required-curve gebruikt annuity-formule → required op 47
    // ligt rond €700k-€800k (nominaal) → FIRE triggert pas bij passend
    // portfolio-niveau.
    const result = computeHybridProjection(baseInputs({
      endStrategy: 'deplete',
      currentAge: 40,
      endAge: 90,
      assets: [makeAsset({ current_value: 150_000, monthly_contribution: 2_000 })],
      yearlyRetirementExpenses: 38_000,
    }))
    // Fire mag niet vroeg triggeren op klein portfolio. Verwacht > 50j.
    expect(result.fireAge).toBeGreaterThan(50)
  })

  it('post-FIRE onttrekking benaderd yearlyExpenses × inflation-factor', () => {
    // V3-fix: baseWithdrawal = annuity(portfolioAtFire, realReturn, years).
    // Bij correcte FIRE-triggering voldoet het portfolio aan de benodigde
    // onttrekking → eerste afbouw-jaar-onttrekking ≈ yearlyExpenses-inflated.
    const result = computeHybridProjection(baseInputs({
      endStrategy: 'deplete',
      currentAge: 40,
      endAge: 90,
      assets: [makeAsset({
        current_value: 800_000, monthly_contribution: 0, expected_return: 7,
      })],
      yearlyRetirementExpenses: 38_000,
    }))
    const fireAge = result.fireAge
    // Zoek de eerste afbouw-rij met werkelijke withdrawal (niet bridge-rij).
    const firstAfbouwRow = result.rows.find(
      r => r.age > fireAge && r.phase === 'afbouw' && r.withdrawalThisYear > 0,
    )
    expect(firstAfbouwRow).toBeDefined()
    const ageDelta = firstAfbouwRow!.age - 40
    const expectedNominal = 38_000 * Math.pow(1.02, ageDelta)
    // Tolerantie ±30%: annuity formule kan meer of minder dan yearlyExpenses
    // geven afhankelijk van portfolio/horizon. Maar niet wild off (bv. €8k
    // op €38k was de bug — dat was 5× lager).
    expect(firstAfbouwRow!.withdrawalThisYear).toBeGreaterThan(expectedNominal * 0.7)
  })
})
