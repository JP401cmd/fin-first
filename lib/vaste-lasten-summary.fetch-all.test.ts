/**
 * V-001 (bijvondst) — de abonnementen-routes zagen maar 1000 transacties.
 *
 * `/api/detect-recurring`, `/api/subscriptions/detect-ai` en
 * `/api/subscriptions/analyse-ai` haalden hun 12-maandsvenster op met één kale
 * `.from('transactions')`-query, oplopend op datum. PostgREST kapt elk antwoord af
 * op `max_rows` (1000), dus bij een tx-rijke gebruiker zag de detectie alleen de
 * OUDSTE rijen en vielen juist de recente maanden weg — precies de maanden waarin
 * een nieuw abonnement zichtbaar wordt.
 *
 * Norm: alle drie lopen via dezelfde keyset-ophaal als de vaste-lastenpagina
 * (`fetchAllRecurringTx`), die het venster compleet binnenhaalt. `/api/detect-recurring`
 * kent een optioneel rekeningfilter; dat gaat als `accountId` mee en moet over
 * álle pagina's heen blijven gelden.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { makeSupabase, MAX_ROWS, type Row } from '@/test/helpers/fake-supabase'
import { fetchAllRecurringTx } from './vaste-lasten-summary'

function datumPlus(dagen: number): string {
  const d = new Date(2025, 6, 1 + dagen)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function rijen(aantal: number, accountId: string, prefix: string): Row[] {
  return Array.from({ length: aantal }, (_, i) => ({
    id: `${prefix}-${String(i).padStart(5, '0')}`,
    date: datumPlus(Math.floor(i / 10)),
    amount: -5,
    description: 'aankoop',
    counterparty_name: `WINKEL ${i}`,
    is_income: false,
    budget_id: null,
    transaction_type: 'debit',
    account_id: accountId,
  }))
}

const PROFIEL: Row = { id: 'user-parity' }

describe('fetchAllRecurringTx — compleet venster boven max_rows', () => {
  it('haalt meer dan max_rows rijen op, tot en met de recentste', async () => {
    const alle = rijen(MAX_ROWS + 500, 'acc-a', 'a')
    const { client } = makeSupabase({ profile: PROFIEL, transactions: alle })

    const { rows, complete } = await fetchAllRecurringTx(client, '2025-07-01')

    expect(complete).toBe(true)
    expect(rows).toHaveLength(MAX_ROWS + 500)
    expect(rows[rows.length - 1].date).toBe(alle[alle.length - 1].date)
  })

  it('past een rekeningfilter toe op álle pagina\'s', async () => {
    const eigen = rijen(MAX_ROWS + 200, 'acc-a', 'a')
    const ander = rijen(300, 'acc-b', 'b')
    const { client } = makeSupabase({ profile: PROFIEL, transactions: [...eigen, ...ander] })

    const { rows, complete } = await fetchAllRecurringTx(client, '2025-07-01', { accountId: 'acc-a' })

    expect(complete).toBe(true)
    expect(rows).toHaveLength(MAX_ROWS + 200)
    expect(rows.every((r) => r.id.startsWith('a-'))).toBe(true)
  })
})

describe('abonnementen-routes lopen via de complete ophaal', () => {
  const ROUTES = [
    'app/api/detect-recurring/route.ts',
    'app/api/subscriptions/detect-ai/route.ts',
    'app/api/subscriptions/analyse-ai/route.ts',
  ]

  it.each(ROUTES)('%s vraagt transacties niet meer met één afkappende query op', (pad) => {
    const bron = readFileSync(join(process.cwd(), pad), 'utf8')
    expect(bron).not.toMatch(/\.from\(\s*['"]transactions['"]\s*\)/)
    expect(bron).toMatch(/fetchAllRecurringTx\(/)
    // Een afgekapte ophaal mag niet stil op de oudste rijen doordetecteren.
    expect(bron).toMatch(/!txResult\.complete/)
  })
})
