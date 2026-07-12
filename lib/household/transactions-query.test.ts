/**
 * Regressietest voor de kaart "Transacties zuinig én volledig ophalen".
 *
 * Bewaakt twee fixes op het drukste transactie-pad:
 *
 *  1) lib/household/perspective-loader.ts — de paginatie-loop haalt een
 *     EXPLICIETE kolomlijst op i.p.v. select('*'). Regressie-tripwire tegen
 *     opnieuw sluipend select('*') of het laten vallen van een van de 13 velden
 *     die de consumers + stamp() nodig hebben, én tegen het opnieuw meenemen van
 *     een kolom die NIET op `transactions` bestaat (zoals partner_split_pct —
 *     die staat alleen op `debts`; meenemen gaf een PostgREST 400 → stille lege
 *     lijst, kaart "Transacties niet zichtbaar"). Tevens een gedrags-check dat de
 *     loop bij >1000 rijen ALLE pagina's ophaalt (deterministisch, niet stil
 *     afgekapt op de PostgREST-cap van 1000).
 *
 *  2) lib/household-projection.ts — de transactie-query in
 *     buildHouseholdProjectionInput heeft een 13-maands-datumvenster +
 *     dezelfde paginatie-loop. Omdat een echte >1000-tx-seed zónder DB te zwaar
 *     is, dekken we de identieke loop-logica gedragsmatig via de
 *     perspective-loader (zelfde patroon) en borgen we de query-vorm van
 *     household-projection via een broncontrole (kolomlijst + `.gte('date', …)`
 *     + `page.length < 1000`-afbreekconditie).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadPerspectiveTransactions,
  type PerspectiveContext,
} from './perspective-loader'

// De exacte 13-velden-lijst die het perspective-loader-pad MOET ophalen.
// BELANGRIJK: partner_split_pct staat hier bewust NIET in — die kolom bestaat
// alleen op `debts`, niet op `transactions`. Zie SCHEMA_TRANSACTION_COLUMNS
// hieronder: de contract-check borgt dat elke gevraagde kolom echt bestaat.
const EXPECTED_PERSPECTIVE_COLUMNS =
  'id, date, amount, description, counterparty_name, counterparty_iban, budget_id, account_id, is_income, transaction_type, ownership, user_id, is_split'

// De echte kolommen van public.transactions (geverifieerd via
// information_schema.columns op de live Supabase-DB, 2026-07-11). Dient als
// schema-contract zodat een toekomstige refactor van de select-lijst niet
// opnieuw een non-existente kolom kan opvragen (→ PostgREST 400 → stille lege
// lijst). Houd deze lijst gelijk aan het migratie-schema van `transactions`.
const SCHEMA_TRANSACTION_COLUMNS = new Set([
  'id', 'user_id', 'account_id', 'budget_id', 'date', 'amount', 'currency',
  'description', 'counterparty_name', 'counterparty_iban', 'category_source',
  'is_income', 'import_hash', 'reference', 'transaction_type', 'notes',
  'created_at', 'updated_at', 'ownership', 'household_id', 'is_split',
  'linked_transfer_id', 'running_balance', 'creditor_id', 'fx_amount',
  'fx_currency', 'fx_rate', 'bank_code', 'bank_seq',
])

// Minimale solo-context zodat loadPerspectiveTransactions het 'personal'-pad
// neemt (alleen de transactie-paginatie-loop draait, geen partner-RPC).
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

/**
 * Chainable mock-Supabase die de aan `.select()` doorgegeven kolomlijst
 * registreert en `range(from, to)`-paginatie serveert uit een vaste rijenset.
 */
function makeTxMock(totalRows: number) {
  const captured: { columns?: string } = {}
  const allRows = Array.from({ length: totalRows }, (_, i) => ({
    id: `tx-${i}`,
    date: '2026-01-01',
    amount: i % 2 === 0 ? 100 : -50,
    ownership: 'personal',
    user_id: 'u1',
    partner_split_pct: null,
    is_split: false,
  }))
  const builder = {
    _from: 0,
    _to: 999,
    select(cols: string) {
      captured.columns = cols
      return this
    },
    order() {
      return this
    },
    gte() {
      return this
    },
    lte() {
      return this
    },
    range(from: number, to: number) {
      this._from = from
      this._to = to
      return this
    },
    then(resolve: (v: { data: unknown[]; error: null }) => void) {
      resolve({ data: allRows.slice(this._from, this._to + 1), error: null })
    },
  }
  const supabase = {
    from() {
      return builder
    },
  } as unknown as SupabaseClient
  return { supabase, captured }
}

describe('perspective-loader transactie-query', () => {
  it('haalt de exacte 13-velden-kolomlijst op (geen select("*"))', async () => {
    const { supabase, captured } = makeTxMock(3)
    await loadPerspectiveTransactions(supabase, 'personal', undefined, soloContext)
    expect(captured.columns).toBe(EXPECTED_PERSPECTIVE_COLUMNS)
    expect(captured.columns).not.toContain('*')
  })

  it('vraagt alleen kolommen op die echt op `transactions` bestaan (schema-contract)', async () => {
    const { supabase, captured } = makeTxMock(1)
    await loadPerspectiveTransactions(supabase, 'personal', undefined, soloContext)
    const requested = (captured.columns ?? '').split(',').map((c) => c.trim())
    const unknown = requested.filter((c) => !SCHEMA_TRANSACTION_COLUMNS.has(c))
    // Vangt de regressie 95bafeb53 (partner_split_pct bestaat alleen op debts):
    // een non-existente kolom gaf een PostgREST 400 → stille lege lijst.
    expect(unknown).toEqual([])
  })

  it('pagineert volledig door bij >1000 rijen (geen stille afkap)', async () => {
    const total = 2500 // 3 pagina's: 1000 + 1000 + 500
    const { supabase } = makeTxMock(total)
    const res = await loadPerspectiveTransactions(supabase, 'personal', undefined, soloContext)
    expect(res.transactions).toHaveLength(total)
    // Determinisme: eerste en laatste rij van de volledige set zijn aanwezig.
    expect(res.transactions[0].id).toBe('tx-0')
    expect(res.transactions[total - 1].id).toBe(`tx-${total - 1}`)
  })
})

describe('household-projection transactie-query (broncontrole)', () => {
  // Whitespace genormaliseerd zodat de assertions ongevoelig zijn voor
  // CRLF/LF en indentatie.
  const src = readFileSync(
    path.resolve(__dirname, '..', 'household-projection.ts'),
    'utf-8',
  ).replace(/\s+/g, ' ')

  it('gebruikt de minimale kolomlijst amount/user_id/date (geen select("*"))', () => {
    expect(src).toContain("from('transactions') .select('amount, user_id, date')")
  })

  it('begrenst de query met een datumvenster (.gte(date, …))', () => {
    expect(src).toContain('localMonthStartMonthsAgo(new Date(), 12)')
    expect(src).toContain(".gte('date', txWindowStart)")
  })

  it('pagineert met dezelfde afbreekconditie (page.length < 1000)', () => {
    expect(src).toContain('page.length < 1000')
  })
})
