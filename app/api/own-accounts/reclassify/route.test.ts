import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/own-accounts/reclassify — herclassificeer bestaande transacties als
 * eigen-rekening-verschuiving.
 *
 * Wat deze tests bewaken:
 *
 *  1. **De route filtert `bank_accounts` NIET zelf op `user_id`.** De
 *     SELECT-policy op die tabel is huishoud-verbreed (eigen rijen ÓF
 *     `ownership='shared'` binnen hetzelfde huishouden). Met het eigenaarsfilter
 *     viel de gezamenlijke huishoudrekening buiten de identifier-set en bleef een
 *     overboeking dáárheen als échte uitgave staan — dubbeltelling die de
 *     spaarquote vertekent, zonder dat er ergens iets faalt. Eigenaarsbesluit:
 *     gedeelde rekeningen tellen als eigen. Spiegelt `/api/own-accounts/ibans`.
 *  2. De route leest `iban_encrypted`, nooit de plaintext `iban`-kolom (Stage B).
 *  3. Een onleesbare rij wordt overgeslagen, niet fataal.
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
const EIGEN_IBAN = 'NL01BANK0000000001'
const GEDEELDE_IBAN = 'NL02BANK0000000002'

type BankRow = { user_id: string; iban_encrypted: string | null }
type Tx = {
  id: string
  counterparty_iban: string | null
  counterparty_name: string | null
  transaction_type: string | null
}

/** Onthoudt of de route zelf op user_id versmalde bij het lezen van bank_accounts. */
let bankAccountsUserIdFilter = false
/** Onthoudt de opgevraagde kolomlijst van bank_accounts. */
let bankAccountsColumns = ''
/** Alle updates die de route deed. */
let updates: { ids: string[]; patch: Record<string, unknown> }[] = []

function buildClient(opts: {
  bankAccounts: BankRow[]
  transactions: Tx[]
  budgets?: { id: string; slug: string | null }[]
  user?: string | null
}) {
  const user = opts.user === undefined ? USER : opts.user
  return {
    auth: {
      getUser: async () => ({
        data: { user: user ? { id: user } : null },
        error: user ? null : { message: 'no session' },
      }),
    },
    from(table: string) {
      if (table === 'bank_accounts') {
        // De stub levert wat de huishoud-verbrede SELECT-policy zou doorlaten:
        // eigen rijen ÉN de gedeelde partnerrij. Een `.eq('user_id', ...)` van de
        // route WERKT hier echt door — zonder dat zou de gedeelde-rekening-test
        // groen blijven ongeacht de fix, en dan bewaakt hij niets.
        let rows = opts.bankAccounts
        const chain = {
          select(cols: string) {
            bankAccountsColumns = cols
            return chain
          },
          eq(col: string, val: string) {
            if (col === 'user_id') {
              bankAccountsUserIdFilter = true
              rows = rows.filter((r) => r.user_id === val)
            }
            return chain
          },
          then(resolve: (v: { data: BankRow[]; error: null }) => unknown) {
            return resolve({ data: rows, error: null })
          },
        }
        return chain
      }
      if (table === 'user_own_ibans') {
        const chain = {
          select: () => chain,
          eq: () => Promise.resolve({ data: [], error: null }),
        }
        return chain
      }
      if (table === 'budgets') {
        const chain = {
          select: () => chain,
          eq: () => Promise.resolve({ data: opts.budgets ?? [], error: null }),
        }
        return chain
      }
      if (table === 'transactions') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          range: (from: number) =>
            Promise.resolve({ data: from === 0 ? opts.transactions : [], error: null }),
          update: (patch: Record<string, unknown>) => ({
            in: (_col: string, ids: string[]) => {
              updates.push({ ids, patch })
              return Promise.resolve({ error: null })
            },
          }),
        }
        return chain
      }
      throw new Error(`onverwachte tabel: ${table}`)
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  bankAccountsUserIdFilter = false
  bankAccountsColumns = ''
  updates = []
  mockDecryptField.mockImplementation((c: string | null) => {
    if (c === null) return null
    if (typeof c === 'string' && c.startsWith('enc:')) return c.slice(4)
    throw new Error('geen geldige ciphertext')
  })
})

describe('POST /api/own-accounts/reclassify', () => {
  it('telt de GEDEELDE huishoudrekening als eigen rekening', async () => {
    // Dit is de bug: de overboeking naar de gezamenlijke rekening (eigenaar =
    // partner, ownership='shared') stond als échte uitgave geboekt omdat de route
    // op `user_id` filterde en die IBAN dus nooit in de identifier-set kwam.
    mockCreateClient.mockResolvedValue(
      buildClient({
        bankAccounts: [
          { user_id: USER, iban_encrypted: `enc:${EIGEN_IBAN}` },
          { user_id: 'user-2', iban_encrypted: `enc:${GEDEELDE_IBAN}` },
        ],
        transactions: [
          { id: 'tx-naar-gedeeld', counterparty_iban: GEDEELDE_IBAN, counterparty_name: 'Gezamenlijke rekening', transaction_type: 'expense' },
          { id: 'tx-echte-uitgave', counterparty_iban: 'NL99SHOP0000000009', counterparty_name: 'Albert Heijn', transaction_type: 'expense' },
        ],
        budgets: [{ id: 'budget-eigen', slug: 'eigen-rekening' }],
      }),
    )

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reclassified).toBe(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].ids).toEqual(['tx-naar-gedeeld'])
    expect(updates[0].patch).toMatchObject({ transaction_type: 'transfer', category_source: 'transfer' })
  })

  it('gooit zelf geen user_id-filter over de RLS-poort heen', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        bankAccounts: [{ user_id: USER, iban_encrypted: `enc:${EIGEN_IBAN}` }],
        transactions: [],
      }),
    )

    await POST()

    // De harde eis. Zou dit ooit teruggezet worden, dan verdwijnt de gedeelde
    // rekening stil uit de identifier-set en is de spaarquote weer corrupt.
    expect(bankAccountsUserIdFilter).toBe(false)
  })

  it('leest iban_encrypted en NOOIT de plaintext iban-kolom', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        bankAccounts: [{ user_id: USER, iban_encrypted: `enc:${EIGEN_IBAN}` }],
        transactions: [],
      }),
    )

    await POST()

    // `iban_encrypted` bevat "iban" als substring, dus toetsen op kolom-tokens.
    const columns = bankAccountsColumns.split(',').map((c) => c.trim())
    expect(columns).toContain('iban_encrypted')
    expect(columns).not.toContain('iban')
  })

  it('slaat een onleesbare rij over zonder de hele herclassificatie te laten vallen', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreateClient.mockResolvedValue(
      buildClient({
        bankAccounts: [
          { user_id: USER, iban_encrypted: 'legacy-zonder-prefix' },
          { user_id: 'user-2', iban_encrypted: `enc:${GEDEELDE_IBAN}` },
        ],
        transactions: [
          { id: 'tx-naar-gedeeld', counterparty_iban: GEDEELDE_IBAN, counterparty_name: null, transaction_type: 'expense' },
        ],
        budgets: [],
      }),
    )

    const body = await (await POST()).json()

    expect(body.reclassified).toBe(1)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('laat bestaande transfers met rust', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        bankAccounts: [{ user_id: USER, iban_encrypted: `enc:${EIGEN_IBAN}` }],
        transactions: [
          { id: 'al-transfer', counterparty_iban: EIGEN_IBAN, counterparty_name: null, transaction_type: 'transfer' },
          { id: 'al-joint', counterparty_iban: EIGEN_IBAN, counterparty_name: null, transaction_type: 'joint_transfer' },
        ],
      }),
    )

    const body = await (await POST()).json()

    expect(body.reclassified).toBe(0)
    expect(updates).toHaveLength(0)
  })

  it('niet ingelogd → 401', async () => {
    mockCreateClient.mockResolvedValue(buildClient({ bankAccounts: [], transactions: [], user: null }))
    expect((await POST()).status).toBe(401)
  })
})
