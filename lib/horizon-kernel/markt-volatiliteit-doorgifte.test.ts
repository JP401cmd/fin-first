import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import { DEFAULT_VOLATILITY } from '@/lib/constants'
import { buildKernelInputFromApp } from '@/lib/horizon-kernel/adapter'
import { buildWhatifKernelAdapterInput } from '@/lib/horizon-kernel/adapter/whatif-varianten'
import {
  buildConvergentieAdapterInput,
  computeMarktcheck,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import {
  computeWhatifMarktcheck,
  type WhatifRawContext,
} from '@/lib/horizon-kernel/whatif-router'
import { runMonteCarlo, type MonteCarloBand } from '@/lib/horizon-kernel/wrappers/mc'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import { buildTotaalplanKernelInput } from '@/lib/totaalplan-data'

/**
 * ADR 0117 — de jaarlaag `fire_assumptions.volatility` moet ÉÉN σ opleveren op
 * de drie oppervlakken die een Monte-Carlo-band of -kans tonen:
 *
 *  1. /toekomst           — `computeMarktcheck` op `ConvergentieRawContext`
 *  2. /toekomst/whatif    — `computeWhatifMarktcheck` op `WhatifRawContext`
 *  3. totaalplan-rapport  — `runMonteCarlo` op `buildTotaalplanKernelInput`
 *
 * ## Wat hier stukging (hersteld 3 sep 2026)
 * Alleen pad 1 droeg het veld. Pad 2 miste het op alle zes kernel-context-
 * constructies van de what-if-client; pad 3 zette het niet op zijn `kernelContext`
 * én bouwde de adapter-invoer met een handgeschreven kopie van de mapping die
 * het veld vergat. Zolang de jaarlaag op de default (0,15) stond was dat
 * onzichtbaar; zodra beheer 'm wijzigde toonden de drie oppervlakken drie
 * verschillende bandbreedtes op hetzelfde plan.
 *
 * ## Toleranties (bewuste keuze)
 * De σ-gelijkheid is EXACT (`toBe`): het is dezelfde float die drie keer wordt
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

/** Dezelfde persona in de what-if-vorm (de profielrij is een subset-type). */
function whatifCtx(over: Partial<WhatifRawContext> = {}): WhatifRawContext {
  const c = convergentieCtx()
  return {
    profile: c.profile,
    assets: [...c.assets],
    debts: [],
    lifeEvents: [],
    aowRows: [],
    yearlyExpenses: c.yearlyExpenses,
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

// ── 1 · σ bereikt de kernel-invoer op alle drie de paden ─────────────────────

describe('marktVolatiliteit — σ bereikt MC!B3 op alle drie de paden', () => {
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

  it('/toekomst/whatif: buildWhatifKernelAdapterInput draagt de σ', () => {
    const w = whatifCtx({ marktVolatiliteit: SIGMA_JAARLAAG })
    const adapter = buildWhatifKernelAdapterInput({
      profile: w.profile,
      assets: w.assets,
      debts: w.debts,
      lifeEvents: w.lifeEvents,
      aowRows: w.aowRows,
      marktVolatiliteit: w.marktVolatiliteit,
    })
    expect(buildKernelInputFromApp(adapter).onzekerheid.mc.sigma).toBe(SIGMA_JAARLAAG)
  })

  it('drie paden, één σ: gelijke input ⇒ exact dezelfde onzekerheid.mc.sigma', () => {
    const c = convergentieCtx({ marktVolatiliteit: SIGMA_JAARLAAG })
    const w = whatifCtx({ marktVolatiliteit: SIGMA_JAARLAAG })
    const viaToekomst = buildKernelInputFromApp(buildConvergentieAdapterInput(c)).onzekerheid.mc.sigma
    const viaTotaalplan = buildTotaalplanKernelInput(c)!.onzekerheid.mc.sigma
    const viaWhatif = buildKernelInputFromApp(
      buildWhatifKernelAdapterInput({
        profile: w.profile,
        assets: w.assets,
        debts: w.debts,
        lifeEvents: w.lifeEvents,
        aowRows: w.aowRows,
        marktVolatiliteit: w.marktVolatiliteit,
      }),
    ).onzekerheid.mc.sigma
    expect(viaToekomst).toBe(SIGMA_JAARLAAG)
    expect(viaTotaalplan).toBe(viaToekomst)
    expect(viaWhatif).toBe(viaToekomst)
  })

  it('zonder jaarlaag vallen alle drie de paden op DEFAULT_VOLATILITY terug (geen tweede hardcode)', () => {
    const c = convergentieCtx()
    const w = whatifCtx()
    expect(buildKernelInputFromApp(buildConvergentieAdapterInput(c)).onzekerheid.mc.sigma).toBe(DEFAULT_VOLATILITY)
    expect(buildTotaalplanKernelInput(c)!.onzekerheid.mc.sigma).toBe(DEFAULT_VOLATILITY)
    expect(
      buildKernelInputFromApp(
        buildWhatifKernelAdapterInput({
          profile: w.profile,
          assets: w.assets,
          debts: w.debts,
          lifeEvents: w.lifeEvents,
          aowRows: w.aowRows,
        }),
      ).onzekerheid.mc.sigma,
    ).toBe(DEFAULT_VOLATILITY)
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

  it('/toekomst/whatif (computeWhatifMarktcheck): hogere σ ⇒ bredere p25–p75-band', () => {
    const laag = computeWhatifMarktcheck({ rawContext: whatifCtx({ marktVolatiliteit: SIGMA_LAAG }), maxRuns: RUNS })
    const hoog = computeWhatifMarktcheck({ rawContext: whatifCtx({ marktVolatiliteit: SIGMA_HOOG }), maxRuns: RUNS })
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

  it('/toekomst en /toekomst/whatif: gelijke context + gelijke σ ⇒ identieke band (één plan, één spreiding)', () => {
    // De what-if-router zonder rendement-delta en dezelfde profielrij moet exact
    // dezelfde marktcheck opleveren als de convergentie-router — anders zou een
    // gebruiker op de twee oppervlakken twee banden zien bij één jaarlaag.
    const conv = computeMarktcheck({ rawContext: convergentieCtx({ marktVolatiliteit: SIGMA_JAARLAAG }), maxRuns: RUNS })
    const wi = computeWhatifMarktcheck({ rawContext: whatifCtx({ marktVolatiliteit: SIGMA_JAARLAAG }), maxRuns: RUNS })
    expect(conv.ok && wi.ok).toBe(true)
    if (!conv.ok || !wi.ok) return
    expect(wi.band.startAge).toBe(conv.band.startAge)
    expect(wi.band.p25).toEqual(conv.band.p25)
    expect(wi.band.p75).toEqual(conv.band.p75)
  })
})
