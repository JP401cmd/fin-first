import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/own-accounts/ibans — de ontsleutelde IBANs van je eigen bankrekeningen.
 *
 * Deze route bestaat omdat `decryptField` de server-only encryptiesleutels nodig
 * heeft en dus niet in een `'use client'`-bestand kan draaien. Wat de tests
 * bewaken, in volgorde van belang:
 *
 *  1. **De route leest `iban_encrypted`, nooit de plaintext `iban`-kolom.** Die
 *     kolom verdwijnt in Stage B; zou de route 'm alsnog aanraken, dan valt de
 *     eigen-rekeningherkenning na de drop stil om.
 *  2. **Onleesbare rijen worden geteld, niet weggemoffeld.** Elke consument
 *     gebruikt deze IBANs als match-identifier voor eigen-rekening-verschuivingen.
 *     Verdwijnt er stil één, dan telt een interne overboeking mee als échte
 *     inkomst én uitgave en staat de spaarquote structureel verkeerd — zonder dat
 *     er ergens iets rood wordt. De teller is de veiligheidsklep waarop
 *     `fetchOwnAccountIbansStrict` afgaat.
 *  3. **RLS is de grens, niet een eigen `user_id`-filter** — en niet ingelogd = 401.
 *  4. **Een leesfout wordt een 500, geen lege lijst.** "Geen eigen IBANs" en "ik
 *     kon ze niet lezen" mogen nooit dezelfde respons opleveren.
 */

const { mockCreateClient, mockDecryptField } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockDecryptField: vi.fn(),
}))
// `getAuthClaims` is in productie een one-liner om `auth.getClaims()` heen (ADR
// 0052). De mock doet hier hetzelfde, zodat de auth-toestand — net als voorheen
// bij `getUser()` — uit de client-stub blijft komen in plaats van uit een losse
// tweede mock die per test bijgesteld moet worden.
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

type Row = { id: string; user_id: string; iban_encrypted: string | null; is_active: boolean | null }

/** Onthoudt welke kolommen de route opvroeg, zodat test 1 daar iets over kan zeggen. */
let selectedColumns = ''
/** Onthoudt of de route zelf op user_id versmalde — dat mag hij niet, zie de test. */
let appliedUserIdFilter = false

function buildClient(rows: Row[], opts: { user?: string | null; readError?: string } = {}) {
  const user = opts.user === undefined ? USER : opts.user
  return {
    auth: {
      getClaims: async () => ({
        data: user ? { claims: { sub: user } } : null,
        error: user ? null : { message: 'no session' },
      }),
    },
    from: (table: string) => {
      if (table !== 'bank_accounts') throw new Error(`onverwachte tabel: ${table}`)
      let filtered = rows
      const chain = {
        select(cols: string) {
          selectedColumns = cols
          return chain
        },
        eq(col: string, val: string) {
          if (col === 'user_id') {
            appliedUserIdFilter = true
            filtered = filtered.filter((r) => r.user_id === val)
          }
          return chain
        },
        not(col: string, op: string, _val: null) {
          if (col === 'iban_encrypted' && op === 'is') {
            filtered = filtered.filter((r) => r.iban_encrypted !== null)
          }
          return chain
        },
        then(resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) {
          if (opts.readError) return resolve({ data: null, error: { message: opts.readError } })
          return resolve({ data: filtered, error: null })
        },
      }
      return chain
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  selectedColumns = ''
  appliedUserIdFilter = false
  // Standaard: `enc:<iban>` → `<iban>`; alles anders is "onleesbaar".
  mockDecryptField.mockImplementation((c: string | null) => {
    if (c === null) return null
    if (typeof c === 'string' && c.startsWith('enc:')) return c.slice(4)
    throw new Error('geen geldige ciphertext')
  })
})

describe('GET /api/own-accounts/ibans', () => {
  it('leest iban_encrypted en NOOIT de plaintext iban-kolom', async () => {
    mockCreateClient.mockResolvedValue(buildClient([
      { id: 'a1', user_id: USER, iban_encrypted: 'enc:NL91ABNA0417164300', is_active: true },
    ]))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.accounts).toEqual([
      { id: 'a1', iban: 'NL91ABNA0417164300', is_active: true },
    ])
    // De harde eis: de kolomlijst noemt de versleutelde kolom en niet de
    // plaintext-kolom. `iban_encrypted` bevat "iban" als substring, dus we
    // toetsen op de kolomlijst-tokens in plaats van op `includes('iban')`.
    const columns = selectedColumns.split(',').map((c) => c.trim())
    expect(columns).toContain('iban_encrypted')
    expect(columns).not.toContain('iban')
  })

  it('telt een onleesbare rij en laat hem uit de lijst — de teller is de veiligheidsklep', async () => {
    mockCreateClient.mockResolvedValue(buildClient([
      { id: 'a1', user_id: USER, iban_encrypted: 'enc:NL91ABNA0417164300', is_active: true },
      { id: 'a2', user_id: USER, iban_encrypted: 'legacy-zonder-prefix', is_active: true },
    ]))

    const body = await (await GET()).json()

    expect(body.accounts).toHaveLength(1)
    expect(body.accounts[0].id).toBe('a1')
    // Zónder deze teller zou de respons niet te onderscheiden zijn van "deze
    // gebruiker heeft één rekening", en zou a2's overboekingen stil als
    // inkomsten/uitgaven worden geboekt.
    expect(body.unreadable).toBe(1)
  })

  it('laat RLS de grens zijn en filtert NIET zelf op user_id', async () => {
    // De SELECT-policy op `bank_accounts` is huishoud-verbreed:
    //   (auth.uid() = user_id) OR (ownership='shared' AND household_id = user_household_id())
    // Geen van de client-reads die deze route vervangt had een `user_id`-filter,
    // dus de GEDEELDE rekening van je partner telde altijd al mee als eigen
    // rekening. Zou de route alsnog op `user_id` filteren, dan verdween die stil
    // uit de identifier-set en werd elke overboeking naar de gezamenlijke
    // huishoudrekening voortaan als echte inkomst én uitgave geboekt.
    //
    // De stub past de RLS-poort niet na — hij levert precies wat de policy zou
    // doorlaten. Wat deze test bewijst: de route gooit daar zelf geen extra
    // versmalling overheen.
    mockCreateClient.mockResolvedValue(buildClient([
      { id: 'mine', user_id: USER, iban_encrypted: 'enc:NL01BANK0000000001', is_active: true },
      { id: 'shared-van-partner', user_id: 'user-2', iban_encrypted: 'enc:NL02BANK0000000002', is_active: true },
    ]))

    const body = await (await GET()).json()

    expect(body.accounts.map((a: { id: string }) => a.id)).toEqual(['mine', 'shared-van-partner'])
    expect(appliedUserIdFilter).toBe(false)
  })

  it('laat een leeg ontsleuteld resultaat vallen — een lege IBAN is geen identifier', async () => {
    // De twee `iban = ''`-rijen uit de onboarding-opruiming zijn nooit versleuteld;
    // deze test dekt de variant waarin er ooit tóch een lege string in de
    // versleutelde kolom belandt. Zou die als identifier meelopen, dan matcht hij
    // op élke lege tegenpartij-IBAN.
    mockCreateClient.mockResolvedValue(buildClient([
      { id: 'leeg', user_id: USER, iban_encrypted: 'enc:', is_active: true },
      { id: 'echt', user_id: USER, iban_encrypted: 'enc:NL91ABNA0417164300', is_active: true },
    ]))

    const body = await (await GET()).json()

    expect(body.accounts.map((a: { id: string }) => a.id)).toEqual(['echt'])
    expect(body.unreadable).toBe(0)
  })

  it('geeft is_active mee zodat consumenten hun eigen filter houden', async () => {
    // De route filtert bewust NIET op is_active: de importpagina en de
    // categorisatie tellen alleen actieve rekeningen mee, de transferkoppeling
    // werkt op een expliciete id-lijst. Hier filteren zou stil gedrag veranderen.
    mockCreateClient.mockResolvedValue(buildClient([
      { id: 'actief', user_id: USER, iban_encrypted: 'enc:NL01BANK0000000001', is_active: true },
      { id: 'inactief', user_id: USER, iban_encrypted: 'enc:NL02BANK0000000002', is_active: false },
    ]))

    const body = await (await GET()).json()

    expect(body.accounts).toEqual([
      { id: 'actief', iban: 'NL01BANK0000000001', is_active: true },
      { id: 'inactief', iban: 'NL02BANK0000000002', is_active: false },
    ])
  })

  it('een leesfout wordt een 500, geen lege lijst', async () => {
    mockCreateClient.mockResolvedValue(buildClient([], { readError: 'connection reset' }))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(500)
    // Geen rauwe DB-melding naar de client (ADR 0044).
    expect(JSON.stringify(body)).not.toContain('connection reset')
  })

  it('niet ingelogd → 401', async () => {
    mockCreateClient.mockResolvedValue(buildClient([], { user: null }))

    const res = await GET()

    expect(res.status).toBe(401)
  })
})
