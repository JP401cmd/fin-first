import { describe, it, expect } from 'vitest'
import {
  ensureOpeningTransaction,
  syncHoldingAggregatesFromTransactions,
  OPENING_TRANSACTION_NOTE,
} from './holdings-sync'

/**
 * WF-BEZIT-15-bug1 — quick-add-positie mag niet verdampen bij de eerste
 * transactie-log.
 *
 * De repro (live vastgesteld op 2 sep): een holding aangemaakt via de quick-add
 * (100 eenheden @ €10) draagt zijn positie als STATISCHE KOLOM op
 * `investment_holdings`, zonder rij in `investment_transactions`. Wie daarna één
 * koop logt (50 @ €14) ziet niet 150 maar **50** eenheden — want
 * `syncHoldingAggregatesFromTransactions` herleidt de positie uitsluitend uit de
 * transactietabel en overschrijft de kolom. Stil dataverlies dat doorwerkt naar
 * netto vermogen en Box 3.
 *
 * Gekozen richting (besluit eigenaar 3-9-2026, optie B): vlak vóór de eerste
 * transactie-log de bestaande statische positie omzetten in een echte
 * openings-`buy`. Dat repareert óók de holdings die vandaag al zonder historie
 * in de database staan, zonder aparte backfill — precies de motivering voor B
 * boven A.
 *
 * Deze suite draait `ensureOpeningTransaction` en daarna de echte
 * `syncHoldingAggregatesFromTransactions` over dezelfde in-memory store, zodat
 * niet alleen de tussenstap maar het EINDGETAL wordt vastgepind — dat is wat de
 * gebruiker zag kapotgaan.
 */

interface Row {
  [key: string]: unknown
}

interface Store {
  holdings: Row[]
  transactions: Row[]
  /** Tabellen waarvan elke select een fout moet teruggeven. */
  failSelectOn: Set<string>
  /** Tabellen waarvan elke insert een fout moet teruggeven. */
  failInsertOn: Set<string>
  /** Kolomlijsten waarmee is geselecteerd, per tabel — voor de crypto-guard. */
  selects: { table: string; columns: string }[]
}

const HOLDINGS_TABLES = new Set(['investment_holdings', 'crypto_holdings'])

/**
 * Minimale Supabase-dubbel: ondersteunt exact de queryvormen die
 * `ensureOpeningTransaction` en `syncHoldingAggregatesFromTransactions`
 * gebruiken (select/eq/order/limit/maybeSingle, insert, update/eq).
 */
function makeSupabase(store: Store) {
  let seq = 0
  const from = (table: string) => {
    const rows = HOLDINGS_TABLES.has(table) ? store.holdings : store.transactions
    const filters: [string, unknown][] = []
    const orderKeys: string[] = []
    let limitN: number | null = null
    let mode: 'select' | 'insert' | 'update' = 'select'
    let payload: Row | null = null

    const matched = () =>
      rows.filter((r) => filters.every(([k, v]) => r[k] === v))

    function run(): { data: Row[] | null; error: { message: string } | null } {
      if (mode === 'insert') {
        if (store.failInsertOn.has(table)) {
          return { data: null, error: { message: 'insert geweigerd' } }
        }
        seq += 1
        // `created_at` loopt op met de insert-volgorde, net als in Postgres —
        // dat is de tiebreaker waarop de sync sorteert bij gelijke datum.
        const row: Row = {
          id: `gen-${seq}`,
          created_at: `2026-09-03T12:00:${String(seq).padStart(2, '0')}Z`,
          ...payload,
        }
        rows.push(row)
        return { data: [row], error: null }
      }
      if (mode === 'update') {
        const hit = matched()
        for (const r of hit) Object.assign(r, payload)
        return { data: hit, error: null }
      }
      if (store.failSelectOn.has(table)) {
        return { data: null, error: { message: 'select geweigerd' } }
      }
      let out = matched()
      if (orderKeys.length > 0) {
        out = [...out].sort((a, b) => {
          for (const k of orderKeys) {
            const cmp = String(a[k] ?? '').localeCompare(String(b[k] ?? ''))
            if (cmp !== 0) return cmp
          }
          return 0
        })
      }
      if (limitN != null) out = out.slice(0, limitN)
      return { data: out, error: null }
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const q: any = {
      select: (columns: string = '*') => {
        store.selects.push({ table, columns })
        return q
      },
      insert: (p: Row) => {
        mode = 'insert'
        payload = p
        return q
      },
      update: (p: Row) => {
        mode = 'update'
        payload = p
        return q
      },
      eq: (k: string, v: unknown) => {
        filters.push([k, v])
        return q
      },
      order: (k: string) => {
        orderKeys.push(k)
        return q
      },
      limit: (n: number) => {
        limitN = n
        return q
      },
      maybeSingle: async () => {
        const r = run()
        return { data: r.data?.[0] ?? null, error: r.error }
      },
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(run()).then(resolve, reject),
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return q
  }
  return { supabase: { from } as never, store }
}

const USER = 'user-1'
const HOLDING = 'holding-1'
const INV = { holdings: 'investment_holdings', transactions: 'investment_transactions' }
const CRY = { holdings: 'crypto_holdings', transactions: 'crypto_transactions' }

function emptyStore(overrides: Partial<Store> = {}): Store {
  return {
    holdings: [],
    transactions: [],
    failSelectOn: new Set(),
    failInsertOn: new Set(),
    selects: [],
    ...overrides,
  }
}

/** De quick-add-holding uit de bugmelding: 100 @ €10, géén transactiehistorie. */
function quickAddStore(extra: Partial<Row> = {}): Store {
  return emptyStore({
    holdings: [
      {
        id: HOLDING,
        user_id: USER,
        units: 100,
        avg_purchase_price: 10,
        purchase_date: '2026-01-10',
        created_at: '2026-01-10T09:00:00Z',
        ...extra,
      },
    ],
  })
}

describe('ensureOpeningTransaction — quick-add-positie redden (WF-BEZIT-15-bug1)', () => {
  it('herstelt de originele repro: 100@10 quick-add + koop 50@14 → 150 eenheden', async () => {
    const store = quickAddStore()
    const { supabase } = makeSupabase(store)

    // 1. Vlak vóór de eerste transactie-log: openingsrij afleiden.
    const opening = await ensureOpeningTransaction(
      supabase,
      INV,
      HOLDING,
      USER,
      '2026-06-01',
    )
    expect(opening.created).toBe(true)
    expect(opening.units).toBe(100)
    expect(opening.pricePerUnit).toBe(10)

    // 2. De transactie die de gebruiker daadwerkelijk logt.
    store.transactions.push({
      id: 'tx-user',
      holding_id: HOLDING,
      user_id: USER,
      type: 'buy',
      units: 50,
      price_per_unit: 14,
      total_amount: 700,
      date: '2026-06-01',
      created_at: '2026-06-01T10:00:00Z',
    })

    // 3. Dezelfde sync die de positie eerder wegvaagde.
    const sync = await syncHoldingAggregatesFromTransactions(
      supabase,
      INV,
      HOLDING,
      USER,
    )

    expect(sync.units).toBe(150)
    // Gewogen gemiddelde kostenbasis: (100×10 + 50×14) / 150 = 11,333…
    expect(sync.avgPurchasePrice).toBeCloseTo(1700 / 150, 6)
    expect(sync.historyIncomplete).toBe(false)
    // En het opgeslagen veld op de holding volgt mee — dat is wat de gebruiker ziet.
    expect(store.holdings[0].units).toBe(150)
  })

  it('markeert de openingsrij herkenbaar als afgeleid, met de aankoopdatum van de holding', async () => {
    const store = quickAddStore()
    const { supabase } = makeSupabase(store)

    await ensureOpeningTransaction(supabase, INV, HOLDING, USER, '2026-06-01')

    expect(store.transactions).toHaveLength(1)
    const row = store.transactions[0]
    expect(row.type).toBe('buy')
    expect(row.units).toBe(100)
    expect(row.price_per_unit).toBe(10)
    expect(row.total_amount).toBe(1000)
    expect(row.date).toBe('2026-01-10')
    expect(row.notes).toBe(OPENING_TRANSACTION_NOTE)
    expect(row.user_id).toBe(USER)
  })

  it('laat een holding MET transactiehistorie volledig ongemoeid', async () => {
    // Tweede regressiecase uit het testplan: bestaand gedrag mag niet wijzigen.
    const store = quickAddStore()
    store.transactions.push({
      id: 'tx-1',
      holding_id: HOLDING,
      user_id: USER,
      type: 'buy',
      units: 30,
      price_per_unit: 12,
      total_amount: 360,
      date: '2026-02-01',
      created_at: '2026-02-01T10:00:00Z',
    })
    const { supabase } = makeSupabase(store)

    const opening = await ensureOpeningTransaction(supabase, INV, HOLDING, USER, '2026-06-01')
    expect(opening.created).toBe(false)
    expect(opening.reason).toBe('has_history')
    expect(store.transactions).toHaveLength(1)
  })

  it('is idempotent: een tweede aanroep maakt geen tweede openingsrij', async () => {
    const store = quickAddStore()
    const { supabase } = makeSupabase(store)

    await ensureOpeningTransaction(supabase, INV, HOLDING, USER, '2026-06-01')
    const second = await ensureOpeningTransaction(supabase, INV, HOLDING, USER, '2026-06-01')

    expect(second.created).toBe(false)
    expect(second.reason).toBe('has_history')
    expect(store.transactions).toHaveLength(1)
  })

  it('klemt de openingsdatum op de nieuwe transactie, zodat een eerste VERKOOP niet vóór zijn aankoop valt', async () => {
    // Zonder klem zou de opening (aankoopdatum 2026-01-10 → hier bewust later
    // gezet) ná de verkoop sorteren; de engine ziet dan eerst een verkoop uit
    // het niets en `syncHoldingAggregates…` klemt de historie op 0 eenheden.
    const store = quickAddStore({ purchase_date: '2026-08-01', created_at: '2026-08-01T09:00:00Z' })
    const { supabase } = makeSupabase(store)

    const opening = await ensureOpeningTransaction(supabase, INV, HOLDING, USER, '2026-06-01')
    expect(opening.date).toBe('2026-06-01')

    store.transactions.push({
      id: 'tx-sell',
      holding_id: HOLDING,
      user_id: USER,
      type: 'sell',
      units: 40,
      price_per_unit: 15,
      total_amount: 600,
      date: '2026-06-01',
      created_at: '2026-06-01T10:00:00Z',
    })

    const sync = await syncHoldingAggregatesFromTransactions(supabase, INV, HOLDING, USER)
    expect(sync.units).toBe(60)
    expect(sync.historyIncomplete).toBe(false)
  })

  it('valt terug op de aanmaakdatum wanneer purchase_date ontbreekt', async () => {
    const store = quickAddStore({ purchase_date: null })
    const { supabase } = makeSupabase(store)

    const opening = await ensureOpeningTransaction(supabase, INV, HOLDING, USER, null)
    expect(opening.date).toBe('2026-01-10')
  })

  it('doet niets bij een holding zonder positieve positie', async () => {
    const store = quickAddStore({ units: 0 })
    const { supabase } = makeSupabase(store)

    const opening = await ensureOpeningTransaction(supabase, INV, HOLDING, USER, '2026-06-01')
    expect(opening.created).toBe(false)
    expect(opening.reason).toBe('no_position')
    expect(store.transactions).toHaveLength(0)
  })

  it('redt de eenheden ook wanneer er geen aankoopprijs bekend is (kostenbasis €0)', async () => {
    const store = quickAddStore({ avg_purchase_price: 0 })
    const { supabase } = makeSupabase(store)

    const opening = await ensureOpeningTransaction(supabase, INV, HOLDING, USER, '2026-06-01')
    expect(opening.created).toBe(true)
    expect(opening.units).toBe(100)
    expect(opening.pricePerUnit).toBe(0)
  })

  it('schrijft NIETS wanneer de bestaande historie niet leesbaar is', async () => {
    // Liever de bekende bug dan een verdubbelde positie: een niet-verifieerbare
    // staat mag nooit tot een tweede openingsrij leiden.
    const store = quickAddStore()
    store.failSelectOn.add('investment_transactions')
    const { supabase } = makeSupabase(store)

    const opening = await ensureOpeningTransaction(supabase, INV, HOLDING, USER, '2026-06-01')
    expect(opening.created).toBe(false)
    expect(opening.reason).toBe('read_failed')
    expect(store.transactions).toHaveLength(0)
  })

  it('meldt insert_failed zonder te gooien wanneer de DB de openingsrij weigert', async () => {
    const store = quickAddStore()
    store.failInsertOn.add('investment_transactions')
    const { supabase } = makeSupabase(store)

    const opening = await ensureOpeningTransaction(supabase, INV, HOLDING, USER, '2026-06-01')
    expect(opening.created).toBe(false)
    expect(opening.reason).toBe('insert_failed')
  })

  it('vraagt op crypto_holdings géén purchase_date op (kolom bestaat daar niet)', async () => {
    // Een select op een niet-bestaande kolom laat de hele query falen; dat zou
    // elke crypto-transactie-log tot `read_failed` degraderen.
    const store = emptyStore({
      holdings: [
        {
          id: HOLDING,
          user_id: USER,
          units: 2,
          avg_purchase_price: 30000,
          created_at: '2026-03-01T09:00:00Z',
        },
      ],
    })
    const { supabase } = makeSupabase(store)

    const opening = await ensureOpeningTransaction(supabase, CRY, HOLDING, USER, '2026-06-01')
    expect(opening.created).toBe(true)
    expect(opening.date).toBe('2026-03-01')

    const holdingSelect = store.selects.find((s) => s.table === 'crypto_holdings')
    expect(holdingSelect?.columns).not.toContain('purchase_date')
  })
})
