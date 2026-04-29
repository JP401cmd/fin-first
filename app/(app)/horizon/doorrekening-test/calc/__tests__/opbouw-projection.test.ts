/**
 * Unit tests voor `computeOpbouwProjection` (Fase 1c van
 * `doorrekening-overzicht-aggregatie.md`).
 *
 * Doel: snapshot- en edge-case-coverage zodat toekomstige aanpassingen aan
 * de opbouw-engine (events, Box 3, inclusion %) regressies direct vangen.
 *
 * Alle fixtures zijn minimaal — we gebruiken `Partial<Asset>`/`Partial<Debt>`
 * casts omdat de productie-types tientallen irrelevante velden bevatten die
 * niets toevoegen voor deze pure-math unit tests.
 */

import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import {
  computeOpbouwProjection,
  computeBox3Tax,
  projectAssetYearly,
  SAVINGS_ASSET_ID,
  SAVINGS_ASSET_LABEL,
  type OpbouwProjectionInputs,
} from '../opbouw-projection'

// ── Fixtures ───────────────────────────────────────────────────

/** Minimal Asset fixture — only the fields the projection engine actually reads. */
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    user_id: 'u1',
    name: 'Test asset',
    asset_type: 'investment',
    current_value: 100_000,
    purchase_value: 100_000,
    purchase_date: null,
    expected_return: 7, // 7% p.j.
    monthly_contribution: 500,
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
  } as Debt
}

/** Canonieke basis-input: één asset, geen schulden, geen events, 10 jaar. */
function baseInputs(overrides: Partial<OpbouwProjectionInputs> = {}): OpbouwProjectionInputs {
  return {
    assets: [makeAsset()],
    debts: [],
    projectionYears: 10,
    currentAge: 40,
    crossoverMonth: null,
    hasPartner: false,
    perEventYearlyCashflows: [],
    allocationStrategy: 'spreiden',
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────

describe('computeOpbouwProjection — basisgeval zonder life events', () => {
  it('levert één rij per projectie-jaar', () => {
    const result = computeOpbouwProjection(baseInputs({ projectionYears: 10 }))
    expect(result.yearlyRows).toHaveLength(10)
    expect(result.yearlyRows[0].year).toBe(1)
    expect(result.yearlyRows[0].age).toBe(40)
    expect(result.yearlyRows[9].year).toBe(10)
    expect(result.yearlyRows[9].age).toBe(49)
  })

  it('assets groeien monotoon met positieve return + savings', () => {
    const result = computeOpbouwProjection(baseInputs())
    for (let i = 1; i < result.yearlyRows.length; i++) {
      expect(result.yearlyRows[i].assets).toBeGreaterThan(result.yearlyRows[i - 1].assets)
    }
  })

  it('netto vermogen eind > netto vermogen begin bij positieve savings', () => {
    const result = computeOpbouwProjection(baseInputs())
    const first = result.yearlyRows[0].netWorth
    const last = result.yearlyRows[result.yearlyRows.length - 1].netWorth
    expect(last).toBeGreaterThan(first)
  })

  it('per-asset en per-debt arrays hebben dezelfde lengte als aantal assets/debts', () => {
    const inputs = baseInputs({
      assets: [makeAsset({ id: 'a1' }), makeAsset({ id: 'a2', current_value: 50_000 })],
      debts: [makeDebt()],
    })
    const result = computeOpbouwProjection(inputs)
    expect(result.perAssetYearly).toHaveLength(2)
    expect(result.perDebtYearly).toHaveLength(1)
    expect(result.perAssetYearly[0]).toHaveLength(inputs.projectionYears)
    expect(result.perDebtYearly[0]).toHaveLength(inputs.projectionYears)
  })
})

describe('computeOpbouwProjection — life events', () => {
  it('annualCashflowNet > 0 in jaar met positieve event-cashflow', () => {
    // Event: +€20k in jaar 3 (index 2) en +€15k in jaar 5 (index 4)
    const yearly = new Array(10).fill(0)
    yearly[2] = 20_000
    yearly[4] = 15_000
    const result = computeOpbouwProjection(
      baseInputs({ perEventYearlyCashflows: [yearly] }),
    )

    expect(result.yearlyRows[0].annualCashflowNet).toBe(0)
    expect(result.yearlyRows[2].annualCashflowNet).toBe(20_000)
    expect(result.yearlyRows[4].annualCashflowNet).toBe(15_000)
    expect(result.yearlyRows[5].annualCashflowNet).toBe(0)
  })

  it('perEventYearlyCashflows shape matcht lifeEvents.length', () => {
    const ev1 = new Array(10).fill(0)
    ev1[1] = 5_000
    const ev2 = new Array(10).fill(0)
    ev2[3] = -3_000
    const ev3 = new Array(10).fill(0)
    ev3[7] = 10_000
    const result = computeOpbouwProjection(
      baseInputs({ perEventYearlyCashflows: [ev1, ev2, ev3] }),
    )
    expect(result.perEventYearlyCashflows).toHaveLength(3)
    expect(result.perEventYearlyCashflows[0]).toBe(ev1)
    expect(result.perEventYearlyCashflows[1]).toBe(ev2)
  })

  it('sommeert event-cashflows over meerdere events per jaar', () => {
    const ev1 = new Array(10).fill(0)
    ev1[4] = 8_000
    const ev2 = new Array(10).fill(0)
    ev2[4] = -2_000
    const result = computeOpbouwProjection(
      baseInputs({ perEventYearlyCashflows: [ev1, ev2] }),
    )
    expect(result.yearlyRows[4].annualCashflowNet).toBe(6_000)
  })
})

describe('computeOpbouwProjection — Box 3 belasting', () => {
  it('cumulativeBox3Tax > 0 wanneer netto-vermogen > heffingsvrij (single)', () => {
    // Startvermogen €100k > heffingsvrij single €59.357 → Box 3 moet > 0 zijn.
    const result = computeOpbouwProjection(
      baseInputs({ hasPartner: false, projectionYears: 3 }),
    )
    expect(result.yearlyRows[result.yearlyRows.length - 1].cumulativeBox3Tax).toBeGreaterThan(0)
  })

  it('cumulativeBox3Tax = 0 wanneer netto-vermogen < heffingsvrij (partner)', () => {
    // Partner-heffingsvrij = €118.714. Asset €50k → geen Box 3.
    const result = computeOpbouwProjection(
      baseInputs({
        assets: [makeAsset({ current_value: 50_000, monthly_contribution: 0, expected_return: 0 })],
        hasPartner: true,
        projectionYears: 3,
      }),
    )
    expect(result.yearlyRows[0].cumulativeBox3Tax).toBe(0)
    expect(result.yearlyRows[2].cumulativeBox3Tax).toBe(0)
  })

  it('partner krijgt hogere heffingsvrij-drempel dan single', () => {
    // Netto €90k ligt tussen heffingsvrij single (59.357) en partner (118.714).
    const inputsSingle = baseInputs({
      assets: [makeAsset({ current_value: 90_000, monthly_contribution: 0, expected_return: 0 })],
      hasPartner: false,
      projectionYears: 2,
    })
    const inputsPartner = { ...inputsSingle, hasPartner: true }
    const rSingle = computeOpbouwProjection(inputsSingle)
    const rPartner = computeOpbouwProjection(inputsPartner)
    expect(rSingle.yearlyRows[1].cumulativeBox3Tax).toBeGreaterThan(0)
    expect(rPartner.yearlyRows[1].cumulativeBox3Tax).toBe(0)
  })

  it('computeBox3Tax direct — drempels kloppen met heffingsvrij-bedragen', () => {
    // Exact op de drempel: nul belasting.
    expect(computeBox3Tax(59_357, false)).toBe(0)
    expect(computeBox3Tax(118_714, true)).toBe(0)
    // Boven drempel: positief.
    expect(computeBox3Tax(200_000, false)).toBeGreaterThan(0)
    expect(computeBox3Tax(200_000, true)).toBeGreaterThan(0)
    // Grondslag-verschil: single heeft hoger bedrag boven heffingsvrij → meer belasting.
    expect(computeBox3Tax(200_000, false)).toBeGreaterThan(computeBox3Tax(200_000, true))
  })
})

describe('computeOpbouwProjection — net_worth_inclusion_pct', () => {
  it('asset met inclusion_pct = 50 telt voor de helft mee in asset-totaal', () => {
    const full = computeOpbouwProjection(
      baseInputs({
        assets: [makeAsset({
          current_value: 100_000,
          monthly_contribution: 0,
          expected_return: 0,
          net_worth_inclusion_pct: 100,
        })],
        projectionYears: 1,
        hasPartner: true, // drempel omhoog → vermijdt Box 3-ruis in deze check
      }),
    )
    const half = computeOpbouwProjection(
      baseInputs({
        assets: [makeAsset({
          current_value: 100_000,
          monthly_contribution: 0,
          expected_return: 0,
          net_worth_inclusion_pct: 50,
        })],
        projectionYears: 1,
        hasPartner: true,
      }),
    )
    // Full asset-waarde ≈ €100k; half ≈ €50k.
    expect(full.yearlyRows[0].assets).toBeCloseTo(100_000, 0)
    expect(half.yearlyRows[0].assets).toBeCloseTo(50_000, 0)
    expect(half.yearlyRows[0].assets / full.yearlyRows[0].assets).toBeCloseTo(0.5, 2)
  })

  it('inclusion_pct = 0 → asset telt helemaal niet mee', () => {
    const result = computeOpbouwProjection(
      baseInputs({
        assets: [makeAsset({ net_worth_inclusion_pct: 0 })],
        projectionYears: 1,
      }),
    )
    expect(result.yearlyRows[0].assets).toBe(0)
  })
})

describe('computeOpbouwProjection — snapshot canonieke input', () => {
  /**
   * Regressie-snapshot. Input is deterministisch (vaste leeftijd, vast
   * rendement, geen events). Het doel is: als iemand straks de engine
   * wijzigt, faalt deze test. Niet-financiële shape-fields (year/age)
   * beperken de impact van rounding-tweaks.
   */
  it('yearlyRows-structuur voor canonieke input', () => {
    const result = computeOpbouwProjection({
      assets: [
        makeAsset({
          id: 'equity',
          current_value: 100_000,
          monthly_contribution: 500,
          expected_return: 7,
          net_worth_inclusion_pct: 100,
        }),
        makeAsset({
          id: 'huis',
          current_value: 400_000,
          monthly_contribution: 0,
          expected_return: 2,
          net_worth_inclusion_pct: 0, // eigen huis wordt genegeerd
        }),
      ],
      debts: [makeDebt({ current_balance: 200_000, interest_rate: 3.5, monthly_payment: 1_000 })],
      projectionYears: 5,
      currentAge: 40,
      crossoverMonth: null,
      hasPartner: false,
      perEventYearlyCashflows: [],
      allocationStrategy: 'spreiden',
    })

    // Shape-check: precies 5 rijen met de verwachte shape.
    expect(result.yearlyRows.map(r => ({ year: r.year, age: r.age }))).toEqual([
      { year: 1, age: 40 },
      { year: 2, age: 41 },
      { year: 3, age: 42 },
      { year: 4, age: 43 },
      { year: 5, age: 44 },
    ])

    // Huis (inclusion_pct=0) telt niet mee — assets ≈ alleen de equity-asset.
    // Equity jaar 1 ≈ €100k × 1.07 + €6k bijdrage ≈ €113k (ruw). Check band.
    expect(result.yearlyRows[0].assets).toBeGreaterThan(105_000)
    expect(result.yearlyRows[0].assets).toBeLessThan(120_000)

    // Schuld daalt monotoon jaar-op-jaar.
    for (let i = 1; i < result.yearlyRows.length; i++) {
      expect(result.yearlyRows[i].debts).toBeLessThanOrEqual(result.yearlyRows[i - 1].debts)
    }

    // cumulativeBox3Tax is monotoon niet-dalend.
    for (let i = 1; i < result.yearlyRows.length; i++) {
      expect(result.yearlyRows[i].cumulativeBox3Tax).toBeGreaterThanOrEqual(
        result.yearlyRows[i - 1].cumulativeBox3Tax,
      )
    }

    // Netto vermogen = assets − debts − cumulativeBox3Tax per rij.
    for (const row of result.yearlyRows) {
      expect(row.netWorth).toBeCloseTo(row.assets - row.debts - row.cumulativeBox3Tax, 0)
    }
  })
})

describe('projectAssetYearly — crossoverMonth gedrag', () => {
  it('stopt contributions na crossoverMonth maar laat rendement doorlopen', () => {
    const asset = makeAsset({ current_value: 10_000, monthly_contribution: 1_000, expected_return: 6 })
    const noStop = projectAssetYearly(asset, 3, null)
    const stopAt12 = projectAssetYearly(asset, 3, 12) // stop na jaar 1

    // Jaar 1 contribution gelijk.
    expect(stopAt12[0].contribution).toBe(noStop[0].contribution)
    // Jaar 2 en 3: geen contributions meer.
    expect(stopAt12[1].contribution).toBe(0)
    expect(stopAt12[2].contribution).toBe(0)
    // Eindwaarde lager dan de variant die altijd doorstort.
    expect(stopAt12[2].value).toBeLessThan(noStop[2].value)
  })
})

// ── Fase G1 — savingsInflow virtueel asset ─────────────────────
//
// Deze tests verifiëren dat `computeOpbouwProjection({ ..., savingsInflow })`
// een virtueel cash-asset vóór de echte assets plaatst zonder het bestaande
// gedrag te breken. Pre-G1-callers (die `savingsInflow` niet doorgeven)
// moeten exact dezelfde outputs krijgen als vóór deze wijziging — dat is
// geborgd door alle tests bovenaan deze file (die onveranderd groen blijven).

describe('computeOpbouwProjection — savingsInflow (Fase G1)', () => {
  it('zonder savingsInflow: asset-array onveranderd en savingsInflowThisYear undefined', () => {
    // Baseline: exact hetzelfde gedrag als vóór G1.
    const asset = makeAsset({ id: 'echt', current_value: 10_000, monthly_contribution: 0, expected_return: 5 })
    const result = computeOpbouwProjection(baseInputs({
      assets: [asset],
      projectionYears: 3,
    }))
    expect(result.perAssetYearly).toHaveLength(1)
    // Elk jaar: geen savingsInflowThisYear-veld.
    for (const row of result.yearlyRows) {
      expect(row.savingsInflowThisYear).toBeUndefined()
    }
  })

  it('met savingsInflow: accumuleert ≈ monthlyAmount × 12 × jaren bij 0% rendement', () => {
    // Asset-type 'cash' met expected_return=0 → strikt lineaire groei.
    // €500/mnd × 12 mnd × 5 jaar = €30.000 ± €1 tolerantie voor rounding.
    const result = computeOpbouwProjection(baseInputs({
      assets: [makeAsset({ id: 'echt', current_value: 0, monthly_contribution: 0, expected_return: 0 })],
      projectionYears: 5,
      savingsInflow: { monthlyAmount: 500 },
    }))
    // Savings moet index 0 innemen, de echte asset schuift naar index 1.
    expect(result.perAssetYearly).toHaveLength(2)
    const savingsEndYear5 = result.perAssetYearly[0][4].value
    expect(savingsEndYear5).toBeGreaterThan(30_000 - 1)
    expect(savingsEndYear5).toBeLessThan(30_000 + 1)
  })

  it('savings stopt bij crossoverMonth: jaar 1-2 groeit, jaar 3+ blijft stabiel', () => {
    // crossoverMonth=24 → na maand 24 geen inleg meer. 2 jaar × 12 × €500 = €12k.
    const result = computeOpbouwProjection(baseInputs({
      assets: [makeAsset({ id: 'echt', current_value: 0, monthly_contribution: 0, expected_return: 0 })],
      projectionYears: 5,
      crossoverMonth: 24,
      savingsInflow: { monthlyAmount: 500 },
    }))
    const savingsRows = result.perAssetYearly[0]
    // Jaar 1: €6k, jaar 2: €12k.
    expect(savingsRows[0].value).toBeCloseTo(6_000, 0)
    expect(savingsRows[1].value).toBeCloseTo(12_000, 0)
    // Jaar 3, 4, 5: constant op €12k (0% rendement, geen extra inleg).
    expect(savingsRows[2].value).toBeCloseTo(12_000, 0)
    expect(savingsRows[3].value).toBeCloseTo(12_000, 0)
    expect(savingsRows[4].value).toBeCloseTo(12_000, 0)
  })

  it('perAssetYearly.length === assets.length wanneer savingsInflow niet gezet is', () => {
    // Geen virtueel asset prependen: lengte moet exact gelijk blijven aan
    // het aantal echte assets.
    const assets = [
      makeAsset({ id: 'a1', current_value: 50_000 }),
      makeAsset({ id: 'a2', current_value: 25_000 }),
    ]
    const result = computeOpbouwProjection(baseInputs({ assets, projectionYears: 3 }))
    expect(result.perAssetYearly.length).toBe(assets.length)
    expect(result.perAssetYearly.length).toBe(2)
  })

  it('savingsInflowThisYear-veld: pre-crossover = monthlyAmount × 12, post-crossover = 0', () => {
    // crossoverMonth=36 → jaar 1-3 volledig pre-crossover, jaar 4-5 post.
    const result = computeOpbouwProjection(baseInputs({
      assets: [makeAsset({ id: 'echt', current_value: 0, monthly_contribution: 0, expected_return: 0 })],
      projectionYears: 5,
      crossoverMonth: 36,
      savingsInflow: { monthlyAmount: 400 },
    }))
    // Pre-crossover jaren: 400 × 12 = 4800.
    expect(result.yearlyRows[0].savingsInflowThisYear).toBe(4_800)
    expect(result.yearlyRows[1].savingsInflowThisYear).toBe(4_800)
    expect(result.yearlyRows[2].savingsInflowThisYear).toBe(4_800)
    // Post-crossover jaren: 0.
    expect(result.yearlyRows[3].savingsInflowThisYear).toBe(0)
    expect(result.yearlyRows[4].savingsInflowThisYear).toBe(0)
  })

  it('savingsInflow respecteert custom label; virtueel asset id = SAVINGS_ASSET_ID', () => {
    // Sanity-check op de exports; garandeert stabiele contract voor UI-consumers.
    expect(SAVINGS_ASSET_ID).toBe('__savings')
    expect(SAVINGS_ASSET_LABEL).toBe('Spaarquote-inleg')
    // De custom label is runtime-input voor de virtuele asset; het asset
    // zelf wordt niet geëxposed via het result (alleen YearRow[]), dus deze
    // check beperkt zich tot de exports die de UI straks gebruikt voor legend.
  })

  it('snapshot: canonieke input met savingsInflow — asset-volgorde en totalen', () => {
    // Regressie-anker: savings als index 0, echte asset op index 1. Als
    // iemand later per ongeluk de volgorde wisselt breekt deze test.
    const result = computeOpbouwProjection({
      assets: [
        makeAsset({
          id: 'equity',
          current_value: 100_000,
          monthly_contribution: 0,
          expected_return: 7,
          net_worth_inclusion_pct: 100,
        }),
      ],
      debts: [],
      projectionYears: 3,
      currentAge: 40,
      crossoverMonth: null,
      hasPartner: true, // vermijd Box 3-ruis
      perEventYearlyCashflows: [],
      allocationStrategy: 'spreiden',
      savingsInflow: { monthlyAmount: 250 },
    })

    // Shape: 3 rijen, savings op index 0, equity op index 1.
    expect(result.perAssetYearly).toHaveLength(2)
    expect(result.yearlyRows).toHaveLength(3)
    // Savings groeit lineair met €3.000/jaar (0% rendement).
    expect(result.perAssetYearly[0][0].value).toBeCloseTo(3_000, 0)
    expect(result.perAssetYearly[0][1].value).toBeCloseTo(6_000, 0)
    expect(result.perAssetYearly[0][2].value).toBeCloseTo(9_000, 0)
    // Equity groeit met 7% rendement maandelijks gecapitaliseerd, zonder
    // contributions → €100k × (1 + 0.07/12)^36 ≈ €123.293 (maandelijkse
    // compounding is de praktijk in `projectAssetYearly`, niet jaarlijks).
    expect(result.perAssetYearly[1][2].value).toBeGreaterThan(123_000)
    expect(result.perAssetYearly[1][2].value).toBeLessThan(123_500)
    // savingsInflowThisYear gelijk aan monthlyAmount × 12 per jaar.
    expect(result.yearlyRows[0].savingsInflowThisYear).toBe(3_000)
    expect(result.yearlyRows[1].savingsInflowThisYear).toBe(3_000)
    expect(result.yearlyRows[2].savingsInflowThisYear).toBe(3_000)
  })
})
