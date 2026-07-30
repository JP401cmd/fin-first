import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * H1 (bug-fix): GET /api/bank-connect/callback maakt de cash-asset/bankrekening
 * aan met een 0-startwaarde en roept daarna `syncAccountBalance()` aan
 * ("Stap 5" in de route), zodat een EERSTE koppeling (ook via onboarding, dat
 * nooit terugkomt op "Synchroniseer nu") meteen het echte saldo meetelt in het
 * netto vermogen in plaats van tot een handmatige klik op €0 te blijven staan.
 *
 * Dit is de "échte" vitest-dekking naast de modellerende regressie-case
 * (`ob-bank-callback-balance-sync-on-connect` in
 * lib/regression-tests/suites/bank-connectie-flow.ts): een volledige,
 * end-to-end GET-aanroep tegen de echte route-handler, met alleen de externe
 * randen (Supabase, TrueLayer-client, veld-encryptie, de saldo-sync zelf)
 * gestubt — zie het patroon in app/auth/callback/route.test.ts.
 *
 * Bewust een minimale "happy path"-scenario (één nieuwe rekening, geen
 * bestaande koppeling/IBAN-match) — genoeg om te bewijzen dat stap 5
 * (saldo-sync) daadwerkelijk op stap 4 (koppeling aangemaakt) volgt.
 */

// vi.hoisted: deze vier mocks worden door meerdere vi.mock-factories gebruikt,
// en vi.mock zelf wordt naar de top van het bestand gehoist — zonder
// vi.hoisted() zouden de factories een niet-geïnitialiseerde `const` lezen.
const {
  mockCreateClient,
  mockExchangeCode,
  mockGetAccounts,
  mockGetBaseUrls,
  mockSyncAccountBalance,
  mockDecryptField,
  mockSyncBudgetingActive,
  mockSetBudgetTracking,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockExchangeCode: vi.fn(),
  mockGetAccounts: vi.fn(),
  mockGetBaseUrls: vi.fn(),
  mockSyncAccountBalance: vi.fn(),
  mockDecryptField: vi.fn(),
  mockSyncBudgetingActive: vi.fn(),
  mockSetBudgetTracking: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/truelayer/client', () => ({
  exchangeCode: mockExchangeCode,
  getAccounts: mockGetAccounts,
  getBaseUrls: mockGetBaseUrls,
}))

vi.mock('@/lib/truelayer/balance-sync', () => ({
  syncAccountBalance: mockSyncAccountBalance,
}))

// Stap 5b (budget-module-gate meesyncen) roept de ECHTE syncBudgetingActive aan,
// die zelf weer .from('assets') en .from('profiles') leest — bovenop de
// tabel-gequeuede stub die deze suite al voor de callback zelf gebruikt. Zonder
// deze mock lopen die queues droog op de reads die de helper doet (verkeerde,
// verwarrende rode reden). Per-test controleerbaar via
// mockSyncBudgetingActive.mockResolvedValue/mockRejectedValueOnce.
vi.mock('@/lib/budgeting-active', () => ({
  syncBudgetingActive: mockSyncBudgetingActive,
}))

// Zelfde reden als hierboven, één laag dieper: sinds het eigenaarsbesluit van
// 30 juli zet het SC-13-herstel in stap 2b óók de budgettracking terug, en het
// doet dat via `setBudgetTracking` — de ENE schrijver van dat drieluik. Die
// helper leest en schrijft zelf `assets`, de companion-rij én de module-gate,
// dus ongemockt zou hij de tabel-queues van deze suite droogleggen op writes die
// niets met de callback te maken hebben. Het drieluik heeft eigen dekking
// (`lib/truelayer/cash-asset-backfill.test.ts`,
// `app/api/assets/toggle-budget/route.test.ts`); hier telt of de callback
// delegeert.
vi.mock('@/lib/budget-tracking', () => ({
  setBudgetTracking: mockSetBudgetTracking,
}))

vi.mock('@/lib/crypto/field-encryption', () => ({
  blindIndex: (s: string) => `hash:${s}`,
  encryptField: (s: string | null) => (s === null || s === undefined ? null : `enc:${s}`),
  // Was ontbrekend in deze mock (bug-fix review): elke test die stap 2b (de
  // cash-as-asset backfill voor hergebruikte rekeningen, die iban_encrypted via
  // decryptField() leest) doorloopt, knalde eerder op "No 'decryptField' export
  // is defined on the mock" — een fout die niets met het geteste gedrag te
  // maken had. Per-test controleerbaar via mockDecryptField.mockReturnValue/
  // mockImplementation (zie de stap 2b-tests hieronder).
  decryptField: mockDecryptField,
}))

import { GET } from './route'

const ORIGIN = 'https://app.trifinity.nl'

/**
 * Fase 6: `loadOccupyingLinks` doet één extra leesronde op
 * `bank_connection_accounts`, direct ná de identiteitslookups (schakel 1) en
 * vóór de per-rekening-lus. Hij levert de rekeningen die BUITEN deze callback al
 * een actieve koppeling dragen; die zijn sinds de partiële unieke index verboden
 * en moeten door schakel 2/3 overgeslagen worden. In de meeste scenario's is die
 * lijst leeg — deze constante zet die leesronde in de queue.
 */
const NO_OCCUPYING_LINKS = { data: [] }

function requestFor(path: string) {
  return new Request(`${ORIGIN}${path}`)
}

// ── Generieke, tabel-gequeuede Supabase-stub ────────────────────────────────
// Elke `.from(table)` levert een chainable object terug; select/insert/update/
// eq/order/limit geven zichzelf terug (chaining), `.single()`/`.maybeSingle()`
// en een "kaal" awaited chain-einde (via `.then()`) consumeren de eerstvolgende
// canned response uit de queue van die tabel — in de exacte volgorde waarin de
// route-handler ze aanroept. Filter-argumenten worden genegeerd: dit is geen
// echte database, alleen een deterministische call-volgorde-speler.
//
// `.insert()`/`.update()` worden bovendien in `calls` getrackt (tabel/op/data),
// zodat tests kunnen asserten WÁT geschreven werd — niet alleen dat de route
// zonder crash doorliep. Nodig voor o.a. de assetnaam bij de cash-as-asset
// backfill (stap 2b) en de garantie dat de callback nooit een
// `daily_requests`-key schrijft (die teller is voorbehouden aan de sync-route).
function makeQueuedSupabaseStub(queues: Record<string, Array<{ data: unknown; error?: unknown }>>) {
  const calls: Array<{ table: string; op: 'insert' | 'update'; data: Record<string, unknown> }> = []

  function nextFor(table: string) {
    const queue = queues[table]
    if (!queue || queue.length === 0) {
      throw new Error(`Geen canned response meer gequeued voor tabel "${table}"`)
    }
    return queue.shift()!
  }

  function makeBuilder(table: string): any {
    const builder: any = {
      select: () => builder,
      insert: (data: Record<string, unknown>) => {
        calls.push({ table, op: 'insert', data })
        return builder
      },
      update: (data: Record<string, unknown>) => {
        calls.push({ table, op: 'update', data })
        return builder
      },
      eq: () => builder,
      in: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => Promise.resolve(nextFor(table)),
      maybeSingle: () => Promise.resolve(nextFor(table)),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(nextFor(table)).then(resolve, reject),
    }
    return builder
  }

  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => makeBuilder(table),
    calls,
  }
}

/**
 * Bouwt een verse set gequeuede responses voor het "eerste koppeling"-happy
 * path (nieuwe bankrekening, geen bestaande link/IBAN-match) — het scenario
 * dat zowel de saldo-sync-call (H1) als het niet-fatale-saldo-pad en de
 * daily_requests-afwezigheid delen. Elke aanroep levert een NIEUWE, ongebruikte
 * queue — de stub-queues zijn one-shot (shift-based) en kunnen niet hergebruikt
 * worden tussen tests.
 */
function makeNewAccountHappyPathStub() {
  const connectionRow = { id: 'conn-1', user_id: 'user-1', provider_name: 'ING', status: 'pending' }
  const tokens = { access_token: 'tok-123', refresh_token: 'rt-123', expires_in: 3600 }
  const tlAccounts = [
    {
      account_id: 'ext-acc-1',
      account_type: 'TRANSACTION',
      display_name: 'Main Account',
      currency: 'EUR',
      account_number: { iban: 'NL91ABNA0417164300' },
    },
  ]

  const stub = makeQueuedSupabaseStub({
    bank_connections: [
      { data: connectionRow }, // select ... .single() (connection lookup)
      { data: null }, // update(...).eq(...) bare await (token exchange write)
      { data: [{ id: connectionRow.id, status: 'active', created_at: new Date().toISOString() }] }, // orphan cleanup source
    ],
    bank_connection_accounts: [
      { data: null }, // select ....maybeSingle() (existingLink lookup) → none
      NO_OCCUPYING_LINKS, // loadOccupyingLinks (fase 6)
      { data: null }, // insert(...) bare await (nieuwe koppeling)
      { data: [] }, // select connection_id .eq(user_id) (orphan cleanup "in use" set)
    ],
    bank_accounts: [
      { data: null }, // select id .maybeSingle() (IBAN-fallback) → geen match
      { data: { id: 'ba-new' } }, // insert(...).select('id').single() (nieuwe bankrekening)
    ],
    assets: [
      { data: { id: 'asset-new' } }, // insert(...).select('id').single() (nieuwe cash-asset)
    ],
    profiles: [
      { data: { onboarding_completed: true } }, // select onboarding_completed .single()
    ],
  })

  return { stub, connectionRow, tokens, tlAccounts }
}

beforeEach(() => {
  mockCreateClient.mockReset()
  mockExchangeCode.mockReset()
  mockGetAccounts.mockReset()
  mockGetBaseUrls.mockReset()
  mockSyncAccountBalance.mockReset()
  mockDecryptField.mockReset()
  mockSyncBudgetingActive.mockReset().mockResolvedValue(true)
  mockSetBudgetTracking.mockReset().mockResolvedValue({
    ok: true,
    asset: { id: 'asset-ba-terug', has_budget_tracking: true, name: 'ING' },
    budgetingActive: true,
  })
  // De route valt terug op NEXT_PUBLIC_APP_URL voor zijn redirects (niet de
  // request-origin) — expliciet zetten zodat de redirect-assertie ondubbelzinnig is.
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN
})

/**
 * Stap 5b (route.ts): ná de rekeningen-lus, vóór de verweesde-connecties-
 * opruiming (stap 6), synct de callback `profiles.budgeting_active` mee —
 * anders bleef budgetteren "uit" na een eerste bankkoppeling tot de gebruiker
 * toevallig een ánder schrijfpad raakte dat de gate wél herberekent.
 */
describe('GET /api/bank-connect/callback — stap 5b: budget-module-gate meesyncen', () => {
  it('roept syncBudgetingActive() aan met de user-id ná een geslaagde koppeling', async () => {
    const { stub, tokens, tlAccounts } = makeNewAccountHappyPathStub()

    mockCreateClient.mockResolvedValue(stub)
    mockExchangeCode.mockResolvedValue(tokens)
    mockGetBaseUrls.mockResolvedValue({ authUrl: 'https://auth.truelayer.com', dataUrl: 'https://api.truelayer.com' })
    mockGetAccounts.mockResolvedValue(tlAccounts)

    const res = await GET(requestFor('/api/bank-connect/callback?code=abc&state=conn-1:user1234-1710000000'))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    expect(mockSyncBudgetingActive).toHaveBeenCalledTimes(1)
    expect(mockSyncBudgetingActive).toHaveBeenCalledWith(stub, 'user-1')
  })

  it('een falende syncBudgetingActive laat de koppeling niet stranden (geen redirect naar ?error=callback_failed)', async () => {
    const { stub, tokens, tlAccounts } = makeNewAccountHappyPathStub()

    mockCreateClient.mockResolvedValue(stub)
    mockExchangeCode.mockResolvedValue(tokens)
    mockGetBaseUrls.mockResolvedValue({ authUrl: 'https://auth.truelayer.com', dataUrl: 'https://api.truelayer.com' })
    mockGetAccounts.mockResolvedValue(tlAccounts)
    mockSyncBudgetingActive.mockRejectedValueOnce(new Error('budgeting_active bijwerken mislukt: db down'))

    const res = await GET(requestFor('/api/bank-connect/callback?code=abc&state=conn-1:user1234-1710000000'))

    // Best-effort (`.catch(() => undefined)` in de route): de koppeling zelf
    // (stap 1-4, al voltooid) mag door een gefaalde gate-write nooit in de
    // catch-tak van de route belanden.
    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    expect(mockSyncBudgetingActive).toHaveBeenCalledWith(stub, 'user-1')
  })
})

describe('GET /api/bank-connect/callback — H1: saldo-sync op eerste koppeling', () => {
  it('roept syncAccountBalance() aan voor een nieuw gekoppelde rekening (niet-fataal, na stap 4)', async () => {
    const connectionRow = { id: 'conn-1', user_id: 'user-1', provider_name: 'ING', status: 'pending' }
    const tokens = { access_token: 'tok-123', refresh_token: 'rt-123', expires_in: 3600 }
    const tlAccounts = [
      {
        account_id: 'ext-acc-1',
        account_type: 'TRANSACTION',
        display_name: 'Main Account',
        currency: 'EUR',
        account_number: { iban: 'NL91ABNA0417164300' },
      },
    ]

    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: connectionRow }, // select ... .single() (connection lookup)
        { data: null }, // update(...).eq(...) bare await (token exchange write)
        { data: [{ id: connectionRow.id, status: 'active' }] }, // select id,status .eq(user_id) (orphan cleanup source)
      ],
      bank_connection_accounts: [
        { data: null }, // select ....maybeSingle() (existingLink lookup) → none
        NO_OCCUPYING_LINKS, // loadOccupyingLinks (fase 6)
        { data: null }, // insert(...) bare await (nieuwe koppeling)
        { data: [] }, // select connection_id .eq(user_id) (orphan cleanup "in use" set)
      ],
      bank_accounts: [
        { data: null }, // select id .maybeSingle() (IBAN-fallback) → geen match
        { data: { id: 'ba-new' } }, // insert(...).select('id').single() (nieuwe bankrekening)
      ],
      assets: [
        { data: { id: 'asset-new' } }, // insert(...).select('id').single() (nieuwe cash-asset)
      ],
      profiles: [
        { data: { onboarding_completed: true } }, // select onboarding_completed .single()
      ],
    })

    mockCreateClient.mockResolvedValue(stub)
    mockExchangeCode.mockResolvedValue(tokens)
    mockGetBaseUrls.mockResolvedValue({ authUrl: 'https://auth.truelayer.com', dataUrl: 'https://api.truelayer.com' })
    mockGetAccounts.mockResolvedValue(tlAccounts)

    const res = await GET(requestFor('/api/bank-connect/callback?code=abc&state=conn-1:user1234-1710000000'))

    // Sanity: de stub dreef de route helemaal tot aan het succes-redirect —
    // als dit niet klopt, ligt de oorzaak in de stub-bekabeling, niet in het
    // ontbreken van de saldo-sync (voorkomt fout-positieve rode reden).
    const location = res.headers.get('location')
    expect(location).toBe(`${ORIGIN}/core/cash/connect/success`)

    // De kern van deze test: de callback maakt de rekening/asset aan (stap 3+4)
    // én synchroniseert daarna het saldo (stap 5) voor exact die rekening.
    expect(mockSyncAccountBalance).toHaveBeenCalledWith(
      stub,
      expect.objectContaining({
        accessToken: tokens.access_token,
        dataUrl: 'https://api.truelayer.com',
        externalAccountId: 'ext-acc-1',
        bankAccountId: 'ba-new',
      }),
    )
  })
})

/**
 * H1-vervolg (bug-fix review): er was nog geen dekking voor het geval waar het
 * ontwerp van H1 juist op leunt — een falende saldo-call mag de koppeling
 * nooit slopen. syncAccountBalance() gooit desnoods hard (zie
 * lib/truelayer/balance-sync.ts), maar de callback vangt die throw
 * niet-fataal af (stap 5: `try { await syncAccountBalance(...) } catch
 * (balanceErr) { console.error(...) }`) en loopt gewoon door naar het
 * succes-redirect.
 */
describe('GET /api/bank-connect/callback — falende saldo-sync is niet-fataal', () => {
  it('syncAccountBalance() rejecte(r)t → callback redirect blijft naar /core/cash/connect/success', async () => {
    const { stub, tokens, tlAccounts } = makeNewAccountHappyPathStub()

    mockCreateClient.mockResolvedValue(stub)
    mockExchangeCode.mockResolvedValue(tokens)
    mockGetBaseUrls.mockResolvedValue({ authUrl: 'https://auth.truelayer.com', dataUrl: 'https://api.truelayer.com' })
    mockGetAccounts.mockResolvedValue(tlAccounts)
    mockSyncAccountBalance.mockRejectedValue(new Error('TrueLayer 500 tijdens saldo-ophalen'))

    const res = await GET(requestFor('/api/bank-connect/callback?code=abc&state=conn-1:user1234-1710000000'))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    expect(mockSyncAccountBalance).toHaveBeenCalled()
  })
})

/**
 * Bug-fix review, punt 5: de regressie-case 'ob-bank-callback-balance-sync-on-connect'
 * leunde op een negatieve bron-inspectie (`!/daily_requests\s*:/.test(src)`) —
 * een herformulering van een verklarende comment kon de suite al rood maken
 * zonder gedragswijziging. Die case is verwijderd; de garantie ("de callback
 * schrijft de daily_requests-teller nooit, die is voorbehouden aan de
 * sync-route") wordt hier bewezen door de daadwerkelijke update-payloads van
 * de Supabase-stub te verzamelen.
 */
describe('GET /api/bank-connect/callback — daily_requests blijft voorbehouden aan de sync-route', () => {
  it('geen enkele update-payload tijdens de callback bevat een daily_requests-key', async () => {
    const { stub, tokens, tlAccounts } = makeNewAccountHappyPathStub()

    mockCreateClient.mockResolvedValue(stub)
    mockExchangeCode.mockResolvedValue(tokens)
    mockGetBaseUrls.mockResolvedValue({ authUrl: 'https://auth.truelayer.com', dataUrl: 'https://api.truelayer.com' })
    mockGetAccounts.mockResolvedValue(tlAccounts)

    const res = await GET(requestFor('/api/bank-connect/callback?code=abc&state=conn-1:user1234-1710000000'))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)

    const updatePayloads = stub.calls.filter((c) => c.op === 'update').map((c) => c.data)
    expect(updatePayloads.length).toBeGreaterThan(0)
    for (const payload of updatePayloads) {
      expect(payload).not.toHaveProperty('daily_requests')
    }
  })
})

/**
 * Bug-fix review, punt 3: de field-encryption-mock miste `decryptField`, dus
 * elke test die stap 2b (de cash-as-asset backfill voor een hergebruikte
 * rekening zonder linked_asset_id) daadwerkelijk doorliep, knalde op "No
 * 'decryptField' export is defined on the mock" — vóórdat de eigenlijke
 * try/catch-wrapper (`decryptIbanForLabel` in route.ts) ooit bewezen werd.
 * Beide takken hieronder drijven stap 2b nu écht door de route-handler.
 *
 * `tlAccounts` heeft bewust GEEN `account_number.iban`: alleen dan valt de
 * route terug op `decryptIbanForLabel(reused.iban_encrypted)` in plaats van de
 * IBAN uit de TrueLayer-respons zelf te gebruiken (`iban ?? decryptIbanForLabel(...)`).
 */
describe('GET /api/bank-connect/callback — stap 2b: iban_encrypted ontsleuteld via decryptIbanForLabel', () => {
  function makeReusedAccountStub(ibanEncrypted: string) {
    const connectionRow = { id: 'conn-1', user_id: 'user-1', provider_name: 'ING', status: 'pending' }
    const tokens = { access_token: 'tok-123', refresh_token: 'rt-123', expires_in: 3600 }
    const tlAccounts = [
      {
        account_id: 'ext-acc-1',
        account_type: 'TRANSACTION',
        display_name: 'Main Account',
        currency: 'EUR',
        // Bewust geen account_number — zie docstring hierboven.
      },
    ]

    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: connectionRow }, // select ... .single() (connection lookup)
        { data: null }, // update(...).eq(...) bare await (token exchange write)
        { data: [{ id: connectionRow.id, status: 'active', created_at: new Date().toISOString() }] }, // orphan cleanup source
      ],
      bank_connection_accounts: [
        { data: { id: 'link-1', bank_account_id: 'ba-reused' } }, // existingLink: hergebruikte rekening
        NO_OCCUPYING_LINKS, // loadOccupyingLinks (fase 6)
        { data: null }, // stap 4: update bestaande koppeling (bare await)
        { data: [] }, // stap 6: select connection_id (orphan cleanup "in use" set)
      ],
      bank_accounts: [
        { data: { id: 'ba-reused', linked_asset_id: null, iban_encrypted: ibanEncrypted } }, // stap 2b lookup
        { data: null }, // stap 2b: linked_asset_id backfill-update (bare await)
      ],
      assets: [
        { data: { id: 'asset-backfill-1' } }, // insert(...).select('id').single() (backfill-asset)
      ],
      profiles: [
        { data: { onboarding_completed: true } }, // select onboarding_completed .single()
      ],
    })

    return { stub, connectionRow, tokens, tlAccounts }
  }

  it('(a) ontsleutelbare iban_encrypted → backfill-asset krijgt naam met de laatste 4 tekens', async () => {
    mockDecryptField.mockReturnValue('NL91ABNA0417164300')

    const { stub, tokens, tlAccounts } = makeReusedAccountStub('v1:legacy-ciphertext')

    mockCreateClient.mockResolvedValue(stub)
    mockExchangeCode.mockResolvedValue(tokens)
    mockGetBaseUrls.mockResolvedValue({ authUrl: 'https://auth.truelayer.com', dataUrl: 'https://api.truelayer.com' })
    mockGetAccounts.mockResolvedValue(tlAccounts)

    const res = await GET(requestFor('/api/bank-connect/callback?code=abc&state=conn-1:user1234-1710000000'))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    expect(mockDecryptField).toHaveBeenCalledWith('v1:legacy-ciphertext')

    const assetInsert = stub.calls.find((c) => c.table === 'assets' && c.op === 'insert')
    expect(assetInsert).toBeDefined()
    expect(assetInsert?.data.name).toBe('ING 4300')
  })

  it('(b) decryptField gooit (ciphertext zonder versie-prefix) → callback loopt door, assetnaam degradeert naar provider_name', async () => {
    mockDecryptField.mockImplementation(() => {
      throw new Error('[field-encryption] Ciphertext is missing the "v1:" version prefix. Got: "legacy-plaintext..."')
    })

    const { stub, tokens, tlAccounts } = makeReusedAccountStub('legacy-plaintext-without-prefix')

    mockCreateClient.mockResolvedValue(stub)
    mockExchangeCode.mockResolvedValue(tokens)
    mockGetBaseUrls.mockResolvedValue({ authUrl: 'https://auth.truelayer.com', dataUrl: 'https://api.truelayer.com' })
    mockGetAccounts.mockResolvedValue(tlAccounts)

    const res = await GET(requestFor('/api/bank-connect/callback?code=abc&state=conn-1:user1234-1710000000'))

    // De kern van deze tak: een niet-gebackfillde rij laat de OAuth-callback
    // NOOIT stranden — decryptIbanForLabel() vangt de throw en levert null.
    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)

    const assetInsert = stub.calls.find((c) => c.table === 'assets' && c.op === 'insert')
    expect(assetInsert).toBeDefined()
    expect(assetInsert?.data.name).toBe('ING')
  })
})

// ══ Fase 5 — de precedentieketen, consume-once, N rekeningen en rekeningtype ══
//
// Vier schakels, in deze volgorde:
//   1. `external_account_id`                      (identiteit — wint altijd)
//   2. `bank_connections.target_bank_account_id`  (de expliciete keuze; alleen bij
//      `link_intent = 'nieuw'`, alleen voor de eerste rekening die door 1 valt)
//   3. `iban_hash`                                (de heuristiek)
//   4. nieuwe rekening + cash-bezit aanmaken
//
// Elke omkering van die volgorde is een bekend defect, dus elke schakel heeft
// hieronder een eigen test — inclusief de negatieve gevallen (schakel 3 mag NIET
// draaien als 2 al bond; schakel 2 mag NIET draaien bij een herautorisatie).

const TL_ACCOUNT_WITH_IBAN = {
  account_id: 'ext-acc-1',
  account_type: 'TRANSACTION',
  display_name: 'Main Account',
  currency: 'EUR',
  account_number: { iban: 'NL91ABNA0417164300' },
}

/** Pending-rij zoals `auth-link` hem achterlaat, met de twee fase-4-kolommen. */
function pendingConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    user_id: 'user-1',
    provider_name: 'ING',
    status: 'pending',
    target_bank_account_id: null,
    link_intent: 'nieuw',
    ...overrides,
  }
}

const TOKENS = { access_token: 'tok-123', refresh_token: 'rt-123', expires_in: 3600 }

function wire(stub: unknown, tlAccounts: unknown[]) {
  mockCreateClient.mockResolvedValue(stub)
  mockExchangeCode.mockResolvedValue(TOKENS)
  mockGetBaseUrls.mockResolvedValue({ authUrl: 'https://auth.truelayer.com', dataUrl: 'https://api.truelayer.com' })
  mockGetAccounts.mockResolvedValue(tlAccounts)
}

const CALLBACK_URL = '/api/bank-connect/callback?code=abc&state=conn-1:user1234-1710000000'

/** De koppelrij-writes die stap 4 deed (insert of update), in aanroepvolgorde. */
function linkWrites(stub: { calls: Array<{ table: string; op: string; data: Record<string, unknown> }> }) {
  return stub.calls.filter((c) => c.table === 'bank_connection_accounts')
}

/** De doelrekening heeft al een cash-bezit → stap 2b hoeft niets bij te maken. */
function carrierWithAsset(id: string, accountType = 'checking') {
  return { data: { id, linked_asset_id: `asset-${id}`, iban_encrypted: null, account_type: accountType } }
}

/**
 * De reactivatie-lezing die stap 2b sinds fase 7 op een BESTAAND cash-bezit doet
 * (SC-13). `is_active: true` = zichtbaar, dus niets te schrijven.
 *
 * Hoort direct achter elke {@link carrierWithAsset} in de `assets`-queue: de
 * backfill leest éérst de bankrekening (`bank_accounts`) en dan het bezit
 * (`assets`).
 */
function activeAssetFor(bankAccountId: string) {
  return { data: { id: `asset-${bankAccountId}`, is_active: true } }
}

/**
 * De twee leesronden van `loadTargetAccount` (schakel 2 toetst de
 * GESCHIKTHEID van de voorkeur op callback-moment, niet alleen op schrijfmoment
 * — een tussentijds gedeactiveerd cash-bezit mag geen koppeling dragen, SC-13).
 * Deze responses staan vóór de per-rekening-lus in de queue.
 */
function eligibleTargetLookup(id: string) {
  return {
    account: { data: { id, name: 'Doelrekening', bank_name: 'ING', iban: 'NL91ABNA0417164300', is_active: true, linked_asset_id: `asset-${id}` } },
    asset: { data: { id: `asset-${id}`, is_active: true, has_budget_tracking: true } },
  }
}

const ORPHAN_SOURCE = (connectionId = 'conn-1') => ({
  data: [{ id: connectionId, status: 'active', created_at: new Date().toISOString() }],
})

describe('GET /api/bank-connect/callback — fase 5: schakel 2 (de expliciete keuze)', () => {
  it('bindt de gekozen doelrekening en maakt GEEN tweede rekening of cash-bezit aan (criterium a)', async () => {
    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: pendingConnection({ target_bank_account_id: 'ba-target' }) },
        { data: null }, // token/status-update
        { data: null }, // consume-once
        ORPHAN_SOURCE(),
      ],
      bank_connection_accounts: [
        { data: null }, // schakel 1: geen identiteit
        NO_OCCUPYING_LINKS, // fase 6: geen rekening is bezet
        { data: null }, // stap 4: nieuwe koppelrij
        { data: [] }, // orphan cleanup
      ],
      bank_accounts: [eligibleTargetLookup('ba-target').account, carrierWithAsset('ba-target')],
      assets: [eligibleTargetLookup('ba-target').asset, activeAssetFor('ba-target')],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])

    const res = await GET(requestFor(CALLBACK_URL))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)

    // Geen aanmaak-tak: dat is de hele belofte van de expliciete keuze.
    expect(stub.calls.filter((c) => c.table === 'assets' && c.op === 'insert')).toHaveLength(0)
    expect(stub.calls.filter((c) => c.table === 'bank_accounts' && c.op === 'insert')).toHaveLength(0)

    const link = linkWrites(stub)[0]
    expect(link.op).toBe('insert')
    expect(link.data.bank_account_id).toBe('ba-target')
    expect(link.data.external_account_id).toBe('ext-acc-1')

    expect(mockSyncAccountBalance).toHaveBeenCalledWith(
      stub,
      expect.objectContaining({ bankAccountId: 'ba-target' }),
    )
  })

  it('wint van de IBAN-heuristiek: schakel 3 wordt niet eens bevraagd', async () => {
    // Slechts EEN canned response voor bank_accounts (de stap 2b-lookup). Zou de
    // route eerst de iban_hash-fallback draaien, dan verbruikt die deze response
    // en loopt de queue leeg — de test faalt dan op een lege queue in plaats van
    // stil de verkeerde volgorde te accepteren.
    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: pendingConnection({ target_bank_account_id: 'ba-target' }) },
        { data: null },
        { data: null },
        ORPHAN_SOURCE(),
      ],
      bank_connection_accounts: [{ data: null }, NO_OCCUPYING_LINKS, { data: null }, { data: [] }],
      bank_accounts: [eligibleTargetLookup('ba-target').account, carrierWithAsset('ba-target')],
      assets: [eligibleTargetLookup('ba-target').asset, activeAssetFor('ba-target')],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])

    const res = await GET(requestFor(CALLBACK_URL))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    expect(linkWrites(stub)[0].data.bank_account_id).toBe('ba-target')
  })
})

describe('GET /api/bank-connect/callback — fase 5: schakel 1 (identiteit) wint van de keuze', () => {
  it('een al gekoppelde externe rekening blijft op haar eigen rij, ook met een andere voorkeur', async () => {
    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: pendingConnection({ target_bank_account_id: 'ba-target' }) },
        { data: null },
        { data: null }, // consume-once (ook als de voorkeur niet toegepast is)
        ORPHAN_SOURCE(),
      ],
      bank_connection_accounts: [
        { data: { id: 'link-1', bank_account_id: 'ba-identiteit' } }, // schakel 1 treft
        // Fase 6: diezelfde rij komt terug als "bezet". Ze mag zichzelf níet
        // blokkeren — de lus werkt haar bij, ze maakt geen tweede rij aan.
        { data: [{ id: 'link-1', bank_account_id: 'ba-identiteit', bank_connections: { provider_name: 'ING' } }] },
        { data: null }, // stap 4: bestaande koppelrij bijwerken
        { data: [] },
      ],
      bank_accounts: [carrierWithAsset('ba-identiteit')],
      assets: [activeAssetFor('ba-identiteit')],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])

    const res = await GET(requestFor(CALLBACK_URL))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)

    const link = linkWrites(stub)[0]
    expect(link.op).toBe('update')
    expect(link.data.bank_account_id).toBe('ba-identiteit')
    // De kern: de voorkeur verhangt een bestaande koppeling NIET.
    expect(link.data.bank_account_id).not.toBe('ba-target')
  })
})

describe('GET /api/bank-connect/callback — fase 5: schakel 3 (iban_hash)', () => {
  it('bij link_intent = herautoriseren bindt de voorkeur alsnog — schakel 2 is daar een val-terug (fase 7)', async () => {
    // **Amendement op fase 5, besluit 3**, na de security-review van fase 7. Daar
    // sloeg `'herautoriseren'` schakel 2 volledig over, met "anders is `iban_hash` de
    // juiste val-terug" als motief. Die val-terug faalt precies op het pad waar het
    // herstel om gaat: schakel 3 filtert `bank_accounts.is_active = true`, en een
    // drager met `is_active = false` ("budgetteren staat uit") is op het herstelpad
    // een legitieme toestand. Mist de bank óók haar `external_account_id`, dan maakte
    // schakel 4 een VERSE rekening aan en landde het herstel ergens anders dan de
    // rekening die de gebruiker repareerde — met de historie verweesd op de oude rij.
    // De voorkeur werd dus weggeschreven en nooit geconsumeerd: dode data.
    //
    // Nu geldt schakel 2 op béide paden, strikt ná schakel 1 (identiteit wint
    // onverkort — dat pint de test hierboven, `ba-identiteit` boven `ba-target`).
    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: pendingConnection({ target_bank_account_id: 'ba-target', link_intent: 'herautoriseren' }) },
        { data: null },
        { data: null }, // consume-once
        ORPHAN_SOURCE(),
      ],
      bank_connection_accounts: [{ data: null }, NO_OCCUPYING_LINKS, { data: null }, { data: [] }],
      bank_accounts: [
        // GEEN geschiktheidstoets op dit pad (SC-13): de waarde is server-afgeleid uit
        // de koppelrij en de trigger borgt de eigenaar, dus er is geen `loadTargetAccount`.
        carrierWithAsset('ba-target'), // stap 4b: heeft al een cash-bezit
      ],
      assets: [activeAssetFor('ba-target')], // stap 4b: bezit is actief, niets te reactiveren
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])

    const res = await GET(requestFor(CALLBACK_URL))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    expect(linkWrites(stub)[0].data.bank_account_id).toBe('ba-target')
  })
})

describe('GET /api/bank-connect/callback — fase 5: consume-once', () => {
  it('nult target_bank_account_id na toepassing, en laat link_intent staan', async () => {
    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: pendingConnection({ target_bank_account_id: 'ba-target' }) },
        { data: null },
        { data: null },
        ORPHAN_SOURCE(),
      ],
      bank_connection_accounts: [{ data: null }, NO_OCCUPYING_LINKS, { data: null }, { data: [] }],
      bank_accounts: [eligibleTargetLookup('ba-target').account, carrierWithAsset('ba-target')],
      assets: [eligibleTargetLookup('ba-target').asset, activeAssetFor('ba-target')],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])
    await GET(requestFor(CALLBACK_URL))

    const connectionUpdates = stub.calls.filter((c) => c.table === 'bank_connections' && c.op === 'update')
    const consumed = connectionUpdates.filter((c) => 'target_bank_account_id' in c.data)

    expect(consumed).toHaveLength(1)
    expect(consumed[0].data.target_bank_account_id).toBeNull()

    // `link_intent` is een FEIT over deze koppelpoging, geen eenmalige
    // instructie: de callback raakt hem nooit aan.
    for (const update of connectionUpdates) {
      expect(update.data).not.toHaveProperty('link_intent')
    }
  })

  it('tweede callback op een al verbruikte voorkeur past niets meer toe en schrijft de kolom niet', async () => {
    // Dit is de toestand na consume-once: de kolom staat op null. De rekening
    // wordt dan volgens de gewone heuristiek behandeld, niet stil op de oude
    // voorkeur gebonden.
    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: pendingConnection({ target_bank_account_id: null }) },
        { data: null },
        ORPHAN_SOURCE(),
      ],
      bank_connection_accounts: [{ data: null }, NO_OCCUPYING_LINKS, { data: null }, { data: [] }],
      bank_accounts: [
        { data: null }, // schakel 3: geen iban-treffer
        { data: { id: 'ba-nieuw' } }, // schakel 4: aanmaak
      ],
      assets: [{ data: { id: 'asset-nieuw' } }],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])

    const res = await GET(requestFor(CALLBACK_URL))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    expect(linkWrites(stub)[0].data.bank_account_id).toBe('ba-nieuw')

    // Geen overbodige write op een kolom die al null is.
    const connectionUpdates = stub.calls.filter((c) => c.table === 'bank_connections' && c.op === 'update')
    for (const update of connectionUpdates) {
      expect(update.data).not.toHaveProperty('target_bank_account_id')
    }
  })
})

describe('GET /api/bank-connect/callback — fase 5: N rekeningen in één consent (criterium c)', () => {
  it('drie rekeningen, één voorkeur → drie koppelingen en de voorkeur bindt er precies één', async () => {
    const tlAccounts = [
      TL_ACCOUNT_WITH_IBAN,
      {
        account_id: 'ext-acc-2',
        account_type: 'TRANSACTION',
        display_name: 'Tweede rekening',
        currency: 'EUR',
        account_number: { iban: 'NL91ABNA0417160002' },
      },
      {
        account_id: 'ext-acc-3',
        account_type: 'TRANSACTION',
        display_name: 'Derde rekening',
        currency: 'EUR',
        account_number: {},
      },
    ]

    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: pendingConnection({ target_bank_account_id: 'ba-target' }) },
        { data: null },
        { data: null }, // consume-once
        ORPHAN_SOURCE(),
      ],
      bank_connection_accounts: [
        { data: null }, // schakel 1, rekening 1
        { data: null }, // schakel 1, rekening 2
        { data: null }, // schakel 1, rekening 3
        NO_OCCUPYING_LINKS, // fase 6: geen rekening is bezet
        { data: null }, // stap 4, rekening 1
        { data: null }, // stap 4, rekening 2
        { data: null }, // stap 4, rekening 3
        { data: [] }, // orphan cleanup
      ],
      bank_accounts: [
        // schakel 2, vooraf: geschiktheidstoets op de voorkeur
        eligibleTargetLookup('ba-target').account,
        // rekening 1 → schakel 2 (voorkeur) → alleen de stap 2b-lookup
        carrierWithAsset('ba-target'),
        // rekening 2 → schakel 3 (iban_hash) + stap 2b-lookup
        { data: { id: 'ba-twee' } },
        carrierWithAsset('ba-twee'),
        // rekening 3 → geen IBAN, dus geen schakel 3 → schakel 4 (aanmaak)
        { data: { id: 'ba-drie-nieuw' } },
      ],
      assets: [
        eligibleTargetLookup('ba-target').asset, // schakel 2, geschiktheidstoets
        activeAssetFor('ba-target'), // stap 2b, rekening 1: bezit is actief
        activeAssetFor('ba-twee'), // stap 2b, rekening 2: bezit is actief
        { data: { id: 'asset-drie-nieuw' } }, // aanmaak rekening 3
      ],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, tlAccounts)

    const res = await GET(requestFor(CALLBACK_URL))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)

    const links = linkWrites(stub)
    expect(links).toHaveLength(3)
    expect(links.map((l) => l.data.bank_account_id)).toEqual(['ba-target', 'ba-twee', 'ba-drie-nieuw'])

    // De voorkeur bindt hooguit één rekening; de rest volgt de heuristiek. Alle
    // drie blijven gekoppeld — een rekening stilzwijgend laten vallen is
    // gegevensverlies dat de gebruiker niet ziet.
    expect(links.filter((l) => l.data.bank_account_id === 'ba-target')).toHaveLength(1)
    expect(mockSyncAccountBalance).toHaveBeenCalledTimes(3)
  })
})

describe('GET /api/bank-connect/callback — fase 5: rekeningtype van de bank (B3, criterium g)', () => {
  it('spaarrekening en creditcard in dezelfde consent krijgen niet het type betaalrekening', async () => {
    const tlAccounts = [
      {
        account_id: 'ext-spaar',
        account_type: 'SAVINGS',
        display_name: 'Spaarrekening',
        currency: 'EUR',
        account_number: { iban: 'NL91ABNA0417161111' },
      },
      {
        account_id: 'ext-card',
        account_type: 'CREDIT_CARD',
        display_name: 'Creditcard',
        currency: 'EUR',
        account_number: { iban: 'NL91ABNA0417162222' },
      },
    ]

    const stub = makeQueuedSupabaseStub({
      bank_connections: [{ data: pendingConnection() }, { data: null }, ORPHAN_SOURCE()],
      bank_connection_accounts: [
        { data: null }, // schakel 1, spaar
        { data: null }, // schakel 1, card
        NO_OCCUPYING_LINKS, // fase 6: geen rekening is bezet
        { data: null }, // stap 4, spaar
        { data: null }, // stap 4, card
        { data: [] },
      ],
      bank_accounts: [
        { data: null }, // iban-fallback spaar → geen treffer
        { data: { id: 'ba-spaar' } }, // aanmaak spaar
        { data: null }, // iban-fallback card → geen treffer
        { data: { id: 'ba-card' } }, // aanmaak card
      ],
      assets: [{ data: { id: 'asset-spaar' } }, { data: { id: 'asset-card' } }],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, tlAccounts)

    const res = await GET(requestFor(CALLBACK_URL))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)

    const assetInserts = stub.calls.filter((c) => c.table === 'assets' && c.op === 'insert')
    const accountInserts = stub.calls.filter((c) => c.table === 'bank_accounts' && c.op === 'insert')
    expect(assetInserts).toHaveLength(2)
    expect(accountInserts).toHaveLength(2)

    // Spaarrekening: eigen subtype, wel liquide.
    expect(assetInserts[0].data.subtype).toBe('savings_account')
    expect(assetInserts[0].data.is_liquid).toBe(true)
    expect(accountInserts[0].data.account_type).toBe('savings')

    // Creditcard: NIET liquide. Dit is de grondslag die noodfonds, spaarquote en
    // de FIRE-motor voeden — een kredietrekening als liquide betaalrekening
    // vertekent alle drie.
    expect(assetInserts[1].data.subtype).toBe('other_cash')
    expect(assetInserts[1].data.is_liquid).toBe(false)
    expect(accountInserts[1].data.account_type).toBe('other')
  })

  it('een onbekend providertype valt terug op betaalrekening zonder de callback te slopen', async () => {
    const stub = makeQueuedSupabaseStub({
      bank_connections: [{ data: pendingConnection() }, { data: null }, ORPHAN_SOURCE()],
      bank_connection_accounts: [{ data: null }, NO_OCCUPYING_LINKS, { data: null }, { data: [] }],
      bank_accounts: [{ data: null }, { data: { id: 'ba-nieuw' } }],
      assets: [{ data: { id: 'asset-nieuw' } }],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [{ ...TL_ACCOUNT_WITH_IBAN, account_type: 'TOTAAL_NIEUW_TYPE' }])

    const res = await GET(requestFor(CALLBACK_URL))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    expect(stub.calls.find((c) => c.table === 'assets')?.data.subtype).toBe('checking')
    expect(
      stub.calls.find((c) => c.table === 'bank_accounts' && c.op === 'insert')?.data.account_type,
    ).toBe('checking')
  })
})

describe('GET /api/bank-connect/callback — fase 5: dezelfde doelrekening, tweede provider (criterium h, SC-14)', () => {
  it('geen tweede rekening en geen tweede cash-bezit', async () => {
    // De gebruiker koppelt een andere bank en kiest dezelfde TriFinity-rekening.
    // Er is geen identiteit (andere `external_account_id`), dus de voorkeur is het
    // enige dat hem op de bestaande rij houdt.
    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: pendingConnection({ id: 'conn-2', provider_name: 'Rabobank', target_bank_account_id: 'ba-target' }) },
        { data: null },
        { data: null },
        ORPHAN_SOURCE('conn-2'),
      ],
      bank_connection_accounts: [{ data: null }, NO_OCCUPYING_LINKS, { data: null }, { data: [] }],
      bank_accounts: [eligibleTargetLookup('ba-target').account, carrierWithAsset('ba-target')],
      assets: [eligibleTargetLookup('ba-target').asset, activeAssetFor('ba-target')],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [{ ...TL_ACCOUNT_WITH_IBAN, account_id: 'ext-rabo-1' }])

    const res = await GET(requestFor('/api/bank-connect/callback?code=abc&state=conn-2:user1234-1710000000'))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    expect(stub.calls.filter((c) => c.table === 'bank_accounts' && c.op === 'insert')).toHaveLength(0)
    expect(stub.calls.filter((c) => c.table === 'assets' && c.op === 'insert')).toHaveLength(0)
    expect(linkWrites(stub)[0].data.bank_account_id).toBe('ba-target')
  })
})

describe('GET /api/bank-connect/callback — fase 5: geen sync_cursor-write', () => {
  it('de callback schrijft nooit een sync_cursor: het startpunt-contract hoort bij de sync-route', async () => {
    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: pendingConnection({ target_bank_account_id: 'ba-target' }) },
        { data: null },
        { data: null },
        ORPHAN_SOURCE(),
      ],
      bank_connection_accounts: [{ data: null }, NO_OCCUPYING_LINKS, { data: null }, { data: [] }],
      bank_accounts: [eligibleTargetLookup('ba-target').account, carrierWithAsset('ba-target')],
      assets: [eligibleTargetLookup('ba-target').asset, activeAssetFor('ba-target')],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])
    const res = await GET(requestFor(CALLBACK_URL))

    // Sanity vóór de negatieve assertie: een route die halverwege in de catch-tak
    // valt schrijft óók geen sync_cursor, en dan zou deze test groen zijn zonder
    // iets te bewijzen.
    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)

    // Een cursor hier zou van "eerste ophaal" een gewone cursor-sync maken en
    // daarmee de blok-lus (B8) overslaan, en het startpunt bevriezen op het
    // koppelmoment. `planInitialFetch` heeft één eigenaar: de sync-route.
    for (const call of stub.calls) {
      expect(call.data).not.toHaveProperty('sync_cursor')
    }
  })
})

// ══ Fase 6 — een al bezette rekening is geen drager (FR5) ════════════════════
//
// Sinds de partiële unieke index `bank_connection_accounts_one_active_per_bank_account`
// is een tweede ACTIEVE koppeling op dezelfde rekening onmogelijk. `supabase-js`
// gooit daar niet op maar geeft een `error` terug — werd die niet gelezen, dan
// verdween de koppeling geruisloos. Daarom slaan schakel 2 en 3 een bezette
// rekening over en valt de callback door naar aanmaak (schakel 4).
describe('GET /api/bank-connect/callback — fase 6: bezette rekeningen worden overgeslagen', () => {
  it('een IBAN-treffer op een al gekoppelde rekening valt door naar aanmaak (schakel 3 → 4)', async () => {
    const stub = makeQueuedSupabaseStub({
      bank_connections: [{ data: pendingConnection() }, { data: null }, ORPHAN_SOURCE()],
      bank_connection_accounts: [
        { data: null }, // schakel 1: geen identiteit
        // ba-bezet draagt al een actieve koppeling van een ándere verbinding.
        { data: [{ id: 'link-ander', bank_account_id: 'ba-bezet', bank_connections: { provider_name: 'Rabobank' } }] },
        { data: null }, // stap 4: nieuwe koppelrij
        { data: [] },
      ],
      bank_accounts: [
        { data: { id: 'ba-bezet' } }, // schakel 3: iban_hash treft de bezette rij
        { data: { id: 'ba-nieuw' } }, // schakel 4: aanmaak
      ],
      assets: [{ data: { id: 'asset-nieuw' } }],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])

    const res = await GET(requestFor(CALLBACK_URL))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    // Zonder deze regel zou de insert op de unieke index sneuvelen en — omdat
    // supabase-js niet gooit — STIL geen koppelrij opleveren: geen fout, geen
    // rekening, geen data.
    expect(linkWrites(stub)[0].data.bank_account_id).toBe('ba-nieuw')
    expect(linkWrites(stub)[0].data.bank_account_id).not.toBe('ba-bezet')
  })

  it('een voorkeur die naar een inmiddels bezette rekening wijst wordt niet toegepast (schakel 2 → 4)', async () => {
    // `auth-link` weigert die keuze al met een 409, maar tussen de wizard en deze
    // terugkomst kan er een andere koppeling op de rekening geland zijn.
    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: pendingConnection({ target_bank_account_id: 'ba-target' }) },
        { data: null },
        { data: null }, // consume-once (ook onbenut)
        ORPHAN_SOURCE(),
      ],
      bank_connection_accounts: [
        { data: null }, // schakel 1: geen identiteit
        { data: [{ id: 'link-ander', bank_account_id: 'ba-target', bank_connections: { provider_name: 'Rabobank' } }] },
        { data: null }, // stap 4
        { data: [] },
      ],
      bank_accounts: [
        // Géén geschiktheidslookup: de bezet-toets zit in `boundAccountIds` en
        // draait vóór `loadTargetAccount`, dus die leesronde wordt niet gedaan.
        { data: null }, // schakel 3: geen iban-treffer
        { data: { id: 'ba-nieuw' } }, // schakel 4: aanmaak
      ],
      assets: [{ data: { id: 'asset-nieuw' } }],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])

    const res = await GET(requestFor(CALLBACK_URL))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    expect(linkWrites(stub)[0].data.bank_account_id).toBe('ba-nieuw')

    // En de voorkeur is alsnog verbruikt: een voorkeur die overleeft omdat ze even
    // niet paste, slaat 90 dagen later stil toe.
    const consumed = stub.calls.filter(
      (c) => c.table === 'bank_connections' && c.op === 'update' && 'target_bank_account_id' in c.data,
    )
    expect(consumed).toHaveLength(1)
    expect(consumed[0].data.target_bank_account_id).toBeNull()
  })

  it('een gefaalde koppelrij-write slaat de saldo-stap over in plaats van hem stil te negeren', async () => {
    // De unieke indexen en de eigenaarschapstrigger leveren een `error`, geen
    // throw. Werd die niet gelezen, dan schreef de callback een saldo weg op een
    // rekening zonder koppelrij — een cijfer dat niemand meer kan verklaren.
    const stub = makeQueuedSupabaseStub({
      bank_connections: [{ data: pendingConnection() }, { data: null }, ORPHAN_SOURCE()],
      bank_connection_accounts: [
        { data: null }, // schakel 1
        NO_OCCUPYING_LINKS,
        { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
        { data: [] },
      ],
      bank_accounts: [{ data: null }, { data: { id: 'ba-nieuw' } }],
      assets: [{ data: { id: 'asset-nieuw' } }],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])

    const res = await GET(requestFor(CALLBACK_URL))

    expect(mockSyncAccountBalance).not.toHaveBeenCalled()
    // En de flow meldt geen succes: er is geen rij die ooit gaat synchroniseren,
    // dus de gebruiker gaat terug naar de wizard met uitleg in plaats van naar een
    // succespagina die niets toont ("ik heb verbonden en er gebeurt niets").
    //
    // Een `23505` ZÓNDER de indexnaam is een onbekende oorzaak: dan blijft het bij
    // de generieke uitgang. `drager_bezet` beweren zou de gebruiker naar een
    // koppeling sturen die misschien niet bestaat.
    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect?error=geen_koppeling`)
  })

  it('faalt er één van twee rekeningen, dan gaan de geslaagde koppelingen wél door', async () => {
    const stub = makeQueuedSupabaseStub({
      bank_connections: [{ data: pendingConnection() }, { data: null }, ORPHAN_SOURCE()],
      bank_connection_accounts: [
        { data: null }, // schakel 1, rekening 1
        { data: null }, // schakel 1, rekening 2
        NO_OCCUPYING_LINKS,
        { data: null, error: { code: '23505', message: 'duplicate key' } }, // stap 4, rekening 1 faalt
        { data: null }, // stap 4, rekening 2 lukt
        { data: [] },
      ],
      bank_accounts: [
        { data: null }, { data: { id: 'ba-een' } },
        { data: null }, { data: { id: 'ba-twee' } },
      ],
      assets: [{ data: { id: 'asset-een' } }, { data: { id: 'asset-twee' } }],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [
      TL_ACCOUNT_WITH_IBAN,
      { ...TL_ACCOUNT_WITH_IBAN, account_id: 'ext-acc-2', account_number: { iban: 'NL91ABNA0417160002' } },
    ])

    const res = await GET(requestFor(CALLBACK_URL))

    // Eén gesneuvelde rekening mag de rest van de consent niet meesleuren; de
    // success-pagina toont per rekening wie hem draagt. Onbekende oorzaak, dus
    // géén `?geblokkeerd=`: die parameter belooft een specifieke toestand.
    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    expect(mockSyncAccountBalance).toHaveBeenCalledTimes(1)
    expect(mockSyncAccountBalance).toHaveBeenCalledWith(stub, expect.objectContaining({ bankAccountId: 'ba-twee' }))
  })
})

// ══ Fase 7 — het per-rekening herstelpad dat fase 6 doorgaf ═══════════════════
//
// Fase 6 ving het symptoom af: landde er geen enkele koppelrij, dan
// `?error=geen_koppeling` met één generieke tekst. Het echte pad — "de rekening die
// deze koppeling droeg is inmiddels door een andere bank in gebruik" — is een
// herstelbare toestand mét uitweg, en krijgt hier zijn eigen redirect. Twee
// parameters, en het verschil tussen de twee is bewust:
//
//   · `?error=drager_bezet&drager=<bank_accounts.id>` — alleen de id, zodat de
//     wizard rechtstreeks naar die rekening kan linken. Géén banknaam, géén IBAN:
//     een query-parameter belandt in browserhistorie, referers en logs.
//   · `?geblokkeerd=<aantal>` — alleen een aantal. Dan is de melding per
//     constructie waar en lekt er niets; wélke rekeningen het zijn leest de pagina
//     achter authenticatie op via `GET /api/bank-connect/linked-accounts`.
describe('GET /api/bank-connect/callback — fase 7: bezette drager krijgt een eigen uitgang', () => {
  /**
   * De ECHTE fout die Postgres/PostgREST teruggeeft bij een tweede actieve
   * koppeling op dezelfde rekening — mét de naam van de partiële unieke index. Die
   * naam is het onderscheidende feit: hij scheidt "drager bezet" van elke andere
   * `23505` (bv. `bank_connection_accounts_one_per_external`, een andere oorzaak met
   * een andere uitweg), en de tests in de fase-6-blok hierboven pinnen dat een
   * `23505` zónder die naam de generieke uitgang houdt.
   */
  const CARRIER_OCCUPIED_ERROR = {
    code: '23505',
    message:
      'duplicate key value violates unique constraint "bank_connection_accounts_one_active_per_bank_account"',
  }

  it('énige rekening botst op een bezette drager → ?error=drager_bezet&drager=<id>', async () => {
    // Het bereikbare pad, zonder aanvaller: bank A op rekening X → verbreken (X
    // komt vrij) → bank B op X → bank A herverbinden. Schakel 1 (identiteit) staat
    // bewust buiten `boundAccountIds` — de historie staat op X, dus doorvallen naar
    // een verse rekening mag níet. De update botst dan op de partiële unieke index,
    // en dát moet de gebruiker met een uitweg te zien krijgen.
    const stub = makeQueuedSupabaseStub({
      bank_connections: [{ data: pendingConnection() }, { data: null }, ORPHAN_SOURCE()],
      bank_connection_accounts: [
        { data: { id: 'link-a', bank_account_id: 'ba-x' } }, // schakel 1: de rij van bank A
        // Bank B draagt X nu actief. Een ándere rij dan de identity-link, dus X is bezet.
        { data: [{ id: 'link-b', bank_account_id: 'ba-x', bank_connections: { provider_name: 'Rabobank' } }] },
        { data: null, error: CARRIER_OCCUPIED_ERROR },
        { data: [] },
      ],
      bank_accounts: [carrierWithAsset('ba-x')],
      assets: [activeAssetFor('ba-x')],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])

    const res = await GET(requestFor(CALLBACK_URL))

    // Identiteit blijft winnen: de koppeling verhuist NIET naar een verse rekening.
    expect(linkWrites(stub)[0].op).toBe('update')
    expect(linkWrites(stub)[0].data.bank_account_id).toBe('ba-x')
    expect(stub.calls.filter((c) => c.table === 'bank_accounts' && c.op === 'insert')).toHaveLength(0)

    const location = res.headers.get('location') ?? ''
    expect(location).toBe(`${ORIGIN}/core/cash/connect?error=drager_bezet&drager=ba-x`)
    // Geen banknaam en geen IBAN in de URL — alleen de id van de drager.
    expect(location).not.toContain('Rabobank')
    expect(location).not.toContain('NL91ABNA0417164300')
  })

  it('gedeeltelijk geslaagd → success-pagina met ?geblokkeerd=1, zonder id in de URL', async () => {
    const stub = makeQueuedSupabaseStub({
      bank_connections: [{ data: pendingConnection() }, { data: null }, ORPHAN_SOURCE()],
      bank_connection_accounts: [
        { data: { id: 'link-a', bank_account_id: 'ba-x' } }, // schakel 1, rekening 1: bestaande rij
        { data: null }, // schakel 1, rekening 2: geen identiteit
        // ba-x is bezet door bank B; rekening 2 heeft daar niets mee te maken.
        { data: [{ id: 'link-b', bank_account_id: 'ba-x', bank_connections: { provider_name: 'Rabobank' } }] },
        { data: null, error: CARRIER_OCCUPIED_ERROR }, // stap 4, rekening 1 botst
        { data: null }, // stap 4, rekening 2 lukt
        { data: [] },
      ],
      bank_accounts: [
        // GEEN leesronde voor rekening 1: haar koppelwrite botst, en sinds de
        // security-review van fase 7 staat stap 4b ná die write. Een MISLUKTE
        // koppelpoging raakt het cash-bezit dus niet meer — anders reactiveerde ze
        // stil een door de gebruiker "verwijderd" bezit (of liet ze een vers
        // €0-bezit achter) terwijl de gebruiker een foutmelding leest.
        { data: null }, // schakel 3, rekening 2: geen iban-treffer
        { data: { id: 'ba-twee' } }, // schakel 4, rekening 2: aanmaak
      ],
      assets: [
        { data: { id: 'asset-twee' } }, // aanmaak rekening 2
      ],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [
      TL_ACCOUNT_WITH_IBAN,
      { ...TL_ACCOUNT_WITH_IBAN, account_id: 'ext-acc-2', account_number: { iban: 'NL91ABNA0417160002' } },
    ])

    const res = await GET(requestFor(CALLBACK_URL))

    // De geslaagde koppeling gaat door — alleen de geblokkeerde is niet gelukt, en
    // dát mag de flow niet verzwijgen (fase 6 liet het alleen in de serverlog).
    const location = res.headers.get('location') ?? ''
    expect(location).toBe(`${ORIGIN}/core/cash/connect/success?geblokkeerd=1`)
    expect(location).not.toContain('ba-x')

    expect(mockSyncAccountBalance).toHaveBeenCalledTimes(1)
    expect(mockSyncAccountBalance).toHaveBeenCalledWith(stub, expect.objectContaining({ bankAccountId: 'ba-twee' }))
  })

  it('op het onboardingpad blijft het ?bank_error=1, ook bij een bezette drager', async () => {
    // Daar bestaat de wizard-uitleg niet: de onboarding-stap kent één foutmelding,
    // en er een tweede naast zetten zou een oppervlak vragen dat er niet is.
    const stub = makeQueuedSupabaseStub({
      bank_connections: [{ data: pendingConnection() }, { data: null }, ORPHAN_SOURCE()],
      bank_connection_accounts: [
        { data: { id: 'link-a', bank_account_id: 'ba-x' } },
        { data: [{ id: 'link-b', bank_account_id: 'ba-x', bank_connections: { provider_name: 'Rabobank' } }] },
        { data: null, error: CARRIER_OCCUPIED_ERROR },
        { data: [] },
      ],
      bank_accounts: [carrierWithAsset('ba-x')],
      assets: [activeAssetFor('ba-x')],
      profiles: [{ data: { onboarding_completed: false } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])

    const res = await GET(requestFor(CALLBACK_URL))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/onboarding?bank_error=1`)
  })
})

describe('GET /api/bank-connect/callback — fase 7: SC-13, hergebruik herstelt het cash-bezit', () => {
  it('een gedeactiveerd cash-bezit op de hergebruikte rekening wordt zichtbaar én budgetteert weer mee', async () => {
    // Het incident: "verwijder" een rekening in de UI (functioneel
    // `assets.is_active = false`) en koppel opnieuw. Zonder deze stap werkt de
    // koppeling, klopt het saldo, en filtert `cash-overview` de rekening weg op
    // `is_active !== false` — onzichtbaar, terwijl er wél data binnenkomt.
    const stub = makeQueuedSupabaseStub({
      bank_connections: [{ data: pendingConnection() }, { data: null }, ORPHAN_SOURCE()],
      bank_connection_accounts: [
        { data: { id: 'link-a', bank_account_id: 'ba-terug' } }, // schakel 1: identiteit
        NO_OCCUPYING_LINKS,
        { data: null }, // stap 4: koppelrij bijgewerkt
        { data: [] },
      ],
      bank_accounts: [carrierWithAsset('ba-terug')],
      assets: [
        { data: { id: 'asset-ba-terug', is_active: false } }, // stap 2b: bezit stáát uit
        { data: null }, // stap 2b: de zichtbaarheids-update
      ],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])

    const res = await GET(requestFor(CALLBACK_URL))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)

    const assetUpdates = stub.calls.filter((c) => c.table === 'assets' && c.op === 'update')
    expect(assetUpdates).toHaveLength(1)
    // As 1 — zichtbaarheid. De route schrijft deze ene vlag zélf.
    expect(assetUpdates[0].data).toEqual({ is_active: true })

    // As 2 — budgettracking, via de ENE schrijver van dat drieluik. Het besluit van
    // 30 juli: herstel dat de rekening zichtbaar maakt maar buiten de budgetten
    // laat, leest als half hersteld.
    expect(mockSetBudgetTracking).toHaveBeenCalledTimes(1)
    expect(mockSetBudgetTracking).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'asset-ba-terug',
      true,
    )

    // Géén tweede cash-bezit.
    expect(stub.calls.filter((c) => c.table === 'assets' && c.op === 'insert')).toHaveLength(0)
  })
})

describe('GET /api/bank-connect/callback — fase 5: geschiktheid van de voorkeur op callback-moment (SC-13)', () => {
  it('doelrekening met een gedeactiveerd cash-bezit valt door naar de heuristiek', async () => {
    // Tussen de wizard en deze terugkomst kan de gebruiker het cash-bezit hebben
    // gedeactiveerd. Dan is de rekening nergens in de app zichtbaar en zouden
    // saldo en transacties er stil op binnenkomen. `loadTargetAccount` weigert
    // hem, en schakel 3/4 neemt het over.
    const stub = makeQueuedSupabaseStub({
      bank_connections: [
        { data: pendingConnection({ target_bank_account_id: 'ba-target' }) },
        { data: null },
        { data: null }, // consume-once (de voorkeur is verbruikt, ook onbenut)
        ORPHAN_SOURCE(),
      ],
      bank_connection_accounts: [{ data: null }, NO_OCCUPYING_LINKS, { data: null }, { data: [] }],
      bank_accounts: [
        eligibleTargetLookup('ba-target').account, // schakel 2: rekening bestaat
        { data: null }, // schakel 3: geen iban-treffer
        { data: { id: 'ba-nieuw' } }, // schakel 4: aanmaak
      ],
      assets: [
        { data: { id: 'asset-ba-target', is_active: false, has_budget_tracking: true } }, // bezit gedeactiveerd
        { data: { id: 'asset-nieuw' } }, // aanmaak
      ],
      profiles: [{ data: { onboarding_completed: true } }],
    })

    wire(stub, [TL_ACCOUNT_WITH_IBAN])

    const res = await GET(requestFor(CALLBACK_URL))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/core/cash/connect/success`)
    expect(linkWrites(stub)[0].data.bank_account_id).toBe('ba-nieuw')
    expect(linkWrites(stub)[0].data.bank_account_id).not.toBe('ba-target')

    // Verbruikt blijft verbruikt: een voorkeur die overleeft omdat ze even niet
    // paste, slaat een volgende keer stil toe.
    const consumed = stub.calls.filter(
      (c) => c.table === 'bank_connections' && c.op === 'update' && 'target_bank_account_id' in c.data,
    )
    expect(consumed).toHaveLength(1)
    expect(consumed[0].data.target_bank_account_id).toBeNull()
  })
})
