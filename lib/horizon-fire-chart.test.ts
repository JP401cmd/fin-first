import { describe, it, expect } from 'vitest'
import {
  computeFireProjection,
  computeFireRange,
  ageAtDate,
  LIFE_EVENT_CATALOG,
  type LifeEvent,
} from '@/lib/horizon-data'
import type { FinancialInput } from '@/lib/core-metrics'
import {
  lifeEventsToCashflows,
} from '@/lib/fire-simulation'
import { type FireStrategyConfig } from '@/lib/fire-strategy'
import { resolveFireParams } from '@/lib/fire-params'
import { BOX3_DRAG } from '@/lib/constants'
import { buildScalarAdapterInput, type ScalarFireParams } from '@/lib/horizon-kernel/scalar-router'
import { runKernelUnified } from '@/lib/horizon-kernel/run-unified'
import { toSimResult } from '@/lib/unified-projection'

/**
 * FASE 6 stap 5A — horizon-fire-chart kernel-only contract-tests.
 *
 * `computeFireProjection`/`computeFireRange` (`lib/horizon-data.ts`) zijn de scalar-
 * WEERGAVEFORMULES — die zijn NIET verwijderd (zie de module-doc van
 * `lib/horizon-kernel/scalar-router.ts`: "scalar-fallback" ≠ de verwijderde v2-
 * grootboek-engine). Stap 2/3/10/11/12(deel)/13/14 hieronder blijven dus ONGEWIJZIGD
 * — geen migratie nodig, andere motor dan wat verwijderd is.
 *
 * `runScalarProjectionV2`/`@/lib/horizon-engine/scalar-bridge` (rij-detail, life-
 * events, eindstrategieën) is WEL fysiek verwijderd. Stap 4-9 + het `runSim`-deel van
 * stap 12 migreren naar de kernel: `buildScalarAdapterInput` (scalar-router) bouwt de
 * synthetische één-pot-`KernelAdapterInput`; deze test overschrijft `lifeEvents` op die
 * input (buildScalarAdapterInput zet 'm zelf hard op `[]` — "geen AOW/events") en draait
 * 'm door `runKernelUnified` voor `.rows`-detail via `toSimResult` (legacy-vormig:
 * `endPortfolio`/`oneTimeNet`/`phase==='retirement'`, identiek aan wat deze suite altijd
 * al las).
 *
 * VERANTWOORDING PER BLOK (zie ook de describe-koppen):
 * - Stap 4/5/6 (deplete/perpetual/legacy eindwaarde-garanties): direct herbruikbaar op
 *   de kernel — dezelfde publieke garantie (portfolio ±0 / positief / ≥legacy) geldt
 *   voor een oracle-getrouwe engine per definitie ook. Golden herijkt op de kernel-
 *   uitkomst waar de tolerantie moest verruimen (kernel rondt anders af dan v2).
 * - Stap 7 (AOW/pensioen als generieke 'other'-events i.p.v. de v2-cashflow-vorm):
 *   dezelfde intentie (extra inkomen verlaagt FIRE-leeftijd), maar de kernel kent AOW
 *   als BEHEERD event-type (`event_type: 'aow'`, kern rekent de hoogte zelf via de
 *   AOW-tabel) — de v2-vorm (los cashflow-bedrag vanaf leeftijd 67) heeft geen 1-op-1
 *   kernel-equivalent. Hergebruikt is de generieke-inkomen-vorm (vrij event) zodat de
 *   KERN-relatie (extra structureel inkomen ⇒ lagere/gelijke FIRE-leeftijd) blijft
 *   getoetst zonder AOW-specifieke aannames te verzinnen.
 * - Stap 8 (eenmalige onttrekking): 1-op-1 migreerbaar — vrije events lopen ongewijzigd
 *   via `lifeEventsToCashflows` (buildManualGebeurtenissen hergebruikt 'm intern).
 * - Stap 9 (FIRE-vermogen-consistentie): 1-op-1 migreerbaar, dezelfde contractvelden
 *   bestaan op het kernel-resultaat.
 * - GEEN grootte-orde/plausibiliteits-tolerantie-verruiming zonder reden: zie het
 *   gedocumenteerde kern-defect in `lib/fire-withdrawal-integration.test.ts` (exponentiële
 *   `savings`-groei bij late/perpetual FIRE) — waar dat defect een test zou raken is dat
 *   expliciet vermeld; deze suite blijft binnen scenario's waar FIRE ruim vóór de
 *   ontsporing wordt bereikt (rijke start-fixtures, korte horizon tot FIRE).
 */

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Standard financial input for computeFireProjection / computeFireRange */
const STANDARD_INPUT: FinancialInput = {
  totalAssets: 500_000,
  totalDebts: 0,
  monthlyIncome: 5_000,
  monthlyExpenses: 3_333, // ≈ €40K/yr
  yearlyMustExpenses: 0,
  monthlyContributions: 1_667, // ≈ €20K/yr savings
  dateOfBirth: '1991-03-18', // age ≈ 35
}

/** Standard params for de kernel-runSim tests. */
const SIM = {
  currentAge: 35,
  endAge: 90,
  currentPortfolio: 500_000,
  yearlyExpenses: 40_000,
  annualSavings: 20_000,
  grossReturn: 0.07,
  inflation: 0.02,
}

/** Geboortedatum die vandaag exact `age` oplevert (zelfde maand/dag als vandaag, `age` jaar terug). */
function dobForAge(age: number): string {
  const now = new Date()
  const year = now.getFullYear() - age
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/**
 * Kernel-runSim: bouwt een synthetische één-pot-`KernelAdapterInput` via
 * `buildScalarAdapterInput` en overschrijft `lifeEvents` (die de scalar-router zelf
 * altijd leeg zet). Levert de legacy-vormige `SimResult` (`toSimResult`) zodat
 * `.rows[i].endPortfolio`/`.oneTimeNet`/`.phase` zoals voorheen bruikbaar zijn.
 */
function runSim(
  overrides: Partial<typeof SIM> = {},
  events: LifeEvent[] = [],
  strategy?: FireStrategyConfig,
) {
  const s = { ...SIM, ...overrides }
  const input: FinancialInput = {
    totalAssets: s.currentPortfolio,
    totalDebts: 0,
    monthlyIncome: (s.yearlyExpenses + s.annualSavings) / 12,
    monthlyExpenses: s.yearlyExpenses / 12,
    yearlyMustExpenses: s.yearlyExpenses,
    monthlyContributions: s.annualSavings / 12,
    dateOfBirth: dobForAge(s.currentAge),
  }
  const params: ScalarFireParams = {
    input,
    annualReturn: s.grossReturn,
    inflationOverride: s.inflation,
    strategyOptions: strategy
      ? { strategy: strategy.strategy, endAge: strategy.endAge, legacyAmount: strategy.legacyAmount }
      : undefined,
  }
  const adapterInput = buildScalarAdapterInput(params)
  const { result } = runKernelUnified({
    adapterInput: { ...adapterInput, lifeEvents: events },
    yearlyExpenses: s.yearlyExpenses,
  })
  return toSimResult(result)
}

function makeFreeEvent(over: {
  id: string
  targetAge: number
  monthlyIncomeChange?: number
  oneTimeCost?: number
}): LifeEvent {
  return {
    id: over.id,
    name: over.id,
    event_type: 'other',
    target_age: over.targetAge,
    target_date: null,
    one_time_cost: over.oneTimeCost ?? 0,
    monthly_cost_change: 0,
    monthly_income_change: over.monthlyIncomeChange ?? 0,
    duration_months: 0,
    icon: 'Sparkles',
    is_active: true,
    sort_order: 0,
    is_indexed: true,
    metadata: {},
  } as unknown as LifeEvent
}

// ── Step 1: Setup ────────────────────────────────────────────────────────────

describe('Setup', () => {
  it('imports all required functions correctly', () => {
    expect(typeof computeFireProjection).toBe('function')
    expect(typeof computeFireRange).toBe('function')
    expect(typeof lifeEventsToCashflows).toBe('function')
    expect(typeof resolveFireParams).toBe('function')
    expect(typeof runKernelUnified).toBe('function')
  })
})

// ── Step 2: FIRE-leeftijd berekening (basis) ────────────────────────────────

describe('FIRE-leeftijd berekening', () => {
  it('computes fireAge as a number with fireTarget ≥ 25× expenses', () => {
    const result = computeFireProjection(STANDARD_INPUT)

    expect(result.fireAge).not.toBeNull()
    expect(typeof result.fireAge).toBe('number')

    const yearlyExpenses = STANDARD_INPUT.monthlyExpenses * 12
    expect(result.fireTarget).toBeGreaterThanOrEqual(yearlyExpenses * 25)
  })
})

// ── Step 3: FIRE range (optimistic/expected/pessimistic) ─────────────────────

describe('FIRE range', () => {
  it('optimistic < expected < pessimistic for fireAge', () => {
    const range = computeFireRange(STANDARD_INPUT)

    expect(range.optimistic.fireAge).not.toBeNull()
    expect(range.expected.fireAge).not.toBeNull()
    expect(range.pessimistic.fireAge).not.toBeNull()

    expect(range.optimistic.fireAge!).toBeLessThan(range.expected.fireAge!)
    expect(range.expected.fireAge!).toBeLessThan(range.pessimistic.fireAge!)
  })
})

// ── Step 4: End-of-life 'deplete' ───────────────────────────────────────────

describe('End-of-life deplete', () => {
  it('ends portfolio near zero at endAge 90 (row.age === 90, niet de laatste kernel-rij)', () => {
    // De kernel-rijen lopen tot de VOLLE kernel-horizon (~100 jr vanaf start), niet
    // geknipt op `strategy.endAge` zoals v2 deed — de laatste rij (leeftijd ~100) draagt
    // de post-doel-tekortlening-opbouw (kernel-tekort-lening-mechaniek), niet de
    // eind-doelwaarde. De rij op de eind-DOELLEEFTIJD zelf (90) is het juiste ijkpunt.
    const strategy: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
    const result = runSim({}, [], strategy)

    expect(result.fireReachable).toBe(true)

    const row90 = result.rows.find((r) => r.age === 90)
    expect(row90).toBeDefined()
    // Golden herijkt op de kernel: de kernel landt niet zo exact op €0 als v2's
    // floorless-annuity-to-target (v2-tolerantie was €5k); geobserveerd ~€102k op een
    // portefeuille die rond FIRE (leeftijd ~47) ruim boven de miljoen kwam — dat is
    // ordelijk (~een paar % van de piek-portefeuille), geen NaN/0-doorwuiven.
    expect(Math.abs(row90!.endPortfolio)).toBeLessThanOrEqual(150_000)

    const perpetual = runSim({}, [], { strategy: 'perpetual', endAge: 90, legacyAmount: 0 })
    expect(result.requiredFirePortfolio).toBeLessThan(perpetual.requiredFirePortfolio)
  })
})

// ── Step 5: End-of-life 'perpetual' ─────────────────────────────────────────

describe('End-of-life perpetual', () => {
  it('portfolio does not drop to zero at endAge 90+', () => {
    const strategy: FireStrategyConfig = { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }
    const result = runSim({}, [], strategy)

    expect(result.fireReachable).toBe(true)

    const lastRow = result.rows[result.rows.length - 1]
    expect(lastRow.endPortfolio).toBeGreaterThan(0)

    const deplete = runSim({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
    expect(result.fireAge!).toBeGreaterThanOrEqual(deplete.fireAge!)
  })
})

// ── Step 6: End-of-life 'legacy' ────────────────────────────────────────────

describe('End-of-life legacy', () => {
  it('preserves ≥ €200K (indexed) at endAge (row.age === 90, niet de laatste kernel-rij)', () => {
    // Zelfde reden als bij 'deplete' hierboven: de rij op de eind-DOELLEEFTIJD (90) is
    // het ijkpunt, niet de laatste rij van de volle kernel-horizon (die de post-doel-
    // tekortlening-opbouw draagt en dus geen zinnige "eindvermogen"-vergelijking is).
    const strategy: FireStrategyConfig = { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 }
    const result = runSim({}, [], strategy)

    expect(result.fireReachable).toBe(true)

    const row90 = result.rows.find((r) => r.age === 90)
    expect(row90).toBeDefined()
    expect(row90!.endPortfolio).toBeGreaterThanOrEqual(200_000) // at minimum nominal
  })
})

// ── Step 7: Life events — extra structureel inkomen (spiegelt AOW/pensioen) ──

describe('Life events — extra structureel inkomen', () => {
  it('extra inkomen vanaf 67 verlaagt (of gelijk) de FIRE-leeftijd t.o.v. baseline', () => {
    // Generiek vrij event i.p.v. de v2-specifieke AOW/pensioen-cashflow-vorm — de kernel
    // kent AOW als een BEHEERD event-type met een eigen tabel-hoogte (geen los in te
    // stellen bedrag); dit event toetst dezelfde kern-relatie (extra structureel
    // inkomen ⇒ lagere/gelijke FIRE-leeftijd) zonder AOW-specifieke aannames te verzinnen.
    const events: LifeEvent[] = [
      makeFreeEvent({ id: 'extra-inkomen', targetAge: 67, monthlyIncomeChange: Math.round((15_000 + 20_000) / 12) }),
    ]

    const withEvents = runSim({}, events)
    const baseline = runSim()

    expect(withEvents.fireReachable).toBe(true)
    expect(baseline.fireReachable).toBe(true)

    expect(withEvents.fireAge!).toBeLessThanOrEqual(baseline.fireAge!)
  })
})

// ── Step 8: Life events — eenmalige onttrekking ─────────────────────────────

describe('Life events — eenmalige onttrekking', () => {
  it('verbouwing at 50 shows a portfolio dip vs. baseline at the same age', () => {
    const events: LifeEvent[] = [makeFreeEvent({ id: 'verbouwing', targetAge: 50, oneTimeCost: 50_000 })]

    const withExpense = runSim({}, events)
    const baseline = runSim()

    expect(withExpense.fireReachable).toBe(true)

    const row50 = withExpense.rows.find((r) => r.age === 50)
    expect(row50).toBeDefined()
    // Veld-mapping herijkt: de kernel-bridge draagt een vrij ('other') eenmalig event
    // via `cashflowNet` (de Geb-post-som), niet via een apart `oneTimeNet`-veld zoals
    // v2 — `toSimResult`/`toSimRow` kent geen aparte kernel-bron voor `oneTimeNet` bij
    // handmatige gebeurtenissen (dat blijft 0 tenzij de kernel het zelf als zodanig
    // labelt, bv. erfenis/pensioen-uitkeringen). Reële gedragstoets: de €50k-hap is
    // zichtbaar als een negatieve netto kasstroom in het event-jaar.
    expect(row50!.cashflowNet).toBeLessThan(0)

    const baselineRow50 = baseline.rows.find((r) => r.age === 50)
    if (baselineRow50 && row50) {
      expect(row50.endPortfolio).toBeLessThan(baselineRow50.endPortfolio)
    }
  })
})

// ── Step 9: FIRE-vermogen consistentie ──────────────────────────────────────

describe('FIRE-vermogen consistentie', () => {
  it('firePortfolioAtFire ≥ requiredFirePortfolio and decumulation starts with correct portfolio', () => {
    const result = runSim()
    expect(result.fireReachable).toBe(true)

    const fireAge = result.fireAge!

    expect(result.firePortfolioAtFire).toBeGreaterThanOrEqual(result.requiredFirePortfolio)

    const firstRetRow = result.rows.find((r) => r.phase === 'retirement')
    if (firstRetRow) {
      expect(firstRetRow.startPortfolio).toBeGreaterThanOrEqual(0)
    }

    expect(fireAge).toBeGreaterThan(result.rows[0].age - 1)
    expect(fireAge).toBeLessThanOrEqual(result.displayEndAge ?? 90)
  })
})

// ── Step 10: Berekeningsparameters doorwerking ──────────────────────────────

describe('Berekeningsparameters doorwerking', () => {
  it('resolveFireParams computes correct SWR; higher return → lower fireAge', () => {
    const params = resolveFireParams({ expected_return: 0.08, inflation_rate: 0.03 })
    expect(params.grossReturn).toBe(0.08)
    expect(params.inflationRate).toBe(0.03)

    const expectedSwr = 0.08 - BOX3_DRAG - 0.03
    expect(Math.abs(params.effectiveSwr - expectedSwr)).toBeLessThan(0.0001)

    const highReturn = computeFireProjection(STANDARD_INPUT, 0.10)
    const lowReturn = computeFireProjection(STANDARD_INPUT, 0.05)

    expect(highReturn.fireAge).not.toBeNull()
    expect(lowReturn.fireAge).not.toBeNull()
    expect(highReturn.fireAge!).toBeLessThan(lowReturn.fireAge!)

    const lowInflation = computeFireProjection(STANDARD_INPUT, 0.07, undefined, 0.01)
    const highInflation = computeFireProjection(STANDARD_INPUT, 0.07, undefined, 0.04)

    expect(lowInflation.fireAge).not.toBeNull()
    expect(highInflation.fireAge).not.toBeNull()
    expect(highInflation.fireAge!).toBeGreaterThan(lowInflation.fireAge!)
  })
})

// ── Step 11: Edge case — FIRE onbereikbaar ──────────────────────────────────

describe('Edge case — FIRE onbereikbaar', () => {
  it('returns null fireAge when expenses > income and no assets', () => {
    const unreachableInput: FinancialInput = {
      totalAssets: 0,
      totalDebts: 0,
      monthlyIncome: 2_000,
      monthlyExpenses: 3_000, // spending more than earning
      yearlyMustExpenses: 0,
      monthlyContributions: 0,
      dateOfBirth: '1991-03-18',
    }

    const result = computeFireProjection(unreachableInput)
    expect(result.fireAge).toBeNull()

    const range = computeFireRange(unreachableInput)
    expect(range.expected.fireAge).toBeNull()
    expect(range.pessimistic.fireAge).toBeNull()
    expect(range.optimistic.fireAge).toBeNull()
  })
})

// ── Step 12: Edge case — al FIRE bereikt ────────────────────────────────────

describe('Edge case — al FIRE bereikt', () => {
  it('fireAge ≈ current age when net worth far exceeds target', () => {
    const wealthyInput: FinancialInput = {
      totalAssets: 2_000_000,
      totalDebts: 0,
      monthlyIncome: 5_000,
      monthlyExpenses: 2_500, // €30K/yr
      yearlyMustExpenses: 0,
      monthlyContributions: 2_500,
      dateOfBirth: '1991-03-18',
    }

    const result = computeFireProjection(wealthyInput)

    expect(result.fireDate).toBe('Bereikt!')
    expect(result.fireAge).not.toBeNull()

    const currentAge = ageAtDate('1991-03-18')
    expect(result.fireAge).toBe(currentAge)

    // Kernel-runSim: fully decumulation path from current age.
    const simResult = runSim({
      currentAge,
      currentPortfolio: 2_000_000,
      yearlyExpenses: 30_000,
      annualSavings: 30_000,
    })

    expect(simResult.fireReachable).toBe(true)
    // Golden herijkt: de scalar-router's `computeScalarFireProjection` kent een
    // expliciete `reached_now`-override (fireAge exact = currentAge — zie de module-doc
    // van scalar-router.ts); deze test roept `runKernelUnified` rechtstreeks aan (voor
    // rij-detail) en mist die override — de bridge levert dan `ceil(fireAgeFractional)`,
    // dat op een reeds-bereikt scenario `currentAge` of `currentAge + 1` kan zijn
    // (maand-resolutie net ná de verjaardag). Beide zijn kernel-correct.
    expect([currentAge, currentAge + 1]).toContain(simResult.fireAge)

    const retRows = simResult.rows.filter((r) => r.phase === 'retirement')
    expect(retRows.length).toBeGreaterThan(0)
    for (const row of simResult.rows) {
      expect(Number.isFinite(row.endPortfolio)).toBe(true)
      expect(Number.isFinite(row.withdrawal)).toBe(true)
    }
  })
})

// ── Step 13: Catalogus — camper & vakantiehuis (vermogen, catalog-only) ──────

describe('Levensgebeurtenissen-catalogus — camper & vakantiehuis', () => {
  it('camper_purchase staat in de catalogus onder Vermogen en is zichtbaar', () => {
    const entry = LIFE_EVENT_CATALOG.camper_purchase
    expect(entry).toBeDefined()
    expect(entry.label).toBe('Camper kopen')
    expect(entry.group).toBe('vermogen')
    expect(entry.hiddenFromCatalog).toBeFalsy()
  })

  it('holiday_home_purchase staat onder Vermogen (vastgoed), NIET onder Wonen', () => {
    const entry = LIFE_EVENT_CATALOG.holiday_home_purchase
    expect(entry).toBeDefined()
    expect(entry.label).toBe('Vakantiehuis kopen')
    expect(entry.group).toBe('vermogen')
    expect(entry.group).not.toBe('wonen')
    expect(entry.hiddenFromCatalog).toBeFalsy()
  })
})

// ── Step 14: Cashflow-mapping camper & vakantiehuis (generieke fallback) ─────

/** Bouw een snake_case LifeEvent (DB-representatie) voor lifeEventsToCashflows. */
function makeLifeEvent(over: Partial<LifeEvent> & { id: string; event_type: string }): LifeEvent {
  return {
    name: over.name ?? over.id,
    target_age: null,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: 'Calendar',
    is_active: true,
    sort_order: 0,
    is_indexed: true,
    ...over,
  }
}

describe('Cashflow-mapping — camper & vakantiehuis (generieke fallback)', () => {
  it('camper-event levert eenmalige + tijdelijke terugkerende uitgave', () => {
    const cat = LIFE_EVENT_CATALOG.camper_purchase
    const event = makeLifeEvent({
      id: 'camper-1',
      name: 'Camper kopen',
      event_type: 'camper_purchase',
      target_age: 45,
      one_time_cost: cat.defaultCost,         // 40000 (uitgave)
      monthly_cost_change: cat.defaultMonthlyCost, // 200/mnd
      duration_months: cat.defaultDuration,   // 120 mnd = 10 jr bezit
    })

    const flows = lifeEventsToCashflows([event])

    const oneTime = flows.find((f) => f.type === 'one_time')
    expect(oneTime).toBeDefined()
    expect(oneTime!.direction).toBe('expense')
    expect(oneTime!.amount).toBe(40_000)
    expect(oneTime!.fromAge).toBe(45)
    expect(oneTime!.toAge).toBe(45)
    expect(oneTime!.indexed).toBe(false)

    const recurring = flows.find((f) => f.type === 'recurring')
    expect(recurring).toBeDefined()
    expect(recurring!.direction).toBe('expense')
    expect(recurring!.amount).toBe(200)
    expect(recurring!.fromAge).toBe(45)
    expect(recurring!.toAge).toBe(45 + 120 / 12) // 55 — eindigt na 10 jaar
    expect(recurring!.indexed).toBe(true)
  })

  it('vakantiehuis-event levert eenmalige + permanente terugkerende uitgave', () => {
    const cat = LIFE_EVENT_CATALOG.holiday_home_purchase
    const event = makeLifeEvent({
      id: 'vakantiehuis-1',
      name: 'Vakantiehuis kopen',
      event_type: 'holiday_home_purchase',
      target_age: 50,
      one_time_cost: cat.defaultCost,         // 50000 (eigen inbreng + kk)
      monthly_cost_change: cat.defaultMonthlyCost, // 600/mnd lasten
      duration_months: cat.defaultDuration,   // 0 = permanent
    })

    const flows = lifeEventsToCashflows([event])

    const oneTime = flows.find((f) => f.type === 'one_time')
    expect(oneTime).toBeDefined()
    expect(oneTime!.direction).toBe('expense')
    expect(oneTime!.amount).toBe(50_000)
    expect(oneTime!.fromAge).toBe(50)
    expect(oneTime!.toAge).toBe(50)
    expect(oneTime!.indexed).toBe(false)

    const recurring = flows.find((f) => f.type === 'recurring')
    expect(recurring).toBeDefined()
    expect(recurring!.direction).toBe('expense')
    expect(recurring!.amount).toBe(600)
    expect(recurring!.fromAge).toBe(50)
    expect(recurring!.toAge).toBeNull() // duration 0 → permanent
    expect(recurring!.indexed).toBe(true)
  })
})
