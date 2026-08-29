import { describe, it, expect } from 'vitest'
import {
  WEALTH_SELECTION_MAX_IDS,
  WEALTH_SELECTION_PREF_KEY,
  WEALTH_SELECTION_WIDGET_ID,
  WealthSelectionBodySchema,
  buildWealthSelectionWidgetData,
  isWealthSelectionWidgetActive,
  parseWealthSelection,
  wealthSelectionMonthKeys,
  type WealthSelectionHistoryInput,
} from './wealth-selection'

/** Twaalf maandsleutels, oud → nieuw (vast, zodat de test niet met de klok meebeweegt). */
const MONTHS = [
  '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04',
  '2026-05', '2026-06', '2026-07', '2026-08',
]

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

const A1 = uuid(1)
const A2 = uuid(2)
const D1 = uuid(11)

function history(partial: Partial<WealthSelectionHistoryInput> = {}): WealthSelectionHistoryInput {
  return {
    monthKeys: MONTHS,
    assetSeries: {},
    debtSeries: {},
    ...partial,
  }
}

/**
 * Builder-aanroep die een gevuld object afdwingt. De builder geeft null bij
 * een selectie zonder levende rijen (review 🟡3); tests die dat pad niet
 * toetsen willen daar hard op vallen i.p.v. op een vage null-deref verderop.
 */
function mustBuild(
  ...args: Parameters<typeof buildWealthSelectionWidgetData>
): NonNullable<ReturnType<typeof buildWealthSelectionWidgetData>> {
  const data = buildWealthSelectionWidgetData(...args)
  if (data === null) throw new Error('verwachtte een gevuld WealthSelectionWidgetData, kreeg null')
  return data
}

describe('parseWealthSelection', () => {
  it('leest een geldige selectie uit de feature_preferences-JSONB', () => {
    const prefs = { [WEALTH_SELECTION_PREF_KEY]: { assetIds: [A1, A2], debtIds: [D1] } }
    expect(parseWealthSelection(prefs)).toEqual({ assetIds: [A1, A2], debtIds: [D1] })
  })

  it('geeft null bij ontbrekende kolom, ontbrekende sleutel of een niet-object', () => {
    expect(parseWealthSelection(null)).toBeNull()
    expect(parseWealthSelection(undefined)).toBeNull()
    expect(parseWealthSelection('nope')).toBeNull()
    expect(parseWealthSelection({})).toBeNull()
    expect(parseWealthSelection({ [WEALTH_SELECTION_PREF_KEY]: 'nope' })).toBeNull()
    expect(parseWealthSelection({ [WEALTH_SELECTION_PREF_KEY]: [A1] })).toBeNull()
  })

  it('geeft null wanneer beide lijsten leeg zijn (of leeg wórden na sanitatie)', () => {
    expect(parseWealthSelection({ [WEALTH_SELECTION_PREF_KEY]: { assetIds: [], debtIds: [] } })).toBeNull()
    expect(
      parseWealthSelection({ [WEALTH_SELECTION_PREF_KEY]: { assetIds: ['niet-een-uuid'], debtIds: [42] } }),
    ).toBeNull()
  })

  it('gooit niet-uuid-waarden weg en laat de geldige staan', () => {
    const prefs = {
      [WEALTH_SELECTION_PREF_KEY]: {
        assetIds: [A1, 'drop-table', 42, null, A2],
        debtIds: [{ id: D1 }],
      },
    }
    expect(parseWealthSelection(prefs)).toEqual({ assetIds: [A1, A2], debtIds: [] })
  })

  it('ontdubbelt (hoofdletterongevoelig) en behoudt de volgorde van eerste voorkomen', () => {
    const prefs = {
      [WEALTH_SELECTION_PREF_KEY]: { assetIds: [A2, A1, A2.toUpperCase()], debtIds: [] },
    }
    expect(parseWealthSelection(prefs)).toEqual({ assetIds: [A2, A1], debtIds: [] })
  })

  it('kapt af op WEALTH_SELECTION_MAX_IDS per lijst', () => {
    const many = Array.from({ length: WEALTH_SELECTION_MAX_IDS + 25 }, (_, i) => uuid(i + 100))
    const parsed = parseWealthSelection({ [WEALTH_SELECTION_PREF_KEY]: { assetIds: many, debtIds: many } })
    expect(parsed?.assetIds).toHaveLength(WEALTH_SELECTION_MAX_IDS)
    expect(parsed?.debtIds).toHaveLength(WEALTH_SELECTION_MAX_IDS)
  })

  it('raakt andere sleutels in feature_preferences niet aan (leest er alleen uit)', () => {
    const prefs = { fire_strategy_override: 'pensioen', [WEALTH_SELECTION_PREF_KEY]: { assetIds: [A1], debtIds: [] } }
    parseWealthSelection(prefs)
    expect(prefs.fire_strategy_override).toBe('pensioen')
  })
})

describe('WealthSelectionBodySchema', () => {
  it('accepteert twee uuid-lijsten, inclusief leeg (= selectie wissen)', () => {
    expect(WealthSelectionBodySchema.safeParse({ assetIds: [A1], debtIds: [] }).success).toBe(true)
    expect(WealthSelectionBodySchema.safeParse({ assetIds: [], debtIds: [] }).success).toBe(true)
  })

  it('weigert niet-uuids, ontbrekende velden en lijsten boven de bovengrens', () => {
    expect(WealthSelectionBodySchema.safeParse({ assetIds: ['x'], debtIds: [] }).success).toBe(false)
    expect(WealthSelectionBodySchema.safeParse({ assetIds: [A1] }).success).toBe(false)
    expect(WealthSelectionBodySchema.safeParse({ assetIds: 'alles', debtIds: [] }).success).toBe(false)
    const tooMany = Array.from({ length: WEALTH_SELECTION_MAX_IDS + 1 }, (_, i) => uuid(i + 500))
    expect(WealthSelectionBodySchema.safeParse({ assetIds: tooMany, debtIds: [] }).success).toBe(false)
  })
})

describe('isWealthSelectionWidgetActive', () => {
  const selection = { assetIds: [A1], debtIds: [] }

  it('is alleen waar wanneer de widget aanstaat én er een selectie is', () => {
    expect(isWealthSelectionWidgetActive([WEALTH_SELECTION_WIDGET_ID], selection)).toBe(true)
    expect(isWealthSelectionWidgetActive([WEALTH_SELECTION_WIDGET_ID], null)).toBe(false)
    expect(isWealthSelectionWidgetActive(['spaarquote'], selection)).toBe(false)
    expect(isWealthSelectionWidgetActive([], selection)).toBe(false)
  })
})

describe('buildWealthSelectionWidgetData — weging en totalen', () => {
  it('weegt elke post met net_worth_inclusion_pct en trekt schulden af', () => {
    const data = mustBuild(
      { assetIds: [A1, A2], debtIds: [D1] },
      [
        { id: A1, name: 'Beleggingen', current_value: 10000, net_worth_inclusion_pct: 100 },
        { id: A2, name: 'Huis', current_value: 400000, net_worth_inclusion_pct: 50 },
      ],
      [{ id: D1, name: 'Hypotheek', current_balance: 100000, net_worth_inclusion_pct: 50 }],
      history(),
    )

    expect(data.assetsTotal).toBe(210000)
    expect(data.debtsTotal).toBe(50000)
    expect(data.total).toBe(160000)
    expect(data.count).toEqual({ assets: 2, debts: 1 })
  })

  it('behandelt een ontbrekend inclusie-percentage als 100% en leest string-bedragen', () => {
    const data = mustBuild(
      { assetIds: [A1], debtIds: [D1] },
      [{ id: A1, name: 'Spaargeld', current_value: '2500.50', net_worth_inclusion_pct: null }],
      [{ id: D1, name: 'Lening', current_balance: '500.25' }],
      history(),
    )

    expect(data.assetsTotal).toBe(2500.5)
    expect(data.debtsTotal).toBe(500.25)
    expect(data.total).toBe(2000.25)
  })

  it('geeft schuld-posten een POSITIEVE value met kind "debt"', () => {
    const data = mustBuild(
      { assetIds: [], debtIds: [D1] },
      [],
      [{ id: D1, name: 'Studieschuld', current_balance: 12000, net_worth_inclusion_pct: 100 }],
      history(),
    )

    expect(data.total).toBe(-12000)
    expect(data.topItems).toEqual([{ name: 'Studieschuld', value: 12000, kind: 'debt' }])
  })

  it('filtert stale id\'s stil weg (verwijderde rij telt niet mee)', () => {
    const data = mustBuild(
      { assetIds: [A1, A2], debtIds: [D1] },
      [{ id: A1, name: 'Nog bestaand', current_value: 1000, net_worth_inclusion_pct: 100 }],
      [],
      history(),
    )

    expect(data.assetsTotal).toBe(1000)
    expect(data.debtsTotal).toBe(0)
    expect(data.count).toEqual({ assets: 1, debts: 0 })
    expect(data.topItems.map(i => i.name)).toEqual(['Nog bestaand'])
  })

  it('geeft null bij een selectie waarvan niets meer bestaat — de widget hoort dan de kies-empty-state te tonen, geen "€ 0"', () => {
    // Eerdere vastlegging gaf hier een leeg-maar-geldig object terug; de
    // review (🟡3) wees uit dat de widget dan een gevulde tak rendert met
    // € 0 en een onterechte "nog geen verloop"-verklaring. Null is de
    // eerlijke uitkomst: geen levende rijen = geen selectie.
    const data = buildWealthSelectionWidgetData({ assetIds: [A1], debtIds: [D1] }, [], [], history())
    expect(data).toBeNull()
  })
})

describe('buildWealthSelectionWidgetData — topItems', () => {
  it('toont maximaal 4 posten, grootste eerst, over bezittingen en schulden heen', () => {
    const assets = [1, 2, 3, 4, 5].map(n => ({
      id: uuid(n),
      name: `Bezit ${n}`,
      current_value: n * 1000,
      net_worth_inclusion_pct: 100,
    }))
    const data = mustBuild(
      { assetIds: assets.map(a => a.id), debtIds: [D1] },
      assets,
      [{ id: D1, name: 'Grote schuld', current_balance: 9000, net_worth_inclusion_pct: 100 }],
      history(),
    )

    expect(data.topItems).toHaveLength(4)
    expect(data.topItems.map(i => i.name)).toEqual(['Grote schuld', 'Bezit 5', 'Bezit 4', 'Bezit 3'])
    expect(data.topItems[0].kind).toBe('debt')
    // count telt álle levende posten, niet alleen de getoonde vier.
    expect(data.count).toEqual({ assets: 5, debts: 1 })
  })

  it('sorteert op de GEWOGEN waarde, niet op de rauwe current_value', () => {
    const data = mustBuild(
      { assetIds: [A1, A2], debtIds: [] },
      [
        { id: A1, name: 'Huis (10%)', current_value: 400000, net_worth_inclusion_pct: 10 },
        { id: A2, name: 'Depot (100%)', current_value: 50000, net_worth_inclusion_pct: 100 },
      ],
      [],
      history(),
    )
    expect(data.topItems.map(i => i.name)).toEqual(['Depot (100%)', 'Huis (10%)'])
  })

  it('valt terug op "Naamloos" bij een lege naam', () => {
    const data = mustBuild(
      { assetIds: [A1], debtIds: [] },
      [{ id: A1, name: '   ', current_value: 100, net_worth_inclusion_pct: 100 }],
      [],
      history(),
    )
    expect(data.topItems[0].name).toBe('Naamloos')
  })
})

describe('buildWealthSelectionWidgetData — history', () => {
  it('somt de reeksen per maand op, oud → nieuw, met schulden negatief', () => {
    const data = mustBuild(
      { assetIds: [A1], debtIds: [D1] },
      [{ id: A1, current_value: 300, net_worth_inclusion_pct: 100 }],
      [{ id: D1, current_balance: 30, net_worth_inclusion_pct: 100 }],
      history({
        assetSeries: { [A1]: [100, 200, 300] },
        debtSeries: { [D1]: [10, 20, 30] },
      }),
    )

    expect(data.history).toEqual([
      { month: '2026-06', value: 90 },
      { month: '2026-07', value: 180 },
      { month: '2026-08', value: 270 },
    ])
  })

  it('lijnt reeksen van ongelijke lengte rechts uit (jongere post begint later)', () => {
    // A1 loopt 4 maanden, A2 slechts 2 — A2 mag pas in de laatste twee punten meetellen.
    const data = mustBuild(
      { assetIds: [A1, A2], debtIds: [] },
      [
        { id: A1, current_value: 40, net_worth_inclusion_pct: 100 },
        { id: A2, current_value: 2, net_worth_inclusion_pct: 100 },
      ],
      [],
      history({ assetSeries: { [A1]: [10, 20, 30, 40], [A2]: [1, 2] } }),
    )

    expect(data.history).toEqual([
      { month: '2026-05', value: 10 },
      { month: '2026-06', value: 20 },
      { month: '2026-07', value: 31 },
      { month: '2026-08', value: 42 },
    ])
  })

  it('levert een volledige 12-punts reeks wanneer alle maanden data hebben', () => {
    const data = mustBuild(
      { assetIds: [A1], debtIds: [] },
      [{ id: A1, current_value: 12, net_worth_inclusion_pct: 100 }],
      [],
      history({ assetSeries: { [A1]: MONTHS.map((_, i) => i + 1) } }),
    )

    expect(data.history).toHaveLength(12)
    expect(data.history[0]).toEqual({ month: '2025-09', value: 1 })
    expect(data.history[11]).toEqual({ month: '2026-08', value: 12 })
  })

  it('geeft een LEGE history bij minder dan 2 maanden echte snapshot-data', () => {
    const data = mustBuild(
      { assetIds: [A1], debtIds: [] },
      [{ id: A1, current_value: 100, net_worth_inclusion_pct: 100 }],
      [],
      history({ assetSeries: { [A1]: [100] } }),
    )
    expect(data.history).toEqual([])
  })

  it('geeft een LEGE history wanneer er helemaal geen reeksen zijn (geen verzonnen lijn)', () => {
    const data = mustBuild(
      { assetIds: [A1], debtIds: [] },
      [{ id: A1, current_value: 100, net_worth_inclusion_pct: 100 }],
      [],
      history(),
    )
    expect(data.history).toEqual([])
    // De actuele som staat er wél — "nog geen verloop" is geen "nog geen vermogen".
    expect(data.total).toBe(100)
  })

  it('grens: precies 2 maanden echte data levert wél een reeks (geen "minder dan 2")', () => {
    // WEALTH_SELECTION_MIN_HISTORY_POINTS = 2 — de ondergrens zelf moet nog
    // een reeks opleveren; alleen ÓNDER de grens (1 punt) blijft history leeg.
    const data = mustBuild(
      { assetIds: [A1], debtIds: [] },
      [{ id: A1, current_value: 200, net_worth_inclusion_pct: 100 }],
      [],
      history({ assetSeries: { [A1]: [100, 200] } }),
    )
    expect(data.history).toEqual([
      { month: '2026-07', value: 100 },
      { month: '2026-08', value: 200 },
    ])
  })

  it('somt reeksen van sterk ongelijke lengte over ASSET én DEBT heen, rechts uitgelijnd (12 vs. 3 maanden)', () => {
    // A1 (asset) heeft alle 12 maanden, D1 (debt) pas de laatste 3 — spiegelt
    // een net aangemaakte schuld naast een lang bestaande bezitting. D1 mag
    // pas in de laatste 3 punten meetellen; de eerste 9 zijn zuiver A1.
    const assetSeries = MONTHS.map((_, i) => (i + 1) * 10) // 10..120, lengte 12
    const debtSeries = [5, 6, 7] // lengte 3 — hoort bij de LAATSTE 3 maanden
    const data = mustBuild(
      { assetIds: [A1], debtIds: [D1] },
      [{ id: A1, current_value: 120, net_worth_inclusion_pct: 100 }],
      [{ id: D1, current_balance: 7, net_worth_inclusion_pct: 100 }],
      history({ assetSeries: { [A1]: assetSeries }, debtSeries: { [D1]: debtSeries } }),
    )

    expect(data.history).toHaveLength(12)
    // Eerste 9 maanden: alleen het asset-punt, geen schuld-aftrek.
    expect(data.history[0]).toEqual({ month: '2025-09', value: 10 })
    expect(data.history[8]).toEqual({ month: '2026-05', value: 90 })
    // Laatste 3 maanden: asset − debt, rechts uitgelijnd op de debt-reeks.
    expect(data.history[9]).toEqual({ month: '2026-06', value: 100 - 5 })
    expect(data.history[10]).toEqual({ month: '2026-07', value: 110 - 6 })
    expect(data.history[11]).toEqual({ month: '2026-08', value: 120 - 7 })
  })

  it('negeert de reeks van een stale id (rij bestaat niet meer)', () => {
    const data = mustBuild(
      { assetIds: [A1, A2], debtIds: [] },
      [{ id: A1, current_value: 30, net_worth_inclusion_pct: 100 }],
      [],
      history({ assetSeries: { [A1]: [10, 20, 30], [A2]: [900, 900, 900] } }),
    )
    expect(data.history.map(p => p.value)).toEqual([10, 20, 30])
  })
})

describe('wealthSelectionMonthKeys', () => {
  it('geeft 12 sleutels oud → nieuw, eindigend op de huidige maand', () => {
    const keys = wealthSelectionMonthKeys(new Date(2026, 7, 15)) // augustus 2026, lokale tijd
    expect(keys).toHaveLength(12)
    expect(keys[11]).toBe('2026-08')
    expect(keys[0]).toBe('2025-09')
  })

  it('rolt correct over de jaargrens', () => {
    const keys = wealthSelectionMonthKeys(new Date(2026, 0, 31))
    expect(keys[11]).toBe('2026-01')
    expect(keys[0]).toBe('2025-02')
  })
})
