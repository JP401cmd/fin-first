import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/own-accounts/settings — bootstrap voor de eigen-rekening-sheet.
 *
 * Wat deze tests bewaken, in volgorde van belang:
 *
 *  1. **Geen `.eq('user_id', …)` op `bank_accounts`.** De SELECT-policy is
 *     huishoud-verbreed; een eigenaarsfilter zou de gezamenlijke huishoudrekening
 *     uit de keuzelijst laten vallen. Spiegelt de reclassify-/ibans-tests.
 *  2. **Wél `.eq('user_id', …)` op `user_own_ibans`** — die tabel is eigen-rij.
 *  3. **Terugval op de oude `iban`-kolom** wanneer `match_value` leeg is (regels
 *     van vóór de `match_type`-kolom), en een rij zonder beide wordt weggefilterd.
 *  4. **Een onleesbare `iban_encrypted` telt mee in `unreadable` maar houdt de
 *     rekening in de lijst** — anders kun je de tegenpartijen ervan niet meer
 *     bekijken, terwijl dat precies is waarvoor deze route bestaat.
 */

const { mockCreateClient, mockDecryptField } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockDecryptField: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: async (supabase: { auth: { getClaims: () => Promise<{ data: { claims: unknown } | null }> } }) =>
    (await supabase.auth.getClaims()).data?.claims ?? null,
}))
vi.mock('@/lib/crypto/field-encryption', () => ({
  blindIndex: (s: string) => `hash:${s}`,
  encryptField: (s: string | null) => (s === null || s === undefined ? null : `enc:${s}`),
  decryptField: mockDecryptField,
}))

import { GET } from './route'

const USER = 'user-1'

type RuleRow = {
  id: string
  match_type: string | null
  match_value: string | null
  iban: string | null
  label: string | null
}
type AccountRow = { id: string; name: string | null; iban_encrypted: string | null; is_active: boolean | null }

/** Onthoudt of de route zelf op user_id versmalde op elke tabel. */
let bankAccountsUserIdFilter = false
let rulesUserIdFilter = false

function buildClient(opts: {
  rules?: RuleRow[]
  accounts?: AccountRow[]
  user?: string | null
  rulesError?: string
  accountsError?: string
}) {
  const user = opts.user === undefined ? USER : opts.user
  return {
    auth: {
      getClaims: async () => ({
        data: user ? { claims: { sub: user } } : null,
        error: user ? null : { message: 'no session' },
      }),
    },
    from(table: string) {
      if (table === 'user_own_ibans') {
        const chain = {
          select: () => chain,
          eq(col: string, _val: string) {
            if (col === 'user_id') rulesUserIdFilter = true
            return chain
          },
          order: () =>
            Promise.resolve(
              opts.rulesError
                ? { data: null, error: { message: opts.rulesError } }
                : { data: opts.rules ?? [], error: null },
            ),
        }
        return chain
      }
      if (table === 'bank_accounts') {
        const chain = {
          select: () => chain,
          eq(col: string, _val: string) {
            if (col === 'user_id') bankAccountsUserIdFilter = true
            return chain
          },
          order: () =>
            Promise.resolve(
              opts.accountsError
                ? { data: null, error: { message: opts.accountsError } }
                : { data: opts.accounts ?? [], error: null },
            ),
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
  rulesUserIdFilter = false
  mockDecryptField.mockImplementation((c: string | null) => {
    if (c === null) return null
    if (typeof c === 'string' && c.startsWith('enc:')) return c.slice(4)
    throw new Error('geen geldige ciphertext')
  })
})

describe('GET /api/own-accounts/settings', () => {
  it('niet ingelogd → 401', async () => {
    mockCreateClient.mockResolvedValue(buildClient({ user: null }))
    expect((await GET()).status).toBe(401)
  })

  it('mapt regels naar {id, matchType, matchValue, label}', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        rules: [
          {
            id: 'r1',
            match_type: 'iban',
            match_value: 'NL91ABNA0417164300',
            iban: null,
            label: 'Spaarrekening',
          },
        ],
      }),
    )

    const body = await (await GET()).json()

    expect(body.rules).toEqual([
      { id: 'r1', matchType: 'iban', matchValue: 'NL91ABNA0417164300', label: 'Spaarrekening' },
    ])
  })

  it('valt bij een lege match_value terug op de oude iban-kolom', async () => {
    // Regel van vóór de match_type-kolom bestond: alleen `iban` is gevuld.
    mockCreateClient.mockResolvedValue(
      buildClient({
        rules: [
          { id: 'legacy', match_type: null, match_value: null, iban: 'NL02BANK0000000002', label: null },
        ],
      }),
    )

    const body = await (await GET()).json()

    expect(body.rules).toEqual([
      { id: 'legacy', matchType: 'iban', matchValue: 'NL02BANK0000000002', label: null },
    ])
  })

  it('filtert een rij zonder match_value én zonder iban weg i.p.v. als lege rij te tonen', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        rules: [
          { id: 'leeg', match_type: 'iban', match_value: null, iban: null, label: null },
          { id: 'goed', match_type: 'name', match_value: 'kraken', iban: null, label: 'Kraken' },
        ],
      }),
    )

    const body = await (await GET()).json()

    expect(body.rules.map((r: { id: string }) => r.id)).toEqual(['goed'])
  })

  it('ontsleutelt iban_encrypted van rekeningen', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        accounts: [{ id: 'a1', name: 'Betaalrekening', iban_encrypted: 'enc:NL91ABNA0417164300', is_active: true }],
      }),
    )

    const body = await (await GET()).json()

    expect(body.accounts).toEqual([
      { id: 'a1', name: 'Betaalrekening', iban: 'NL91ABNA0417164300', isActive: true },
    ])
    expect(body.unreadable).toBe(0)
  })

  it('een onleesbare rij telt mee in unreadable maar blijft in de lijst', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        accounts: [
          { id: 'a1', name: 'Betaalrekening', iban_encrypted: 'enc:NL91ABNA0417164300', is_active: true },
          { id: 'a2', name: 'Kapotte rekening', iban_encrypted: 'legacy-zonder-prefix', is_active: true },
        ],
      }),
    )

    const body = await (await GET()).json()

    // De kapotte rekening blijft zichtbaar (met iban: null) — je kunt er nog
    // steeds tegenpartijen van bekijken en een regel voor aanmaken.
    expect(body.accounts.map((a: { id: string }) => a.id)).toEqual(['a1', 'a2'])
    expect(body.accounts[1]).toMatchObject({ id: 'a2', iban: null })
    expect(body.unreadable).toBe(1)
  })

  it('gooit GEEN user_id-filter over bank_accounts (huishoud-verbrede policy)', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        accounts: [
          { id: 'mine', name: 'Van mij', iban_encrypted: 'enc:NL01BANK0000000001', is_active: true },
          { id: 'shared', name: 'Gezamenlijk', iban_encrypted: 'enc:NL02BANK0000000002', is_active: true },
        ],
      }),
    )

    const body = await (await GET()).json()

    expect(body.accounts.map((a: { id: string }) => a.id)).toEqual(['mine', 'shared'])
    expect(bankAccountsUserIdFilter).toBe(false)
  })

  it('filtert user_own_ibans WÉL op user_id (eigen-rij)', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    await GET()
    expect(rulesUserIdFilter).toBe(true)
  })

  it('een leesfout op rules wordt een 500, geen lege lijst', async () => {
    mockCreateClient.mockResolvedValue(buildClient({ rulesError: 'connection reset' }))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('connection reset')
  })

  it('een leesfout op accounts wordt een 500, geen lege lijst', async () => {
    mockCreateClient.mockResolvedValue(buildClient({ accountsError: 'connection reset' }))

    const res = await GET()
    expect(res.status).toBe(500)
  })
})
