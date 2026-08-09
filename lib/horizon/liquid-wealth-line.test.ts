/**
 * Tests voor de besteedbaar-vermogenslijn (Toekomst-grafiek, Pad-modus).
 *
 * Pinnen drie dingen:
 *  1. de CONDITIE — de tweede lijn verschijnt zodra er een eigen woning is ÉN de
 *     woonstrategie de woning buiten de FIRE-pot houdt; hij verdwijnt zonder eigen
 *     woning en bij `include_full` (daar geldt J ≡ I, dus de lijn zou samenvallen);
 *  2. de STANDAARDSTAND van de toggle die de lijn sinds de "te druk"-melding
 *     schakelt — AAN bij uitsluiten, UIT bij de rest;
 *  3. de MAPPING — de punten komen één-op-één uit `nettoLiquide` op de as-conventie
 *     van de hoofdlijn (`age + 1`), zonder eigen som.
 */
import { describe, it, expect } from 'vitest'
import {
  shouldShowLiquidWealthLine,
  defaultLiquidWealthLineVisible,
  buildLiquidWealthPoints,
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

// ── Standaardstand van de toggle ────────────────────────────────────────────

describe('defaultLiquidWealthLineVisible — conditioneel op de woonstrategie', () => {
  // De lijn zit sinds de "te druk"-melding achter een eigen pill naast de
  // Doel-pill. De standaardstand is NIET één vaste keuze: bij uitsluiten staat
  // de voortgangsbalk / het vrijheids-% al op de zonder-woning-grondslag, dus
  // dáár moet de lijn meteen zichtbaar zijn — anders liegt de grafiek t.o.v. de
  // balk eronder. Bij downsize/opeethypotheek is de totaallijn het hoofdverhaal.

  it('staat AAN bij exclude_from_fire (daar is zonder-woning het hoofdverhaal)', () => {
    expect(defaultLiquidWealthLineVisible('exclude_from_fire')).toBe(true)
  })

  it('staat UIT bij downsize en reverse_mortgage — verdieping, geen openingsbeeld', () => {
    expect(defaultLiquidWealthLineVisible('downsize')).toBe(false)
    expect(defaultLiquidWealthLineVisible('reverse_mortgage')).toBe(false)
  })

  it('staat UIT bij include_full — daar bestaat de lijn (en dus de pill) niet eens', () => {
    expect(defaultLiquidWealthLineVisible('include_full')).toBe(false)
    // Dubbele grendel: de conditie zet 'm daar sowieso al uit.
    expect(shouldShowLiquidWealthLine(context(true), 'include_full')).toBe(false)
  })

  it('zet precies één van de vier modi standaard aan', () => {
    const modes = Object.keys(STRATEGIES) as Array<HousingStrategyConfig['mode']>
    expect(modes.filter(defaultLiquidWealthLineVisible)).toEqual(['exclude_from_fire'])
  })
})

// ── Mapping ─────────────────────────────────────────────────────────────────

describe('buildLiquidWealthPoints — consume-only mapping van nettoLiquide', () => {
  const rows: LiquidWealthRow[] = [
    { age: 45, nettoLiquide: 120_000 },
    { age: 46, nettoLiquide: 145_000 },
    { age: 47, nettoLiquide: 138_000 },
  ]

  it('plot elke rijwaarde ongewijzigd op leeftijd + 1 (as van de hoofdlijn)', () => {
    expect(buildLiquidWealthPoints(rows)).toEqual([
      [46, 120_000],
      [47, 145_000],
      [48, 138_000],
    ])
  })

  it('slaat niet-eindige waarden over en levert een lege reeks bij lege invoer', () => {
    expect(
      buildLiquidWealthPoints([
        { age: 45, nettoLiquide: Number.NaN },
        { age: 46, nettoLiquide: 10_000 },
      ]),
    ).toEqual([[47, 10_000]])
    expect(buildLiquidWealthPoints([])).toEqual([])
  })
})
