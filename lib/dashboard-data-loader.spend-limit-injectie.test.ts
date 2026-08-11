/**
 * De `spend_limit:`-WIDGETINJECTIE van `loadDashboardData` (lib/dashboard-data-loader.ts).
 *
 * ── WAT HIER WORDT BEWAAKT ──────────────────────────────────────────────────
 * Drie regels die samen bepalen of een grens-tegel verschijnt, blijft staan of
 * verdwijnt, en die geen van drieën in een pure functie wonen:
 *
 *  1. **isActive-gate** — alleen een ACTIEVE pot krijgt een nieuwe widget-pref.
 *     Een gepauzeerde pot mag er geen krijgen, maar een BESTAANDE pref van een
 *     gepauzeerde pot mag ook niet gewist worden (FR-B2-03/04, AC-B2-02).
 *  2. **order-offset −300** — nieuwe grens-tegels landen bóven de favoriete
 *     budgetten (−100) en holdings (−200), dus bovenaan het startscherm.
 *  3. **stale-drop** — pas bij ARCHIVEREN verdwijnt de opgeslagen pref, omdat de
 *     pot dan niet meer uit de loader komt (AC-B2-03).
 *
 * ── ECHTE REGEL + EEN BRON-ANKER ────────────────────────────────────────────
 * De injectie staat inline in `loadDashboardData`, een functie met tientallen
 * queries die in een unit-test niet te draaien is. Deze suite doet daarom twee
 * dingen tegelijk:
 *
 *  · de INVOER is echt — `loadSpendLimitsSection` (nep-client, hetzelfde patroon
 *    als lib/spend-limits/loader.test.ts) plus `toSpendLimitWidgetData`, precies
 *    de twee functies die de loader hier ook gebruikt. `isActive` en de
 *    archief-filter komen dus uit de echte code, niet uit een fixture;
 *  · de REGEL is óók echt: de gate en de pref-vorm wonen sinds de
 *    widget-schakelaar (PATCH /api/spend-limits/[id]/widget) in
 *    lib/spend-limits/widget-pref.ts, en `injecteer()` hieronder roept diezelfde
 *    functies aan als de loader. Wat hier nog gespiegeld is, is enkel het
 *    SAMENSTELLEN van de lijst (welke prefs blijven staan), en dat spiegelbeeld
 *    is verankerd: `bronanker` leest lib/dashboard-data-loader.ts van schijf en
 *    eist dat de beslissende fragmenten er letterlijk in staan. Wordt de injectie
 *    daar veranderd, dan valt dit bestand om in plaats van stilzwijgend een regel
 *    te bewaken die niet meer bestaat.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadSpendLimitsSection } from '@/lib/spend-limits/loader'
import { toSpendLimitWidgetData, type SpendLimitWidgetData } from '@/lib/spend-limits/widget-data'
import { mergeWidgetPrefs, type WidgetPref, type WidgetPrefs } from '@/lib/widget-catalog'
import {
  lowestWidgetOrder,
  newSpendLimitWidgetPrefs,
  SPEND_LIMIT_WIDGET_ORDER_OFFSET,
  SPEND_LIMIT_WIDGET_SIZE,
} from '@/lib/spend-limits/widget-pref'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOADER_PATH = join(REPO_ROOT, 'lib', 'dashboard-data-loader.ts')
const NOW = new Date(2026, 7, 8)

// ── Bron-anker ──────────────────────────────────────────────────────────────

/** Strip block- en regelcommentaar en normaliseer witruimte, zodat het anker
 *  op CODE matcht en niet op proza, en niet omvalt bij een herformattering. */
function loaderCode(): string {
  return readFileSync(LOADER_PATH, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
}

describe('bronanker — de gespiegelde regel bestaat nog in loadDashboardData', () => {
  const code = loaderCode()

  it('leest een niet-lege bron (anders is elke assertie hieronder groen om niets)', () => {
    expect(code.length).toBeGreaterThan(1000)
    expect(code).toContain('loadSpendLimitsSection(supabase, now,')
  })

  it.each([
    // De gate + de pref-vorm komen uit de gedeelde helper; dit anker bewaakt dat
    // de loader hem ook echt consumeert en niet stilletjes een eigen kopie terugkrijgt.
    ['gedeelde injectie-helper', 'newSpendLimitWidgetPrefs( spendLimitWidgets, savedSpendLimitIds, lowestOrder, )'],
    ['lowestOrder-basis', 'const lowestOrder = lowestWidgetOrder(widgetPrefs.widgets)'],
    // De stale-drop: een opgeslagen pref overleeft alleen als de pot nog uit de
    // loader komt (dus niet gearchiveerd is).
    ['stale-drop', "!w.id.startsWith('spend_limit:') || currentSpendLimitIds.has(w.id)"],
    ['huidige-set uit de loader-uitvoer', 'const currentSpendLimitIds = new Set(spendLimitWidgets.map(s =>'],
    // De projectie is een SELECTIE uit het rapport, geen tweede berekening.
    ['projectie via toSpendLimitWidgetData', 'spendLimitsSection.limits.map(l => toSpendLimitWidgetData(l,'],
  ])('%s staat letterlijk in de loader', (_label, fragment) => {
    expect(code).toContain(fragment)
  })

  it('de bundel-tak vraagt GEEN eigen dagtarief op — de widget leest het bundelveld', () => {
    // Dit is de andere helft van de "één metriek, één grondslag"-regel: de
    // widget consumeert DashboardData.dailyExpenseRate, dus mag deze aanroep
    // nooit stilletjes een tweede dagtarief gaan afleiden.
    expect(code).toContain('withDailyExpenseRate: false,')
  })
})

// ── Nep-client (patroon uit lib/spend-limits/loader.test.ts) ────────────────

type Row = Record<string, unknown>

function makeFake(limits: Row[], counterpartyAgg: Row[] = []) {
  const tables: Record<string, Row[]> = { spend_limits: limits, budgets: [] }

  function builder(table: string) {
    const filters: { col: string; val: unknown }[] = []
    const settle = () => {
      let rows = tables[table] ?? []
      for (const f of filters) rows = rows.filter((r) => r[f.col] === f.val)
      return { data: rows, error: null }
    }
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'gte', 'lt', 'gt', 'lte', 'in', 'limit', 'not', 'is']) {
      q[m] = () => q
    }
    q.eq = (col: string, val: unknown) => {
      filters.push({ col, val })
      return q
    }
    q.single = () => Promise.resolve({ data: settle().data?.[0] ?? null, error: null })
    q.maybeSingle = q.single
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(res, rej)
    return q
  }

  return {
    from: (table: string) => builder(table),
    rpc: async (fn: string) =>
      fn === 'tx_counterparty_month_aggregate' ? { data: counterpartyAgg, error: null } : { data: [], error: null },
  } as unknown as SupabaseClient
}

function limitRow(over: Partial<Row> & { id: string }): Row {
  return {
    name: `Pot ${over.id}`,
    purpose: null,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    rule_type: 'counterparty',
    budget_id: null,
    include_child_budgets: true,
    counterparty_key: 'SHELL',
    counterparty_label: 'Shell',
    limit_amount: 100,
    period: 'month',
    is_active: true,
    ...over,
  }
}

/** De echte keten uit de loader: sectie laden → projecteren naar widget-vorm. */
async function widgetsFor(limits: Row[]): Promise<SpendLimitWidgetData[]> {
  const section = await loadSpendLimitsSection(makeFake(limits), NOW, {
    withBudgetOptions: false,
    withDailyExpenseRate: false,
  })
  return section.limits.map((l) =>
    toSpendLimitWidgetData(l, { aggregateTruncationSuspected: section.aggregateTruncationSuspected }),
  )
}

// ── De gespiegelde injectie (verankerd door de suite hierboven) ─────────────

function injecteer(saved: WidgetPrefs | null, spendLimitWidgets: SpendLimitWidgetData[]) {
  const widgetPrefs = mergeWidgetPrefs(saved)
  const lowestOrder = lowestWidgetOrder(widgetPrefs.widgets)
  const savedSpendLimitIds = new Set(
    widgetPrefs.widgets.filter((w) => w.id.startsWith('spend_limit:')).map((w) => w.id),
  )
  const currentSpendLimitIds = new Set(spendLimitWidgets.map((s) => `spend_limit:${s.id}`))
  // Exact de aanroep uit de loader — de gate en de pref-vorm worden hier dus
  // getest zoals ze draaien, niet nagebouwd.
  const newSpendLimitPrefs: WidgetPref[] = newSpendLimitWidgetPrefs(
    spendLimitWidgets,
    savedSpendLimitIds,
    lowestOrder,
  )

  const allWidgetPrefs = [
    ...widgetPrefs.widgets.filter(
      (w) => !w.id.startsWith('spend_limit:') || currentSpendLimitIds.has(w.id),
    ),
    ...newSpendLimitPrefs,
  ]
  return {
    lowestOrder,
    allWidgetPrefs,
    spendLimitPrefs: allWidgetPrefs.filter((w) => w.id.startsWith('spend_limit:')),
    activeWidgets: allWidgetPrefs.filter((w) => w.enabled).sort((a, b) => a.order - b.order),
  }
}

/** Opgeslagen prefs met één catalogus-widget, zodat `saved` niet-leeg is. */
function savedWith(...dynamic: WidgetPref[]): WidgetPrefs {
  return {
    widgets: [{ id: 'netto_vermogen', enabled: true, size: 'quarter', order: 0 }, ...dynamic],
  }
}

// ── 1. isActive-gate ────────────────────────────────────────────────────────

describe('injectie — isActive-gate', () => {
  it('injecteert alleen ACTIEVE potten', async () => {
    const widgets = await widgetsFor([
      limitRow({ id: 'aaa', is_active: true }),
      limitRow({ id: 'bbb', is_active: false }),
    ])
    // De gepauzeerde pot komt wél uit de loader (de pref mag niet wissen)…
    expect(widgets.map((w) => [w.id, w.isActive])).toEqual([
      ['aaa', true],
      ['bbb', false],
    ])

    // …maar krijgt géén nieuwe widget.
    const { spendLimitPrefs } = injecteer(savedWith(), widgets)
    expect(spendLimitPrefs.map((p) => p.id)).toEqual(['spend_limit:aaa'])
  })

  it('bewaart de OPGESLAGEN pref van een gepauzeerde pot (AC-B2-02)', async () => {
    const widgets = await widgetsFor([limitRow({ id: 'bbb', is_active: false })])
    const saved = savedWith({ id: 'spend_limit:bbb', enabled: true, size: 'half', order: -42 })

    const { spendLimitPrefs } = injecteer(saved, widgets)
    expect(spendLimitPrefs).toEqual([
      { id: 'spend_limit:bbb', enabled: true, size: 'half', order: -42 },
    ])
  })

  it('laat een bewuste "widget uit"-keuze een pauze/hervat-cyclus overleven', async () => {
    const saved = savedWith({ id: 'spend_limit:aaa', enabled: false, size: 'quarter', order: -301 })

    // Gepauzeerd: geen injectie (isActive false) én de pref blijft staan.
    const gepauzeerd = injecteer(saved, await widgetsFor([limitRow({ id: 'aaa', is_active: false })]))
    expect(gepauzeerd.spendLimitPrefs).toEqual([
      { id: 'spend_limit:aaa', enabled: false, size: 'quarter', order: -301 },
    ])

    // Hervat: nog steeds geen injectie — de pref bestáát al, dus `enabled: false`
    // wordt niet stilletjes overschreven.
    const hervat = injecteer(saved, await widgetsFor([limitRow({ id: 'aaa', is_active: true })]))
    expect(hervat.spendLimitPrefs).toEqual([
      { id: 'spend_limit:aaa', enabled: false, size: 'quarter', order: -301 },
    ])
    expect(hervat.activeWidgets.some((w) => w.id === 'spend_limit:aaa')).toBe(false)
  })
})

// ── 2. order-offset −300 ────────────────────────────────────────────────────

describe('injectie — order-offset −300', () => {
  // De defaults staan als constante vastgepind omdat de widget-schakelaar
  // (PATCH /api/spend-limits/[id]/widget) er een teruggezette tegel mee schrijft:
  // schuift de injectie op, dan moet de schakelaar meeschuiven — niet driften.
  it('pint de gedeelde defaults vast (maat + offset)', () => {
    expect(SPEND_LIMIT_WIDGET_ORDER_OFFSET).toBe(-300)
    expect(SPEND_LIMIT_WIDGET_SIZE).toBe('quarter')
  })

  it('geeft elke nieuwe pot lowestOrder − 300 + volgorde-index', async () => {
    const widgets = await widgetsFor([
      limitRow({ id: 'aaa' }),
      limitRow({ id: 'bbb' }),
      limitRow({ id: 'ccc' }),
    ])
    const { lowestOrder, spendLimitPrefs } = injecteer(savedWith(), widgets)

    expect(lowestOrder).toBe(0)
    expect(spendLimitPrefs).toEqual([
      { id: 'spend_limit:aaa', enabled: true, size: 'quarter', order: -300 },
      { id: 'spend_limit:bbb', enabled: true, size: 'quarter', order: -299 },
      { id: 'spend_limit:ccc', enabled: true, size: 'quarter', order: -298 },
    ])
  })

  it('landt bóven de favoriete budgetten (−100) en holdings (−200)', async () => {
    // Dát is wat de offset betekent; het getal zelf is verder betekenisloos.
    const widgets = await widgetsFor([limitRow({ id: 'aaa' })])
    const saved = savedWith(
      { id: 'budget_fav:b1', enabled: true, size: 'quarter', order: -100 },
      { id: 'holding_fav:h1', enabled: true, size: 'quarter', order: -200 },
    )
    const { activeWidgets } = injecteer(saved, widgets)

    expect(activeWidgets.map((w) => w.id).slice(0, 3)).toEqual([
      'spend_limit:aaa',
      'holding_fav:h1',
      'budget_fav:b1',
    ])
  })

  it('schuift mee met een al lager staande widget (lowestOrder is relatief)', async () => {
    const widgets = await widgetsFor([limitRow({ id: 'aaa' })])
    const saved = savedWith({ id: 'budget_fav:b1', enabled: true, size: 'quarter', order: -500 })
    const { lowestOrder, spendLimitPrefs, activeWidgets } = injecteer(saved, widgets)

    expect(lowestOrder).toBe(-500)
    expect(spendLimitPrefs[0].order).toBe(-800)
    expect(activeWidgets[0].id).toBe('spend_limit:aaa')
  })
})

// ── 3. stale-drop op archief ────────────────────────────────────────────────

describe('injectie — stale-drop', () => {
  it('gooit de opgeslagen pref weg zodra de pot GEARCHIVEERD is (AC-B2-03)', async () => {
    // De loader filtert `is_archived: true` weg, dus de pot ontbreekt in
    // `currentSpendLimitIds` en de pref valt uit de lijst.
    const widgets = await widgetsFor([limitRow({ id: 'aaa', is_archived: true })])
    expect(widgets).toEqual([])

    const saved = savedWith({ id: 'spend_limit:aaa', enabled: true, size: 'quarter', order: -300 })
    const { spendLimitPrefs, allWidgetPrefs } = injecteer(saved, widgets)

    expect(spendLimitPrefs).toEqual([])
    // En uitsluitend die pref: een gewone catalogus-widget blijft ongemoeid.
    expect(allWidgetPrefs.some((w) => w.id === 'netto_vermogen')).toBe(true)
  })

  it('raakt prefs van ANDERE potten niet aan bij het opruimen van één', async () => {
    const widgets = await widgetsFor([
      limitRow({ id: 'aaa' }),
      limitRow({ id: 'weg', is_archived: true }),
    ])
    const saved = savedWith(
      { id: 'spend_limit:aaa', enabled: true, size: 'half', order: -310 },
      { id: 'spend_limit:weg', enabled: true, size: 'quarter', order: -300 },
    )
    const { spendLimitPrefs } = injecteer(saved, widgets)

    expect(spendLimitPrefs).toEqual([
      { id: 'spend_limit:aaa', enabled: true, size: 'half', order: -310 },
    ])
  })

  it('injecteert niets bij nul potten en laat de catalogus met rust', async () => {
    const { spendLimitPrefs, allWidgetPrefs } = injecteer(savedWith(), await widgetsFor([]))
    expect(spendLimitPrefs).toEqual([])
    expect(allWidgetPrefs.filter((w) => w.id.startsWith('spend_limit:'))).toEqual([])
    expect(allWidgetPrefs.length).toBeGreaterThan(0)
  })
})
