import { describe, it, expect } from 'vitest'
import {
  compareOvergangStrategieen,
  berekenEerderStoppen,
} from './phase-analysis'
import type { SimCashflow } from './fire-simulation'
import type { FireStrategyConfig } from './fire-strategy'

/**
 * Tests voor de overgangsfase-rekenmotoren in phase-analysis.ts.
 *
 * Dekt de B2/B3-correcties uit het tussenfase-plan:
 *  - compareOvergangStrategieen: deeltijdwerk-strategie verwijderd (2 strategieën),
 *    rendement/Box 3-aanname uitlijnbaar, optionele cashflows.
 *  - berekenEerderStoppen: caller-geleverde fireTarget/effectiveSwr,
 *    cashflow-verwerking, en één 3-tier feasibility-status uit de lib.
 */

const DUMMY_STRATEGY: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }

// ── compareOvergangStrategieen ───────────────────────────────────────────────

describe('compareOvergangStrategieen', () => {
  it('retourneert exact 2 strategieën (gelijkmatig + afbouwend), geen deeltijdwerk', () => {
    const result = compareOvergangStrategieen(
      600_000,
      55,
      67,
      40_000,
      0.07,
      0.02,
    )
    expect(result).toHaveLength(2)
    const names = result.map((r) => r.strategie)
    expect(names).toContain('gelijkmatig')
    expect(names).toContain('afbouwend')
    expect(names).not.toContain('deeltijdwerk')
  })

  it('geeft elke strategie het juiste aantal jaren onttrekkingsrijen', () => {
    const result = compareOvergangStrategieen(600_000, 55, 67, 40_000, 0.07, 0.02)
    for (const strat of result) {
      expect(strat.jaarlijkseOnttrekking).toHaveLength(12)
    }
  })

  it('retourneert geen strategieën als er geen duur is (endAge <= startAge)', () => {
    expect(compareOvergangStrategieen(600_000, 67, 67, 40_000, 0.07, 0.02)).toHaveLength(0)
    expect(compareOvergangStrategieen(600_000, 67, 60, 40_000, 0.07, 0.02)).toHaveLength(0)
  })

  it('gebruikt de doorgegeven box3Drag-aanname i.p.v. de platte default', () => {
    // Hogere Box 3-drag → meer afslag op rendement → lager eindvermogen.
    const lowDrag = compareOvergangStrategieen(600_000, 55, 67, 40_000, 0.07, 0.02, { box3Drag: 0.005 })
    const highDrag = compareOvergangStrategieen(600_000, 55, 67, 40_000, 0.07, 0.02, { box3Drag: 0.04 })
    const lowEind = lowDrag.find((s) => s.strategie === 'gelijkmatig')!.eindVermogenOvergang
    const highEind = highDrag.find((s) => s.strategie === 'gelijkmatig')!.eindVermogenOvergang
    expect(lowEind).toBeGreaterThan(highEind)
  })

  it('verwerkt cashflows (life events) in het eindvermogen', () => {
    const baseline = compareOvergangStrategieen(600_000, 55, 67, 40_000, 0.07, 0.02)
    const incomeFlow: SimCashflow[] = [
      { id: 'cf-1', name: 'Deeltijdklus', type: 'recurring', direction: 'income', amount: 10_000, fromAge: 55, toAge: null, indexed: false },
    ]
    const withIncome = compareOvergangStrategieen(600_000, 55, 67, 40_000, 0.07, 0.02, { cashflows: incomeFlow })
    const baseEind = baseline.find((s) => s.strategie === 'gelijkmatig')!.eindVermogenOvergang
    const incomeEind = withIncome.find((s) => s.strategie === 'gelijkmatig')!.eindVermogenOvergang
    // Extra jaarlijks inkomen tijdens de overgang → hoger eindvermogen.
    expect(incomeEind).toBeGreaterThan(baseEind)
  })

  it('afbouwende strategie start hoger dan gelijkmatige in het eerste jaar', () => {
    const result = compareOvergangStrategieen(600_000, 55, 67, 40_000, 0.07, 0.02)
    const gelijk = result.find((s) => s.strategie === 'gelijkmatig')!
    const afbouw = result.find((s) => s.strategie === 'afbouwend')!
    expect(afbouw.jaarlijkseOnttrekking[0].onttrekking).toBeGreaterThan(
      gelijk.jaarlijkseOnttrekking[0].onttrekking,
    )
  })
})

// ── berekenEerderStoppen ─────────────────────────────────────────────────────

describe('berekenEerderStoppen', () => {
  it('meer jaren eerder → meer (of gelijk) extra sparen voor haalbare opties', () => {
    const result = berekenEerderStoppen(
      40,
      55,
      300_000,
      40_000,
      20_000,
      0.07,
      0.02,
      [],
      DUMMY_STRATEGY,
      { years: [1, 2, 3, 5] },
    )
    expect(result.opties.length).toBeGreaterThanOrEqual(4)
    const feasible = result.opties.filter((o) => o.status !== 'niet-haalbaar')
    for (let i = 1; i < feasible.length; i++) {
      expect(feasible[i].extraMaandelijksBesparen).toBeGreaterThanOrEqual(
        feasible[i - 1].extraMaandelijksBesparen,
      )
    }
  })

  it('elke optie krijgt een 3-tier status uit de lib', () => {
    const result = berekenEerderStoppen(
      40, 55, 300_000, 40_000, 20_000, 0.07, 0.02, [], DUMMY_STRATEGY,
    )
    for (const o of result.opties) {
      expect(['haalbaar', 'krap', 'niet-haalbaar']).toContain(o.status)
    }
  })

  it('gebruikt een caller-geleverde fireTarget i.p.v. eigen SWR-afleiding', () => {
    // Een veel lagere fireTarget maakt eerder stoppen makkelijker (meer haalbaar /
    // minder extra sparen) dan een veel hogere fireTarget.
    const lowTarget = berekenEerderStoppen(
      40, 55, 300_000, 40_000, 20_000, 0.07, 0.02, [], DUMMY_STRATEGY,
      { years: [3], fireTarget: 600_000 },
    )
    const highTarget = berekenEerderStoppen(
      40, 55, 300_000, 40_000, 20_000, 0.07, 0.02, [], DUMMY_STRATEGY,
      { years: [3], fireTarget: 1_500_000 },
    )
    expect(lowTarget.opties[0].extraMaandelijksBesparen).toBeLessThan(
      highTarget.opties[0].extraMaandelijksBesparen,
    )
  })

  it('verwerkt cashflows: extra inkomen verlaagt de benodigde extra inleg', () => {
    const noFlow = berekenEerderStoppen(
      40, 55, 300_000, 40_000, 20_000, 0.07, 0.02, [], DUMMY_STRATEGY,
      { years: [3], fireTarget: 1_200_000 },
    )
    const incomeFlow: SimCashflow[] = [
      { id: 'cf-2', name: 'Bijverdienste', type: 'recurring', direction: 'income', amount: 15_000, fromAge: 40, toAge: null, indexed: false },
    ]
    const withFlow = berekenEerderStoppen(
      40, 55, 300_000, 40_000, 20_000, 0.07, 0.02, incomeFlow, DUMMY_STRATEGY,
      { years: [3], fireTarget: 1_200_000 },
    )
    expect(withFlow.opties[0].extraMaandelijksBesparen).toBeLessThanOrEqual(
      noFlow.opties[0].extraMaandelijksBesparen,
    )
  })

  it('markeert opties in het verleden als niet-haalbaar zonder extra inleg', () => {
    const result = berekenEerderStoppen(
      54, 55, 300_000, 40_000, 20_000, 0.07, 0.02, [], DUMMY_STRATEGY,
      { years: [3] }, // nieuwFireAge 52 < currentAge 54
    )
    expect(result.opties[0].status).toBe('niet-haalbaar')
    expect(result.opties[0].extraMaandelijksBesparen).toBe(0)
  })
})
