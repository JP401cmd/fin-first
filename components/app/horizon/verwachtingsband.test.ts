import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { SimResult, SimRow } from '@/lib/fire-simulation'
import type { HousingStrategyConfig } from '@/lib/housing-strategy'
import { toSimResult } from '@/lib/unified-projection'
import {
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import { buildScenarioPathsFromSim } from './sim-chart'
import {
  computeVerwachtingsband,
  resolveVerwachtingsbandDoel,
  LEGE_VERWACHTINGSBAND,
} from './verwachtingsband'

/**
 * Verwachtingsband — de "waarschijnlijk vrij tussen X en Y"-randen van de Vrijheidsas
 * en de `laatst`-input van `computeStopMarge`.
 *
 * De kern van deze suite is de GRONDSLAG-fix (ADR 0034, I vs. J): de band tast rijen af
 * die netto vermogen INCL. eigen woning dragen (`SimRow.endPortfolio` = `row.netWorth`),
 * dus de drempel hoort `requiredFireNetWorth` (I@FIRE) te zijn en niet
 * `requiredFirePortfolio` (J@FIRE, liquide). Onder woningstrategie "meerekenen" is
 * J == I → byte-identiek; onder élke andere strategie kruiste het pad de liquide drempel
 * precies de overwaarde te vroeg.
 */

// ── Synthetische rijen (pure index-/ordening-contracten) ─────────────────────

function makeRow(age: number, startPortfolio: number, growth: number): SimRow {
  return {
    age,
    phase: 'accumulation',
    startPortfolio,
    growth,
    savings: 0,
    withdrawal: 0,
    cashflowNet: 0,
    oneTimeNet: 0,
    endPortfolio: startPortfolio + growth,
    grossIncome: 0,
    grossExpenses: 0,
    flowIn: 0,
    flowOut: 0,
  }
}

/** 40 jaar zuivere aangroei van 5%/jr — lang genoeg dat óók de −0,02-variant het doel haalt. */
function accumulatieRijen(): SimRow[] {
  const rows: SimRow[] = []
  let start = 100_000
  for (let i = 0; i < 40; i++) {
    rows.push(makeRow(40 + i, start, start * 0.05))
    start *= 1.05
  }
  return rows
}

function simMet(rows: SimRow[], over: Partial<SimResult> = {}): SimResult {
  return { rows, requiredFirePortfolio: 150_000, ...over } as SimResult
}

// ── Echte kernel-runs (grondslag-fix) ────────────────────────────────────────

const PINNED_AGE = 42
const ESSENTIAL_YEARLY = 40_000
const GROSS_RETURN = 0.07
/**
 * De liquide bezittingen worden gedeeld door 4 terwijl de eigen woning (en de daaraan
 * gekoppelde hypotheek) op volle grootte blijft. Zo (a) valt de verwachte FIRE-leeftijd
 * ruim in de toekomst i.p.v. "nu al bereikt", en (b) is de overwaarde groot genoeg t.o.v.
 * de portefeuille dat het I−J-gat het verschil tussen beide grondslagen zichtbaar maakt.
 * Zelfde truc als de schaal-fixture in `lib/hooks/use-horizon-fire-sim.test.ts`.
 */
const LIQUIDE_SCHAAL = 4

const fx = buildCompleetHorizonFixture(PINNED_AGE)

function schaalAsset(a: Asset): Asset {
  if (a.asset_type === 'eigen_huis') return a
  return {
    ...a,
    current_value: a.current_value / LIQUIDE_SCHAAL,
    purchase_value: a.purchase_value != null ? a.purchase_value / LIQUIDE_SCHAAL : a.purchase_value,
  }
}
function schaalDebt(d: Debt): Debt {
  if (d.linked_asset_id) return d // hypotheek volgt de (ongeschaalde) woning
  return {
    ...d,
    current_balance: d.current_balance / LIQUIDE_SCHAAL,
    original_amount: d.original_amount / LIQUIDE_SCHAAL,
  }
}

const schaalAssets = fx.assets.map(schaalAsset)
const schaalDebts = fx.debts.map(schaalDebt)

/** Draait de kernel voor één woningstrategie en levert het (echte) SimResult. */
function runMetWoningstrategie(housing: HousingStrategyConfig): SimResult {
  const profile: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(PINNED_AGE),
    yearly_essential_expenses: ESSENTIAL_YEARLY,
    retirement_expense_method: 'essential_budgets',
    fire_end_strategy: 'perpetual',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    housing_strategy_config: housing,
  }
  const outcome = computeConvergentieProjection({
    rawContext: {
      profile,
      assets: schaalAssets,
      debts: schaalDebts,
      lifeEvents: fx.lifeEvents,
      aowRows: [],
      yearlyExpenses: ESSENTIAL_YEARLY,
    },
  })
  if (!outcome.ok) throw new Error('fixture ongeldig — kernel-outcome niet ok')
  return toSimResult(outcome.result)
}

/** Het gedrag van VÓÓR de fix: dezelfde bouwer, maar met de LIQUIDE drempel (J@FIRE). */
function bandOpLiquideDrempel(sim: SimResult) {
  const paden = buildScenarioPathsFromSim(sim.rows, GROSS_RETURN, sim.requiredFirePortfolio)
  return { laatstFireAge: paden[0]?.fireAge ?? null, vroegstFireAge: paden[2]?.fireAge ?? null }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('resolveVerwachtingsbandDoel — grondslag I (incl. woning) met J als terugval', () => {
  it('incl.-woning-doel aanwezig ⇒ dát is de drempel (niet het liquide doel)', () => {
    expect(
      resolveVerwachtingsbandDoel({ rows: [], requiredFirePortfolio: 800_000, requiredFireNetWorth: 950_000 }),
    ).toBe(950_000)
  })

  it('incl.-woning-doel ontbreekt (stub-/mock-SimResult) ⇒ terugval op het liquide doel', () => {
    expect(resolveVerwachtingsbandDoel({ rows: [], requiredFirePortfolio: 800_000 })).toBe(800_000)
  })

  it('degeneratie (0 / negatief / niet-eindig) ⇒ terugval op het liquide doel', () => {
    const basis = { rows: [], requiredFirePortfolio: 800_000 }
    expect(resolveVerwachtingsbandDoel({ ...basis, requiredFireNetWorth: 0 })).toBe(800_000)
    expect(resolveVerwachtingsbandDoel({ ...basis, requiredFireNetWorth: -5 })).toBe(800_000)
    expect(resolveVerwachtingsbandDoel({ ...basis, requiredFireNetWorth: Number.NaN })).toBe(800_000)
  })

  it('geen run ⇒ 0 (geen band)', () => {
    expect(resolveVerwachtingsbandDoel(null)).toBe(0)
    expect(resolveVerwachtingsbandDoel(undefined)).toBe(0)
  })
})

describe('computeVerwachtingsband — degeneratie', () => {
  it('geen run / geen rijen / geen positief doel ⇒ lege band', () => {
    expect(computeVerwachtingsband(null, GROSS_RETURN)).toEqual(LEGE_VERWACHTINGSBAND)
    expect(computeVerwachtingsband(simMet([]), GROSS_RETURN)).toEqual(LEGE_VERWACHTINGSBAND)
    expect(
      computeVerwachtingsband(simMet(accumulatieRijen(), { requiredFirePortfolio: 0 }), GROSS_RETURN),
    ).toEqual(LEGE_VERWACHTINGSBAND)
  })
})

describe('computeVerwachtingsband — één aanroep, twee randen', () => {
  const rows = accumulatieRijen()
  const sim = simMet(rows, { requiredFireNetWorth: 150_000 })

  it('laatst = pessimist (index 0), vroegst = optimist (index 2) van dezelfde bouwer-aanroep', () => {
    const paden = buildScenarioPathsFromSim(rows, GROSS_RETURN, 150_000)
    expect(computeVerwachtingsband(sim, GROSS_RETURN)).toEqual({
      laatstFireAge: paden[0].fireAge,
      vroegstFireAge: paden[2].fireAge,
    })
  })

  it('vroegst ≤ verwacht (baseline-pad) ≤ laatst — de band omsluit de verwachting', () => {
    const paden = buildScenarioPathsFromSim(rows, GROSS_RETURN, 150_000)
    const band = computeVerwachtingsband(sim, GROSS_RETURN)
    expect(band.vroegstFireAge).not.toBeNull()
    expect(band.laatstFireAge).not.toBeNull()
    expect(paden[1].fireAge).not.toBeNull()
    expect(band.vroegstFireAge!).toBeLessThanOrEqual(paden[1].fireAge!)
    expect(paden[1].fireAge!).toBeLessThanOrEqual(band.laatstFireAge!)
  })
})

describe('grondslag-fix — woningstrategie ≠ meerekenen (uitsluiten)', () => {
  const sim = runMetWoningstrategie({ mode: 'exclude_from_fire' })
  const verwacht = sim.fireAgeFractional
  const band = computeVerwachtingsband(sim, GROSS_RETURN)
  const oud = bandOpLiquideDrempel(sim)

  it('fixture-sanity: FIRE ruim in de toekomst én een echt I−J-gat (overwaarde)', () => {
    expect(verwacht).not.toBeNull()
    expect(verwacht!).toBeGreaterThan(PINNED_AGE + 5)
    expect(sim.requiredFireNetWorth).toBeDefined()
    expect(sim.requiredFireNetWorth! - sim.requiredFirePortfolio).toBeGreaterThan(100_000)
  })

  it('NA de fix: vroegst ≤ verwacht ≤ laatst (of laatst null)', () => {
    expect(band.vroegstFireAge).not.toBeNull()
    // Deze fixture bereikt FIRE ruim ná het eerste rijjaar, dus de scherpe vorm geldt.
    // (Algemeen is de bovengrens `ceil(verwacht)`: de band tast jaargrenzen af.)
    expect(band.vroegstFireAge!).toBeLessThanOrEqual(verwacht!)
    // `laatst === null` = de voorzichtige variant haalt het incl.-woning-doel nooit;
    // `computeStopMarge` claimt dan bewust nooit 'stevig' (conservatief 'krap').
    if (band.laatstFireAge !== null) expect(band.laatstFireAge).toBeGreaterThanOrEqual(verwacht!)
  })

  it('VÓÓR de fix lag de hele band vóór de verwachting — regressie-anker', () => {
    // Het pad draagt netto vermogen INCL. woning; tegen de LIQUIDE drempel kruiste het
    // precies de overwaarde te vroeg. Gevolg: `laatst < verwacht`, waarna de defensieve
    // clamp in stop-marge.ts (`laatst = max(laatst, verwacht)`) elke stop ≥ verwacht op
    // 'stevig' zette — de gemelde "waarschijnlijk vrij tussen 45 en 47"-onzin.
    expect(oud.laatstFireAge).not.toBeNull()
    expect(oud.laatstFireAge!).toBeLessThan(verwacht!)
    expect(oud.vroegstFireAge).not.toBeNull()
    expect(oud.vroegstFireAge!).toBeLessThan(verwacht!)
    // De fix schuift de vroege rand naar achteren (richting de verwachting).
    expect(band.vroegstFireAge!).toBeGreaterThan(oud.vroegstFireAge!)
  })
})

describe('grondslag-fix — woningstrategie meerekenen: J == I ⇒ byte-identiek', () => {
  const sim = runMetWoningstrategie({ mode: 'include_full' })

  it('meerekenen ⇒ requiredFirePortfolio == requiredFireNetWorth (ADR 0034)', () => {
    expect(sim.requiredFireNetWorth).toBeDefined()
    expect(sim.requiredFireNetWorth!).toBeCloseTo(sim.requiredFirePortfolio, 2)
  })

  it('band identiek aan de uitkomst van vóór de fix (liquide drempel)', () => {
    expect(computeVerwachtingsband(sim, GROSS_RETURN)).toEqual(bandOpLiquideDrempel(sim))
  })
})
