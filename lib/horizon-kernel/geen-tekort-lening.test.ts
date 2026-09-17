/**
 * ADR 0149 — **"Geen tekort-lening in mijn plan"** als planvoorwaarde (app-only,
 * buiten het Excel-oracle-domein).
 *
 * Met `KernelInput.geenTekortLening` is een stopmoment pas toereikend wanneer, náást
 * `gap ≥ 0`, er t/m de eindleeftijd geen BLIJVENDE tekort-lening nodig is
 * (`runway.ts#heeftBlijvendeTekortLening`, dezelfde episode-regel als `depletionMonth`:
 * een brug ≤ `MAX_TRANSIENT_SPAN_MONTHS` die bewezen is afgelost telt niet). Het
 * criterium woont op één plek (`solver.ts#isToereikend`) en wordt door de solver, de
 * scenarioband, de Monte-Carlo en de rendement-marge gedeeld.
 *
 * Vlag weggelaten/`false` ⇒ byte-identiek aan het bestaande gedrag; het fixture-pad
 * zet 'm nooit ⇒ oracle-parity onaangetast (aparte suite, `test/horizon-oracle`).
 *
 * Persona: "Tessa Compleet" (gepind op 42, deplete tot 90) mét een extra pensioen-
 * inkomen vanaf 68. Bezittingen ×0,1 ⇒ het liquide vermogen raakt na een vroege stop
 * rond 58 op, de tekort-lening loopt ~30 jaar en wordt pas ná 68 uit het pensioen
 * afgelost — de gap op 90 is dan wél ≥ 0. Precies het plan dat de instelling uitsluit.
 */

import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import { buildKernelInputFromApp, buildKernelInputFromAppWithNotices } from './adapter'
import { memberProfileToKernelAdapterProfile } from './adapter/partner-blok'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from './convergentie-router'
import { computeEs } from './tables/es'
import { evaluateFireAt, isToereikend, solveFire, type SolveFireResult } from './solver'
import {
  heeftBlijvendeTekortLening,
  MAX_TRANSIENT_SPAN_MONTHS,
  type TekortProjectionView,
} from './runway'
import { runScenarioBand } from './wrappers/band'
import { runMonteCarlo } from './wrappers/mc'
import { computeRendementMarge } from './rendement-marge'
import type { KernelInput } from './types'

// ── Persona + het pensioen-gat ─────────────────────────────────────────────────

const PINNED_AGE = 42
const EINDLEEFTIJD = 90
const fx = buildCompleetHorizonFixture(PINNED_AGE)

const basisProfiel: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  fire_end_strategy: 'deplete',
  fire_end_age: EINDLEEFTIJD,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}

/** Extra pensioen-inkomen vanaf 68: lost een eerder tekort ná 68 af (gap op 90 ≥ 0). */
const EXTRA_PENSIOEN = {
  id: 'evt-extra-pensioen',
  name: 'Extra pensioen',
  event_type: 'pensioen',
  target_age: 68,
  one_time_cost: 0,
  monthly_cost_change: 0,
  monthly_income_change: 4000,
  is_active: true,
  sort_order: 9,
  metadata: {},
} as unknown as LifeEvent

const scaleAssets = (factor: number): Asset[] =>
  fx.assets.map((a) => ({ ...a, current_value: a.current_value * factor }) as Asset)

function makeInput(
  over: Partial<ConvergentieRawProfileRow> = {},
  assets: readonly Asset[] = scaleAssets(0.1),
  lifeEvents: readonly LifeEvent[] = [...fx.lifeEvents, EXTRA_PENSIOEN],
): KernelInput {
  // Sinds 17 sep 2026 is de instelling standaard AAN (NULL = aan). Deze suite
  // vergelijkt UIT met AAN, dus de basis zet 'm expliciet uit.
  return buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({ ...basisProfiel, fire_no_deficit_loan: false, ...over }),
    assets,
    debts: fx.debts,
    lifeEvents,
    aowRows: [],
  })
}

const metVlag = (input: KernelInput): KernelInput => ({ ...input, geenTekortLening: true })

/** Aantal maanden t/m de eindleeftijd met een materieel tekort-slot-saldo (≥ €1). */
function tekortMaanden(input: KernelInput, solve: SolveFireResult): number {
  const slot = input.schuldPotten.find((p) => p.rol === 'tekortLening')?.slot ?? -1
  const eindMaand = (solve.eindleeftijd - input.startLeeftijd) * 12
  let n = 0
  for (let m = 0; m <= eindMaand; m++) {
    const saldo = solve.projection.s[m]?.slots[slot]?.saldo
    if (typeof saldo === 'number' && Math.round(saldo) >= 1) n += 1
  }
  return n
}

const zonderProjectie = (s: SolveFireResult): Omit<SolveFireResult, 'projection'> => {
  const { projection: _p, ...rest } = s
  return rest
}

// ── (a) het plan met een blijvende tekort-lening ───────────────────────────────

describe('solveFire — geenTekortLening (ADR 0149)', () => {
  const input = makeInput()
  const off = solveFire(input)
  const on = solveFire(metVlag(input))

  it('(a) vlag UIT: de bisectie vindt FIRE X mét een blijvende tekort-lening (gap ≥ 0)', () => {
    expect(off.status).toBe('reached_at')
    expect(off.gap).toBeGreaterThanOrEqual(0)
    expect(off.tekortLeningTotEindleeftijd).toBeGreaterThan(100_000)
    // De tekort-episode is geen brug: ze loopt vele jaren.
    expect(tekortMaanden(input, off)).toBeGreaterThan(MAX_TRANSIENT_SPAN_MONTHS * 5)
    expect(heeftBlijvendeTekortLening(input, off.projection, off.eindleeftijd)).toBe(true)
    // Bewijs dat het criterium zonder vlag puur de gap is: dezelfde stand is "toereikend".
    expect(isToereikend(input, computeEs(input), off.projection, off.fireAge)).toBe(true)
  })

  it('(a) vlag AAN: FIRE > X, zonder blijvende tekort-lening op de gekozen leeftijd', () => {
    expect(on.fireAge).toBeGreaterThan(off.fireAge)
    expect(on.fireAge).toBeLessThan(100)
    expect(on.status).toBe('reached_at')
    expect(heeftBlijvendeTekortLening(input, on.projection, on.eindleeftijd)).toBe(false)
    expect(isToereikend(metVlag(input), computeEs(input), on.projection, on.fireAge)).toBe(true)
    // Dezelfde stand is mét vlag NIET toereikend op de oude FIRE X.
    expect(isToereikend(metVlag(input), computeEs(input), off.projection, off.fireAge)).toBe(false)
    // Geen extra engine-runs: dezelfde bisectie, alleen een ander criterium.
    expect(on.engineRuns).toBeLessThanOrEqual(off.engineRuns + 1)
  })

  it('(a) de vroegste maand: één maand eerder stoppen is mét vlag niet toereikend', () => {
    const eenMaandEerder = on.fireAge - 1 / 12
    const proj = solveFire({ ...metVlag(input), stopAnker: { soort: 'leeftijd', leeftijd: eenMaandEerder } }).projection
    expect(isToereikend(metVlag(input), computeEs(input), proj, eenMaandEerder)).toBe(false)
  })

  it('(h) geforceerd stopmoment (evaluateFireAt) houdt mét vlag zijn status — stopkaarten en gekozen-stop-pad blijven bereikbaar', () => {
    // Given de oude FIRE X, waar een blijvende tekort-lening nodig is,
    // When die leeftijd geforceerd wordt doorgerekend met de vlag aan,
    // Then blijft de status gelijk aan vlag uit (geen unreachable → bridge fireReachable blijft true).
    const geforceerdOff = evaluateFireAt(input, off.fireAge)
    const geforceerdOn = evaluateFireAt(metVlag(input), off.fireAge)
    expect(heeftBlijvendeTekortLening(input, geforceerdOn.projection, geforceerdOn.eindleeftijd)).toBe(true)
    expect(geforceerdOn.status).toBe(geforceerdOff.status)
    expect(geforceerdOn.status).not.toBe('unreachable_within_horizon')
  })

  // ── (c) vast anker: de leeftijd blijft staan, het tekort meldt zich als anker-status ──
  it('(c) vast anker + vlag AAN ⇒ leeftijd = anker, status anchor_shortfall, identiek aan vlag UIT', () => {
    const anker = makeInput({ fire_stop_anchor: 'age', fire_stop_age: 47 })
    const ankerOff = solveFire(anker)
    const ankerOn = solveFire(metVlag(anker))
    expect(ankerOn.fireAge).toBe(47)
    expect(ankerOn.status).toBe('anchor_shortfall')
    expect(ankerOn.engineRuns).toBe(1)
    expect(heeftBlijvendeTekortLening(anker, ankerOn.projection, ankerOn.eindleeftijd)).toBe(true)
    expect(zonderProjectie(ankerOn)).toEqual(zonderProjectie(ankerOff))
  })

  it('(c) nu-anker + vlag AAN ⇒ stop_now_shortfall (F2-compat-naam blijft)', () => {
    const nu = solveFire(metVlag(makeInput({ fire_stop_anchor: 'now' })))
    expect(nu.fireAge).toBe(PINNED_AGE)
    expect(nu.status).toBe('stop_now_shortfall')
  })

  // ── (d) nergens binnen de horizon toereikend ───────────────────────────────────
  it('(d) tekort óók bij doorwerken tot 100 ⇒ parkeerstand + unreachable_within_horizon', () => {
    // Uitgaven > inkomen: het liquide vermogen raakt al tijdens het werken op; het
    // pensioen vanaf 68 lost de lening later wél af (gap ≥ 0), maar de episode is blijvend.
    const arm = makeInput({ net_monthly_income: 1000, estimated_monthly_expenses: 3500 })
    const armOff = solveFire(arm)
    const armOn = solveFire(metVlag(arm))
    expect(armOff.status).toBe('reached_at')
    expect(armOn.fireAge).toBe(100)
    expect(armOn.status).toBe('unreachable_within_horizon')
    expect(armOn.vastStopLeeftijd).toBeNull()
    expect(armOn.engineRuns).toBe(1) // horizon-check faalt → geen bisectie
    expect(heeftBlijvendeTekortLening(arm, armOn.projection, armOn.eindleeftijd)).toBe(true)
  })

  // ── (e) afwezig ≡ false ────────────────────────────────────────────────────────
  it('(e) vlag afwezig vs. false ⇒ identiek solveFire-resultaat', () => {
    const uit = solveFire({ ...input, geenTekortLening: false })
    expect(zonderProjectie(uit)).toEqual(zonderProjectie(off))
    expect(uit.projection.prognose).toEqual(off.projection.prognose)
    expect(uit.projection.s).toEqual(off.projection.s)
  })

  it('(e) een plan zonder tekort-lening: vlag AAN ≡ vlag UIT', () => {
    const ruim = makeInput({}, scaleAssets(1))
    const ruimOff = solveFire(ruim)
    expect(ruimOff.tekortLeningTotEindleeftijd).toBe(0)
    expect(zonderProjectie(solveFire(metVlag(ruim)))).toEqual(zonderProjectie(ruimOff))
  })
})

// ── (b) een brug (≤ 12 maanden, afgelost) verschuift niets ────────────────────

describe('overbrugging — een kortstondig, afgelost tekort telt niet (ADR 0149)', () => {
  // De F6-persona (tekort-aflossing-liquide.test.ts): "wanneer nodig"-huisverkoop met
  // kern-drempel 0 → een één-maand-transitie-lag-tekort dat de maand erna uit de
  // verkoopopbrengst wordt afgelost. Dat is de canonieke liquiditeitsbrug.
  const assets: Asset[] = [
    { id: 'a1', name: 'Betaalrekening', asset_type: 'cash', current_value: 15000, expected_return: 0, monthly_contribution: 0, is_active: true } as unknown as Asset,
    { id: 'a2', name: 'Spaarrekening', asset_type: 'savings', current_value: 40000, expected_return: 2.5, monthly_contribution: 0, is_active: true } as unknown as Asset,
    { id: 'a3', name: 'Mijn woning', asset_type: 'eigen_huis', current_value: 500000, expected_return: 3.5, monthly_contribution: 0, is_active: true } as unknown as Asset,
    { id: 'a4', name: 'Beleggingsrekening', asset_type: 'investment', current_value: 0, expected_return: 7, monthly_contribution: 0, is_active: true } as unknown as Asset,
  ]
  const debts: Debt[] = [
    { id: 'd1', name: 'Studielening DUO', debt_type: 'student_loan', current_balance: 40000, interest_rate: 0, monthly_payment: 222.22, is_active: true } as unknown as Debt,
    { id: 'd3', name: 'Hypotheek — Mijn woning', debt_type: 'mortgage', current_balance: 250000, interest_rate: 4, monthly_payment: 1193.54, is_active: true, linked_asset_id: 'a3' } as unknown as Debt,
  ]
  const lifeEvents: LifeEvent[] = [
    { id: 'e1', event_type: 'aow', name: 'AOW', target_age: 69, one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 1558, is_active: true, sort_order: 0, metadata: { leefsituatie: 'alleenstaand', jarenBuitenNL: 0 } } as unknown as LifeEvent,
  ]
  const brugInput = (): KernelInput => {
    const input = buildKernelInputFromAppWithNotices({
      profile: {
        date_of_birth: '1980-01-01', net_monthly_income: 5000, estimated_monthly_expenses: 3500,
        yearly_essential_expenses: 42000, expected_return: 0.07, inflation_rate: 0.02,
        box3_method: 'forfaitair', fire_end_strategy: 'deplete', fire_end_age: 90,
        withdrawal_strategy: 'static',
        housing_strategy_config: { mode: 'downsize', trigger: 'on_depletion', triggerAge: 67, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null, depletionThresholdYears: 0 },
        pot_rules: { surplus_group: 'beleggingen', deficit_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'], withdrawal_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'] },
        retirement_expense_method: 'essential_budgets',
      } as never,
      assets, debts, lifeEvents,
    }).input
    return { ...input, woning: { ...input.woning, drempelMaandenUitgave: 0 } }
  }

  it('(b) de transitie-brug bestaat, is kort, en verschuift de FIRE-leeftijd niet', () => {
    const input = brugInput()
    const off = solveFire(input)
    const on = solveFire(metVlag(input))
    const brugMaanden = tekortMaanden(input, off)
    expect(brugMaanden).toBeGreaterThan(0)
    expect(brugMaanden).toBeLessThanOrEqual(MAX_TRANSIENT_SPAN_MONTHS + 1)
    expect(heeftBlijvendeTekortLening(input, off.projection, off.eindleeftijd)).toBe(false)
    expect(zonderProjectie(on)).toEqual(zonderProjectie(off))
  })
})

// ── (f) de helper zelf — episode-regel op een synthetische S-tabel ────────────

describe('heeftBlijvendeTekortLening — episode-regel (ADR 0149)', () => {
  const SLOT = 6
  const START = 40
  const EIND = 90
  const basis = { startLeeftijd: START, schuldPotten: [{ rol: 'tekortLening', slot: SLOT }] } as unknown as KernelInput

  /** S-tabel met `saldo` op slot 6 voor de opgegeven maanden (rest 0), horizon = 720 mnd. */
  function view(saldi: Record<number, number>, lastInHorizonMonth = 720): TekortProjectionView {
    const s = Array.from({ length: lastInHorizonMonth + 1 }, (_, m) => ({
      slots: Array.from({ length: 8 }, (_, i) => ({ saldo: i === SLOT ? (saldi[m] ?? 0) : 0 })),
    }))
    return { s, summary: { lastInHorizonMonth } }
  }
  const reeks = (van: number, tot: number, bedrag = 10_000) => {
    const out: Record<number, number> = {}
    for (let m = van; m <= tot; m++) out[m] = bedrag
    return out
  }

  it('geen pot met rol tekortLening ⇒ false, ook met saldi in slot 6', () => {
    const zonderPot = { ...basis, schuldPotten: [] } as unknown as KernelInput
    expect(heeftBlijvendeTekortLening(zonderPot, view(reeks(100, 300)), EIND)).toBe(false)
  })

  it('geen enkele materiële maand ⇒ false (sub-euro-ruis telt als 0)', () => {
    expect(heeftBlijvendeTekortLening(basis, view({}), EIND)).toBe(false)
    expect(heeftBlijvendeTekortLening(basis, view(reeks(100, 400, 0.4)), EIND)).toBe(false)
  })

  it(`brug: een afgeloste episode van ≤ ${MAX_TRANSIENT_SPAN_MONTHS + 1} maanden telt niet`, () => {
    expect(heeftBlijvendeTekortLening(basis, view(reeks(100, 100)), EIND)).toBe(false)
    expect(heeftBlijvendeTekortLening(basis, view(reeks(100, 100 + MAX_TRANSIENT_SPAN_MONTHS)), EIND)).toBe(false)
  })

  it(`aanhoudend: een afgeloste episode van ${MAX_TRANSIENT_SPAN_MONTHS + 2} maanden telt wél`, () => {
    expect(heeftBlijvendeTekortLening(basis, view(reeks(100, 100 + MAX_TRANSIENT_SPAN_MONTHS + 1)), EIND)).toBe(true)
  })

  it('een korte episode die aan het venster-einde (eindleeftijd) nog openstaat telt wél', () => {
    const eindMaand = (EIND - START) * 12 // 600
    expect(heeftBlijvendeTekortLening(basis, view(reeks(eindMaand - 2, eindMaand)), EIND)).toBe(true)
    // …maar dezelfde reeks vóór het venster-einde, afgelost, is een brug.
    expect(heeftBlijvendeTekortLening(basis, view(reeks(eindMaand - 12, eindMaand - 10)), EIND)).toBe(false)
  })

  it('het venster is inclusief t/m de eindleeftijd; een tekort erná telt niet', () => {
    const eindMaand = (EIND - START) * 12
    expect(heeftBlijvendeTekortLening(basis, view(reeks(eindMaand + 1, eindMaand + 100)), EIND)).toBe(false)
    expect(heeftBlijvendeTekortLening(basis, view(reeks(eindMaand - 20, eindMaand + 100)), EIND)).toBe(true)
  })

  it('twee bruggen ná elkaar blijven bruggen; de eerste aanhoudende episode wint', () => {
    expect(heeftBlijvendeTekortLening(basis, view({ ...reeks(100, 105), ...reeks(120, 125) }), EIND)).toBe(false)
    expect(heeftBlijvendeTekortLening(basis, view({ ...reeks(100, 105), ...reeks(120, 200) }), EIND)).toBe(true)
  })

  it('de horizon begrenst het venster wanneer de eindleeftijd erbuiten ligt', () => {
    // Eindleeftijd 100 (maand 720) maar horizon op maand 500: een open episode op 500 telt.
    expect(heeftBlijvendeTekortLening(basis, view(reeks(498, 500), 500), 100)).toBe(true)
  })
})

// ── (g) band, Monte-Carlo en rendement-marge delen het predicaat ──────────────

describe('wrappers — band, MC en marge respecteren geenTekortLening (ADR 0149)', () => {
  const input = makeInput()

  it('(g) scenarioband: "Verwacht" landt op de solver-leeftijd mét vlag, later dan zonder', () => {
    const bandOff = runScenarioBand(input)
    const bandOn = runScenarioBand(metVlag(input))
    const verwachtOff = bandOff.rows.find((r) => r.scenario === 'Verwacht')!
    const verwachtOn = bandOn.rows.find((r) => r.scenario === 'Verwacht')!
    expect(verwachtOff.fireAge).toBe(solveFire(input).fireAge)
    expect(verwachtOn.fireAge).toBe(solveFire(metVlag(input)).fireAge)
    expect(verwachtOn.fireAge!).toBeGreaterThan(verwachtOff.fireAge!)
    // Elk scenario schuift mét vlag op (of wordt onhaalbaar), nooit eerder.
    for (const scenario of ['Pessimistisch', 'Optimistisch'] as const) {
      const off = bandOff.rows.find((r) => r.scenario === scenario)!
      const on = bandOn.rows.find((r) => r.scenario === scenario)!
      if (on.reachable && off.reachable) expect(on.fireAge!).toBeGreaterThanOrEqual(off.fireAge!)
      else expect(off.reachable || !on.reachable).toBe(true)
    }
  })

  it('(g) Monte-Carlo: een run die alleen met een blijvende tekort-lening standhoudt slaagt mét vlag niet', () => {
    // Vast anker op 47: de live FIRE-leeftijd ligt vast, dus alleen het criterium verschilt.
    const anker = makeInput({ fire_stop_anchor: 'age', fire_stop_age: 47 })
    const mcOff = runMonteCarlo(anker)
    const mcOn = runMonteCarlo(metVlag(anker))
    expect(mcOff.liveFireAge).toBe(47)
    expect(mcOn.liveFireAge).toBe(47)
    expect(mcOff.successProbability).toBeGreaterThan(0.5)
    expect(mcOn.successProbability).toBeLessThan(mcOff.successProbability)
    expect(mcOn.sustainProbability).toBeLessThan(mcOff.sustainProbability)
    // Zelfde runs, zelfde percentielband: alleen het 1/0-criterium verschilt.
    expect(mcOn.band).toEqual(mcOff.band)
  })

  it('(g) rendement-marge: mét vlag is de marge op het anker kleiner (het plan houdt het daar niet)', () => {
    // Anker 48: ruim ná de solver-leeftijd (~47,1), zodat de gap daar duidelijk ≥ 0 is
    // (op 47,0 zelf ligt de gap op de rand — de marge is daar ~0).
    const anker = makeInput({ fire_stop_anchor: 'age', fire_stop_age: 48 })
    const margeOff = computeRendementMarge(anker)
    const margeOn = computeRendementMarge(metVlag(anker))
    expect(margeOff).not.toBeNull()
    expect(margeOn).not.toBeNull()
    expect(margeOff!.marge).toBeGreaterThan(0)
    expect(margeOn!.marge).toBeLessThan(0)
  })
})

// ── Adapter: profiles.fire_no_deficit_loan → KernelInput.geenTekortLening ──────

describe('adapter — fire_no_deficit_loan (ADR 0149)', () => {
  it('standaard AAN (17 sep 2026): true/null/afwezig ⇒ geenTekortLening true; alleen false ⇒ undefined', () => {
    expect(makeInput({ fire_no_deficit_loan: true }).geenTekortLening).toBe(true)
    expect(makeInput({ fire_no_deficit_loan: null }).geenTekortLening).toBe(true)
    expect(makeInput({ fire_no_deficit_loan: undefined }).geenTekortLening).toBe(true)
    expect(makeInput({ fire_no_deficit_loan: false }).geenTekortLening).toBeUndefined()
  })

  it('de convergentie-mapper laat de kolom door (ook null)', () => {
    expect(buildConvergentieAdapterProfile({ ...basisProfiel, fire_no_deficit_loan: true }).fire_no_deficit_loan).toBe(true)
    expect(buildConvergentieAdapterProfile(basisProfiel).fire_no_deficit_loan).toBeNull()
  })

  it('het partnerprofiel draagt zijn EIGEN waarde', () => {
    expect(memberProfileToKernelAdapterProfile({ date_of_birth: '1980-01-01', fire_no_deficit_loan: true }).fire_no_deficit_loan).toBe(true)
    expect(memberProfileToKernelAdapterProfile({ date_of_birth: '1980-01-01' }).fire_no_deficit_loan).toBeNull()
  })

  it('de vlag uit het profiel stuurt de solver (end-to-end)', () => {
    const viaProfiel = solveFire(makeInput({ fire_no_deficit_loan: true }))
    expect(zonderProjectie(viaProfiel)).toEqual(zonderProjectie(solveFire(metVlag(makeInput()))))
  })
})
