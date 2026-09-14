import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import { DEFAULT_VOLATILITY } from '@/lib/constants'
import { buildKernelInputFromApp } from '@/lib/horizon-kernel/adapter'
import {
  buildConvergentieAdapterInput,
  computeMarktcheck,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import { runMonteCarlo, type MonteCarloBand } from '@/lib/horizon-kernel/wrappers/mc'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import { buildTotaalplanKernelInput } from '@/lib/totaalplan-data'

/**
 * ADR 0117 — de jaarlaag `fire_assumptions.volatility` moet ÉÉN σ opleveren op
 * de twee oppervlakken die een Monte-Carlo-band of -kans tonen:
 *
 *  1. /toekomst           — `computeMarktcheck` op `ConvergentieRawContext`
 *  2. totaalplan-rapport  — `runMonteCarlo` op `buildTotaalplanKernelInput`
 *
 * ## Wat hier stukging (hersteld 3 sep 2026)
 * Alleen pad 1 droeg het veld. Het totaalplan zette het niet op zijn `kernelContext`
 * én bouwde de adapter-invoer met een handgeschreven kopie van de mapping die
 * het veld vergat. Zolang de jaarlaag op de default (0,15) stond was dat
 * onzichtbaar; zodra beheer 'm wijzigde toonden de oppervlakken verschillende
 * bandbreedtes op hetzelfde plan. (De losse wat-als-pagina, destijds een derde
 * pad, is vervallen — ADR 0144.)
 *
 * ## Toleranties (bewuste keuze)
 * De σ-gelijkheid is EXACT (`toBe`): het is dezelfde float die meermaals wordt
 * doorgegeven, elke afwijking is een doorgeef-fout. De bandbreedte-toets is
 * ORDINAAL (`toBeGreaterThan`) zonder numerieke tolerantie: de foutklasse die we
 * vangen is "beweegt niet mee" (identieke band), niet "wijkt een fractie af".
 * Een absolute cent- of relatieve %-tolerantie zou hier beide een verkeerde
 * uitspraak doen over een grootheid die bij σ 0,05 → 0,30 een factor ~6 moet
 * schalen. De MC-ruis is sin-hash-gebaseerd (deterministisch), dus de toets is
 * reproduceerbaar; 40 runs volstaan voor de ordening en houden de suite snel
 * (elke run is een volledige kernel-projectie).
 */

const DOB = '1986-01-01'
const SIGMA_LAAG = 0.05
const SIGMA_HOOG = 0.3
const SIGMA_JAARLAAG = 0.22
const RUNS = 40

function makeAssets(): Asset[] {
  return [
    {
      id: 'inv',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: 150_000,
      woz_value: null,
      // PERCENTAGE (7 = 7%) — anders dan het profiel-veld hieronder (decimaal).
      expected_return: 7,
      monthly_contribution: 800,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
  ] as unknown as Asset[]
}

/** Zelfde persona als `marktcheck.test.ts` (deplete → de band toont ook de afbouw). */
function convergentieCtx(over: Partial<ConvergentieRawContext> = {}): ConvergentieRawContext {
  return {
    profile: {
      date_of_birth: DOB,
      net_monthly_income: 4000,
      estimated_monthly_expenses: 2500,
      expected_return: 0.07,
      inflation_rate: 0.02,
      box3_method: 'forfaitair',
      fire_end_strategy: 'deplete',
      fire_end_age: 90,
      fire_legacy_amount: 0,
      withdrawal_strategy: 'static',
      housing_strategy_config: { mode: 'include_full' },
      retirement_expense_method: 'current_expenses',
      retirement_expense_custom_amount: null,
    },
    assets: makeAssets(),
    debts: [],
    lifeEvents: [],
    aowRows: [],
    yearlyExpenses: 30_000,
    ...over,
  }
}

/** Eén getal voor "hoe breed is de band": Σ(p75 − p25) over alle leeftijden. */
function bandBreedte(band: MonteCarloBand): number {
  let som = 0
  for (let i = 0; i < band.p75.length; i++) som += band.p75[i] - band.p25[i]
  return som
}

function metRuns(input: KernelInput, runs: number): KernelInput {
  return {
    ...input,
    onzekerheid: { ...input.onzekerheid, mc: { ...input.onzekerheid.mc, aantalRuns: runs } },
  }
}

// ── 1 · σ bereikt de kernel-invoer op beide paden ────────────────────────────

describe('marktVolatiliteit — σ bereikt MC!B3 op beide paden', () => {
  it('/toekomst: buildConvergentieAdapterInput draagt het veld en de KernelInput de σ', () => {
    const adapter = buildConvergentieAdapterInput(convergentieCtx({ marktVolatiliteit: SIGMA_JAARLAAG }))
    expect(adapter.marktVolatiliteit).toBe(SIGMA_JAARLAAG)
    expect(buildKernelInputFromApp(adapter).onzekerheid.mc.sigma).toBe(SIGMA_JAARLAAG)
  })

  it('totaalplan: buildTotaalplanKernelInput draagt de σ (dit exemplaar liet hem vallen)', () => {
    const input = buildTotaalplanKernelInput(convergentieCtx({ marktVolatiliteit: SIGMA_JAARLAAG }))
    expect(input).not.toBeNull()
    expect(input!.onzekerheid.mc.sigma).toBe(SIGMA_JAARLAAG)
  })

  it('twee paden, één σ: gelijke input ⇒ exact dezelfde onzekerheid.mc.sigma', () => {
    const c = convergentieCtx({ marktVolatiliteit: SIGMA_JAARLAAG })
    const viaToekomst = buildKernelInputFromApp(buildConvergentieAdapterInput(c)).onzekerheid.mc.sigma
    const viaTotaalplan = buildTotaalplanKernelInput(c)!.onzekerheid.mc.sigma
    expect(viaToekomst).toBe(SIGMA_JAARLAAG)
    expect(viaTotaalplan).toBe(viaToekomst)
  })

  it('zonder jaarlaag vallen beide paden op DEFAULT_VOLATILITY terug (geen tweede hardcode)', () => {
    const c = convergentieCtx()
    expect(buildKernelInputFromApp(buildConvergentieAdapterInput(c)).onzekerheid.mc.sigma).toBe(DEFAULT_VOLATILITY)
    expect(buildTotaalplanKernelInput(c)!.onzekerheid.mc.sigma).toBe(DEFAULT_VOLATILITY)
  })
})

// ── 2 · de bandbreedte beweegt mee met de jaarlaag (ordinaal) ────────────────

describe('marktVolatiliteit — de bandbreedte beweegt mee zodra de jaarlaag wijzigt', () => {
  it('/toekomst (computeMarktcheck): hogere σ ⇒ bredere p25–p75-band', () => {
    const laag = computeMarktcheck({ rawContext: convergentieCtx({ marktVolatiliteit: SIGMA_LAAG }), maxRuns: RUNS })
    const hoog = computeMarktcheck({ rawContext: convergentieCtx({ marktVolatiliteit: SIGMA_HOOG }), maxRuns: RUNS })
    expect(laag.ok && hoog.ok).toBe(true)
    if (!laag.ok || !hoog.ok) return
    expect(bandBreedte(hoog.band)).toBeGreaterThan(bandBreedte(laag.band))
  })

  it('totaalplan (runMonteCarlo op buildTotaalplanKernelInput): hogere σ ⇒ bredere band', () => {
    const laag = buildTotaalplanKernelInput(convergentieCtx({ marktVolatiliteit: SIGMA_LAAG }))
    const hoog = buildTotaalplanKernelInput(convergentieCtx({ marktVolatiliteit: SIGMA_HOOG }))
    expect(laag && hoog).toBeTruthy()
    if (!laag || !hoog) return
    const bandLaag = runMonteCarlo(metRuns(laag, RUNS)).band
    const bandHoog = runMonteCarlo(metRuns(hoog, RUNS)).band
    expect(bandBreedte(bandHoog)).toBeGreaterThan(bandBreedte(bandLaag))
  })
})
