import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import {
  buildConvergentieAdapterInput,
  computeMarktcheck,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { marktcheckSigma, runMarktcheckOnKernelInput } from '@/lib/horizon-kernel/marktcheck'
import { computeRendementMarge } from '@/lib/horizon-kernel/rendement-marge'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { MAX_AGE, type KernelInput } from '@/lib/horizon-kernel/types'
import { executeKernelRequest } from '@/lib/horizon-kernel/worker/kernel-protocol'
import { perturbInputForRun, percentielIndex, runMonteCarlo } from './mc'
import { computeMarktcheckVrijheidsleeftijden, VRIJHEID_PERCENTIELEN } from './mc-vrijheid'
import { potIdiosyncraticNoise, sharedMarketShock } from './noise'
import { potRisicoFactor } from './risico'

/**
 * Drie vrijheidsleeftijden onder de Marktcheck-band (spec toekomst-drie-katernen §7.6).
 *
 * Toleranties: geen. Elke vergelijking hier is EXACT (`toBe`/`toEqual`), bewust: de
 * leeftijden zijn maand-resolutie-uitkomsten van dezelfde deterministische solver
 * (sin-hash-ruis op run-index, geen RNG-toestand), en de band-invariant gaat over
 * byte-gelijkheid. Een tolerantie zou precies de foutklasse verbergen die we vangen
 * (een andere run, een andere rang, een verschoven perturbatie).
 *
 * Runs: 24–40 i.p.v. 200 om de suite snel te houden; de methode is rang-gebaseerd en
 * daarmee n-onafhankelijk. De meting op n = 200 staat in de module-doc.
 */

const DOB = '1986-01-01'

interface Persona {
  strategy?: 'deplete' | 'perpetual' | 'legacy'
  legacy?: number
  monthlyExpenses?: number
  contribution?: number
  investment?: number
  pensioen?: boolean
  anchor?: 'aow' | 'now' | 'age'
  stopAge?: number
}

function ctx(p: Persona = {}): ConvergentieRawContext {
  const assets = [
    {
      id: 'inv',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: p.investment ?? 150_000,
      woz_value: null,
      expected_return: 7, // PERCENTAGE
      monthly_contribution: p.contribution ?? 800,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
    ...(p.pensioen
      ? [
          {
            id: 'pen',
            name: 'Pensioen',
            asset_type: 'pension',
            current_value: 80_000,
            woz_value: null,
            expected_return: 5,
            monthly_contribution: 400,
            is_active: true,
            net_worth_inclusion_pct: 100,
            depreciation_rate: 0,
          },
          {
            id: 'sp',
            name: 'Spaar',
            asset_type: 'savings',
            current_value: 30_000,
            woz_value: null,
            expected_return: 1.5,
            monthly_contribution: 0,
            is_active: true,
            net_worth_inclusion_pct: 100,
            depreciation_rate: 0,
          },
        ]
      : []),
  ] as unknown as Asset[]
  const expenses = p.monthlyExpenses ?? 2500
  return {
    profile: {
      date_of_birth: DOB,
      net_monthly_income: 4000,
      estimated_monthly_expenses: expenses,
      expected_return: 0.07, // DECIMAAL
      inflation_rate: 0.02,
      box3_method: 'forfaitair',
      fire_end_strategy: p.strategy ?? 'deplete',
      fire_end_age: 90,
      fire_legacy_amount: p.legacy ?? 0,
      withdrawal_strategy: 'static',
      housing_strategy_config: { mode: 'include_full' },
      retirement_expense_method: 'current_expenses',
      retirement_expense_custom_amount: null,
      ...(p.anchor ? { fire_stop_anchor: p.anchor, fire_stop_age: p.stopAge ?? null } : {}),
    },
    assets,
    debts: [],
    lifeEvents: [],
    aowRows: [],
    yearlyExpenses: expenses * 12,
  } as ConvergentieRawContext
}

const kernelInput = (c: ConvergentieRawContext): KernelInput =>
  buildKernelInputFromAppWithNotices(buildConvergentieAdapterInput(c)).input

/** Dezelfde invoer die `runMarktcheckOnKernelInput` aan `runMonteCarlo` geeft. */
function mcInputVan(input: KernelInput, runs: number): KernelInput {
  return {
    ...input,
    onzekerheid: {
      ...input.onzekerheid,
      mc: { ...input.onzekerheid.mc, aantalRuns: runs, sigma: marktcheckSigma(input) },
    },
  }
}

function okOf(c: ConvergentieRawContext, maxRuns: number, stopAge?: number | null) {
  const out = computeMarktcheck({ rawContext: c, maxRuns, stopAge })
  if (!out.ok) throw new Error(`marktcheck faalde: ${out.reason}`)
  return out
}

describe('Marktcheck-vrijheidsleeftijden — volgorde en begrip', () => {
  const personas: Array<[string, Persona]> = [
    ['deplete', {}],
    ['deplete + pensioen- en spaarpot', { pensioen: true }],
    ['perpetual', { strategy: 'perpetual', monthlyExpenses: 2800, contribution: 500, investment: 100_000 }],
    ['legacy €100k', { strategy: 'legacy', legacy: 100_000, pensioen: true }],
  ]
  for (const [naam, p] of personas) {
    it(`Given ${naam}, When de marktcheck draait, Then geldt tegenzit ≥ midden ≥ meezit binnen de horizon`, () => {
      const out = okOf(ctx(p), 40)
      const v = out.vrijheidsleeftijden
      expect(v).not.toBeNull()
      const { tegenzit, midden, meezit } = v!
      for (const a of [tegenzit, midden, meezit]) {
        expect(a).not.toBeNull()
        expect(Number.isFinite(a!)).toBe(true)
        expect(a!).toBeLessThan(MAX_AGE)
      }
      expect(tegenzit!).toBeGreaterThanOrEqual(midden!)
      expect(midden!).toBeGreaterThanOrEqual(meezit!)
      // Echte spreiding, geen drie keer hetzelfde getal.
      expect(tegenzit!).toBeGreaterThan(meezit!)
    })
  }

  it('Given n runs, When de percentiel-runs worden opgelost, Then is de uitkomst gelijk aan ELKE run oplossen en het leeftijd-percentiel nemen (methode a)', () => {
    // Methode (b) — rang op gap, drie solves — moet op de gemeten persona's exact
    // methode (a) opleveren: dezelfde rangconventie (nearest-rank, aflopend op
    // leeftijd = oplopend op gap) en een gap-rang die de leeftijdsvolgorde volgt.
    const input = kernelInput(ctx({ pensioen: true }))
    const mcIn = mcInputVan(input, 24)
    const mc = runMonteCarlo(mcIn)
    const b = computeMarktcheckVrijheidsleeftijden(mcIn, mc)

    const leeftijden: number[] = []
    for (let i = 1; i <= mc.runs; i++) {
      const s = solveFire(perturbInputForRun(mcIn, i, mcIn.onzekerheid.mc.sigma))
      leeftijden.push(
        s.status === 'unreachable_within_horizon' || s.fireAge >= MAX_AGE
          ? Number.POSITIVE_INFINITY
          : s.fireAge,
      )
    }
    const aflopend = [...leeftijden].sort((x, y) => (x === y ? 0 : x < y ? 1 : -1))
    const op = (q: number) => {
      const a = aflopend[percentielIndex(aflopend.length, q)]
      return Number.isFinite(a) ? a : null
    }
    expect(b).toEqual({
      tegenzit: op(VRIJHEID_PERCENTIELEN.tegenzit),
      midden: op(VRIJHEID_PERCENTIELEN.midden),
      meezit: op(VRIJHEID_PERCENTIELEN.meezit),
    })
    // En de marktcheck zelf rekent met exact die mcInput.
    expect(runMarktcheckOnKernelInput(input, { maxRuns: 24 })).toMatchObject({
      ok: true,
      vrijheidsleeftijden: b,
    })
  })

  it('Given het live kerngetal (ruisloos plan), Then ligt het tussen meezit en tegenzit', () => {
    // Zelfde begrip, zelfde solver: het deterministische plan hoort binnen de
    // middelste helft van de marktverlopen te vallen. Bewust GEEN |midden − live|-
    // grens: de p50-run is niet de ruisloze run (eindige-steekproef-effect van de
    // sin-hash-trekkingen, zie de note bij calc `marktcheck-band`); gemeten 0,25 jr
    // bij n = 200 en 1,4 jr bij n = 40.
    for (const p of [{ pensioen: true }, {}, { strategy: 'legacy', legacy: 100_000 }] as Persona[]) {
      const c = ctx(p)
      const live = solveFire(kernelInput(c))
      const v = okOf(c, 40).vrijheidsleeftijden!
      expect(live.fireAge).toBeGreaterThanOrEqual(v.meezit!)
      expect(live.fireAge).toBeLessThanOrEqual(v.tegenzit!)
    }
  })
})

describe('Marktcheck-vrijheidsleeftijden — vast stopmoment', () => {
  for (const [naam, p] of [
    ['AOW-anker', { anchor: 'aow' }],
    ['vaste leeftijd 58', { anchor: 'age', stopAge: 58 }],
    ['nu stoppen', { anchor: 'now' }],
  ] as Array<[string, Persona]>) {
    it(`Given ${naam}, When de marktcheck draait, Then is vrijheidsleeftijden null en blijven band en marge er`, () => {
      const out = okOf(ctx(p), 20, 58)
      expect(out.vrijheidsleeftijden).toBeNull()
      expect(out.band.p50.length).toBeGreaterThan(0)
      expect(out.runs).toBe(20)
    })
  }
})

describe('Marktcheck-vrijheidsleeftijden — onbereikbaar binnen de horizon', () => {
  it('Given een plan dat alleen meezittend binnen de horizon vrij wordt, Then zijn tegenzit en midden null en meezit een leeftijd', () => {
    // Perpetual met weinig inleg: bij tegenzit/midden valt de solver op de
    // horizon-parkeerstand (FIRE = 100, bij perpetual triviaal "toereikend") → null.
    const v = okOf(
      ctx({ strategy: 'perpetual', monthlyExpenses: 3500, contribution: 200, investment: 50_000 }),
      40,
    ).vrijheidsleeftijden!
    expect(v.tegenzit).toBeNull()
    expect(v.midden).toBeNull()
    expect(v.meezit).not.toBeNull()
    expect(v.meezit!).toBeLessThan(MAX_AGE)
  })

  it('Given een onhaalbaar nalatenschapsdoel, Then zijn alle drie null — nooit oneindig, nooit de parkeerstand', () => {
    const v = okOf(ctx({ strategy: 'legacy', legacy: 50_000_000 }), 20).vrijheidsleeftijden!
    expect(v).toEqual({ tegenzit: null, midden: null, meezit: null })
  })

  it('Given nul runs, Then null', () => {
    const input = kernelInput(ctx())
    expect(computeMarktcheckVrijheidsleeftijden(input, { rangGap: [], vastStopLeeftijd: null })).toBeNull()
  })
})

describe('Marktcheck-vrijheidsleeftijden — determinisme en geen gedragswijziging', () => {
  it('Given dezelfde context twee keer, Then exact dezelfde uitkomst (sin-hash-ruis, geen RNG-toestand)', () => {
    const c = ctx({ pensioen: true })
    expect(okOf(c, 30)).toStrictEqual(okOf(c, 30))
  })

  it('Given de marktcheck, Then zijn band, bandLiquide, marge en runs gelijk aan de losse wrapper + marge (het nieuwe veld is puur additief)', () => {
    const c = ctx({ pensioen: true })
    const input = kernelInput(c)
    const out = okOf(c, 30, 60)
    const mc = runMonteCarlo(mcInputVan(input, 30))
    expect(out.band).toStrictEqual(mc.band)
    expect(out.bandLiquide).toStrictEqual(mc.bandLiquide)
    expect(out.marge).toStrictEqual(computeRendementMarge(input, 60))
    expect(out.runs).toBe(mc.runs)
    expect(mc.rangGap).toHaveLength(30)
  })

  it('Given perturbInputForRun, Then is de verstoring bit-voor-bit de formule die vóór de extractie inline stond', () => {
    const input = kernelInput(ctx({ pensioen: true }))
    const sigma = 0.021
    for (const i of [1, 7, 200]) {
      const shock = sharedMarketShock(i, sigma)
      const verwacht = input.assetPotten.map((p) => {
        const f = potRisicoFactor(p)
        return f === 0
          ? p.rendement
          : p.rendement + shock * f + potIdiosyncraticNoise(i, p.slot, sigma) * f
      })
      expect(perturbInputForRun(input, i, sigma).assetPotten.map((p) => p.rendement)).toEqual(verwacht)
    }
  })
})

describe('Marktcheck-vrijheidsleeftijden — over de worker-grens', () => {
  it('Given een marktcheck-verzoek aan de worker-handler, Then draagt het antwoord de drie leeftijden en overleeft het structured clone', () => {
    const c = ctx({ pensioen: true })
    const res = executeKernelRequest({ id: 1, kind: 'marktcheck', rawContext: c, maxRuns: 20 })
    expect(res.ok && res.kind === 'marktcheck').toBe(true)
    if (!res.ok || res.kind !== 'marktcheck' || !res.result.ok) throw new Error('geen marktcheck-antwoord')
    expect(res.result.vrijheidsleeftijden).toEqual(okOf(c, 20).vrijheidsleeftijden)
    expect(structuredClone(res)).toStrictEqual(res)
  })
})
