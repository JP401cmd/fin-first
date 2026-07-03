/**
 * Regressietest voor de kaart "Transacties zuinig én volledig ophalen".
 *
 * Bewaakt twee fixes op het drukste transactie-pad:
 *
 *  1) lib/household/perspective-loader.ts — de paginatie-loop haalt een
 *     EXPLICIETE kolomlijst op i.p.v. select('*'). Regressie-tripwire tegen
 *     opnieuw sluipend select('*') of het laten vallen van een van de 14 velden
 *     die de consumers + stamp() nodig hebben. Tevens een gedrags-check dat de
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

// De exacte 14-velden-lijst die het perspective-loader-pad MOET ophalen.
const EXPECTED_PERSPECTIVE_COLUMNS =
  'id, date, amount, description, counterparty_name, counterparty_iban, budget_id, account_id, is_income, transaction_type, ownership, user_id, partner_split_pct, is_split'

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
  it('haalt de exacte 14-velden-kolomlijst op (geen select("*"))', async () => {
    const { supabase, captured } = makeTxMock(3)
    await loadPerspectiveTransactions(supabase, 'personal', undefined, soloContext)
    expect(captured.columns).toBe(EXPECTED_PERSPECTIVE_COLUMNS)
    expect(captured.columns).not.toContain('*')
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
