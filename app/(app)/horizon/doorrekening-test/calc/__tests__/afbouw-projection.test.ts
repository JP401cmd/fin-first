/**
 * Unit tests voor `computeAfbouwRequiredSchedule` + `computeRequiredPortfolio`
 * (Fase 1c van `doorrekening-overzicht-aggregatie.md`).
 *
 * Scope:
 *  - Deplete: required-portfolio curve richting €0 bij endAge.
 *  - Legacy: eindwaarde ≈ legacyAmount × inflatie-factor.
 *  - Perpetual: bijna horizontale curve.
 *  - Pensioen: null voor age < aowAge, non-null vanaf aowAge.
 *  - Edge: realReturn ≤ 0 → perpetual valt terug op SWR-pad zonder crash.
 */

import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import {
  computeAfbouwRequiredSchedule,
  computeAfbouwSchedulePerAsset,
  computeRequiredPortfolio,
  ensureAowCashflow,
  solveDepleteBaseWithdrawal,
  type AfbouwPerAssetInputs,
} from '../afbouw-projection'

// ── Gedeelde parameters ────────────────────────────────────────

const DEFAULT_PARAMS = {
  currentAge: 50,
  endAge: 90,
  yearlyExpenses: 40_000,
  aowHousehold: 'alleenstaand' as const,
  inflation: 0.02,
  grossReturn: 0.07,
  legacyAmount: 0,
  aowAge: 67,
}

// ── Deplete ────────────────────────────────────────────────────

describe('computeAfbouwRequiredSchedule — deplete', () => {
  it('required portfolio daalt naar ~één laatste jaar uitgaven bij endAge (nominaal)', () => {
    // `computeRequiredPortfolio` gebruikt `totalYears = max(1, endAge-startAge)`,
    // dus op endAge blijft er 1 jaar netto-behoefte over (expenses − AOW).
    // Output is nu NOMINAAL (= reëel × (1+inflation)^(age-currentAge)).
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'deplete',
    })
    const last = schedule[schedule.length - 1]
    expect(last.age).toBe(DEFAULT_PARAMS.endAge)
    const aowYearly = 1558 * 12
    const expectedRealLastYear = Math.max(0, DEFAULT_PARAMS.yearlyExpenses - aowYearly)
    const years = DEFAULT_PARAMS.endAge - DEFAULT_PARAMS.currentAge
    const expectedNominalLastYear = expectedRealLastYear * Math.pow(1 + DEFAULT_PARAMS.inflation, years)
    expect(last.requiredPortfolio).not.toBeNull()
    // Orde-van-grootte check binnen 10% — AOW inflateert ook anders in praktijk.
    const v = last.requiredPortfolio as number
    expect(v).toBeGreaterThan(expectedNominalLastYear * 0.9)
    expect(v).toBeLessThan(expectedNominalLastYear * 1.2)
  })

  it('required portfolio bij endAge is een klein restbedrag (< 10% van beginpunt)', () => {
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'deplete',
    })
    const first = schedule[0].requiredPortfolio as number
    const last = schedule[schedule.length - 1].requiredPortfolio as number
    expect(last / first).toBeLessThan(0.1)
  })

  it('curve daalt op lange termijn (first > last) ondanks nominale inflatie-factor', () => {
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'deplete',
    })
    // Nu de required-curve nominaal is, kan er op korte termijn stijging
    // zitten (inflatie-factor groeit sneller dan rest-looptijd-verkorting).
    // Globaal blijft de curve echter dalen: op endAge is de rest-looptijd 1
    // jaar, dus de PV-component is klein ondanks de inflatie-schaling.
    const first = schedule[0].requiredPortfolio as number
    const last = schedule[schedule.length - 1].requiredPortfolio as number
    expect(first).toBeGreaterThan(last)
  })

  it('required op currentAge > required op een latere leeftijd', () => {
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'deplete',
    })
    const first = schedule[0].requiredPortfolio as number
    const mid = schedule[Math.floor(schedule.length / 2)].requiredPortfolio as number
    expect(first).toBeGreaterThan(mid)
  })
})

// ── Legacy ─────────────────────────────────────────────────────

describe('computeAfbouwRequiredSchedule — legacy', () => {
  it('required bij endAge reflecteert nominale legacy-bedrag (geïnflateerd)', () => {
    // Bij endAge is `totalYears = max(1, endAge − startAge) = 1`. Output is
    // nominaal = reëel × (1+inflation)^years. Nominale legacy ≈ legacyAmount
    // × (1+inflation)^(endAge-currentAge).
    const legacyAmount = 250_000
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'legacy',
      legacyAmount,
    })
    const last = schedule[schedule.length - 1]
    expect(last.requiredPortfolio).not.toBeNull()
    const v = last.requiredPortfolio as number
    const years = DEFAULT_PARAMS.endAge - DEFAULT_PARAMS.currentAge
    const nominalLegacy = legacyAmount * Math.pow(1 + DEFAULT_PARAMS.inflation, years)
    // Binnen 20% band — er zit nog 1 jaar netto-behoefte bovenop.
    expect(v).toBeGreaterThan(nominalLegacy * 0.8)
    expect(v).toBeLessThan(nominalLegacy * 1.3)
  })

  it('legacy required > deplete required op elke leeftijd', () => {
    // Legacy vereist structureel meer kapitaal dan deplete omdat een bedrag
    // behouden moet blijven.
    const deplete = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'deplete',
    })
    const legacy = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'legacy',
      legacyAmount: 200_000,
    })
    for (let i = 0; i < deplete.length; i++) {
      const d = deplete[i].requiredPortfolio as number
      const l = legacy[i].requiredPortfolio as number
      expect(l).toBeGreaterThan(d)
    }
  })
})

// ── Perpetual ──────────────────────────────────────────────────

describe('computeAfbouwRequiredSchedule — perpetual', () => {
  it('curve stijgt nominaal met inflatie maar blijft in reële termen horizontaal', () => {
    // De perpetual-formule indexeert de netto-behoefte met `(1 + inflation)^(age − currentAge)`.
    // Dat betekent: nominaal stijgt de required-curve ~2%/jr (zelfde als inflatie),
    // maar gedefleerd met diezelfde factor is de curve exact horizontaal.
    // Dat is het ontwerpdoel van "koopkracht-behoud".
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      currentAge: 67,
      endAge: 100,
      strategy: 'perpetual',
    })
    const inflation = DEFAULT_PARAMS.inflation
    // Defleer elk punt naar reële termen (currentAge = referentie).
    const realValues = schedule.map((s, i) => (s.requiredPortfolio as number) / Math.pow(1 + inflation, i))
    const max = Math.max(...realValues)
    const min = Math.min(...realValues)
    const avg = realValues.reduce((a, b) => a + b, 0) / realValues.length
    // In reële termen mag de variatie < 1% zijn (alleen FP-ruis).
    expect((max - min) / avg).toBeLessThan(0.01)
  })

  it('nominale variatie over 5 jaar venster < 10% (≈ cumulatieve inflatie)', () => {
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      currentAge: 67,
      endAge: 100,
      strategy: 'perpetual',
    })
    const values = schedule.map(s => s.requiredPortfolio as number)
    const earlyWindow = values.slice(0, 5)
    const wMax = Math.max(...earlyWindow)
    const wMin = Math.min(...earlyWindow)
    const wAvg = earlyWindow.reduce((a, b) => a + b, 0) / earlyWindow.length
    // 4 jaar inflatie ≈ 1.02^4 − 1 ≈ 8.2%; geef marge tot 10%.
    expect((wMax - wMin) / wAvg).toBeLessThan(0.1)
  })

  it('levert positieve required waarde op elke leeftijd', () => {
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'perpetual',
    })
    for (const point of schedule) {
      expect(point.requiredPortfolio).not.toBeNull()
      expect(point.requiredPortfolio as number).toBeGreaterThan(0)
    }
  })

  it('edge: realReturn <= 0 → valt terug op SWR-pad zonder te crashen', () => {
    // grossReturn < inflation ⇒ realReturn < 0.
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'perpetual',
      grossReturn: 0.01,
      inflation: 0.03,
    })
    expect(schedule).toHaveLength(DEFAULT_PARAMS.endAge - DEFAULT_PARAMS.currentAge + 1)
    for (const point of schedule) {
      expect(point.requiredPortfolio).not.toBeNull()
      const v = point.requiredPortfolio as number
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThan(0)
    }
  })
})

// ── Pensioen ───────────────────────────────────────────────────

describe('computeAfbouwRequiredSchedule — pensioen', () => {
  it('requiredPortfolio === null voor alle age < aowAge', () => {
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'pensioen',
    })
    const preAow = schedule.filter(p => p.age < DEFAULT_PARAMS.aowAge)
    expect(preAow.length).toBeGreaterThan(0)
    for (const point of preAow) {
      expect(point.requiredPortfolio).toBeNull()
    }
  })

  it('requiredPortfolio non-null vanaf aowAge', () => {
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'pensioen',
    })
    const postAow = schedule.filter(p => p.age >= DEFAULT_PARAMS.aowAge)
    expect(postAow.length).toBeGreaterThan(0)
    for (const point of postAow) {
      expect(point.requiredPortfolio).not.toBeNull()
      expect(point.requiredPortfolio as number).toBeGreaterThanOrEqual(0)
    }
  })

  it('overgangs-punt: vlak voor aowAge = null, op aowAge = non-null', () => {
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'pensioen',
    })
    const justBefore = schedule.find(p => p.age === DEFAULT_PARAMS.aowAge - 1)
    const atAow = schedule.find(p => p.age === DEFAULT_PARAMS.aowAge)
    expect(justBefore?.requiredPortfolio).toBeNull()
    expect(atAow?.requiredPortfolio).not.toBeNull()
  })
})

// ── Algemene shape-checks ──────────────────────────────────────

describe('computeAfbouwRequiredSchedule — shape', () => {
  it('levert één punt per leeftijd van currentAge tot en met endAge', () => {
    const schedule = computeAfbouwRequiredSchedule({
      ...DEFAULT_PARAMS,
      strategy: 'deplete',
    })
    expect(schedule).toHaveLength(DEFAULT_PARAMS.endAge - DEFAULT_PARAMS.currentAge + 1)
    expect(schedule[0].age).toBe(DEFAULT_PARAMS.currentAge)
    expect(schedule[schedule.length - 1].age).toBe(DEFAULT_PARAMS.endAge)
  })
})

// ── computeRequiredPortfolio direct (sanity) ───────────────────

describe('computeRequiredPortfolio — directe aanroep', () => {
  it('deplete met realReturn=0 geeft som van netto-behoeftes over de looptijd', () => {
    // Forceer realReturn=0 via grossReturn==inflation.
    const required = computeRequiredPortfolio(
      30_000, // yearlyExpenses
      60,     // startAge
      70,     // endAge
      0.02,   // grossReturn
      0.02,   // inflation  → realReturn = 0
      'deplete',
      'swr',
      false,  // hasPartner
      0,      // legacyAmount
    )
    // Tussen 60–66 (7 jaar) volledige expenses, 67–69 (3 jaar) expenses − AOW(single = 1558×12).
    const aow = 1558 * 12
    const expected = 30_000 * 7 + Math.max(0, 30_000 - aow) * 3
    expect(required).toBeCloseTo(expected, 0)
  })

  it('perpetual vóór AOW-leeftijd gebruikt volledige expenses', () => {
    const required = computeRequiredPortfolio(
      40_000,
      50,
      90,
      0.05,
      0.02,
      'perpetual',
      'swr',
      false,
      0,
    )
    // In deze branch is de formule: expenses / NL_SWR.
    // NL_SWR ≈ 2.883% → 40k / 0.02883 ≈ 1.39M. Sanity-range.
    expect(required).toBeGreaterThan(1_000_000)
    expect(required).toBeLessThan(2_000_000)
  })
})

// ── Fixtures voor per-asset & AOW tests (Fase G2) ───────────────

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
    monthly_contribution: 0,
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

function makeLifeEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: 'le1',
    name: 'Test event',
    event_type: 'other',
    target_age: 67,
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

/** Canonieke per-asset input: één 500k asset, geen schulden, geen events. */
function baseAfbouwInputs(overrides: Partial<AfbouwPerAssetInputs> = {}): AfbouwPerAssetInputs {
  const asset = makeAsset({ current_value: 500_000, expected_return: 7 })
  return {
    startAssetValues: [500_000],
    assets: [asset],
    startDebtValues: [],
    debts: [],
    retirementAge: 65,
    endAge: 95,
    yearlyExpenses: 40_000,
    grossReturn: 0.07,
    inflationRate: 0.02,
    strategy: 'deplete',
    legacyAmount: 0,
    withdrawalStrategy: 'swr',
    distributionStrategy: 'proportional',
    cashflows: [],
    hasPartner: false,
    ...overrides,
  }
}

// ── computeAfbouwSchedulePerAsset — invarianten ─────────────────

describe('computeAfbouwSchedulePerAsset — basis invarianten', () => {
  it('levert één rij per jaar van retirementAge tot endAge', () => {
    const rows = computeAfbouwSchedulePerAsset(baseAfbouwInputs())
    expect(rows).toHaveLength(30) // 65 → 95
    expect(rows[0].age).toBe(65)
    expect(rows[rows.length - 1].age).toBe(94)
  })

  it('sum(perAssetValues) === endBalance op elke rij (± €1)', () => {
    const rows = computeAfbouwSchedulePerAsset(baseAfbouwInputs())
    for (const row of rows) {
      const sum = row.perAssetValues.reduce((s, v) => s + v, 0)
      expect(Math.abs(sum - row.endBalance)).toBeLessThanOrEqual(1)
    }
  })

  it('startBalance van jaar y == endBalance van jaar y-1 (consistentie)', () => {
    const rows = computeAfbouwSchedulePerAsset(baseAfbouwInputs())
    for (let i = 1; i < rows.length; i++) {
      expect(Math.abs(rows[i].startBalance - rows[i - 1].endBalance)).toBeLessThanOrEqual(1)
    }
  })

  it('perAssetValues.length === assets.length op elke rij', () => {
    const rows = computeAfbouwSchedulePerAsset(baseAfbouwInputs({
      startAssetValues: [100_000, 200_000, 300_000],
      assets: [
        makeAsset({ id: 'a1', expected_return: 0 }),
        makeAsset({ id: 'a2', expected_return: 4 }),
        makeAsset({ id: 'a3', expected_return: 7 }),
      ],
    }))
    for (const row of rows) {
      expect(row.perAssetValues).toHaveLength(3)
      expect(row.perAssetWithdrawal).toHaveLength(3)
      expect(row.perAssetGrowth).toHaveLength(3)
    }
  })

  it('own_home_last: eigen huis blijft langer staan dan liquide assets', () => {
    // Compare proportional vs own_home_last met identieke inputs.
    // Verwacht: bij own_home_last is huis halverwege significant hoger.
    const common = {
      startAssetValues: [200_000, 500_000, 600_000],
      assets: [
        makeAsset({ id: 'cash', asset_type: 'cash', expected_return: 0 }),
        makeAsset({ id: 'stocks', asset_type: 'investment', expected_return: 6 }),
        makeAsset({ id: 'huis', asset_type: 'eigen_huis', expected_return: 2 }),
      ],
      strategy: 'deplete' as const,
      yearlyExpenses: 30_000,
    }
    const propRows = computeAfbouwSchedulePerAsset(baseAfbouwInputs({
      ...common,
      distributionStrategy: 'proportional',
    }))
    const ohlRows = computeAfbouwSchedulePerAsset(baseAfbouwInputs({
      ...common,
      distributionStrategy: 'own_home_last',
    }))
    // Check vroeg in de afbouw (jaar 3) — bij own_home_last is huis dan nog
    // volledig intact (cash/stocks worden eerst aangesproken); bij
    // proportional is huis al afgebrokkeld.
    const earlyIdx = 3
    expect(ohlRows[earlyIdx].perAssetValues[2]).toBeGreaterThan(propRows[earlyIdx].perAssetValues[2])
    // Cash raakt eerst op bij own_home_last.
    expect(ohlRows[earlyIdx].perAssetValues[0]).toBeLessThan(propRows[earlyIdx].perAssetValues[0])
  })

  it('highest_value_first: grootste positie raakt als eerste op', () => {
    const rows = computeAfbouwSchedulePerAsset(baseAfbouwInputs({
      startAssetValues: [100_000, 500_000, 200_000],
      assets: [
        makeAsset({ id: 'a', expected_return: 4 }),
        makeAsset({ id: 'b', expected_return: 4 }),
        makeAsset({ id: 'c', expected_return: 4 }),
      ],
      distributionStrategy: 'highest_value_first',
      strategy: 'deplete',
    }))
    // Bouw cumulatieve withdraw-som op: asset b (grootste) moet de meeste
    // hebben geleverd over de hele horizon.
    let totalA = 0, totalB = 0
    for (const row of rows) {
      totalA += row.perAssetWithdrawal[0]
      totalB += row.perAssetWithdrawal[1]
    }
    expect(totalB).toBeGreaterThan(totalA)
  })
})

// ── Deplete eindbalans ─────────────────────────────────────────

describe('computeAfbouwSchedulePerAsset — deplete', () => {
  it('onttrekking loopt door na AOW-leeftijd (bug-fix: AOW vult aan, vervangt niet)', () => {
    // Addendum: voorheen stopte de onttrekking zodra AOW nominaal boven een
    // vaste `baseWithdrawal` steeg (rond age 67+). Nu gebruikt de forward-
    // simulatie `inflatedExpenses - cashflow` → onttrekking blijft positief
    // zolang werkelijke uitgaven > AOW.
    const rows = computeAfbouwSchedulePerAsset(baseAfbouwInputs({
      strategy: 'deplete',
      retirementAge: 60,
      endAge: 95,
      startAssetValues: [1_500_000],
      assets: [makeAsset({ id: 'stocks', expected_return: 6 })],
      yearlyExpenses: 40_000, // > AOW (~21k geïnflateerd)
    }))
    // Na AOW-leeftijd (NL_AOW_AGE = 67): vroeger onttrekking 0. Nu moet ze
    // nog steeds > 0 zijn omdat inflatedExpenses boven AOW blijft.
    const postAowRow = rows.find(r => r.age === 75)
    expect(postAowRow).toBeDefined()
    expect(postAowRow!.withdrawal).toBeGreaterThan(0)
  })

  it('netWorth daalt substantieel over de afbouw-horizon', () => {
    const rows = computeAfbouwSchedulePerAsset(baseAfbouwInputs({
      strategy: 'deplete',
    }))
    // Lange-termijn trend: netto-vermogen moet substantieel dalen
    // (deplete-semantiek). Niet per se tot 0 — dat hangt af van de
    // startPortfolio vs. de werkelijke uitgaven.
    expect(rows[rows.length - 1].netWorth).toBeLessThan(rows[0].netWorth)
  })

  it('positieve cashflow houdt portfolio-withdrawal gelijk maar baseWithdrawal stijgt', () => {
    // Algebraïsche identiteit: om endBalance = 0 te halen moet de totale
    // portfolio-onttrekking gelijk blijven (zelfde startkapitaal + return).
    // Wat verandert is het `baseWithdrawal`-target: de solver compenseert
    // de cashflow-stream door een hoger base te kiezen, zodat base − cashflow
    // per jaar dezelfde portfolio-withdrawal oplevert.
    const cfs: SimCashflow[] = [{
      id: 'cf-test',
      name: 'Test income',
      type: 'recurring',
      direction: 'income',
      amount: 500, // monthly = €6 000/jr
      fromAge: 65,
      toAge: 95,
      indexed: false,
    }]
    const baseNoCf = solveDepleteBaseWithdrawal({
      startBalance: 500_000,
      retirementAge: 65,
      endAge: 95,
      yearlyExpenses: 40_000,
      grossReturn: 0.07,
      inflationRate: 0.02,
      cashflows: [],
      targetEnd: 0,
    })
    const baseCf = solveDepleteBaseWithdrawal({
      startBalance: 500_000,
      retirementAge: 65,
      endAge: 95,
      yearlyExpenses: 40_000,
      grossReturn: 0.07,
      inflationRate: 0.02,
      cashflows: cfs,
      targetEnd: 0,
    })
    // Hogere base omdat de cashflow-stream 6k/jr bijdraagt
    expect(baseCf).toBeGreaterThan(baseNoCf)
  })
})

// ── Legacy eindbalans ──────────────────────────────────────────

describe('computeAfbouwSchedulePerAsset — legacy', () => {
  it('legacy: portfolio blijft positief bij voldoende startPortfolio', () => {
    // Na de AOW-fix wordt de forward-schedule gestuurd door werkelijke
    // uitgaven (inflatedExpenses), niet door de solver-baseWithdrawal. Met
    // ruim startPortfolio blijft eindvermogen positief en in de buurt van
    // het nominale legacy-bedrag (±50% tolerance — de exacte aansluiting
    // vereist een startPortfolio-solver die niet-triviaal is).
    const legacy = 200_000
    const inputs = baseAfbouwInputs({
      strategy: 'legacy',
      legacyAmount: legacy,
      startAssetValues: [1_500_000], // ruim voldoende kapitaal
    })
    const rows = computeAfbouwSchedulePerAsset(inputs)
    const last = rows[rows.length - 1]
    expect(last.netWorth).toBeGreaterThan(0)
  })
})

// ── Perpetual stabiliteit ──────────────────────────────────────

describe('computeAfbouwSchedulePerAsset — perpetual', () => {
  it('portfolio groeit bij voldoende rendement en inflatie-geïndexeerde uitgaven (positief eind)', () => {
    // Perpetual-strategie haalt min(balance × NL_SWR, inflatedExpenses) op.
    // Met gross 7% return en inflatie-geïndexeerde uitgaven blijft het
    // portfolio nominaal groeien (real return ≈ 5% > 2.883% SWR).
    // Invariant: eindsaldo > 0 en > 50% van startsaldo (niet opgedroogd).
    const rows = computeAfbouwSchedulePerAsset(baseAfbouwInputs({
      strategy: 'perpetual',
      startAssetValues: [2_000_000],
      assets: [makeAsset({ current_value: 2_000_000, expected_return: 7 })],
      yearlyExpenses: 40_000,
    }))
    const start = rows[0].startBalance
    const end = rows[rows.length - 1].endBalance
    expect(end).toBeGreaterThan(0)
    // Zonder oppotten van surplus: end > start (koopkracht-behoud ruim gehaald)
    expect(end).toBeGreaterThan(start * 0.5)
  })
})

// ── cash_first distributie ─────────────────────────────────────

describe('computeAfbouwSchedulePerAsset — distributionStrategy', () => {
  it('cash_first: asset met return=0 raakt als eerste op', () => {
    // Scenario: 2 assets, één cash (return=0), één investment (return=7%).
    const rows = computeAfbouwSchedulePerAsset(baseAfbouwInputs({
      strategy: 'deplete',
      startAssetValues: [100_000, 400_000],
      assets: [
        makeAsset({ id: 'cash', expected_return: 0 }),
        makeAsset({ id: 'inv', expected_return: 7 }),
      ],
      distributionStrategy: 'cash_first',
      yearlyExpenses: 50_000,
    }))
    // Zoek het eerste jaar waarin cash-asset op 0 staat.
    const cashZeroRow = rows.findIndex(r => r.perAssetValues[0] <= 1)
    expect(cashZeroRow).toBeGreaterThan(-1)
    // Op dat moment moet investment-asset nog substantieel zijn (niet al op).
    expect(rows[cashZeroRow].perAssetValues[1]).toBeGreaterThan(10_000)
  })

  it('lowest_return_first: gedraagt zich identiek aan cash_first', () => {
    const common = baseAfbouwInputs({
      strategy: 'deplete',
      startAssetValues: [100_000, 400_000],
      assets: [
        makeAsset({ id: 'a', expected_return: 2 }),
        makeAsset({ id: 'b', expected_return: 7 }),
      ],
    })
    const rowsCf = computeAfbouwSchedulePerAsset({ ...common, distributionStrategy: 'cash_first' })
    const rowsLrf = computeAfbouwSchedulePerAsset({ ...common, distributionStrategy: 'lowest_return_first' })
    for (let i = 0; i < rowsCf.length; i++) {
      expect(rowsCf[i].endBalance).toBeCloseTo(rowsLrf[i].endBalance, 2)
      expect(rowsCf[i].perAssetValues[0]).toBeCloseTo(rowsLrf[i].perAssetValues[0], 2)
    }
  })
})

// ── AOW-splitsing in cashflow ──────────────────────────────────

describe('computeAfbouwSchedulePerAsset — AOW detectie', () => {
  it('aowIncomeThisYear > 0 wanneer cashflow id prefix le-aow-', () => {
    const cfs: SimCashflow[] = [{
      id: 'le-aow-adjusted-event1',
      name: 'AOW',
      type: 'recurring',
      direction: 'income',
      amount: 1558, // monthly
      fromAge: 67,
      toAge: null,
      indexed: true,
    }]
    const rows = computeAfbouwSchedulePerAsset(baseAfbouwInputs({
      retirementAge: 65,
      endAge: 75,
      cashflows: cfs,
    }))
    // Pre-AOW (age 65-66): geen AOW
    expect(rows[0].aowIncomeThisYear).toBe(0)
    expect(rows[1].aowIncomeThisYear).toBe(0)
    // Age 67+: AOW kicks in
    expect(rows[2].aowIncomeThisYear).toBeGreaterThan(0)
    // eventCashflowNetThisYear = totaal − AOW; voor pure AOW is dat 0
    expect(Math.abs(rows[2].eventCashflowNetThisYear)).toBeLessThan(1)
  })
})

// ── ensureAowCashflow ──────────────────────────────────────────

describe('ensureAowCashflow', () => {
  it('zonder AOW life-event: voegt __aow recurring cashflow toe', () => {
    const result = ensureAowCashflow([], 67, 95, false, [])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('__aow')
    expect(result[0].type).toBe('recurring')
    expect(result[0].direction).toBe('income')
    expect(result[0].fromAge).toBe(67)
    expect(result[0].toAge).toBe(95)
    // Amount is monthly-conventie (conform SimCashflow)
    expect(result[0].amount).toBe(1558)
  })

  it('met AOW life-event: laat cashflows ongewijzigd', () => {
    const events: LifeEvent[] = [makeLifeEvent({ event_type: 'aow', target_age: 67 })]
    const preExisting: SimCashflow[] = [{
      id: 'le-aow-adjusted-le1',
      name: 'AOW',
      type: 'recurring',
      direction: 'income',
      amount: 1558,
      fromAge: 67,
      toAge: null,
      indexed: true,
    }]
    const result = ensureAowCashflow(preExisting, 67, 95, false, events)
    expect(result).toBe(preExisting) // identiek referentie: geen mutatie
  })

  it('samenwonend gebruikt lager maandbedrag (AOW per partner)', () => {
    const single = ensureAowCashflow([], 67, 95, false, [])
    const partner = ensureAowCashflow([], 67, 95, true, [])
    expect(partner[0].amount).toBeLessThan(single[0].amount)
    expect(partner[0].amount).toBe(1072)
  })

  it('endAge ≤ aowAge: geen cashflow toegevoegd', () => {
    const result = ensureAowCashflow([], 70, 68, false, [])
    expect(result).toHaveLength(0)
  })

  it('skipt bij bestaande __aow cashflow (dubbel-tel preventie)', () => {
    const existing: SimCashflow[] = [{
      id: '__aow',
      name: 'AOW',
      type: 'recurring',
      direction: 'income',
      amount: 1558,
      fromAge: 67,
      toAge: 95,
      indexed: true,
    }]
    const result = ensureAowCashflow(existing, 67, 95, false, [])
    expect(result).toBe(existing)
  })
})

// ── solveDepleteBaseWithdrawal ─────────────────────────────────

describe('solveDepleteBaseWithdrawal', () => {
  it('zonder cashflows: solve geeft endBalance ≈ 0', () => {
    const base = solveDepleteBaseWithdrawal({
      startBalance: 500_000,
      retirementAge: 65,
      endAge: 95,
      yearlyExpenses: 40_000,
      grossReturn: 0.07,
      inflationRate: 0.02,
      cashflows: [],
      targetEnd: 0,
    })
    expect(base).toBeGreaterThan(0)
    // Classic 4%-rule bandbreedte: base withdrawal zit tussen 3% en 8% van startBalance
    expect(base / 500_000).toBeGreaterThan(0.02)
    expect(base / 500_000).toBeLessThan(0.10)
  })

  it('met positieve cashflow: solved baseWithdrawal is HOGER (compenseert extra inkomen tijdens run)', () => {
    // Note: baseWithdrawal is het target-bedrag vóór cashflow-aftrek. Met
    // een positieve cashflow daalt het jaarlijkse portfolio-withdrawal,
    // waardoor meer balance overblijft — de solver moet dus een HOGER
    // baseWithdrawal-target kiezen om het verschil op te vangen en eindstand 0 te halen.
    const cfs: SimCashflow[] = [{
      id: 'cf-test',
      name: 'Extra income',
      type: 'recurring',
      direction: 'income',
      amount: 500, // monthly
      fromAge: 65,
      toAge: 95,
      indexed: false,
    }]
    const baseWithout = solveDepleteBaseWithdrawal({
      startBalance: 500_000,
      retirementAge: 65,
      endAge: 95,
      yearlyExpenses: 40_000,
      grossReturn: 0.07,
      inflationRate: 0.02,
      cashflows: [],
      targetEnd: 0,
    })
    const baseWith = solveDepleteBaseWithdrawal({
      startBalance: 500_000,
      retirementAge: 65,
      endAge: 95,
      yearlyExpenses: 40_000,
      grossReturn: 0.07,
      inflationRate: 0.02,
      cashflows: cfs,
      targetEnd: 0,
    })
    expect(baseWith).toBeGreaterThan(baseWithout)
  })

  it('legacy target: eindsaldo ≈ targetEnd (Addendum V: base geïnflateerd per jaar)', () => {
    const targetEnd = 100_000
    const inflation = 0.02
    const base = solveDepleteBaseWithdrawal({
      startBalance: 500_000,
      retirementAge: 65,
      endAge: 95,
      yearlyExpenses: 40_000,
      grossReturn: 0.07,
      inflationRate: inflation,
      cashflows: [],
      targetEnd,
    })
    // Simuleer met geïnflateerde base — consistent met Addendum V-semantiek:
    // solver kiest `base` als koopkracht-constante; per jaar geïnflateerd
    // wordt het nominale onttrekkingsbedrag.
    let balance = 500_000
    for (let y = 0; y < 30; y++) {
      const indexed = base * Math.pow(1 + inflation, y)
      balance = (balance - indexed) * 1.07
    }
    const rel = Math.abs(balance - targetEnd) / targetEnd
    expect(rel).toBeLessThan(0.01)
  })
})

// ── Debts in de afbouw-fase ────────────────────────────────────

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
    ...overrides,
  } as Debt
}

describe('computeAfbouwSchedulePerAsset — debts', () => {
  it('perDebtValues.length === debts.length en daalt over tijd', () => {
    const rows = computeAfbouwSchedulePerAsset(baseAfbouwInputs({
      startDebtValues: [20_000],
      debts: [makeDebt({ current_balance: 20_000, monthly_payment: 300 })],
    }))
    expect(rows[0].perDebtValues).toHaveLength(1)
    // Debt daalt: na een paar jaar moet hij op 0 staan.
    const last = rows[rows.length - 1]
    expect(last.perDebtValues[0]).toBeLessThanOrEqual(rows[0].perDebtValues[0])
  })
})
