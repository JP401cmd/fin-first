import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/bank-connect/sync — de dedup-invariant.
 *
 * De unieke index op `transactions` is sinds migratie
 * `20260729171125_transactions_drift_account_scoped_dedup_and_source.sql`
 * rekening-gescoped: `(user_id, account_id, import_hash, coalesce(bank_seq,''))`.
 * De route dedupte daarvóór gebruiker-breed en sloeg daardoor een échte tweede
 * boeking met gelijke datum/bedrag/omschrijving op een ANDERE rekening stil over
 * ("Kosten betaalrekening €1,70" op 1 juli bij twee rekeningen) — dataverlies
 * zonder signaal.
 *
 * De Supabase-stub hieronder is geen queue maar een piepklein in-memory
 * `transactions`-tabelletje dat de filters écht toepast: alleen zo bewijst de
 * test het scope-gedrag in plaats van de call-volgorde.
 */

const {
  mockCreateClient,
  mockIsEnabled,
  mockGetBaseUrls,
  mockGetAccountTransactions,
  mockSyncAccountBalance,
  mockCategorize,
  mockBuildFrequencyMap,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockIsEnabled: vi.fn(),
  mockGetBaseUrls: vi.fn(),
  mockGetAccountTransactions: vi.fn(),
  mockSyncAccountBalance: vi.fn(),
  mockCategorize: vi.fn(),
  mockBuildFrequencyMap: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/truelayer/feature-flag', () => ({ isTrueLayerEnabled: mockIsEnabled }))
vi.mock('@/lib/truelayer/client', () => ({
  getBaseUrls: mockGetBaseUrls,
  getAccountTransactions: mockGetAccountTransactions,
  refreshAccessToken: vi.fn(),
}))
vi.mock('@/lib/truelayer/balance-sync', () => ({ syncAccountBalance: mockSyncAccountBalance }))
vi.mock('@/lib/crypto/field-encryption', () => ({
  decryptField: (v: string | null) => (v ? v.replace(/^enc:/, '') : null),
  encryptField: (v: string) => `enc:${v}`,
}))
vi.mock('@/lib/parsers/categorize', () => ({
  categorizeTransaction: mockCategorize,
  buildFrequencyMap: mockBuildFrequencyMap,
}))

import { POST } from './route'
import { computeHash } from '@/lib/parsers/shared'
import { planInitialFetch } from '@/lib/truelayer/initial-fetch'
import { TrueLayerProviderLimitError, TrueLayerRequestError } from '@/lib/truelayer/errors'

const USER_ID = 'user-1'
const ACCOUNT_A = 'acct-a'
const ACCOUNT_B = 'acct-b'

type TxRow = {
  id: string
  user_id: string
  account_id: string
  date: string
  import_hash: string | null
  bank_seq: string | null
  /** Laag-2-velden. Optioneel zodat de laag-1-tests niet hoeven te veranderen. */
  amount?: number
  counterparty_iban?: string | null
  counterparty_name?: string | null
  budget_id?: string | null
  category_source?: string | null
}

/** Eén TrueLayer-boeking; de mapper hasht date|amount|description. */
const TL_TX = {
  transaction_id: 'tl-1',
  timestamp: '2026-07-01T00:00:00Z',
  description: 'Kosten betaalrekening',
  amount: -1.7,
  transaction_type: 'DEBIT',
  transaction_category: 'BANK_CHARGE',
}

type DedupQuery = { eqs: Record<string, unknown>; gte: string | null; lte: string | null; range: [number, number] | null }

function makeSupabase(existing: TxRow[]) {
  const inserted: Record<string, unknown>[][] = []
  const dedupQueries: DedupQuery[] = []
  const crossSourceQueries: DedupQuery[] = []
  const syncLogs: Record<string, unknown>[] = []
  const connAccountUpdates: Record<string, unknown>[] = []
  /** Elke niet-insert-mutatie op `transactions`. Moet altijd leeg blijven:
   *  dedup verhindert INSERTs en doet nooit een update, merge of delete. */
  const transactionMutations: string[] = []

  function builder(table: string) {
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: unknown = null
    let cols = ''
    const eqs: Record<string, unknown> = {}
    let gte: string | null = null
    let lte: string | null = null
    let range: [number, number] | null = null

    const b: Record<string, unknown> = {}
    const self = () => b
    b.select = (c?: string) => { cols = c ?? ''; return b }
    b.order = self
    b.limit = self
    b.not = self
    b.in = self
    b.eq = (col: string, val: unknown) => { eqs[col] = val; return b }
    b.gte = (_col: string, val: string) => { gte = val; return b }
    b.lte = (_col: string, val: string) => { lte = val; return b }
    b.range = (from: number, to: number) => { range = [from, to]; return b }
    b.insert = (rows: unknown) => {
      op = 'insert'
      payload = rows
      if (table === 'transactions') inserted.push(Array.isArray(rows) ? rows as Record<string, unknown>[] : [rows as Record<string, unknown>])
      if (table === 'bank_sync_log') syncLogs.push(rows as Record<string, unknown>)
      return b
    }
    b.update = (row: unknown) => {
      op = 'update'
      payload = row
      if (table === 'bank_connection_accounts') connAccountUpdates.push(row as Record<string, unknown>)
      if (table === 'transactions') transactionMutations.push('update')
      return b
    }
    b.delete = () => {
      op = 'update'
      payload = null
      if (table === 'transactions') transactionMutations.push('delete')
      return b
    }
    b.upsert = (row: unknown) => {
      op = 'update'
      payload = row
      if (table === 'transactions') transactionMutations.push('upsert')
      return b
    }

    function resolve(): { data: unknown; error: null } {
      if (op !== 'select') return { data: payload, error: null }
      if (table === 'bank_connection_accounts') {
        return {
          data: {
            id: 'conn-acct-1',
            user_id: USER_ID,
            is_active: true,
            bank_account_id: ACCOUNT_B,
            external_account_id: 'ext-1',
            daily_requests: 0,
            rate_limit_reset_date: null,
            sync_cursor: null,
            bank_connections: {
              id: 'conn-1',
              access_token_encrypted: 'enc:tok',
              refresh_token_encrypted: 'enc:rt',
              token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
            },
          },
          error: null,
        }
      }
      if (table === 'transactions') {
        const matchesScope = (r: TxRow) =>
          (eqs['user_id'] === undefined || r.user_id === eqs['user_id']) &&
          (eqs['account_id'] === undefined || r.account_id === eqs['account_id'])

        // Startpunt-query (B9): `select('date') … .limit(1).maybeSingle()`.
        // Bewust géén dedupQuery — dit is het startpunt, geen tweede dedup-pad.
        if (cols === 'date') {
          const newest = existing.filter(matchesScope).map((r) => r.date).sort().at(-1)
          return { data: newest ? { date: newest } : null, error: null }
        }

        const inWindow = (r: TxRow) =>
          (gte === null || r.date >= gte) && (lte === null || r.date <= lte)

        // Kandidatenquery van dedup-laag 2 (cross-bron): dezelfde scope, andere
        // kolommen. Verbreed met ±1 dag door de loader zelf.
        if (cols === 'date, amount, counterparty_iban, counterparty_name') {
          crossSourceQueries.push({ eqs: { ...eqs }, gte, lte, range })
          let rows = existing.filter((r) => matchesScope(r) && inWindow(r))
          if (range) rows = rows.slice(range[0], range[1] + 1)
          return {
            data: rows.map((r) => ({
              date: r.date,
              amount: r.amount ?? 0,
              counterparty_iban: r.counterparty_iban ?? null,
              counterparty_name: r.counterparty_name ?? null,
            })),
            error: null,
          }
        }

        dedupQueries.push({ eqs: { ...eqs }, gte, lte, range })
        let rows = existing.filter((r) =>
          (eqs['user_id'] === undefined || r.user_id === eqs['user_id']) &&
          (eqs['account_id'] === undefined || r.account_id === eqs['account_id']) &&
          (gte === null || r.date >= gte) &&
          (lte === null || r.date <= lte) &&
          r.import_hash !== null
        )
        if (range) rows = rows.slice(range[0], range[1] + 1)
        return { data: rows.map((r) => ({ import_hash: r.import_hash })), error: null }
      }
      return { data: [], error: null }
    }

    b.single = () => Promise.resolve(resolve())
    b.maybeSingle = () => Promise.resolve(resolve())
    b.then = (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(ok, fail)
    return b
  }

  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      from: vi.fn((table: string) => builder(table)),
    },
    inserted,
    dedupQueries,
    crossSourceQueries,
    syncLogs,
    connAccountUpdates,
    transactionMutations,
    /** Momentopname van de bestaande rijen — bewijst dat er niets aan is geraakt. */
    existing,
  }
}

function request(body: Record<string, unknown> = { connection_account_id: 'conn-acct-1' }) {
  return new Request('https://app.trifinity.nl/api/bank-connect/sync', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsEnabled.mockResolvedValue(true)
  mockGetBaseUrls.mockResolvedValue({ dataUrl: 'https://data.truelayer.test' })
  mockGetAccountTransactions.mockResolvedValue([TL_TX])
  mockSyncAccountBalance.mockResolvedValue({ synced: { balance: 42 } })
  mockCategorize.mockReturnValue({ budget_id: null, confidence: 0, budgetName: null })
  mockBuildFrequencyMap.mockResolvedValue(new Map())
})

describe('POST /api/bank-connect/sync — rekening-gescoped dedup', () => {
  it('importeert een boeking die identiek is aan één op een ANDERE rekening', async () => {
    const hash = await computeHash('2026-07-01', -1.7, 'Kosten betaalrekening')
    // Zelfde datum/bedrag/omschrijving, maar op rekening A — de sync draait op B.
    const { client, inserted } = makeSupabase([
      { id: 'tx-a', user_id: USER_ID, account_id: ACCOUNT_A, date: '2026-07-01', import_hash: hash, bank_seq: null },
    ])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ new: 1, duplicates: 0 })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toHaveLength(1)
    expect(inserted[0][0]).toMatchObject({ account_id: ACCOUNT_B, import_hash: hash })
  })

  it('slaat een boeking over die al op DEZELFDE rekening staat', async () => {
    const hash = await computeHash('2026-07-01', -1.7, 'Kosten betaalrekening')
    const { client, inserted } = makeSupabase([
      { id: 'tx-b', user_id: USER_ID, account_id: ACCOUNT_B, date: '2026-07-01', import_hash: hash, bank_seq: null },
    ])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ new: 0, duplicates: 1 })
    expect(inserted).toHaveLength(0)
  })

  it('stempelt gesynchroniseerde rijen met source "bank"', async () => {
    const { client, inserted } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(inserted[0][0]).toMatchObject({ source: 'bank' })
  })

  it('leest de bestaande hashes gescoped op user_id + account_id, gepagineerd binnen het datumvenster', async () => {
    const { client, dedupQueries } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    await POST(request())

    expect(dedupQueries).toHaveLength(1)
    expect(dedupQueries[0].eqs).toEqual({ user_id: USER_ID, account_id: ACCOUNT_B })
    // Datumvenster van de opgehaalde batch (hash bevat de datum, dus rijen
    // buiten dit venster kunnen niet botsen) + een echte `range()`-pagina in
    // plaats van het stil falende `.in('import_hash', hashes)`.
    expect(dedupQueries[0].gte).toBe('2026-07-01')
    expect(dedupQueries[0].lte).toBe('2026-07-01')
    expect(dedupQueries[0].range).toEqual([0, 999])
  })
})

/**
 * De eerste ophaal (B8/B9). Drie dingen worden hier vastgelegd:
 *
 * 1. een lege rekening haalt de volle terugblik in blokken op, nieuwste eerst;
 * 2. een rekening mét historie start op D−3 en doet één verzoek;
 * 3. een bank-eigen verzoeklimiet halverwege STOPT, BEHOUDT en SCHRIJFT WEG —
 *    de al opgehaalde blokken blijven staan en het wordt geen 500.
 */
describe('POST /api/bank-connect/sync — eerste ophaal (B8/B9)', () => {
  const TODAY = new Date().toISOString().slice(0, 10)

  function tx(id: string, date: string, description: string) {
    return { ...TL_TX, transaction_id: id, timestamp: `${date}T00:00:00Z`, description }
  }

  it('haalt op een lege rekening de volle terugblik in blokken, nieuwste eerst', async () => {
    const { client } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request())
    const body = await res.json()

    const expected = planInitialFetch({ today: TODAY })
    expect(mockGetAccountTransactions).toHaveBeenCalledTimes(expected.blocks.length)
    expect(body.fetch_mode).toBe('historical')
    // Alle blokken + de saldo-call: `provider_requests` meet de bank-eigen
    // limiet, niet onze 10/dag-rem.
    expect(body.provider_requests).toBe(expected.blocks.length + 1)

    // Nieuwste blok eerst, en dat blok gaat zónder `to` naar de provider: een
    // kale datum leest TrueLayer als middernacht en zou vandaag afkappen.
    const [, , , firstFrom, firstTo] = mockGetAccountTransactions.mock.calls[0]
    expect(firstFrom).toBe(expected.blocks[0].from)
    expect(firstTo).toBeUndefined()

    // Het oudste blok bepaalt hoe ver terug we zijn gegaan — méér dan de
    // TrueLayer-standaard van ~88 dagen.
    expect(body.fetched_from).toBe(expected.blocks[expected.blocks.length - 1].from)
    expect(body.truncated).toBe(false)
  })

  it('ontdubbelt dezelfde boeking uit twee overlappende blokken tot één insert', async () => {
    // Aangrenzende blokken delen hun grensdatum; zonder ontdubbeling botsen twee
    // gelijke rijen in één insert op de unieke index en sneuvelt de hele batch.
    const { client, inserted } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    await POST(request())

    expect(mockGetAccountTransactions.mock.calls.length).toBeGreaterThan(1)
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toHaveLength(1)
  })

  it('start op een rekening mét historie bij de nieuwste transactie −3 dagen, in één verzoek', async () => {
    const hash = await computeHash('2026-07-01', -1.7, 'Kosten betaalrekening')
    const { client } = makeSupabase([
      { id: 'tx-b', user_id: USER_ID, account_id: ACCOUNT_B, date: '2026-07-20', import_hash: hash, bank_seq: null },
    ])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request())
    const body = await res.json()

    expect(mockGetAccountTransactions).toHaveBeenCalledTimes(1)
    expect(mockGetAccountTransactions.mock.calls[0][3]).toBe('2026-07-17')
    expect(body.fetch_mode).toBe('incremental')
    expect(body.provider_requests).toBe(2) // één blok + de saldo-call
  })

  it('behoudt bij een provider-limiet op blok 3 de rijen uit blok 1 en 2, zonder 500', async () => {
    const { client, inserted, syncLogs } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    mockGetAccountTransactions
      .mockResolvedValueOnce([tx('tl-1', '2026-06-01', 'Blok 1')])
      .mockResolvedValueOnce([tx('tl-2', '2026-02-01', 'Blok 2')])
      .mockRejectedValueOnce(
        new TrueLayerProviderLimitError(
          'TrueLayer transacties ophalen mislukt: 429 (provider_request_limit_exceeded)',
          429,
          'provider_request_limit_exceeded',
        ),
      )

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(200)
    // Blok 4 wordt niet meer geprobeerd: na de limiet stoppen we.
    expect(mockGetAccountTransactions).toHaveBeenCalledTimes(3)

    // De winst van blok 1 en 2 staat in de database.
    const rows = inserted.flat()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.description).sort()).toEqual(['Blok 1', 'Blok 2'])
    expect(body).toMatchObject({ new: 2, truncated: true, provider_requests: 4 })

    // ...en de afkap is terug te vinden in het log, niet alleen in de respons.
    expect(syncLogs).toHaveLength(1)
    expect(syncLogs[0]).toMatchObject({ status: 'partial', transactions_new: 2, provider_requests: 4 })
    expect(String(syncLogs[0].error_message)).toContain('Provider-limiet')
  })

  it('telt de eerste ophaal als ÉÉN synchronisatie, met het echte verzoekaantal in het log', async () => {
    // Bewuste eigenaarskeuze: de 10/dag is een rem op sync-spam per
    // gebruikershandeling. Het werkelijke aantal verzoeken blijft observeerbaar
    // via bank_sync_log.provider_requests.
    const { client, syncLogs, connAccountUpdates } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request())
    const body = await res.json()

    expect(body.daily_requests).toBe(1)
    expect(connAccountUpdates[0]).toMatchObject({ daily_requests: 1 })
    // De rate-limit-tik en de uitkomst zijn twee aparte writes; alleen de eerste
    // raakt de teller.
    expect(connAccountUpdates.at(-1)).not.toHaveProperty('daily_requests')
    expect(Number(syncLogs[0].provider_requests)).toBeGreaterThan(1)
  })

  it('laat een gewone providerfout wél een fout blijven, mét een spoor in het log', async () => {
    const { client, syncLogs } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockGetAccountTransactions.mockRejectedValueOnce(
      new TrueLayerRequestError('TrueLayer transacties ophalen mislukt: 502', 502, 'internal_server_error'),
    )

    const res = await POST(request())

    expect(res.status).toBe(500)
    // Het faalpad schreef vóór deze fase nooit een rij weg: het las de body een
    // tweede keer met `req.clone()`, wat op een geconsumeerde body gooit.
    expect(syncLogs).toHaveLength(1)
    expect(syncLogs[0]).toMatchObject({ status: 'error' })
    // Genormaliseerd — geen rauwe fouttekst in een AVG-exporteerbare kolom.
    expect(syncLogs[0].error_message).toBe('Providerfout 502 (internal_server_error)')
    consoleError.mockRestore()
  })

  it('reserveert de rate-limit-tik vóór de provider-lus, ook als de sync faalt', async () => {
    // Anders is elke mislukte of getimeoute sync gratis en kost herhalen niets,
    // terwijl de provider-verzoeken wél gedaan zijn.
    const { client, connAccountUpdates } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockGetAccountTransactions.mockRejectedValueOnce(
      new TrueLayerRequestError('TrueLayer transacties ophalen mislukt: 502', 502, null),
    )

    await POST(request())

    expect(connAccountUpdates[0]).toMatchObject({ daily_requests: 1 })
    consoleError.mockRestore()
  })

  it('weigert een date_from in een ander formaat dan YYYY-MM-DD', async () => {
    const { client } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ connection_account_id: 'conn-acct-1', date_from: '01-05-2026' }))

    expect(res.status).toBe(400)
    expect(mockGetAccountTransactions).not.toHaveBeenCalled()
  })

  it('respecteert een expliciete date_from: één venster, geen blok-lus', async () => {
    const { client } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ connection_account_id: 'conn-acct-1', date_from: '2026-05-01' }))
    const body = await res.json()

    expect(mockGetAccountTransactions).toHaveBeenCalledTimes(1)
    expect(mockGetAccountTransactions.mock.calls[0][3]).toBe('2026-05-01')
    expect(body.fetch_mode).toBe('cursor')
  })
})

/**
 * Dedup-laag 2 — cross-bron (fase 2).
 *
 * De bank levert een andere omschrijvingstekst dan de CSV van diezelfde bank
 * voor dezelfde boeking, dus laag 1 (de hash over datum|bedrag|omschrijving)
 * ziet twee verschillende rijen. Laag 2 matcht op datum ±1 dag + bedrag exact +
 * tegenpartij. Stil overslaan, gesplitst tellen — nooit een update, merge of
 * delete op een bestaande rij.
 */
describe('POST /api/bank-connect/sync — cross-bron dedup (laag 2)', () => {
  /** Bestaande CSV-rij op de doelrekening; de hash wijkt bewust af van de
   *  bank-rij, anders zou laag 1 het geval al afvangen en bewees de test niets. */
  function csvRow(over: Partial<TxRow> = {}): TxRow {
    return {
      id: 'tx-csv',
      user_id: USER_ID,
      account_id: ACCOUNT_B,
      date: '2026-07-10',
      import_hash: 'hash-van-de-csv-omschrijving',
      bank_seq: '0042',
      amount: -42.5,
      counterparty_iban: 'NL91 ABNA 0417 1643 00',
      counterparty_name: 'ALBERT HEIJN 1234',
      budget_id: 'budget-boodschappen',
      category_source: 'manual',
      ...over,
    }
  }

  /** Bankrij voor dezelfde boeking, met de tekst zoals TrueLayer 'm levert. */
  function bankTx(over: Record<string, unknown> = {}) {
    return {
      transaction_id: 'tl-ah',
      timestamp: '2026-07-10T14:03:00Z',
      description: 'BEA, Betaalpas AH to go Utrecht CS, PAS123',
      amount: -42.5,
      transaction_type: 'DEBIT',
      transaction_category: 'PURCHASE',
      meta: { counter_party_iban: 'NL91ABNA0417164300', counter_party_preferred_name: 'Albert Heijn' },
      ...over,
    }
  }

  it('slaat een cross-bron-duplicaat stil over en telt het apart, op IBAN', async () => {
    const { client, inserted, syncLogs } = makeSupabase([csvRow()])
    mockCreateClient.mockResolvedValue(client)
    mockGetAccountTransactions.mockResolvedValue([bankTx()])

    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(inserted).toHaveLength(0)
    // Laag 1 vangt niets (andere omschrijving = andere hash); laag 2 alles.
    expect(body).toMatchObject({ new: 0, duplicates: 0, duplicates_cross_source: 1 })
    expect(syncLogs[0]).toMatchObject({
      transactions_dup: 0,
      transactions_dup_cross_source_iban: 1,
      transactions_dup_cross_source_name: 0,
    })
  })

  it('telt de naam-terugval apart van de IBAN-treffer', async () => {
    // De zwakste grond voor een treffer krijgt een eigen teller, anders is de
    // blinde vlek (twee filialen die naar dezelfde naam normaliseren) achteraf
    // niet te meten.
    const { client, inserted, syncLogs } = makeSupabase([
      csvRow({ counterparty_iban: null, counterparty_name: 'Bakker' }),
    ])
    mockCreateClient.mockResolvedValue(client)
    mockGetAccountTransactions.mockResolvedValue([
      bankTx({ meta: { counter_party_preferred_name: 'CCV*BAKKER 12' } }),
    ])

    const res = await POST(request())
    const body = await res.json()

    expect(inserted).toHaveLength(0)
    expect(body).toMatchObject({ duplicates_cross_source: 1 })
    expect(syncLogs[0]).toMatchObject({
      transactions_dup_cross_source_iban: 0,
      transactions_dup_cross_source_name: 1,
    })
  })

  it('voegt een échte transactie mét toevallig gelijke datum en bedrag WEL in', async () => {
    // Andere tegenpartij = andere boeking. Dit is de fout die duur is: hem
    // overslaan is stil verlies van een echte transactie.
    const { client, inserted, syncLogs } = makeSupabase([
      csvRow({ counterparty_iban: 'NL02RABO0123456789', counterparty_name: 'Slagerij Jansen' }),
    ])
    mockCreateClient.mockResolvedValue(client)
    mockGetAccountTransactions.mockResolvedValue([bankTx()])

    const res = await POST(request())
    const body = await res.json()

    expect(body).toMatchObject({ new: 1, duplicates: 0, duplicates_cross_source: 0 })
    expect(inserted.flat()).toHaveLength(1)
    expect(inserted.flat()[0]).toMatchObject({ account_id: ACCOUNT_B, amount: -42.5, source: 'bank' })
    expect(syncLogs[0]).toMatchObject({
      transactions_dup_cross_source_iban: 0,
      transactions_dup_cross_source_name: 0,
    })
  })

  it('matcht niet buiten de ±1-dagtolerantie', async () => {
    const { client, inserted } = makeSupabase([csvRow({ date: '2026-07-08' })])
    mockCreateClient.mockResolvedValue(client)
    mockGetAccountTransactions.mockResolvedValue([bankTx()])

    const res = await POST(request())
    const body = await res.json()

    expect(body).toMatchObject({ new: 1, duplicates_cross_source: 0 })
    expect(inserted.flat()).toHaveLength(1)
  })

  it('laat de bestaande rij volledig ongemoeid — geen update, merge of delete (FR11)', async () => {
    const existingRow = csvRow()
    const before = { ...existingRow }
    const { client, transactionMutations, existing } = makeSupabase([existingRow])
    mockCreateClient.mockResolvedValue(client)
    mockGetAccountTransactions.mockResolvedValue([bankTx()])

    await POST(request())

    // De oudste rij wint en houdt haar handmatig gezette budget-toewijzing.
    expect(transactionMutations).toEqual([])
    expect(existing[0].id).toBe(before.id)
    expect(existing[0].budget_id).toBe('budget-boodschappen')
    expect(existing[0].category_source).toBe('manual')
    expect(existing[0]).toEqual(before)
  })

  it('haalt de kandidaten gescoped op user_id + account_id, met het venster ±1 dag verbreed', async () => {
    const { client, crossSourceQueries } = makeSupabase([csvRow()])
    mockCreateClient.mockResolvedValue(client)
    mockGetAccountTransactions.mockResolvedValue([bankTx()])

    await POST(request())

    expect(crossSourceQueries).toHaveLength(1)
    expect(crossSourceQueries[0].eqs).toEqual({ user_id: USER_ID, account_id: ACCOUNT_B })
    // Batchvenster is 2026-07-10..2026-07-10; de loader verbreedt het met de
    // ±1-dagtolerantie van de matcher, anders glipt een duplicaat op de dag
    // ervoor of erna er stil doorheen.
    expect(crossSourceQueries[0].gte).toBe('2026-07-09')
    expect(crossSourceQueries[0].lte).toBe('2026-07-11')
    expect(crossSourceQueries[0].range).toEqual([0, 999])
  })

  it('is een no-op op een verse rekening: nul kandidaten, alles wordt ingevoegd', async () => {
    // Bewust géén "is deze rekening nieuw"-vlag: de kandidatenquery is al
    // rekening- én datumgescoped en levert hier vanzelf nul rijen.
    const { client, inserted, syncLogs } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)
    mockGetAccountTransactions.mockResolvedValue([bankTx()])

    const res = await POST(request())
    const body = await res.json()

    expect(body).toMatchObject({ new: 1, duplicates_cross_source: 0 })
    expect(inserted.flat()).toHaveLength(1)
    expect(syncLogs[0]).toMatchObject({
      transactions_dup_cross_source_iban: 0,
      transactions_dup_cross_source_name: 0,
    })
  })

  it('laat laag 1 vóórgaan: een hash-duplicaat telt niet óók als cross-bron', async () => {
    const hash = await computeHash('2026-07-10', -42.5, 'BEA, Betaalpas AH to go Utrecht CS, PAS123')
    const { client, syncLogs } = makeSupabase([csvRow({ import_hash: hash })])
    mockCreateClient.mockResolvedValue(client)
    mockGetAccountTransactions.mockResolvedValue([bankTx()])

    const res = await POST(request())
    const body = await res.json()

    expect(body).toMatchObject({ new: 0, duplicates: 1, duplicates_cross_source: 0 })
    expect(syncLogs[0]).toMatchObject({ transactions_dup: 1, transactions_dup_cross_source_iban: 0 })
  })
})
