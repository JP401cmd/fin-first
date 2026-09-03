/**
 * Partner-samenwerking fase 1 — "Te bespreken" (ADR 0128).
 *
 * Drie lagen in één suite:
 *  1) de pure samenvoeging (`composeFlagItems`): melder-label, eigen-vlag,
 *     en het overslaan van een vlag zonder zichtbare boeking;
 *  2) de loader (`loadTransactionFlags`): solo → null, expliciete kolomlijsten
 *     (geen `select('*')` op `transactions`), huishoud-scoping en de teller;
 *  3) het MIGRATIE-CONTRACT (broncontrole op de SQL): de eigenschappen die de
 *     vlag géén zijkanaal maken. Die kunnen niet in vitest tegen een echte DB,
 *     maar de vorm van de policies wél — en precies die vorm is het besluit.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PerspectiveContext } from './perspective-loader'
import {
  FLAGGED_TRANSACTION_COLUMNS,
  TRANSACTION_FLAG_COLUMNS,
  composeFlagItems,
  flaggedByLabel,
  loadTransactionFlags,
  type FlaggedTransaction,
  type TransactionFlagRow,
} from './transaction-flags'

const householdCtx: PerspectiveContext = {
  userId: 'u-me',
  hasHousehold: true,
  householdId: 'hh-1',
  partnerId: 'u-partner',
  partnerName: 'Sam',
  splitMode: 'equal',
  customSplitPct: null,
  primaryPayerId: null,
  mySharePct: 50,
  partnerPrivacy: null,
  budgetModel: 'separate',
}

const soloCtx: PerspectiveContext = {
  ...householdCtx,
  hasHousehold: false,
  householdId: null,
  partnerId: null,
  partnerName: null,
  mySharePct: 100,
}

function flag(over: Partial<TransactionFlagRow> = {}): TransactionFlagRow {
  return {
    id: 'f-1',
    transaction_id: 'tx-1',
    household_id: 'hh-1',
    flagged_by: 'u-me',
    status: 'open',
    note: null,
    resolved_by: null,
    resolved_at: null,
    created_at: '2026-09-03T10:00:00Z',
    ...over,
  }
}

const tx1: FlaggedTransaction = {
  id: 'tx-1',
  date: '2026-09-01',
  amount: -42.5,
  description: 'Albert Heijn',
  counterparty_name: 'AH',
  account_id: 'acc-1',
}

describe('composeFlagItems', () => {
  it('labelt de melder als "jij" of als de partnernaam', () => {
    expect(flaggedByLabel('u-me', householdCtx)).toBe('jij')
    expect(flaggedByLabel('u-partner', householdCtx)).toBe('Sam')
    expect(flaggedByLabel('u-partner', { ...householdCtx, partnerName: null })).toBe('je partner')
  })

  it('stempelt flaggedByMe en koppelt de boeking', () => {
    const items = composeFlagItems(
      [flag(), flag({ id: 'f-2', transaction_id: 'tx-2', flagged_by: 'u-partner', note: 'vakantie?' })],
      new Map([
        ['tx-1', tx1],
        ['tx-2', { ...tx1, id: 'tx-2' }],
      ]),
      householdCtx,
    )
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ id: 'f-1', flaggedByMe: true, flaggedByLabel: 'jij', transaction: tx1 })
    expect(items[1]).toMatchObject({ id: 'f-2', flaggedByMe: false, flaggedByLabel: 'Sam', note: 'vakantie?' })
  })

  it('laat een vlag zonder zichtbare boeking weg (nooit een vlag zonder boeking tonen)', () => {
    const items = composeFlagItems([flag(), flag({ id: 'f-x', transaction_id: 'tx-hidden' })], new Map([['tx-1', tx1]]), householdCtx)
    expect(items.map((i) => i.id)).toEqual(['f-1'])
  })
})

/** Chainbare mock: registreert per tabel de select-kolommen + filters. */
function makeMock(rows: { flags: unknown[]; transactions: unknown[]; flagError?: { message: string } }) {
  const captured: Record<string, { columns?: string; eq: Array<[string, unknown]>; inIds?: unknown; limit?: number }> = {}
  const supabase = {
    from(table: string) {
      const c = (captured[table] ??= { eq: [] })
      const b = {
        select(cols: string) {
          c.columns = cols
          return b
        },
        eq(col: string, val: unknown) {
          c.eq.push([col, val])
          return b
        },
        in(_col: string, ids: unknown) {
          c.inIds = ids
          return b
        },
        order() {
          return b
        },
        limit(n: number) {
          c.limit = n
          return b
        },
        then(resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => void) {
          if (table === 'transaction_flags' && rows.flagError) {
            resolve({ data: null, error: rows.flagError })
            return
          }
          resolve({ data: table === 'transaction_flags' ? rows.flags : rows.transactions, error: null })
        },
      }
      return b
    },
  } as unknown as SupabaseClient
  return { supabase, captured }
}

describe('loadTransactionFlags', () => {
  it('geeft null voor een solo-gebruiker en raakt de database niet', async () => {
    const { supabase, captured } = makeMock({ flags: [], transactions: [] })
    expect(await loadTransactionFlags(supabase, soloCtx)).toBeNull()
    expect(Object.keys(captured)).toEqual([])
  })

  it('scope\'t op het huishouden, vraagt expliciete kolommen op en telt afgerond apart', async () => {
    const { supabase, captured } = makeMock({
      flags: [flag(), flag({ id: 'f-2', transaction_id: 'tx-2', status: 'resolved', resolved_at: 'x' })],
      transactions: [tx1],
    })
    const data = await loadTransactionFlags(supabase, householdCtx)
    expect(data).not.toBeNull()
    expect(data!.open.map((i) => i.id)).toEqual(['f-1'])
    expect(data!.resolvedCount).toBe(1)
    expect(data!.partnerName).toBe('Sam')

    expect(captured.transaction_flags.columns).toBe(TRANSACTION_FLAG_COLUMNS)
    expect(captured.transaction_flags.eq).toEqual([['household_id', 'hh-1']])
    expect(captured.transaction_flags.limit).toBeGreaterThan(0)

    // Alleen de OPEN vlaggen worden verrijkt, met een expliciete kolomlijst.
    expect(captured.transactions.columns).toBe(FLAGGED_TRANSACTION_COLUMNS)
    expect(captured.transactions.columns).not.toContain('*')
    expect(captured.transactions.inIds).toEqual(['tx-1'])
  })

  it('degradeert naar null bij een DB-fout (bv. tabel nog niet gemigreerd) in plaats van de pagina te breken', async () => {
    const { supabase, captured } = makeMock({
      flags: [],
      transactions: [],
      flagError: { message: 'relation "public.transaction_flags" does not exist' },
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(loadTransactionFlags(supabase, householdCtx)).resolves.toBeNull()
    expect(spy).toHaveBeenCalledOnce()
    expect(captured.transactions).toBeUndefined()
    spy.mockRestore()
  })

  it('slaat de boekingen-query over als er niets open staat', async () => {
    const { supabase, captured } = makeMock({
      flags: [flag({ status: 'resolved', resolved_at: 'x' })],
      transactions: [],
    })
    const data = await loadTransactionFlags(supabase, householdCtx)
    expect(data).toEqual({ partnerName: 'Sam', open: [], resolvedCount: 1 })
    expect(captured.transactions).toBeUndefined()
  })
})

describe('migratie-contract 20260903120000_transaction_flags (broncontrole)', () => {
  const src = readFileSync(
    path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260903120000_transaction_flags.sql'),
    'utf-8',
  )
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()

  it('zet RLS aan en richt elke policy op `authenticated` (anon → 0 rijen, geen fout)', () => {
    expect(src).toContain('alter table public.transaction_flags enable row level security')
    const policies = src.match(/create policy "[^"]+" on public\.transaction_flags for (select|insert|update|delete) to (\w+)/g) ?? []
    expect(policies).toHaveLength(4)
    for (const p of policies) expect(p.endsWith('to authenticated')).toBe(true)
  })

  it('erft zichtbaarheid van transactions: SELECT én UPDATE via de invoker-helper + eigen huishouden', () => {
    const select = src.match(/for select to authenticated using \((.*?)\);/)?.[1] ?? ''
    expect(select).toContain('household_id = (select public.user_household_id())')
    expect(select).toContain('public.transaction_flag_transaction_visible(transaction_id)')

    const update = src.match(/for update to authenticated using \((.*?)\) with check \((.*?)\);/)
    expect(update).not.toBeNull()
    for (const part of [update![1], update![2]]) {
      expect(part).toContain('household_id = (select public.user_household_id())')
      expect(part).toContain('public.transaction_flag_transaction_visible(transaction_id)')
    }
  })

  it('INSERT: alleen jezelf, eigen huishouden, en alleen een gedeelde boeking op een full-rekening (K4)', () => {
    const insert = src.match(/for insert to authenticated with check \((.*?)\);/)?.[1] ?? ''
    expect(insert).toContain('flagged_by = (select auth.uid())')
    expect(insert).toContain('household_id = (select public.user_household_id())')
    expect(insert).toContain('public.transaction_flaggable(transaction_id, household_id)')

    const flaggable = src.match(/function public\.transaction_flaggable\(.*?\$\$(.*?)\$\$/)?.[1] ?? ''
    expect(flaggable).toContain("t.ownership = 'shared'")
    expect(flaggable).toContain('t.household_id = p_household_id')
    expect(flaggable).toContain("ba.partner_visibility = 'full'")
  })

  it('de helpers zijn SECURITY INVOKER — nergens een DEFINER die de RLS van transactions zou omzeilen', () => {
    // Op de functie-DEFINITIE (language … stable security …), niet op de
    // COMMENT ON-strings die het woord ook noemen.
    expect(src).not.toMatch(/language \w+ stable security definer/)
    const invokers = src.match(/language sql stable security invoker set search_path = ''/g) ?? []
    expect(invokers.length).toBe(2)
    for (const fn of ['transaction_flag_transaction_visible(uuid)', 'transaction_flaggable(uuid, uuid)']) {
      expect(src).toContain(`revoke all on function public.${fn} from anon`)
      expect(src).toContain(`grant execute on function public.${fn} to authenticated`)
    }
  })

  it('DELETE is eigen-rij (alleen de melder trekt in), één vlag per boeking, sleutels bewaakt door een trigger', () => {
    expect(src).toContain('for delete to authenticated using (flagged_by = (select auth.uid()))')
    expect(src).toContain('unique (transaction_id)')
    expect(src).toContain('before insert or update on public.transaction_flags')
    expect(src).toContain("errcode = '42501'")
  })

  it('de notitie mag alleen de melder zelf wijzigen (attributie: hij staat onder zijn naam)', () => {
    const guard = src.match(/function public\.transaction_flags_guard\(\).*?\$\$(.*?)\$\$/)?.[1] ?? ''
    expect(guard).toContain('new.note is distinct from old.note and old.flagged_by <> auth.uid()')
    // id en created_at horen bij de onveranderlijke sleutels (sortering "nieuwste eerst").
    expect(guard).toContain('new.id is distinct from old.id')
    expect(guard).toContain('new.created_at is distinct from old.created_at')
  })
})
