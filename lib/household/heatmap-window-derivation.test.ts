/**
 * De uitgaven-heatmap op /overzicht/budget/transacties werd tot nu toe apart
 * gedownload, terwijl het periode-venster van diezelfde pagina hem vrijwel
 * altijd al omvat. De tweede download is weg; de heatmap wordt uit de gedeelde
 * ruwe set gesneden met `windowPerspectiveItems` — exact de vensterregel die de
 * loader zelf op zijn resultaat toepast.
 *
 * Deze suite bewijst dat die afleiding IDENTIEK buckets aan een eigen fetch, op
 * de bucket-functies (`spendByDay` / `buildHeatmapWeeks`) en niet op de
 * rendering. De fixture is bewust zó gekozen dat een afleiding ZONDER venster
 * (of met een off-by-one op een rand) meteen andere buckets geeft:
 *   • rijen die wél in het ruime venster vallen maar vóór/na het heatmap-venster
 *     liggen (die mogen niet meetellen),
 *   • rijen exact óp `start` en `end` (die moeten juist wél meetellen),
 *   • meer dan 1000 rijen, zodat de paginatie-loop van de loader echt draait,
 *   • een partner-set uit de niet-datum-begrensde RPC, inclusief een
 *     privacy-'totalen'-aggregaatrij en een rij zonder datum.
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadPerspectiveTransactions,
  windowPerspectiveItems,
  type PerspectiveContext,
  type PerspectiveItem,
} from './perspective-loader'
import {
  resolvePeriodWindow,
  resolveHeatmapWindow,
  resolveFetchWindow,
  spendByDay,
  buildHeatmapWeeks,
  type AnalysisTransaction,
} from '../transaction-insights'

// Peildatum = 15 juni 2026 → heatmap 2025-06-01 t/m 2026-05-31.
// De periode is bewust '30d' (2026-05-17 t/m 2026-06-15): het ophaal-venster
// steekt dan aan BEIDE kanten buiten de heatmap uit (2025-05-17 … 2026-06-15),
// zodat er echt rijen zijn die de afleiding moet wegsnijden.
const NOW = new Date(2026, 5, 15)
const HEATMAP = resolveHeatmapWindow(NOW)
const FETCH = resolveFetchWindow(resolvePeriodWindow('30d', 0, NOW))

type Row = Record<string, unknown> & { id: string; date?: string }

const soloContext: PerspectiveContext = {
  userId: 'u1',
  hasHousehold: false,
  householdId: null,
  partnerId: null,
  partnerName: null,
  splitMode: 'equal',
  customSplitPct: null,
  primaryPayerId: null,
  mySharePct: 100,
  partnerPrivacy: null,
  budgetModel: 'separate',
}

const householdContext: PerspectiveContext = {
  ...soloContext,
  hasHousehold: true,
  householdId: 'h1',
  partnerId: 'u2',
  partnerName: 'Partner',
  mySharePct: 60,
}

/**
 * Chainable mock-Supabase die `gte`/`lte`/`range` écht toepast op een vaste
 * rijenset, gesorteerd op datum aflopend (zoals de loader bestelt). Zonder een
 * echt filterende mock zou "smal" en "ruim" dezelfde rijen opleveren en zou de
 * test niets bewijzen.
 */
function makeClient(rows: Row[], partnerRows: Row[] = []) {
  const windows: Array<{ since?: string; until?: string }> = []
  const supabase = {
    from() {
      const state: { since?: string; until?: string; from: number; to: number } = {
        from: 0,
        to: 999,
      }
      const builder = {
        select: () => builder,
        order: () => builder,
        gte: (_col: string, value: string) => {
          state.since = value
          return builder
        },
        lte: (_col: string, value: string) => {
          state.until = value
          return builder
        },
        range: (from: number, to: number) => {
          state.from = from
          state.to = to
          return builder
        },
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
          if (state.from === 0) windows.push({ since: state.since, until: state.until })
          const matching = rows
            .filter((r) => {
              const date = r.date as string
              if (state.since && date < state.since) return false
              if (state.until && date > state.until) return false
              return true
            })
            .sort((a, b) =>
              a.date === b.date
                ? a.id.localeCompare(b.id)
                : (b.date as string).localeCompare(a.date as string),
            )
          resolve({ data: matching.slice(state.from, state.to + 1), error: null })
        },
      }
      return builder
    },
    rpc: (_name: string, args: { p_category: string }) =>
      Promise.resolve({
        data: args.p_category === 'transactions' ? partnerRows : [{ monthly_income: 2500 }],
        error: null,
      }),
  } as unknown as SupabaseClient
  return { supabase, windows }
}

/**
 * Eén mapper voor BEIDE paden — zou elk pad zijn eigen mapping krijgen, dan
 * bewees de vergelijking niets meer.
 */
function toAnalysis(items: PerspectiveItem[]): AnalysisTransaction[] {
  return items
    .filter((t) => !t._aggregated)
    .map((t) => ({
      id: String(t.id),
      date: String(t.date ?? ''),
      amount: Number(t.amount) * t._myShareFraction,
      description: '',
      counterparty_name: null,
      counterparty_iban: null,
      budget_id: null,
      category: null,
      account_id: null,
      account_name: null,
      is_income: Boolean(t.is_income),
      transaction_type: (t.transaction_type as string | null) ?? null,
      bank_code: null,
      running_balance: null,
      creditor_id: null,
      fx_amount: null,
      fx_currency: null,
      fx_rate: null,
    }))
}

/** De randgevallen die een venster-fout meteen zichtbaar maken. */
const EDGE_ROWS: Row[] = [
  // Binnen het ruime venster, vóór de heatmap-start → mag NIET meetellen.
  { id: 'voor-1', date: '2025-05-20', amount: -111, ownership: 'personal', user_id: 'u1' },
  // Exact op de heatmap-start → moet WEL meetellen.
  { id: 'rand-start', date: HEATMAP.start, amount: -222, ownership: 'personal', user_id: 'u1' },
  // Exact op het heatmap-einde → moet WEL meetellen.
  { id: 'rand-eind', date: HEATMAP.end, amount: -333, ownership: 'personal', user_id: 'u1' },
  // Ná het heatmap-einde, binnen de gekozen periode → mag NIET meetellen.
  { id: 'na-1', date: '2026-06-10', amount: -444, ownership: 'personal', user_id: 'u1' },
]

/** Volume-rijen (>1000) zodat de paginatie-loop van de loader echt draait. */
function bulkRows(count: number): Row[] {
  const out: Row[] = []
  for (let i = 0; i < count; i++) {
    // Verdeeld over 2025-07 t/m 2026-05, alle binnen beide vensters.
    const month = 7 + (i % 11)
    const year = month > 12 ? 2026 : 2025
    const mm = String(month > 12 ? month - 12 : month).padStart(2, '0')
    const dd = String((i % 28) + 1).padStart(2, '0')
    out.push({
      id: `bulk-${String(i).padStart(4, '0')}`,
      date: `${year}-${mm}-${dd}`,
      amount: i % 7 === 0 ? 90 : -(10 + (i % 23)),
      transaction_type: i % 13 === 0 ? 'transfer' : null,
      is_income: i % 7 === 0,
      ownership: 'personal',
      user_id: 'u1',
    })
  }
  return out
}

async function fetchBoth(rows: Row[], partnerRows: Row[], context: PerspectiveContext) {
  const perspective = context.hasHousehold ? 'household' : 'personal'
  const { supabase, windows } = makeClient(rows, partnerRows)
  const wide = await loadPerspectiveTransactions(supabase, perspective, FETCH, context)
  const narrow = await loadPerspectiveTransactions(
    supabase,
    perspective,
    { since: HEATMAP.start, until: HEATMAP.end },
    context,
  )
  const derived = windowPerspectiveItems(wide.transactions, {
    since: HEATMAP.start,
    until: HEATMAP.end,
  })
  return { derived, dedicated: narrow.transactions, wide: wide.transactions, windows }
}

describe('heatmap uit de gedeelde set vs. een eigen fetch', () => {
  it('levert exact dezelfde rijen, in dezelfde volgorde (solo)', async () => {
    const { derived, dedicated } = await fetchBoth([...EDGE_ROWS, ...bulkRows(1200)], [], soloContext)
    expect(derived.map((r) => r.id)).toEqual(dedicated.map((r) => r.id))
  })

  it('buckets identiek per dag én in het week-rooster (solo)', async () => {
    const { derived, dedicated } = await fetchBoth([...EDGE_ROWS, ...bulkRows(1200)], [], soloContext)
    const dailyDerived = spendByDay(toAnalysis(derived))
    const dailyDedicated = spendByDay(toAnalysis(dedicated))
    expect(dailyDerived).toEqual(dailyDedicated)
    expect(buildHeatmapWeeks(HEATMAP.start, HEATMAP.end, dailyDerived)).toEqual(
      buildHeatmapWeeks(HEATMAP.start, HEATMAP.end, dailyDedicated),
    )
  })

  it('houdt de randdagen binnen en de buren buiten (de fixture kan het verschil zien)', async () => {
    const { derived, wide } = await fetchBoth(EDGE_ROWS, [], soloContext)
    const daily = spendByDay(toAnalysis(derived))
    expect(daily.get(HEATMAP.start)).toBe(222)
    expect(daily.get(HEATMAP.end)).toBe(333)
    expect(daily.has('2025-05-20')).toBe(false)
    expect(daily.has('2026-06-10')).toBe(false)
    // Tegenproef: zonder de vensterregel zouden de buren wél meetellen — de
    // ruwe set draagt ze immers.
    const ongefilterd = spendByDay(toAnalysis(wide))
    expect(ongefilterd.has('2025-05-20')).toBe(true)
    expect(ongefilterd.has('2026-06-10')).toBe(true)
  })

  it('behandelt partnerrijen, aggregaten en datumloze rijen gelijk (huishouden)', async () => {
    const partnerRows: Row[] = [
      { id: 'p-binnen', date: '2026-03-03', amount: -75, user_id: 'u2' },
      { id: 'p-voor', date: '2025-05-02', amount: -60, user_id: 'u2' },
      { id: 'p-na', date: '2026-06-09', amount: -80, user_id: 'u2' },
      { id: 'p-totaal', _aggregated: true, total_expense: 900, user_id: 'u2' },
      { id: 'p-datumloos', amount: -5, user_id: 'u2' },
    ]
    const { derived, dedicated } = await fetchBoth(EDGE_ROWS, partnerRows, householdContext)
    expect(derived.map((r) => r.id)).toEqual(dedicated.map((r) => r.id))
    // De twee uitzonderingen van de vensterregel horen aan BEIDE kanten te
    // overleven, niet stil weg te vallen.
    expect(derived.map((r) => r.id)).toContain('p-totaal')
    expect(derived.map((r) => r.id)).toContain('p-datumloos')
    // …en de datum-dragende partnerrijen buiten het venster niet.
    expect(derived.map((r) => r.id)).not.toContain('p-voor')
    expect(derived.map((r) => r.id)).not.toContain('p-na')

    const daily = spendByDay(toAnalysis(derived))
    expect(daily).toEqual(spendByDay(toAnalysis(dedicated)))
    expect(daily.get('2026-03-03')).toBe(75)
  })

  it('het ruime venster omvat het smalle — anders zou afleiden nooit mogen', async () => {
    const { windows } = await fetchBoth(EDGE_ROWS, [], soloContext)
    expect(windows[0]).toEqual({ since: FETCH.since, until: FETCH.until })
    expect(windows[1]).toEqual({ since: HEATMAP.start, until: HEATMAP.end })
    expect(FETCH.since <= HEATMAP.start).toBe(true)
    expect(FETCH.until >= HEATMAP.end).toBe(true)
  })
})
