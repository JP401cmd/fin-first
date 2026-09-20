import { describe, expect, it } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildKernelInputFromApp } from '@/lib/horizon-kernel/adapter'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { buildBaselineOverrides } from '@/lib/whatif-overrides'
import { solveFireAgeWithoutAnchor } from './scenario-presets'
import { solveHaalbareUitgave } from './haalbare-uitgave'
import { patchNalatenschap } from './kernel-profile-basis'
import { computeLabGrenzen } from './lab-grenzen'
import { HEFBOOM_KEYS, HEFBOOM_RICHTING, type LabGrenzenContext, type LabGrenzenWaarden } from './lab-grenzen-types'

/**
 * KERNEL-BEWIJS voor de grenzen-batch (ADR 0170) op de persona "compleet": leeftijd 42,
 * vast stopmoment 50, € 100.000/jr pensioenuitgave — een bescheiden tekort (gemeten 15 sep
 * 2026 in lab-antwoorden.kernel.test.ts: 77,1% dekking). De eigenschappen die de schaal
 * belooft, geen magische bedragen:
 *  (a) op de gedekt-grens géén shortfall, één rasterstap aan de verkeerde kant wél;
 *  (b) ruim ligt voorbij gedekt in de richting van de knop;
 *  (c) onder solved ligt de stop-grens binnen één rasterstap van `solveFireAgeWithoutAnchor`;
 *  (d) pariteit met `solveHaalbareUitgave` op de uitgave-na-pensioen-knop (≤ 1 stap);
 *  (e) `patchNalatenschap(row, 0)` onder deplete verandert het kern-oordeel niet.
 */

function maakCtx(over: Partial<LabGrenzenContext> = {}): LabGrenzenContext {
  const fx = buildCompleetHorizonFixture(42)
  const profile: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(42),
    yearly_essential_expenses: 100_000,
    retirement_expense_method: 'essential_budgets',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    housing_strategy_config: { mode: 'include_full' },
    fire_stop_anchor: 'age',
    fire_stop_age: 50,
  }
  const baseline = buildBaselineOverrides(fx.financialInput, fx.grossReturn, null)
  return {
    profile,
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
    baseline,
    currentAge: 42,
    waarden: { verdienen: 0, uitgeven: baseline.savingsRate, uitgaveNaPensioen: null, nalatenschap: null, stop: 50 },
    planAnkerVast: true,
    planStopAge: 50,
    eindVorm: 'deplete',
    bereik: {
      verdienen: { min: -1500, max: 12_000, stap: 50 },
      uitgeven: { min: 0, max: 60, stap: 1 },
      uitgaveNaPensioen: { min: 30_000, max: 150_000, stap: 600 },
      nalatenschap: { min: 0, max: 500_000, stap: 10_000 },
      stop: { min: 42, max: 70, stap: 0.5 },
    },
    ...over,
  }
}

/** Het huidig-oordeel op een stand — hetzelfde predicaat als de grenzen, 1–2 runs. */
function oordeel(ctx: LabGrenzenContext, waarden: LabGrenzenWaarden) {
  const r = computeLabGrenzen({ ...ctx, waarden, bereik: {} })
  if (r.huidig == null) throw new Error('fixture: geen huidig-oordeel')
  return r.huidig
}

describe('lab-grenzen × kernel — vast stopmoment 50 met een bescheiden tekort', () => {
  const ctx = maakCtx()
  const batch = computeLabGrenzen(ctx)

  it('de basislijn is een tekort; de batch levert voor elke knop een grens en blijft binnen budget', () => {
    expect(batch.huidig).toEqual({ gedekt: false, ruim: false })
    for (const k of HEFBOOM_KEYS) {
      expect(batch.grenzen[k], k).toBeDefined()
    }
    expect(batch.runs).toBeLessThanOrEqual(120)
    // Telemetrie voor het rapport.
    console.info(`[lab-grenzen.kernel] runs per batch (vast anker): ${batch.runs}`)
  })

  for (const k of ['verdienen', 'uitgaveNaPensioen', 'stop'] as const) {
    it(`(a) ${k}: op de gedekt-grens geen shortfall, één rasterstap aan de verkeerde kant wél`, () => {
      const g = batch.grenzen[k]!
      expect(g.gedekt, `${k} heeft een gedekt-grens`).not.toBeNull()
      const stap = ctx.bereik[k]!.stap
      const slechter = HEFBOOM_RICHTING[k] === 'stijgend' ? g.gedekt! - stap : g.gedekt! + stap
      expect(oordeel(ctx, { ...ctx.waarden, [k]: g.gedekt }).gedekt).toBe(true)
      expect(oordeel(ctx, { ...ctx.waarden, [k]: slechter }).gedekt).toBe(false)
    })
  }

  it('(b) ruim ligt voorbij gedekt in de richting van de knop (of ontbreekt binnen bereik)', () => {
    for (const k of HEFBOOM_KEYS) {
      const g = batch.grenzen[k]!
      if (g.gedekt == null || g.ruim == null) continue
      if (HEFBOOM_RICHTING[k] === 'stijgend') expect(g.ruim, k).toBeGreaterThanOrEqual(g.gedekt)
      else expect(g.ruim, k).toBeLessThanOrEqual(g.gedekt)
    }
    // Minstens één knop draagt een echte ruim-grens, anders test dit niets.
    expect(HEFBOOM_KEYS.some((k) => batch.grenzen[k]?.ruim != null)).toBe(true)
  })

  it('(b′) op de ruim-grens is de huidige stand ruim, één stap ervoor niet', () => {
    const g = batch.grenzen.stop!
    expect(g.ruim).not.toBeNull()
    expect(g.ruim!).toBeGreaterThan(g.gedekt!)
    expect(oordeel(ctx, { ...ctx.waarden, stop: g.ruim! })).toEqual({ gedekt: true, ruim: true })
    expect(oordeel(ctx, { ...ctx.waarden, stop: g.ruim! - 0.5 }).ruim).toBe(false)
  })

  it('(d) pariteit: de gedekt-grens op uitgave na pensioen ligt binnen één sliderstap van solveHaalbareUitgave', () => {
    const h = solveHaalbareUitgave({ profile: ctx.profile, assets: ctx.assets, debts: ctx.debts, lifeEvents: ctx.lifeEvents, aowRows: ctx.aowRows })
    expect(h).not.toBeNull()
    const g = batch.grenzen.uitgaveNaPensioen!.gedekt
    expect(g).not.toBeNull()
    expect(Math.abs((g as number) - h!.perJaar)).toBeLessThanOrEqual(600)
  })
})

describe('lab-grenzen × kernel — solved (geen vast anker)', () => {
  it('(c) de stop-grens ligt binnen één rasterstap van solveFireAgeWithoutAnchor op dezelfde input', () => {
    const ctx = maakCtx({ planAnkerVast: false, planStopAge: null, bereik: { stop: { min: 42, max: 70, stap: 0.5 } } })
    const vrij = solveFireAgeWithoutAnchor({ profile: ctx.profile, assets: ctx.assets, debts: ctx.debts, lifeEvents: ctx.lifeEvents, aowRows: ctx.aowRows })
    expect(vrij).not.toBeNull()
    const r = computeLabGrenzen(ctx)
    console.info(`[lab-grenzen.kernel] runs per batch (solved, alleen stop): ${r.runs}; vrij=${vrij}, grens=${r.grenzen.stop?.gedekt}`)
    const g = r.grenzen.stop!
    expect(g.gedekt).not.toBeNull()
    expect(Math.abs(g.gedekt! - vrij!)).toBeLessThanOrEqual(0.5)
    // ruim onder solved: minstens marge × (vrij − nu) later dan gedekt.
    expect(g.ruim).not.toBeNull()
    expect(g.ruim!).toBeGreaterThan(g.gedekt!)
  })
})

describe('patchNalatenschap × kernel', () => {
  it('(e) patchNalatenschap(row, 0) onder deplete geeft dezelfde status als de ongepatchte run', () => {
    const ctx = maakCtx()
    const input = (p: ConvergentieRawProfileRow) =>
      buildKernelInputFromApp({
        profile: buildConvergentieAdapterProfile(p),
        assets: ctx.assets,
        debts: ctx.debts,
        lifeEvents: ctx.lifeEvents,
        aowRows: ctx.aowRows,
      })
    const basis = solveFire(input(ctx.profile))
    const gepatcht = solveFire(input(patchNalatenschap(ctx.profile, 0)))
    expect(gepatcht.status).toBe(basis.status)
    expect(gepatcht.fireAge).toBe(basis.fireAge)
    expect(gepatcht.eindleeftijd).toBe(basis.eindleeftijd)
  })
})
