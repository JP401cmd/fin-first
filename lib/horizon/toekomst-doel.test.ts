import { describe, it, expect } from 'vitest'
import type { Asset, AssetType } from '@/lib/asset-data'
import {
  buildParameterGoalRows,
  doelGewogenRendement,
  PARAM_TO_GOAL_TYPE,
  PARAMETER_GOAL_TYPES,
  type ParameterGoalInput,
} from './toekomst-doel'

/**
 * Tests voor de pure doelscenario-bouwlaag (ronde 4 stap 3):
 *   - `buildParameterGoalRows`: één rij per vinkje, nl-NL-naamformats, META-clamps,
 *     fire-0,5-grid (ceil) + marge-floor (≥ 0), tolerant overslaan van parameters
 *     zonder doelwaarde;
 *   - `doelGewogenRendement`: gewogen (inclusion + delta) totaalrendement, lege → null.
 * De builder herberekent NIETS: hij clampt/normaliseert de client-doelwaarden.
 */

// Minimale Asset-fabriek: `doelGewogenRendement` leest alleen deze velden.
function asset(over: {
  current_value: number
  expected_return: number
  asset_type: AssetType
  is_active?: boolean
  net_worth_inclusion_pct?: number
}): Asset {
  return {
    is_active: true,
    net_worth_inclusion_pct: 100,
    ...over,
  } as unknown as Asset
}

/** Kortere factory voor de builder-input. */
function input(
  parameters: ParameterGoalInput['parameters'],
  doelwaarden: ParameterGoalInput['doelwaarden'],
): ParameterGoalInput {
  return { parameters, doelwaarden }
}

describe('buildParameterGoalRows', () => {
  it('bouwt één rij per aangevinkte parameter, in DOEL_PARAMETERS-volgorde', () => {
    const { rows, overgeslagen } = buildParameterGoalRows(
      input(
        { spaarquote: true, salaris: true, rendement: true, fire: true },
        { spaarquotePct: 45, salarisMnd: 6000, rendementPct: 6.3, fireLeeftijd: 58, margeJaren: 3 },
      ),
    )
    expect(overgeslagen).toEqual([])
    expect(rows.map((r) => r.parameter)).toEqual(['spaarquote', 'salaris', 'rendement', 'fire'])
    expect(rows.map((r) => r.goal_type)).toEqual([
      'savings_rate',
      'salary',
      'expected_return',
      'fire_age',
    ])
  })

  it('elke rij draagt server-side metadata (bron/oorsprong), één kleurfamilie en META-iconen', () => {
    const { rows } = buildParameterGoalRows(
      input(
        { spaarquote: true, salaris: true, rendement: true, fire: true },
        { spaarquotePct: 45, salarisMnd: 6000, rendementPct: 6.3, fireLeeftijd: 58, margeJaren: 3 },
      ),
    )
    for (const r of rows) {
      expect(r.color).toBe('purple')
      expect(r.metadata.bron).toBe('parameter')
      expect(r.metadata.oorsprong).toBe('lab')
    }
    const byType = Object.fromEntries(rows.map((r) => [r.goal_type, r]))
    expect(byType.savings_rate.icon).toBe('Activity')
    expect(byType.salary.icon).toBe('Briefcase')
    expect(byType.expected_return.icon).toBe('Coins')
    expect(byType.fire_age.icon).toBe('Hourglass')
    // Alleen het FIRE-doel draagt de marge; de andere niet.
    expect(byType.fire_age.metadata.margeDoelJaren).toBe(3)
    expect(byType.savings_rate.metadata.margeDoelJaren).toBeUndefined()
  })

  it('formatteert de namen (nl-NL, salaris-bedrag zonder decimalen, rendement met 1 decimaal)', () => {
    const { rows } = buildParameterGoalRows(
      input(
        { spaarquote: true, salaris: true, rendement: true, fire: true },
        { spaarquotePct: 45, salarisMnd: 6250, rendementPct: 6.3, fireLeeftijd: 58, margeJaren: 3 },
      ),
    )
    const byType = Object.fromEntries(rows.map((r) => [r.goal_type, r]))
    expect(byType.savings_rate.name).toBe('Spaarquote naar 45%')
    expect(byType.salary.name).toBe('Salaris naar €6.250/mnd')
    expect(byType.salary.target_value).toBe(6250)
    expect(byType.expected_return.name).toBe('Rendement naar 6,3%')
    expect(byType.fire_age.name).toBe('Vrij op 58 jaar')
  })

  it('clampt doelwaarden op de META-ranges (spaarquote ≤ 100, rendement ≤ 20, fire 18–100)', () => {
    const { rows } = buildParameterGoalRows(
      input(
        { spaarquote: true, rendement: true, fire: true },
        { spaarquotePct: 150, rendementPct: 25, fireLeeftijd: 12 },
      ),
    )
    const byType = Object.fromEntries(rows.map((r) => [r.goal_type, r]))
    expect(byType.savings_rate.target_value).toBe(100)
    expect(byType.savings_rate.name).toBe('Spaarquote naar 100%')
    expect(byType.expected_return.target_value).toBe(20)
    expect(byType.expected_return.name).toBe('Rendement naar 20,0%')
    // fire 12 → onder de min → 18.
    expect(byType.fire_age.target_value).toBe(18)
    expect(byType.fire_age.name).toBe('Vrij op 18 jaar')
  })

  it('clampt een te hoge fire-leeftijd op 100', () => {
    const { rows } = buildParameterGoalRows(input({ fire: true }, { fireLeeftijd: 120 }))
    expect(rows[0].target_value).toBe(100)
    expect(rows[0].name).toBe('Vrij op 100 jaar')
  })

  it('rondt een fractionele fire-leeftijd naar boven op het 0,5-grid', () => {
    const { rows } = buildParameterGoalRows(input({ fire: true }, { fireLeeftijd: 58.3, margeJaren: 2 }))
    expect(rows[0].target_value).toBe(58.5)
    expect(rows[0].name).toBe('Vrij op 58,5 jaar')
    // Een net-geheel getal springt NIET omhoog door float-ruis.
    const heel = buildParameterGoalRows(input({ fire: true }, { fireLeeftijd: 58 }))
    expect(heel.rows[0].target_value).toBe(58)
  })

  it('floort de marge op het 0,5-grid en houdt hem ≥ 0', () => {
    expect(
      buildParameterGoalRows(input({ fire: true }, { fireLeeftijd: 58, margeJaren: 2.7 })).rows[0]
        .metadata.margeDoelJaren,
    ).toBe(2.5)
    expect(
      buildParameterGoalRows(input({ fire: true }, { fireLeeftijd: 58, margeJaren: 2.3 })).rows[0]
        .metadata.margeDoelJaren,
    ).toBe(2)
    // Negatieve marge → 0 (nooit een negatieve veiligheidsmarge).
    expect(
      buildParameterGoalRows(input({ fire: true }, { fireLeeftijd: 58, margeJaren: -1 })).rows[0]
        .metadata.margeDoelJaren,
    ).toBe(0)
    // Ontbrekende marge → 0.
    expect(
      buildParameterGoalRows(input({ fire: true }, { fireLeeftijd: 58 })).rows[0].metadata
        .margeDoelJaren,
    ).toBe(0)
  })

  it('slaat een aangevinkte parameter zonder (eindige) doelwaarde tolerant over en meldt dat', () => {
    const { rows, overgeslagen } = buildParameterGoalRows(
      input({ spaarquote: true, salaris: true }, { spaarquotePct: 45 }),
    )
    expect(rows.map((r) => r.parameter)).toEqual(['spaarquote'])
    expect(overgeslagen).toEqual(['salaris'])

    // Niet-eindige waarden tellen als "ontbrekend".
    const nan = buildParameterGoalRows(input({ rendement: true }, { rendementPct: Number.NaN }))
    expect(nan.rows).toEqual([])
    expect(nan.overgeslagen).toEqual(['rendement'])
  })

  it('negeert parameters die niet expliciet true zijn', () => {
    const { rows, overgeslagen } = buildParameterGoalRows(
      // @ts-expect-error — bewust een niet-true waarde om de whitelist te testen.
      input({ spaarquote: false, salaris: undefined }, { spaarquotePct: 45, salarisMnd: 6000 }),
    )
    expect(rows).toEqual([])
    expect(overgeslagen).toEqual([])
  })
})

describe('PARAM_TO_GOAL_TYPE / PARAMETER_GOAL_TYPES', () => {
  it('koppelt elke parameter aan het juiste goal_type', () => {
    expect(PARAM_TO_GOAL_TYPE).toEqual({
      spaarquote: 'savings_rate',
      salaris: 'salary',
      rendement: 'expected_return',
      fire: 'fire_age',
    })
    expect(PARAMETER_GOAL_TYPES).toEqual(['savings_rate', 'salary', 'expected_return', 'fire_age'])
  })
})

describe('doelGewogenRendement', () => {
  it('weegt het rendement inclusion-gewogen over actieve assets (nul-basis, zonder delta)', () => {
    const assets = [
      asset({ current_value: 10_000, expected_return: 7, asset_type: 'investment' }),
      asset({ current_value: 30_000, expected_return: 2.5, asset_type: 'savings' }),
    ]
    // (10000·0,07 + 30000·0,025) / 40000 · 100 = 3,625
    expect(doelGewogenRendement(assets, undefined)).toBeCloseTo(3.625, 6)
  })

  it('telt de per-categorie rendement-delta bovenop het gewogen basisrendement', () => {
    const assets = [
      asset({ current_value: 10_000, expected_return: 7, asset_type: 'investment' }),
      asset({ current_value: 30_000, expected_return: 2.5, asset_type: 'savings' }),
    ]
    // Beleggingen +0,02: (10000·0,09 + 30000·0,025) / 40000 · 100 = 4,125
    expect(doelGewogenRendement(assets, { Beleggingen: 0.02 })).toBeCloseTo(4.125, 6)
  })

  it('weegt met net_worth_inclusion_pct (halve inclusie = half gewicht)', () => {
    const assets = [
      asset({ current_value: 10_000, expected_return: 7, asset_type: 'investment' }),
      asset({
        current_value: 20_000,
        expected_return: 2,
        asset_type: 'savings',
        net_worth_inclusion_pct: 50,
      }),
    ]
    // Gewichten: 10000 (er 0,07) en 10000 (er 0,02) → (700 + 200)/20000 · 100 = 4,5
    expect(doelGewogenRendement(assets, undefined)).toBeCloseTo(4.5, 6)
  })

  it('negeert inactieve assets en assets zonder positieve waarde', () => {
    const assets = [
      asset({ current_value: 10_000, expected_return: 7, asset_type: 'investment' }),
      asset({ current_value: 999_999, expected_return: 3, asset_type: 'savings', is_active: false }),
      asset({ current_value: 0, expected_return: 5, asset_type: 'investment' }),
    ]
    // Alleen de eerste telt → 7,0
    expect(doelGewogenRendement(assets, undefined)).toBeCloseTo(7, 6)
  })

  it('geeft null zonder assets met waarde', () => {
    expect(doelGewogenRendement([], undefined)).toBeNull()
    expect(
      doelGewogenRendement(
        [asset({ current_value: 0, expected_return: 5, asset_type: 'investment' })],
        undefined,
      ),
    ).toBeNull()
  })
})
