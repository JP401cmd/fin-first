/**
 * Tests voor de besteedbaar-vermogenslijn (Toekomst-grafiek, Pad-modus).
 *
 * Pinnen drie dingen:
 *  1. de CONDITIE — de tweede lijn verschijnt zodra er een eigen woning is ÉN de
 *     woonstrategie de woning buiten de FIRE-pot houdt; hij verdwijnt zonder eigen
 *     woning en bij `include_full` (daar geldt J ≡ I, dus de lijn zou samenvallen);
 *  2. de GRONDSLAG van de PRIMAIRE lijn — die wisselt sinds ADR 0114 per
 *     woonstrategie, en alleen bij "Uitsluiten" (daar staan de voortgangsbalk en
 *     het vrijheids-% al op J);
 *  3. de MAPPING — de punten komen één-op-één uit `nettoLiquide` op de as-conventie
 *     van de hoofdlijn (seed op de beginleeftijd, daarna `age + 1`), zonder eigen som.
 *
 * De vroegere `defaultLiquidWealthLineVisible`-tests zijn vervallen met de functie
 * zelf (ADR 0114 D5): de tweede lijn staat nu in álle strategieën standaard uit.
 */
import { describe, it, expect } from 'vitest'
import {
  shouldShowLiquidWealthLine,
  buildLiquidWealthPoints,
  primaryChartBasis,
  type LiquidWealthRow,
} from './liquid-wealth-line'
import type { HousingContext, HousingStrategyConfig } from '@/lib/housing-strategy'

// ── Fixtures ────────────────────────────────────────────────────────────────

function context(hasEigenHuis: boolean): HousingContext {
  return {
    eigenHuisValue: hasEigenHuis ? 450_000 : 0,
    wozValue: hasEigenHuis ? 430_000 : 0,
    mortgageBalance: hasEigenHuis ? 200_000 : 0,
    mortgageMonthlyPayment: hasEigenHuis ? 950 : 0,
    hasEigenHuis,
    eigenHuisMortgages: [],
    eigenHuisAssets: [],
  }
}

const STRATEGIES: Record<HousingStrategyConfig['mode'], HousingStrategyConfig> = {
  include_full: { mode: 'include_full' },
  exclude_from_fire: { mode: 'exclude_from_fire' },
  downsize: {
    mode: 'downsize',
    trigger: 'fixed_age',
    triggerAge: 70,
    depletionThresholdYears: 2,
    salePricePct: 1,
    salesCostsPct: 0.04,
    newMonthlyHousingCost: null,
  },
  reverse_mortgage: {
    mode: 'reverse_mortgage',
    trigger: 'fixed_age',
    triggerAge: 70,
    depletionThresholdYears: 2,
    maxLoanPct: 0.5,
    interestRate: 0.055,
    monthlyPayout: null,
  },
}

// ── Conditie ────────────────────────────────────────────────────────────────

describe('shouldShowLiquidWealthLine — eigen woning ÉN een niet-meetellen-strategie', () => {
  // Herroeping van het eerdere "alle vier de modi"-besluit (zelfde dag, 2026-08-05):
  // dat rustte op de premisse "de kernel rekent de woning in élke modus als
  // niet-liquide". Onjuist — `adapter/prio-overgang.ts` zet de vlag op
  // `!woningMeerekenen`, dus bij include_full is NIETS niet-liquide en geldt J ≡ I
  // exact. De lijn valt daar samen met de totaallijn = legenda-ruis. Deze tests
  // pinnen de nieuwe grens én blijven de rem op een verdere versmalling.

  it('toont de lijn bij een eigen woning + een niet-meetellen-strategie', () => {
    expect(shouldShowLiquidWealthLine(context(true), 'exclude_from_fire')).toBe(true)
  })

  it('toont de lijn NIET zonder eigen woning', () => {
    for (const mode of Object.keys(STRATEGIES) as Array<HousingStrategyConfig['mode']>) {
      expect(shouldShowLiquidWealthLine(context(false), mode), `strategie ${mode}`).toBe(false)
    }
  })

  it('toont de lijn NIET bij include_full (J ≡ I → de lijn zou samenvallen)', () => {
    expect(shouldShowLiquidWealthLine(context(true), 'include_full')).toBe(false)
  })

  it('toont de lijn bij de drie ANDERE modi — downsize en reverse_mortgage horen erbij', () => {
    // De conditie neemt de modus nu wél mee (arity 2). De drie niet-meetellen-modi
    // moeten alle drie true geven; alleen include_full valt af.
    expect(shouldShowLiquidWealthLine).toHaveLength(2)
    const modes = Object.keys(STRATEGIES) as Array<HousingStrategyConfig['mode']>
    const shown = modes.filter((mode) => shouldShowLiquidWealthLine(context(true), mode))
    expect(shown.sort()).toEqual(['downsize', 'exclude_from_fire', 'reverse_mortgage'])
    // …en de vier modi die we bedoelen zijn ook echt de vier die bestaan.
    expect(modes.slice().sort()).toEqual(
      ['downsize', 'exclude_from_fire', 'include_full', 'reverse_mortgage'],
    )
  })
})

// ── Grondslag van de primaire lijn ──────────────────────────────────────────

describe('primaryChartBasis — de hoofdlijn wisselt alleen bij "Uitsluiten"', () => {
  // ADR 0114 herroept "de hoofdlijn blijft in alle vier de modi netWorth". De
  // wissel is bewust SMAL: alleen `exclude_from_fire` heeft het probleem dat de
  // kaart beschrijft (balk en vrijheids-% staan daar al op J, de grafiek stond
  // op I). Bij downsize/opeethypotheek wordt de woning uiteindelijk besteedbaar
  // en blijft het totaal het hoofdverhaal; bij include_full geldt J ≡ I.

  it('kiest de liquide grondslag bij een eigen woning + uitsluiten', () => {
    expect(primaryChartBasis(context(true), 'exclude_from_fire')).toBe('liquid')
  })

  it('houdt de totaal-grondslag bij downsize en reverse_mortgage', () => {
    expect(primaryChartBasis(context(true), 'downsize')).toBe('total')
    expect(primaryChartBasis(context(true), 'reverse_mortgage')).toBe('total')
  })

  it('houdt de totaal-grondslag bij include_full (J ≡ I → de keuze is leeg)', () => {
    expect(primaryChartBasis(context(true), 'include_full')).toBe('total')
  })

  it('houdt de totaal-grondslag zonder eigen woning, in elke modus', () => {
    for (const mode of Object.keys(STRATEGIES) as Array<HousingStrategyConfig['mode']>) {
      expect(primaryChartBasis(context(false), mode), `strategie ${mode}`).toBe('total')
    }
  })

  it('wisselt in precies één van de vier modi', () => {
    const modes = Object.keys(STRATEGIES) as Array<HousingStrategyConfig['mode']>
    expect(modes.filter(m => primaryChartBasis(context(true), m) === 'liquid'))
      .toEqual(['exclude_from_fire'])
  })

  it('wisselt alleen binnen de modi waar óók een tweede lijn bestaat', () => {
    // Vangrail tegen een toekomstige verruiming: een primaire J-lijn zonder dat
    // `shouldShowLiquidWealthLine` waar is zou een grondslag tekenen waarvoor de
    // grafiek geen tweede lijn en geen J-drempel kent.
    for (const mode of Object.keys(STRATEGIES) as Array<HousingStrategyConfig['mode']>) {
      if (primaryChartBasis(context(true), mode) === 'liquid') {
        expect(shouldShowLiquidWealthLine(context(true), mode), `strategie ${mode}`).toBe(true)
      }
    }
  })
})

// ── Mapping ─────────────────────────────────────────────────────────────────

describe('buildLiquidWealthPoints — consume-only mapping van nettoLiquide', () => {
  const rows: LiquidWealthRow[] = [
    { age: 45, nettoLiquide: 120_000, startNettoLiquide: 108_000 },
    { age: 46, nettoLiquide: 145_000, startNettoLiquide: 120_000 },
    { age: 47, nettoLiquide: 138_000, startNettoLiquide: 145_000 },
  ]

  it('seedt op de beginleeftijd en plot elke rijwaarde ongewijzigd op leeftijd + 1', () => {
    // Zelfde as-conventie als `simRowsToChartPoints` voor de totaallijn: seed op
    // de beginleeftijd, daarna één punt per jaargrens. Voorwaarde om deze reeks
    // als PRIMAIRE lijn te kunnen tekenen (ADR 0114).
    expect(buildLiquidWealthPoints(rows)).toEqual([
      [45, 108_000],
      [46, 120_000],
      [47, 145_000],
      [48, 138_000],
    ])
  })

  it('gebruikt ALLEEN rij 0 als anker — de rest komt uit nettoLiquide', () => {
    // Anders zou de reeks twee grootheden door elkaar plotten (beginstand van
    // jaar N én eindstand van jaar N−1 zijn hetzelfde moment, maar de reeks mag
    // er maar één van tekenen).
    const pts = buildLiquidWealthPoints(rows)
    expect(pts).toHaveLength(rows.length + 1)
    expect(pts.slice(1).map(([, v]) => v)).toEqual(rows.map(r => r.nettoLiquide))
  })

  it('laat het anker weg wanneer de rij het niet draagt (geen verzonnen beginstand)', () => {
    // Test-/preview-rijfabrieken mogen `startNettoLiquide` weglaten; er komt dan
    // geen seed in plaats van een terugval op de I-beginstand — dat zou twee
    // grondslagen op één lijn mengen.
    expect(buildLiquidWealthPoints([{ age: 45, nettoLiquide: 120_000 }])).toEqual([
      [46, 120_000],
    ])
  })

  it('slaat niet-eindige waarden over en levert een lege reeks bij lege invoer', () => {
    expect(
      buildLiquidWealthPoints([
        { age: 45, nettoLiquide: Number.NaN, startNettoLiquide: Number.NaN },
        { age: 46, nettoLiquide: 10_000, startNettoLiquide: 9_000 },
      ]),
    ).toEqual([[47, 10_000]])
    expect(buildLiquidWealthPoints([])).toEqual([])
  })
})
