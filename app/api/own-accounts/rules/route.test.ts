import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/own-accounts/rules — de eigen-rekening-regels bijwerken (delta) en
 * meteen de bestaande historie omzetten.
 *
 * Wat deze tests bewaken, in volgorde van belang:
 *
 *  1. **Server-bepaalde normalisatie.** Een IBAN met spaties/kleine letters
 *     wordt in zowel `iban` als `match_value` opgeslagen als `NL91ABNA…`; een
 *     naam-regel wordt lowercase in `match_value` met de rauwe vorm in `label`.
 *     Matcht de opgeslagen vorm niet met wat `isOwnAccountTransfer` verwacht, dan
 *     doet de regel stil niets — dit is de kern van de route.
 *  2. Validatie: 401 zonder sessie, 400 bij ongeldige body/IBAN/te korte naam.
 *  3. `remove` filtert op `user_id` bovenop RLS.
 *  4. `add` gebruikt `upsert` met `ignoreDuplicates` op `user_id,match_type,match_value`.
 *  5. Na de delta draait de herclassificatie en komt `reclassified` mee terug.
 */

const { mockCreateClient, mockDecryptField } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockDecryptField: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/crypto/field-encryption', () => ({
  blindIndex: (s: string) => `hash:${s}`,
  encryptField: (s: string | null) => (s === null || s === undefined ? null : `enc:${s}`),
  decryptField: mockDecryptField,
}))

import { POST } from './route'

const USER = 'user-1'

type RuleRow = {
  id: string
  user_id: string
  match_type: string
  match_value: string
  iban: string | null
  label: string | null
}
type Tx = {
  id: string
  counterparty_iban: string | null
  counterparty_name: string | null
  transaction_type: string | null
}

let removeUserIdFilter = false
let upsertCalls: { rows: Record<string, unknown>[]; options: Record<string, unknown> }[] = []
let deleteCalls: { ids: string[] }[] = []
let updates: { ids: string[]; patch: Record<string, unknown> }[] = []

function buildClient(opts: {
  existingRules?: RuleRow[]
  bankAccounts?: { iban_encrypted: string | null }[]
  budgets?: { id: string; slug: string | null }[]
  transactions?: Tx[]
  user?: string | null
}) {
  const user = opts.user === undefined ? USER : opts.user
  let rules = [...(opts.existingRules ?? [])]
  const bankAccounts = opts.bankAccounts ?? []
  const budgets = opts.budgets ?? []
  const transactions = opts.transactions ?? []

  return {
    auth: {
      getUser: async () => ({
        data: { user: user ? { id: user } : null },
        error: user ? null : { message: 'no session' },
      }),
    },
    from(table: string) {
      if (table === 'user_own_ibans') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => Promise.resolve({ data: rules, error: null }),
          then: (resolve: (v: { data: RuleRow[]; error: null }) => unknown) => resolve({ data: rules, error: null }),
          delete: () => ({
            in: (_col: string, ids: string[]) => ({
              eq: (col: string, _val: string) => {
                if (col === 'user_id') removeUserIdFilter = true
                deleteCalls.push({ ids })
                rules = rules.filter((r) => !ids.includes(r.id))
                return Promise.resolve({ error: null })
              },
            }),
          }),
          upsert: (rows: Record<string, unknown>[], options: Record<string, unknown>) => {
            upsertCalls.push({ rows, options })
            for (const row of rows) {
              const exists = rules.some(
                (r) =>
                  r.user_id === row.user_id &&
                  r.match_type === row.match_type &&
                  r.match_value === row.match_value,
              )
              if (!exists) {
                rules.push({
                  id: `new-${rules.length}-${row.match_value}`,
                  user_id: row.user_id as string,
                  match_type: row.match_type as string,
                  match_value: row.match_value as string,
                  iban: (row.iban as string | null) ?? null,
                  label: (row.label as string | null) ?? null,
                })
              }
            }
            return Promise.resolve({ error: null })
          },
        }
        return chain
      }
      if (table === 'bank_accounts') {
        const chain = {
          select: () => chain,
          then: (resolve: (v: { data: { iban_encrypted: string | null }[]; error: null }) => unknown) =>
            resolve({ data: bankAccounts, error: null }),
        }
        return chain
      }
      if (table === 'budgets') {
        const chain = {
          select: () => chain,
          eq: () => Promise.resolve({ data: budgets, error: null }),
        }
        return chain
      }
      if (table === 'transactions') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          range: (from: number) => Promise.resolve({ data: from === 0 ? transactions : [], error: null }),
          // `.in(ids).eq('user_id', …).select('id')` — de teller telt sinds
          // 11 aug de teruggegeven rijen i.p.v. de kandidaten, en de UPDATE
          // draagt een eigen eigenaarsfilter. Zie `lib/own-accounts-reclassify.ts`.
          update: (patch: Record<string, unknown>) => ({
            in: (_col: string, ids: string[]) => {
              updates.push({ ids, patch })
              const updateChain = {
                eq: () => updateChain,
                select: () => Promise.resolve({ data: ids.map((id) => ({ id })), error: null }),
              }
              return updateChain
            },
          }),
        }
        return chain
      }
      throw new Error(`onverwachte tabel: ${table}`)
    },
  }
}

function req(body: unknown) {
  return new Request('http://localhost/api/own-accounts/rules', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  removeUserIdFilter = false
  upsertCalls = []
  deleteCalls = []
  updates = []
  mockDecryptField.mockImplementation((c: string | null) => {
    if (c === null) return null
    if (typeof c === 'string' && c.startsWith('enc:')) return c.slice(4)
    throw new Error('geen geldige ciphertext')
  })
})

describe('POST /api/own-accounts/rules', () => {
  it('niet ingelogd → 401', async () => {
    mockCreateClient.mockResolvedValue(buildClient({ user: null }))
    const res = await POST(req({ add: [] }))
    expect(res.status).toBe(401)
  })

  it('ongeldige body → 400 (zod)', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    const res = await POST(req({ add: [{ matchType: 'bogus', matchValue: 'x' }] }))
    expect(res.status).toBe(400)
  })

  it('ongeldige IBAN → 400', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    const res = await POST(req({ add: [{ matchType: 'iban', matchValue: '123' }] }))
    expect(res.status).toBe(400)
  })

  it('naam korter dan 3 tekens → 400', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    const res = await POST(req({ add: [{ matchType: 'name', matchValue: 'ab' }] }))
    expect(res.status).toBe(400)
  })

  it('normaliseert een IBAN-regel server-side (spaties/kleine letters weg, uppercase)', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))

    const res = await POST(
      req({ add: [{ matchType: 'iban', matchValue: 'nl91 abna 0417 1643 00', label: 'Spaarrekening' }] }),
    )

    expect(res.status).toBe(200)
    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0].rows[0]).toMatchObject({
      user_id: USER,
      iban: 'NL91ABNA0417164300',
      match_type: 'iban',
      match_value: 'NL91ABNA0417164300',
      label: 'Spaarrekening',
    })
  })

  it('normaliseert een naam-regel: match_value lowercase, label de rauwe vorm, iban null', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))

    const res = await POST(req({ add: [{ matchType: 'name', matchValue: ' ABN AMRO ' }] }))

    expect(res.status).toBe(200)
    expect(upsertCalls[0].rows[0]).toMatchObject({
      user_id: USER,
      iban: null,
      match_type: 'name',
      match_value: 'abn amro',
      label: 'ABN AMRO',
    })
  })

  it('upsert gebruikt ignoreDuplicates op user_id,match_type,match_value', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))

    await POST(req({ add: [{ matchType: 'iban', matchValue: 'NL91ABNA0417164300' }] }))

    expect(upsertCalls[0].options).toMatchObject({
      onConflict: 'user_id,match_type,match_value',
      ignoreDuplicates: true,
    })
  })

  it('twee keer dezelfde regel toevoegen is een no-op, geen 409', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        existingRules: [
          {
            id: 'r1',
            user_id: USER,
            match_type: 'iban',
            match_value: 'NL91ABNA0417164300',
            iban: 'NL91ABNA0417164300',
            label: null,
          },
        ],
      }),
    )

    const res = await POST(req({ add: [{ matchType: 'iban', matchValue: 'nl91 abna 0417 1643 00' }] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.rules).toHaveLength(1)
  })

  it('remove filtert op user_id bovenop RLS', async () => {
    const RULE_ID = '22222222-2222-4222-8222-222222222222'
    mockCreateClient.mockResolvedValue(
      buildClient({
        existingRules: [
          { id: RULE_ID, user_id: USER, match_type: 'iban', match_value: 'NL91ABNA0417164300', iban: null, label: null },
        ],
      }),
    )

    const res = await POST(req({ remove: [RULE_ID] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(removeUserIdFilter).toBe(true)
    expect(deleteCalls[0].ids).toEqual([RULE_ID])
    expect(body.rules).toHaveLength(0)
  })

  it('draait na de delta de herclassificatie en geeft reclassified terug', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        transactions: [
          { id: 'tx1', counterparty_iban: 'NL91ABNA0417164300', counterparty_name: null, transaction_type: 'expense' },
          { id: 'tx-onaangeraakt', counterparty_iban: 'NL99SHOP0000000009', counterparty_name: 'Albert Heijn', transaction_type: 'expense' },
        ],
        budgets: [{ id: 'budget-eigen', slug: 'eigen-rekening' }],
      }),
    )

    const res = await POST(req({ add: [{ matchType: 'iban', matchValue: 'NL91ABNA0417164300' }] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reclassified).toBe(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].ids).toEqual(['tx1'])
    expect(updates[0].patch).toMatchObject({
      transaction_type: 'transfer',
      category_source: 'transfer',
      budget_id: 'budget-eigen',
    })
  })
})
