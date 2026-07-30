import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/bank-connect/accounts — de kandidaat-doelrekeningen voor de
 * koppelwizard (fase 4).
 *
 * Wat deze tests bewaken, in volgorde van belang:
 *
 *  1. **Alleen eigen rekeningen, en alleen eigen transacties.** De SELECT-policy
 *     op `bank_accounts` en `transactions` is bréder dan eigen-rij (huishoud-
 *     gedeelde partnerrijen komen erdoor), dus zonder expliciete `user_id`-filter
 *     zou de wizard partnerrekeningen aanbieden en andermans uitgavenvolume
 *     prijsgeven.
 *  2. **De geschiktheidsregel.** Een rekening met budgetteren úit (inactieve
 *     companion) hoort er juist WÉL bij — dat is de groep waarvoor het
 *     voorgevinkte budget-vinkje bestaat (B2). Een rekening waarvan het
 *     cash-bezit is gedeactiveerd hoort er niet bij.
 *  3. **Het startpunt komt uit `planInitialFetch`, niet uit de UI.** Bij historie
 *     tot D levert de route D−3; op een lege rekening de historische modus. Nergens
 *     een tweede "−3 dagen".
 *  4. **Van de IBAN verlaten alleen de laatste vier tekens de server.**
 *
 * De Supabase-stub is bewust geen call-queue maar een piepklein in-memory
 * tabellenspul dat de filters écht toepast — alleen zo bewijst een test
 * scope-gedrag in plaats van aanroepvolgorde.
 */

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

import { GET } from './route'

const USER = 'user-1'
const PARTNER = 'user-2'

type BankAccountRow = {
  id: string
  user_id: string
  name: string
  bank_name: string | null
  iban: string | null
  is_active: boolean
  linked_asset_id: string | null
  sort_order?: number
}
type AssetRow = { id: string; user_id: string; is_active: boolean | null; has_budget_tracking: boolean | null }
type TxRow = { id: string; user_id: string; account_id: string; date: string }
type LinkRow = {
  id: string
  user_id: string
  bank_account_id: string | null
  is_active: boolean
  provider_name: string | null
}

type Fixture = {
  bankAccounts: BankAccountRow[]
  assets: AssetRow[]
  transactions: TxRow[]
  links: LinkRow[]
}

function makeSupabase(fixture: Fixture, opts: { user?: string | null; failTransactions?: boolean } = {}) {
  const user = opts.user === undefined ? USER : opts.user

  function builder(table: string) {
    const eqs: Record<string, unknown> = {}
    const notNullCols: string[] = []
    let inList: { col: string; vals: unknown[] } | null = null
    let countMode = false
    let order: { col: string; asc: boolean } | null = null
    let limit: number | null = null

    const b: Record<string, unknown> = {}
    b.select = (_cols?: string, options?: { count?: string }) => {
      if (options?.count) countMode = true
      return b
    }
    b.eq = (col: string, val: unknown) => { eqs[col] = val; return b }
    b.in = (col: string, vals: unknown[]) => { inList = { col, vals }; return b }
    // Alleen de vorm die de route gebruikt: `.not(col, 'is', null)`.
    b.not = (col: string, op: string, val: unknown) => {
      if (op === 'is' && val === null) notNullCols.push(col)
      else throw new Error(`stub kent .not(${col}, ${op}, ...) niet`)
      return b
    }
    b.order = (col: string, options?: { ascending?: boolean }) => {
      // Alleen de eerste order bepaalt hier de uitkomst; de tweede is een
      // tiebreaker die geen test-assertie draagt.
      if (!order) order = { col, asc: options?.ascending !== false }
      return b
    }
    b.limit = (n: number) => { limit = n; return b }
    b.maybeSingle = () => Promise.resolve(resolveSingle())
    b.single = () => Promise.resolve(resolveSingle())
    b.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveList()).then(onFulfilled)

    function rows(): Record<string, unknown>[] {
      const source: Record<string, unknown>[] =
        table === 'bank_accounts' ? fixture.bankAccounts
        : table === 'assets' ? fixture.assets
        : table === 'transactions' ? fixture.transactions
        : table === 'bank_connection_accounts' ? fixture.links
        : []

      let out = source.filter((row) =>
        Object.entries(eqs).every(([col, val]) => row[col] === val),
      )
      if (inList) out = out.filter((row) => inList!.vals.includes(row[inList!.col]))
      for (const col of notNullCols) out = out.filter((row) => row[col] !== null && row[col] !== undefined)
      if (order) {
        const { col, asc } = order
        out = [...out].sort((a, b2) => String(a[col]).localeCompare(String(b2[col])) * (asc ? 1 : -1))
      }
      return out
    }

    function resolveList(): { data: unknown; error: unknown; count?: number } {
      if (table === 'transactions' && opts.failTransactions) {
        return { data: null, error: { message: 'boom' } }
      }
      const all = rows()
      const projected = table === 'bank_connection_accounts'
        ? all.map((r) => ({
            id: r.id,
            bank_account_id: r.bank_account_id,
            bank_connections: { provider_name: r.provider_name },
          }))
        : all
      const data = limit === null ? projected : projected.slice(0, limit)
      return countMode ? { data, error: null, count: all.length } : { data, error: null }
    }

    function resolveSingle(): { data: unknown; error: unknown } {
      const list = resolveList()
      if (list.error) return { data: null, error: list.error }
      return { data: (list.data as unknown[])[0] ?? null, error: null }
    }

    return b
  }

  return {
    auth: { getUser: () => Promise.resolve({ data: { user: user ? { id: user } : null } }) },
    from: (table: string) => builder(table),
  }
}

/** Vandaag vastzetten: het startpunt van de eerste ophaal is een datumsom. */
const TODAY = '2026-07-29'

beforeEach(() => {
  mockCreateClient.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`))
})

async function callGet(fixture: Fixture, opts?: Parameters<typeof makeSupabase>[1]) {
  mockCreateClient.mockResolvedValue(makeSupabase(fixture, opts))
  const res = await GET()
  return { res, body: await res.json() }
}

const EMPTY: Fixture = { bankAccounts: [], assets: [], transactions: [], links: [] }

describe('GET /api/bank-connect/accounts — auth', () => {
  it('401 zonder sessie', async () => {
    const { res, body } = await callGet(EMPTY, { user: null })
    expect(res.status).toBe(401)
    expect(body.error).toBe('Niet ingelogd')
  })

  it('lege lijst als de gebruiker nog geen rekening heeft (onboarding, SC-25)', async () => {
    const { res, body } = await callGet(EMPTY)
    expect(res.status).toBe(200)
    expect(body.accounts).toEqual([])
  })
})

describe('GET /api/bank-connect/accounts — eigenaarschap', () => {
  it('biedt geen huishoud-gedeelde partnerrekening aan', async () => {
    const { body } = await callGet({
      ...EMPTY,
      bankAccounts: [
        { id: 'acc-mine', user_id: USER, name: 'Mijn betaalrekening', bank_name: 'ING', iban: 'NL91ABNA0417164300', is_active: true, linked_asset_id: null },
        { id: 'acc-partner', user_id: PARTNER, name: 'Gedeelde rekening', bank_name: 'ING', iban: null, is_active: true, linked_asset_id: null },
      ],
    })

    expect(body.accounts.map((a: { id: string }) => a.id)).toEqual(['acc-mine'])
  })

  it('telt alleen eigen transacties, niet die van de partner op dezelfde rekening', async () => {
    const { body } = await callGet({
      ...EMPTY,
      bankAccounts: [
        { id: 'acc-1', user_id: USER, name: 'Betaalrekening', bank_name: null, iban: null, is_active: true, linked_asset_id: null },
      ],
      transactions: [
        { id: 't1', user_id: USER, account_id: 'acc-1', date: '2026-07-10' },
        { id: 't2', user_id: USER, account_id: 'acc-1', date: '2026-07-20' },
        // Partnerrij op dezelfde rekening: mag de teller noch het startpunt raken.
        { id: 't3', user_id: PARTNER, account_id: 'acc-1', date: '2026-07-28' },
      ],
    })

    expect(body.accounts[0].transaction_count).toBe(2)
    expect(body.accounts[0].newest_transaction_date).toBe('2026-07-20')
    expect(body.accounts[0].oldest_transaction_date).toBe('2026-07-10')
  })
})

describe('GET /api/bank-connect/accounts — welke rekeningen zijn kandidaat', () => {
  const fixture: Fixture = {
    ...EMPTY,
    bankAccounts: [
      { id: 'acc-active', user_id: USER, name: 'Actief', bank_name: null, iban: null, is_active: true, linked_asset_id: 'asset-active' },
      // Budgetteren uit = companion gedeactiveerd, bezitting leeft nog → kandidaat.
      { id: 'acc-nobudget', user_id: USER, name: 'Zonder budgetteren', bank_name: null, iban: null, is_active: false, linked_asset_id: 'asset-nobudget' },
      // Bezitting gedeactiveerd → geen kandidaat (SC-13 is een ander pad).
      { id: 'acc-dead', user_id: USER, name: 'Verwijderd bezit', bank_name: null, iban: null, is_active: false, linked_asset_id: 'asset-dead' },
      // Losse, inactieve rekening zonder bezit → geen kandidaat.
      { id: 'acc-loose-off', user_id: USER, name: 'Losse inactieve', bank_name: null, iban: null, is_active: false, linked_asset_id: null },
    ],
    assets: [
      { id: 'asset-active', user_id: USER, is_active: true, has_budget_tracking: true },
      { id: 'asset-nobudget', user_id: USER, is_active: true, has_budget_tracking: false },
      { id: 'asset-dead', user_id: USER, is_active: false, has_budget_tracking: true },
    ],
  }

  it('laat een rekening met budgetteren uit staan (B2) en filtert dode rekeningen weg', async () => {
    const { body } = await callGet(fixture)

    expect(body.accounts.map((a: { id: string }) => a.id)).toEqual(['acc-active', 'acc-nobudget'])
  })

  it('markeert alleen de rekening zonder tracking met budget_tracking: false', async () => {
    const { body } = await callGet(fixture)
    const byId = Object.fromEntries(body.accounts.map((a: { id: string; budget_tracking: boolean }) => [a.id, a.budget_tracking]))

    expect(byId['acc-active']).toBe(true)
    expect(byId['acc-nobudget']).toBe(false)
  })
})

describe('GET /api/bank-connect/accounts — startpunt en IBAN', () => {
  it('rekening mét historie → incrementeel vanaf de nieuwste transactie −3 dagen (B9)', async () => {
    const { body } = await callGet({
      ...EMPTY,
      bankAccounts: [
        { id: 'acc-1', user_id: USER, name: 'Betaalrekening', bank_name: null, iban: null, is_active: true, linked_asset_id: null },
      ],
      transactions: [{ id: 't1', user_id: USER, account_id: 'acc-1', date: '2026-07-20' }],
    })

    expect(body.accounts[0].fetch_plan).toEqual({ mode: 'incremental', start_date: '2026-07-17' })
  })

  it('lege rekening → historische modus (B8), geen datumbelofte uit de UI', async () => {
    const { body } = await callGet({
      ...EMPTY,
      bankAccounts: [
        { id: 'acc-1', user_id: USER, name: 'Nieuwe rekening', bank_name: null, iban: null, is_active: true, linked_asset_id: null },
      ],
    })

    expect(body.accounts[0].fetch_plan.mode).toBe('historical')
    expect(body.accounts[0].transaction_count).toBe(0)
    expect(body.accounts[0].newest_transaction_date).toBeNull()
  })

  it('alleen de laatste vier IBAN-tekens verlaten de server', async () => {
    const { res, body } = await callGet({
      ...EMPTY,
      bankAccounts: [
        { id: 'acc-1', user_id: USER, name: 'Betaalrekening', bank_name: 'ING', iban: 'NL91 ABNA 0417 1643 00', is_active: true, linked_asset_id: null },
      ],
    })

    expect(body.accounts[0].iban_tail).toBe('4300')
    const raw = JSON.stringify(body)
    expect(raw).not.toContain('NL91')
    expect(res.status).toBe(200)
  })
})

describe('GET /api/bank-connect/accounts — actieve koppeling en fouten', () => {
  it('noemt de provider van een al bestaande actieve koppeling', async () => {
    const { body } = await callGet({
      ...EMPTY,
      bankAccounts: [
        { id: 'acc-1', user_id: USER, name: 'Betaalrekening', bank_name: null, iban: null, is_active: true, linked_asset_id: null },
        { id: 'acc-2', user_id: USER, name: 'Spaarrekening', bank_name: null, iban: null, is_active: true, linked_asset_id: null },
      ],
      links: [
        { id: 'link-1', user_id: USER, bank_account_id: 'acc-1', is_active: true, provider_name: 'ING' },
        // Inactieve koppeling telt niet: dat is de zachte ontkoppeling.
        { id: 'link-2', user_id: USER, bank_account_id: 'acc-2', is_active: false, provider_name: 'Rabobank' },
      ],
    })

    const byId = Object.fromEntries(body.accounts.map((a: { id: string; linked_provider_name: string | null }) => [a.id, a.linked_provider_name]))
    expect(byId['acc-1']).toBe('ING')
    expect(byId['acc-2']).toBeNull()
  })

  it('koppeling van de partner bezet MIJN keuzelijst niet (eigen-rij-filter)', async () => {
    const { body } = await callGet({
      ...EMPTY,
      bankAccounts: [
        { id: 'acc-1', user_id: USER, name: 'Betaalrekening', bank_name: null, iban: null, is_active: true, linked_asset_id: null },
      ],
      links: [
        { id: 'link-p', user_id: PARTNER, bank_account_id: 'acc-1', is_active: true, provider_name: 'Rabobank' },
      ],
    })

    expect(body.accounts[0].linked_provider_name).toBeNull()
  })

  it('bezet zónder leesbare banknaam blijft bezet — nooit null (FR5)', async () => {
    // `linked_provider_name` IS het kiesbaarheidsfeit: `null` = vrij. Een bezette
    // rekening die als `null` terugkomt zou in de wizard weer kiesbaar worden en
    // de gebruiker alsnog tegen de 409 van auth-link laten lopen.
    const { body } = await callGet({
      ...EMPTY,
      bankAccounts: [
        { id: 'acc-1', user_id: USER, name: 'Betaalrekening', bank_name: null, iban: null, is_active: true, linked_asset_id: null },
      ],
      links: [
        { id: 'link-1', user_id: USER, bank_account_id: 'acc-1', is_active: true, provider_name: null },
      ],
    })

    expect(body.accounts[0].linked_provider_name).toBe('een andere bank')
  })

  it('een gefaalde historie-query levert een generieke 500, geen drivertekst', async () => {
    const { res, body } = await callGet({
      ...EMPTY,
      bankAccounts: [
        { id: 'acc-1', user_id: USER, name: 'Betaalrekening', bank_name: null, iban: null, is_active: true, linked_asset_id: null },
      ],
    }, { failTransactions: true })

    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('boom')
  })
})
