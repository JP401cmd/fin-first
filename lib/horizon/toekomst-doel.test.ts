import { describe, it, expect } from 'vitest'
import type { Asset, AssetType } from '@/lib/asset-data'
import {
  buildParameterGoalRows,
  doelGewogenRendement,
  HEFBOOM_DOEL_PARAMETERS,
  PARAM_TO_GOAL_TYPE,
  PARAMETER_GOAL_TYPES,
  LEGACY_PARAMETER_GOAL_TYPES,
  type ParameterGoalInput,
} from './toekomst-doel'
import { HEFBOOM_KEYS } from './lab-grenzen-types'
import { DOEL_PARAMETERS } from './toekomst-scenario'
import { GOAL_TYPE_ICONS } from '@/lib/goal-data'
import { formatCurrency } from '@/lib/format'

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
        { spaarquote: true, rendement: true, fire: true },
        { spaarquotePct: 45, rendementPct: 6.3, fireLeeftijd: 58, margeJaren: 3 },
      ),
    )
    expect(overgeslagen).toEqual([])
    expect(rows.map((r) => r.parameter)).toEqual(['spaarquote', 'rendement', 'fire'])
    expect(rows.map((r) => r.goal_type)).toEqual([
      'savings_rate',
      'expected_return',
      'fire_age',
    ])
  })

  it('elke rij draagt server-side metadata (bron/oorsprong), één kleurfamilie en META-iconen', () => {
    const { rows } = buildParameterGoalRows(
      input(
        { spaarquote: true, rendement: true, fire: true },
        { spaarquotePct: 45, rendementPct: 6.3, fireLeeftijd: 58, margeJaren: 3 },
      ),
    )
    for (const r of rows) {
      expect(r.color).toBe('purple')
      expect(r.metadata.bron).toBe('parameter')
      expect(r.metadata.oorsprong).toBe('lab')
    }
    const byType = Object.fromEntries(rows.map((r) => [r.goal_type, r]))
    expect(byType.savings_rate.icon).toBe('Activity')
    expect(byType.expected_return.icon).toBe('Coins')
    expect(byType.fire_age.icon).toBe('Hourglass')
    // Alleen het FIRE-doel draagt de marge; de andere niet.
    expect(byType.fire_age.metadata.margeDoelJaren).toBe(3)
    expect(byType.savings_rate.metadata.margeDoelJaren).toBeUndefined()
  })

  it('formatteert de namen (nl-NL, rendement met 1 decimaal)', () => {
    const { rows } = buildParameterGoalRows(
      input(
        { spaarquote: true, rendement: true, fire: true },
        { spaarquotePct: 45, rendementPct: 6.3, fireLeeftijd: 58, margeJaren: 3 },
      ),
    )
    const byType = Object.fromEntries(rows.map((r) => [r.goal_type, r]))
    expect(byType.savings_rate.name).toBe('Spaarquote naar 45%')
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
      input({ rendement: true }, {}),
    )
    expect(rows).toEqual([])
    expect(overgeslagen).toEqual(['rendement'])

    // Niet-eindige waarden tellen als "ontbrekend".
    const nan = buildParameterGoalRows(input({ rendement: true }, { rendementPct: Number.NaN }))
    expect(nan.rows).toEqual([])
    expect(nan.overgeslagen).toEqual(['rendement'])
  })

  it('negeert parameters die niet expliciet true zijn', () => {
    const { rows, overgeslagen } = buildParameterGoalRows(
      // @ts-expect-error — bewust een niet-true waarde om de whitelist te testen.
      input({ spaarquote: false, rendement: undefined }, { spaarquotePct: 45, rendementPct: 6.3 }),
    )
    expect(rows).toEqual([])
    expect(overgeslagen).toEqual([])
  })
})

describe('PARAM_TO_GOAL_TYPE / PARAMETER_GOAL_TYPES', () => {
  it('koppelt elke parameter aan het juiste goal_type (acht sinds 20 sep 2026: + de drie knop-doelen); salaris blijft als legacy-type bestaan', () => {
    expect(PARAM_TO_GOAL_TYPE).toEqual({
      spaarquote: 'savings_rate',
      rendement: 'expected_return',
      fire: 'fire_age',
      dekking: 'plan_coverage',
      eindvermogen: 'end_balance',
      extraInleg: 'extra_deposit',
      uitgaveNaPensioen: 'retirement_expense',
      nalatenschap: 'legacy_amount',
    })
    expect(PARAMETER_GOAL_TYPES).toEqual([
      'savings_rate',
      'expected_return',
      'fire_age',
      'plan_coverage',
      'end_balance',
      'extra_deposit',
      'retirement_expense',
      'legacy_amount',
    ])
    expect(PARAMETER_GOAL_TYPES).toHaveLength(8)
    expect(LEGACY_PARAMETER_GOAL_TYPES).toEqual(['salary'])
  })

  /**
   * DE REGRESSIE DIE HET DEFECT VAN 20 SEP 2026 HAD GEVANGEN. De gebruiker kon alle vijf
   * lab-knoppen verschuiven, maar "Werk je doel bij" bood er twee aan: `verdienen`,
   * `uitgaveNaPensioen` en `nalatenschap` hadden geen doelparameter en niets zei daar iets
   * over. Deze toets koppelt de twee lijsten hard aan elkaar.
   */
  it('ELKE hefboom-knop heeft minstens één doelparameter, en die bestaat', () => {
    for (const knop of HEFBOOM_KEYS) {
      const params = HEFBOOM_DOEL_PARAMETERS[knop]
      expect(params.length, `knop '${knop}' heeft geen doelparameter`).toBeGreaterThan(0)
      for (const p of params) {
        expect(DOEL_PARAMETERS, `knop '${knop}' wijst naar onbekende parameter '${p}'`).toContain(p)
        expect(PARAM_TO_GOAL_TYPE[p], `parameter '${p}' heeft geen goal_type`).toBeTruthy()
      }
    }
  })

  it('geen twee knoppen delen een doelparameter (behalve dat `stop` er drie draagt)', () => {
    const alle = HEFBOOM_KEYS.flatMap((k) => [...HEFBOOM_DOEL_PARAMETERS[k]])
    expect(new Set(alle).size).toBe(alle.length)
    // `stop` draagt drie parameters omdat het uitkomstdoel van het anker afhangt.
    expect(HEFBOOM_DOEL_PARAMETERS.stop).toEqual(['fire', 'dekking', 'eindvermogen'])
    // `rendement` hoort bij geen enkele knop (het is het marktaannames-blok).
    expect(alle).not.toContain('rendement')
  })
})

describe('buildParameterGoalRows — de drie knop-doelen (20 sep 2026)', () => {
  it('bouwt de drie rijen met nl-NL-bedragnamen, hele euro’s en de juiste goal_types', () => {
    const { rows, overgeslagen } = buildParameterGoalRows(
      input(
        { extraInleg: true, uitgaveNaPensioen: true, nalatenschap: true },
        { extraInlegMnd: 500, uitgaveNaPensioenJaar: 31800, nalatenschapBedrag: 100000 },
      ),
    )
    expect(overgeslagen).toEqual([])
    expect(rows.map((r) => r.goal_type)).toEqual(['extra_deposit', 'retirement_expense', 'legacy_amount'])
    // De naam draagt de eenheid: zonder "/jaar" leest €31.800 als een maandbedrag.
    expect(rows.map((r) => r.name)).toEqual([
      `Extra inleg naar ${formatCurrency(500)}/mnd`,
      `Uitgave na pensioen naar ${formatCurrency(31800)}/jaar`,
      `Nalatenschap naar ${formatCurrency(100000)}`,
    ])
    expect(rows.map((r) => r.target_value)).toEqual([500, 31800, 100000])
    // Server-side velden, net als bij de bestaande parameters.
    for (const r of rows) {
      expect(r.color).toBe('purple')
      expect(r.metadata).toEqual({ bron: 'parameter', oorsprong: 'lab' })
    }
    expect(rows.map((r) => r.icon)).toEqual([
      GOAL_TYPE_ICONS.extra_deposit,
      GOAL_TYPE_ICONS.retirement_expense,
      GOAL_TYPE_ICONS.legacy_amount,
    ])
  })

  it('rondt af op hele euro’s zodat naam en opgeslagen waarde niet uiteenlopen', () => {
    const { rows } = buildParameterGoalRows(
      input({ nalatenschap: true }, { nalatenschapBedrag: 100000.6 }),
    )
    expect(rows[0].target_value).toBe(100001)
    expect(rows[0].name).toBe(`Nalatenschap naar ${formatCurrency(100001)}`)
  })

  it('slaat nul en negatief over: `target <= 0` leest app-breed als "geen doel gesteld"', () => {
    // De knop "Meer verdienen" schuift ook naar negatief (minder salaris) — geen doel.
    const negatief = buildParameterGoalRows(input({ extraInleg: true }, { extraInlegMnd: -200 }))
    expect(negatief.rows).toEqual([])
    expect(negatief.overgeslagen).toEqual(['extraInleg'])

    const nul = buildParameterGoalRows(
      input(
        { uitgaveNaPensioen: true, nalatenschap: true },
        { uitgaveNaPensioenJaar: 0, nalatenschapBedrag: 0 },
      ),
    )
    expect(nul.rows).toEqual([])
    expect(nul.overgeslagen).toEqual(['uitgaveNaPensioen', 'nalatenschap'])

    // Afronden mag geen 0 laten ontsnappen: €0,40 → €0 is evenmin een doel.
    const bijnaNul = buildParameterGoalRows(input({ extraInleg: true }, { extraInlegMnd: 0.4 }))
    expect(bijnaNul.rows).toEqual([])
    expect(bijnaNul.overgeslagen).toEqual(['extraInleg'])
  })

  it('slaat een aangevinkte knop zonder (eindige) doelwaarde tolerant over', () => {
    const leeg = buildParameterGoalRows(input({ uitgaveNaPensioen: true }, {}))
    expect(leeg.rows).toEqual([])
    expect(leeg.overgeslagen).toEqual(['uitgaveNaPensioen'])

    const nan = buildParameterGoalRows(
      input({ nalatenschap: true }, { nalatenschapBedrag: Number.NaN }),
    )
    expect(nan.rows).toEqual([])
    expect(nan.overgeslagen).toEqual(['nalatenschap'])
  })

  it('hangt NIET aan het stop-anker: de drie rijen ontstaan zonder plan-velden', () => {
    // Anders dan `dekking`/`eindvermogen` zijn dit plan-parameters, geen uitkomsten. Er
    // gaat dus geen `planEindleeftijd` in en de rijen dragen geen anker-metadata.
    const { rows } = buildParameterGoalRows(
      input({ extraInleg: true }, { extraInlegMnd: 250 }),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].metadata).not.toHaveProperty('eindleeftijd')
  })
})

describe('buildParameterGoalRows — eindvermogen (ADR 0145 D12)', () => {
  it('bouwt een end_balance-rij: doel = het NOMINALE client-bedrag, naam met eindleeftijd, plan-velden in de metadata', () => {
    const { rows, overgeslagen } = buildParameterGoalRows(
      input({ eindvermogen: true }, { eindvermogen: 250_000, planEindleeftijd: 90, planStopAnker: 'age', planStopLeeftijd: 60 }),
    )
    expect(overgeslagen).toEqual([])
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.parameter).toBe('eindvermogen')
    expect(row.goal_type).toBe('end_balance')
    expect(row.name).toBe('Eindvermogen op je 90e')
    expect(row.target_value).toBe(250_000)
    expect(row.icon).toBe('Vault')
    expect(row.color).toBe('purple')
    expect(row.metadata).toEqual({ bron: 'parameter', oorsprong: 'lab', eindleeftijd: 90, stopAnker: 'age', stopLeeftijd: 60 })
  })

  it('nul is een geldig doel; negatief, ontbrekend of zonder eindleeftijd wordt tolerant overgeslagen', () => {
    const plan = { planEindleeftijd: 90, planStopAnker: 'aow' as const, planStopLeeftijd: null }
    expect(buildParameterGoalRows(input({ eindvermogen: true }, { ...plan, eindvermogen: 0 })).rows[0]?.target_value).toBe(0)
    expect(buildParameterGoalRows(input({ eindvermogen: true }, { ...plan, eindvermogen: -1 })).overgeslagen).toEqual(['eindvermogen'])
    expect(buildParameterGoalRows(input({ eindvermogen: true }, plan)).overgeslagen).toEqual(['eindvermogen'])
    expect(buildParameterGoalRows(input({ eindvermogen: true }, { eindvermogen: 1000 })).overgeslagen).toEqual(['eindvermogen'])
  })
})

describe('buildParameterGoalRows — dekking ("Plan gedekt", ADR 0145)', () => {
  it('bouwt de rij uit de SERVER-plan-velden: naam met eindleeftijd, doel = META-max (100), metadata met anker', () => {
    const { rows, overgeslagen } = buildParameterGoalRows(
      input({ dekking: true }, { planEindleeftijd: 90, planStopAnker: 'age', planStopLeeftijd: 58.5 }),
    )
    expect(overgeslagen).toEqual([])
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.parameter).toBe('dekking')
    expect(row.goal_type).toBe('plan_coverage')
    expect(row.name).toBe('Plan gedekt tot 90 jaar')
    expect(row.target_value).toBe(100)
    expect(row.icon).toBe('ShieldCheck')
    expect(row.color).toBe('purple')
    expect(row.metadata).toEqual({ bron: 'parameter', oorsprong: 'lab', eindleeftijd: 90, stopAnker: 'age', stopLeeftijd: 58.5 })
  })

  it('aow: stopLeeftijd null (de kaart zegt dan "je AOW-leeftijd"); fractionele eindleeftijd met komma', () => {
    const { rows } = buildParameterGoalRows(input({ dekking: true }, { planEindleeftijd: 92.5, planStopAnker: 'aow', planStopLeeftijd: null }))
    expect(rows[0].name).toBe('Plan gedekt tot 92,5 jaar')
    expect(rows[0].metadata).toMatchObject({ stopAnker: 'aow', stopLeeftijd: null, eindleeftijd: 92.5 })
  })

  it('zonder plan-eindleeftijd wordt de rij tolerant overgeslagen (geen doel zonder plan-einde)', () => {
    const { rows, overgeslagen } = buildParameterGoalRows(input({ dekking: true, spaarquote: true }, { spaarquotePct: 45 }))
    expect(rows.map((r) => r.parameter)).toEqual(['spaarquote'])
    expect(overgeslagen).toEqual(['dekking'])
  })

  it('dekking staat ná fire in de DOEL_PARAMETERS-volgorde', () => {
    const { rows } = buildParameterGoalRows(
      input({ fire: true, dekking: true }, { fireLeeftijd: 58, planEindleeftijd: 90, planStopAnker: 'age', planStopLeeftijd: 58 }),
    )
    expect(rows.map((r) => r.goal_type)).toEqual(['fire_age', 'plan_coverage'])
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

  // TPR-02 — zelfde ketting als de kernel: ontbrekend rendement → terugval; bewuste 0 → 0.
  it('ontbrekend rendement → terugvalRendement, bewuste 0 blijft 0, zonder terugval → 0', () => {
    const assets = [
      asset({ current_value: 10_000, expected_return: null as unknown as number, asset_type: 'investment' }),
      asset({ current_value: 10_000, expected_return: 0, asset_type: 'crypto' }),
    ]
    // (10000·0,07 + 10000·0) / 20000 · 100 = 3,5
    expect(doelGewogenRendement(assets, undefined, 0.07)).toBeCloseTo(3.5, 6)
    // Oude nul-basis blijft het gedrag zonder terugval.
    expect(doelGewogenRendement(assets, undefined)).toBe(0)
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
