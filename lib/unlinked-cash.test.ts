import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  unlinkedCashTotal,
  selectUnlinkedBankAccounts,
  selectUnlinkedBankAccountsForUser,
  loadHouseholdIdsByUser,
  type UnlinkedCashRow,
} from './unlinked-cash'

/**
 * Deze suite bewaakt de GRONDSLAG, niet de opmaak: welke rijen meetellen in de
 * losse-cash-optelling, en — belangrijker — welke filters daarbij WEL en NIET op
 * de query mogen staan. De regressie die hier gevangen wordt is een
 * `.eq('user_id', …)` die terugsluipt: die maakt de query strikt smaller dan de
 * huishoud-verbrede SELECT-policy en laat gedeelde huishoudrekeningen wegvallen,
 * waarna check-in en snapshots een ander netto vermogen tonen dan het dashboard.
 */

type Call = { method: string; args: unknown[] }

/** Minimale PostgREST-dubbelganger die alleen registreert wat er op 'm wordt aangeroepen. */
function makeFakeSupabase(result: unknown = { data: [], error: null }) {
  const calls: Call[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'or', 'in', 'order']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }
  // Thenable, zodat `await`-ende consumers (loadHouseholdIdsByUser) werken.
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result)

  const client = {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] })
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const called = (calls: Call[], method: string) => calls.filter(c => c.method === method)
const userIdFilters = (calls: Call[]) => called(calls, 'eq').filter(c => c.args[0] === 'user_id')

describe('unlinkedCashTotal', () => {
  it('telt saldi op', () => {
    expect(unlinkedCashTotal([{ balance: 100 }, { balance: 250.5 }])).toBe(350.5)
  })

  it('accepteert numerieke strings (numeric-kolom komt als string terug)', () => {
    expect(unlinkedCashTotal([{ balance: '100.25' }, { balance: '9.75' }])).toBe(110)
  })

  it('telt negatieve saldi (roodstand) gewoon mee', () => {
    expect(unlinkedCashTotal([{ balance: 500 }, { balance: -200 }])).toBe(300)
  })

  it('behandelt ontbrekend saldo als 0', () => {
    expect(unlinkedCashTotal([{ balance: null }, {}, { balance: 40 }])).toBe(40)
  })

  it('levert 0 bij een gefaalde leesronde (null/undefined)', () => {
    expect(unlinkedCashTotal(null)).toBe(0)
    expect(unlinkedCashTotal(undefined)).toBe(0)
    expect(unlinkedCashTotal([])).toBe(0)
  })

  it('weegt NIET: bank_accounts heeft geen net_worth_inclusion_pct', () => {
    // Een verzonnen weging hier zou onmiddellijk driften met het dashboard, dat
    // losse rekeningen altijd al op 100% telt. Vandaar dat een meegestuurd
    // inclusion-veld pertinent genegeerd wordt.
    const rows: UnlinkedCashRow[] = [
      { balance: 1000, net_worth_inclusion_pct: 50 } as UnlinkedCashRow,
    ]
    expect(unlinkedCashTotal(rows)).toBe(1000)
  })
})

describe('selectUnlinkedBankAccounts (RLS-client)', () => {
  it('filtert op actieve, niet-gekoppelde rekeningen', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccounts(client)

    expect(called(calls, 'from')[0].args[0]).toBe('bank_accounts')
    expect(called(calls, 'eq')).toContainEqual({ method: 'eq', args: ['is_active', true] })
    expect(called(calls, 'is')).toContainEqual({ method: 'is', args: ['linked_asset_id', null] })
  })

  it('zet GEEN user-filter — RLS doet de huishoud-verbrede scoping', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccounts(client)

    expect(userIdFilters(calls)).toHaveLength(0)
  })

  it('leest een letterlijke kolomset (anders vervalt de PostgREST-typing)', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccounts(client)

    expect(typeof called(calls, 'select')[0].args[0]).toBe('string')
    expect(called(calls, 'select')[0].args[0]).toContain('balance')
  })
})

describe('selectUnlinkedBankAccountsForUser (service-role, RLS scoopt niet)', () => {
  const USER = '11111111-1111-4111-8111-111111111111'
  const HOUSEHOLD = '22222222-2222-4222-8222-222222222222'

  it('spiegelt de policy: eigen rijen OF gedeeld binnen het huishouden', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccountsForUser(client, USER, HOUSEHOLD)

    expect(called(calls, 'or')).toHaveLength(1)
    expect(called(calls, 'or')[0].args[0]).toBe(
      `user_id.eq.${USER},and(ownership.eq.shared,household_id.eq.${HOUSEHOLD})`,
    )
    // De or() DRAAGT de user-scope; een losse eq zou 'm juist weer dichttrekken.
    expect(userIdFilters(calls)).toHaveLength(0)
  })

  it('houdt de grondslag-filters ook in service-role-context aan', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccountsForUser(client, USER, HOUSEHOLD)

    expect(called(calls, 'eq')).toContainEqual({ method: 'eq', args: ['is_active', true] })
    expect(called(calls, 'is')).toContainEqual({ method: 'is', args: ['linked_asset_id', null] })
  })

  it('zonder huishouden: alleen eigen rijen, geen or()', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccountsForUser(client, USER, null)

    expect(called(calls, 'or')).toHaveLength(0)
    expect(userIdFilters(calls)).toEqual([{ method: 'eq', args: ['user_id', USER] }])
  })

  it('degradeert fail-closed bij een niet-UUID huishoud-id', () => {
    // Een waarde met leestekens zou het komma-gescheiden or()-predicaat kunnen
    // herschrijven. Dan liever alleen-eigen-rijen dan een opengebroken filter.
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccountsForUser(client, USER, 'x,ownership.eq.shared')

    expect(called(calls, 'or')).toHaveLength(0)
    expect(userIdFilters(calls)).toEqual([{ method: 'eq', args: ['user_id', USER] }])
  })
})

describe('loadHouseholdIdsByUser', () => {
  const A = '11111111-1111-4111-8111-111111111111'
  const B = '33333333-3333-4333-8333-333333333333'
  const HOUSEHOLD = '22222222-2222-4222-8222-222222222222'

  it('bouwt de user→household map in één leesronde', async () => {
    const { client, calls } = makeFakeSupabase({
      data: [
        { user_id: A, household_id: HOUSEHOLD },
        { user_id: B, household_id: HOUSEHOLD },
      ],
      error: null,
    })

    const map = await loadHouseholdIdsByUser(client, [A, B])

    expect(map.get(A)).toBe(HOUSEHOLD)
    expect(map.get(B)).toBe(HOUSEHOLD)
    expect(called(calls, 'from')[0].args[0]).toBe('household_members')
    expect(called(calls, 'in')).toHaveLength(1)
  })

  it('houdt bij meerdere huishoudens het EERSTE (oudste) lidmaatschap', async () => {
    // household_members is uniek op (household_id, user_id), niet op user_id —
    // twee huishoudens is dus mogelijk. Deterministisch kiezen voorkomt dat twee
    // cron-runs een ander huishouden pakken.
    const OUDSTE = '44444444-4444-4444-8444-444444444444'
    const { client } = makeFakeSupabase({
      data: [
        { user_id: A, household_id: OUDSTE },
        { user_id: A, household_id: HOUSEHOLD },
      ],
      error: null,
    })

    expect((await loadHouseholdIdsByUser(client, [A])).get(A)).toBe(OUDSTE)
  })

  it('slaat rijen zonder huishouden over', async () => {
    const { client } = makeFakeSupabase({
      data: [{ user_id: A, household_id: null }],
      error: null,
    })

    expect((await loadHouseholdIdsByUser(client, [A])).size).toBe(0)
  })

  it('levert een lege map bij een fout (fail-closed → alleen eigen rijen)', async () => {
    const { client } = makeFakeSupabase({ data: null, error: { message: 'boom' } })

    expect((await loadHouseholdIdsByUser(client, [A])).size).toBe(0)
  })

  it('doet geen query bij een lege gebruikerslijst', async () => {
    const { client, calls } = makeFakeSupabase()

    expect((await loadHouseholdIdsByUser(client, [])).size).toBe(0)
    expect(calls).toHaveLength(0)
  })
})
