import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import { buildKernelInputFromApp } from './adapter'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from './convergentie-router'
import { runKernelProjection } from './engine'
import { prognoseJ } from './gap'
import { startNettoLiquide } from './jaarrand'
import { inflationIndex } from './scaffold'
import { evaluateFireAt } from './solver'

/**
 * GUARDRAILS-ANKER BIJ FIRE-MAAND 0 (ADR 0126, PR B) — een eigen, blokkerende test.
 *
 * De engine legt het guardrails-anker P!B82 zelf vast op maand `fireMaand − 1`
 * (engine.ts, self-capture in de maandloop). Bij een geforceerde FIRE op de
 * startleeftijd is `fireMaand = 0`; maand −1 bestaat niet, de self-capture vuurt nooit
 * en het anker zou 0 blijven voor ALLE 1200 maanden. `guardrailsFactorInHorizon`
 * (tables/ont.ts) maakt van anker 0 een ratio 0, en 0 < onderdrempel (0,8) ⇒
 * MAX(floor, 1 − stap): een PERMANENTE cut op de uitgave-term voor elk 'Guardrails'-
 * profiel — de stop-nu-run (runway, status, Monte-Carlo, rendement-marge) rekent dan
 * systematisch te rooskleurig. Geen bestaande run raakte maand 0 (de bisectie
 * evalueert maand 0 nooit, stop-kaarten liggen in de toekomst); de runway wél.
 *
 * De remedie zit in de ENGINE (niet bij één aanroeper): bij FIRE-maand 0 wordt het
 * anker geïnitialiseerd op de T0-liquide-stand (`startNettoLiquide`, de afleiding die
 * de bridge voor rij 0 hanteert). Buiten oracle-domein: geen fixture forceert FIRE op
 * de startleeftijd, dus parity blijft byte-identiek. Deze test moet óók blijven staan
 * wanneer de runway ooit verdwijnt: hij pint het engine-gedrag én het latente defect
 * (via de expliciete anker-0-override) vast.
 */

const PROFILE: ConvergentieRawProfileRow = {
  date_of_birth: '1986-01-01',
  net_monthly_income: 4000,
  estimated_monthly_expenses: 2500,
  expected_return: 7,
  inflation_rate: 2,
  box3_method: 'forfaitair',
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  withdrawal_strategy: 'guardrails',
  housing_strategy_config: { mode: 'include_full' },
  retirement_expense_method: 'current_expenses',
  retirement_expense_custom_amount: null,
}

function makeInput(currentValue = 150_000, overrides: Partial<ConvergentieRawProfileRow> = {}) {
  const assets = [
    {
      id: 'inv',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: currentValue,
      woz_value: null,
      expected_return: 7,
      monthly_contribution: 800,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
  ] as unknown as Asset[]
  return buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({ ...PROFILE, ...overrides }),
    assets,
    debts: [],
    lifeEvents: [],
    aowRows: [],
  })
}

describe('runKernelProjection op FIRE-maand 0 — guardrails-anker (engine-init)', () => {
  const input = makeInput()
  const p = input.onttrekkingsprofiel
  /** De cut-factor van één stap omlaag (met de floor als bodem). */
  const cut = Math.max(p.guardrailFloor, 1 - p.guardrailStap)
  const nu = input.startLeeftijd

  it('fixture: profiel is Guardrails, cut-factor < 1, T0-liquide-stand > 0', () => {
    expect(p.profiel).toBe('Guardrails')
    expect(cut).toBeLessThan(1)
    expect(cut).toBeGreaterThan(0)
    expect(startNettoLiquide(input)).toBe(150_000)
  })

  it('de ENGINE ankert bij FIRE-maand 0 zelf op de T0-liquide-stand en houdt de factor neutraal', () => {
    const solve = evaluateFireAt(input, nu)
    const proj = solve.projection
    expect(proj.summary.fireMonth).toBe(0)
    expect(proj.summary.guardrailsAnker).toBe(startNettoLiquide(input))
    // BEWUSTE GRENS: Ont!G(0) = Prognose!J(−1) is de oracle-cel "" → 0 (m−1-lag), dus
    // maand 0 zélf houdt één maand de floor-factor — één van 1200 maanden.
    expect(proj.ont[0].guardrailsFactor).toBe(cut)
    // Vanaf maand 1 verhoudt J(m−1) zich tot de T0-stand ≈ 1 → neutraal (factor 1).
    for (let m = 1; m <= 6; m++) {
      expect(proj.ont[m].guardrailsFactor, `maand ${m}`).toBe(1)
    }
    // De onttrekking rekent vanaf maand 0 (salaris weg vanaf de FIRE-maand).
    expect(proj.ont[0].onttrekking).toBeGreaterThan(0)
    expect(solve.engineRuns).toBe(1)
  })

  it('HET LATENTE DEFECT, expliciet: met anker 0 staat de factor élke in-horizon maand op de cut en rekent de run te rooskleurig', () => {
    // Zo gedroeg de engine zich vóór de init (anker `?? 0`); via de override blijft het reproduceerbaar.
    const defect = runKernelProjection(input, { fireAge: nu, guardrailsAnker: 0 })
    expect(defect.summary.guardrailsAnker).toBe(0)
    const last = defect.summary.lastInHorizonMonth
    for (let m = 0; m <= last; m++) {
      expect(defect.ont[m].guardrailsFactor, `maand ${m}`).toBe(cut)
    }
    const goed = runKernelProjection(input, { fireAge: nu })
    // Maand 1: box3VorigeMaand leest bel[0] (identiek in beide runs), dus het verschil
    // in Ont!D is exact de gecutte uitgave-term: (P!B15/12 · index(1)) · (1 − cut).
    const baseTerm1 = (input.inkomenUitgaven.uitgaveNaPensioenPerJaar / 12) * inflationIndex(input, 1)
    expect(goed.ont[1].onttrekking - defect.ont[1].onttrekking).toBeCloseTo(baseTerm1 * (1 - cut), 6)
    expect(defect.ont[1].onttrekking).toBeLessThan(goed.ont[1].onttrekking)
    // En dat verschil tikt door in het liquide vermogen: na vijf jaar staat de
    // defect-run hoger (minder onttrokken = rooskleuriger). Bewust op maand 60 en niet
    // op het horizon-einde: ná een blijvende uitputting loopt de tekort-lening over
    // tientallen jaren numeriek weg (orde 1e33), waar beide runs op dezelfde float landen.
    expect(prognoseJ(defect, 60)).toBeGreaterThan(prognoseJ(goed, 60) as number)
  })

  it('T0-liquide-stand ≤ 0 ⇒ anker 0 (geen positieve referentie; zo’n run is een deficit)', () => {
    const arm = makeInput(0)
    expect(startNettoLiquide(arm)).toBe(0)
    const proj = runKernelProjection(arm, { fireAge: arm.startLeeftijd })
    expect(proj.summary.guardrailsAnker).toBe(0)
  })

  it('een expliciete override blijft winnen (testknop intact)', () => {
    const proj = runKernelProjection(input, { fireAge: nu, guardrailsAnker: 12_345 })
    expect(proj.summary.guardrailsAnker).toBe(12_345)
  })
})

describe('FIRE-maand ≥ 1 — de maand-0-tak is inert (self-capture ongewijzigd)', () => {
  const input = makeInput()

  it('anker = Prognose!J(fireMaand − 1), exact als voorheen', () => {
    const solve = evaluateFireAt(input, 55)
    const proj = solve.projection
    const fm = proj.summary.fireMonth
    expect(fm).toBeGreaterThan(0)
    expect(proj.summary.guardrailsAnker).toBe(prognoseJ(proj, fm - 1))
    expect(proj.summary.guardrailsAnker).toBeGreaterThan(0)
  })

  it('evaluateFireAt ≡ runKernelProjection op dezelfde leeftijd (geen verborgen opties)', () => {
    const solve = evaluateFireAt(input, 55)
    expect(solve.projection).toEqual(runKernelProjection(input, { fireAge: 55 }))
  })
})
