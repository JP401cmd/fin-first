import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/own-accounts/counterparties?accountId=&months= — de tegenpartijen
 * van één bankrekening, gegroepeerd, voor de instellingen-sheet.
 *
 * Wat deze tests bewaken, in volgorde van belang:
 *
 *  1. **De pagineringsval.** PostgREST kapt elk antwoord stil af op `max_rows`
 *     (1000); zonder paginering zou een gebruiker met veel historie een
 *     onvolledige (maar compleet ogende) tegenpartijlijst krijgen. Boven
 *     `MAX_PAGES` (25) komt `truncated: true` terug in plaats van een stille cap.
 *  2. Groepering op IBAN wanneer aanwezig, anders op genormaliseerde naam; totalen
 *     zijn beide POSITIEF en tellen de juiste kant.
 *  3. Sortering: heen-én-weer-verkeer eerst, dan op volume.
 *  4. De meest voorkomende naamvariant wordt getoond.
 *  5. Rijen zonder IBAN én zonder naam worden overgeslagen.
 */

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: async (supabase: { auth: { getClaims: () => Promise<{ data: { claims: unknown } | null }> } }) =>
    (await supabase.auth.getClaims()).data?.claims ?? null,
}))

import { GET } from './route'

const USER = 'user-1'
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'

type Row = {
  counterparty_iban: string | null
  counterparty_name: string | null
  amount: number | string | null
  date: string | null
  transaction_type: string | null
}

function mkRow(overrides: Partial<Row>): Row {
  return {
    counterparty_iban: null,
    counterparty_name: null,
    amount: 0,
    date: '2026-01-01',
    transaction_type: 'expense',
    ...overrides,
  }
}

function buildClient(opts: { rows: Row[]; user?: string | null }) {
  const user = opts.user === undefined ? USER : opts.user
  return {
    auth: {
      getClaims: async () => ({
        data: user ? { claims: { sub: user } } : null,
        error: user ? null : { message: 'no session' },
      }),
    },
    from(table: string) {
      if (table !== 'transactions') throw new Error(`onverwachte tabel: ${table}`)
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        order: () => chain,
        range: (from: number, to: number) => Promise.resolve({ data: opts.rows.slice(from, to + 1), error: null }),
      }
      return chain
    },
  }
}

function req(query: string) {
  return new Request(`http://localhost/api/own-accounts/counterparties?${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/own-accounts/counterparties', () => {
  it('niet ingelogd → 401', async () => {
    mockCreateClient.mockResolvedValue(buildClient({ rows: [], user: null }))
    const res = await GET(req(`accountId=${ACCOUNT_ID}`))
    expect(res.status).toBe(401)
  })

  it('geen geldige UUID → 400', async () => {
    mockCreateClient.mockResolvedValue(buildClient({ rows: [] }))
    const res = await GET(req('accountId=niet-een-uuid'))
    expect(res.status).toBe(400)
  })

  it('groepeert op genormaliseerde IBAN en telt uitgaand/inkomend positief op de juiste kant', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        rows: [
          mkRow({ counterparty_iban: 'nl91 abna 0417 1643 00', amount: -50, date: '2026-01-05' }),
          mkRow({ counterparty_iban: 'NL91ABNA0417164300', amount: 20, date: '2026-01-06' }),
        ],
      }),
    )

    const body = await (await GET(req(`accountId=${ACCOUNT_ID}`))).json()

    expect(body.counterparties).toHaveLength(1)
    const cp = body.counterparties[0]
    expect(cp.iban).toBe('NL91ABNA0417164300')
    expect(cp.outgoingTotal).toBe(50)
    expect(cp.incomingTotal).toBe(20)
    expect(cp.outgoingCount).toBe(1)
    expect(cp.incomingCount).toBe(1)
  })

  it('groepeert op genormaliseerde naam wanneer er geen IBAN is', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        rows: [
          mkRow({ counterparty_name: 'Kraken  ', amount: -100 }),
          mkRow({ counterparty_name: 'kraken', amount: -25 }),
        ],
      }),
    )

    const body = await (await GET(req(`accountId=${ACCOUNT_ID}`))).json()

    expect(body.counterparties).toHaveLength(1)
    expect(body.counterparties[0].outgoingTotal).toBe(125)
  })

  it('sorteert heen-en-weer-verkeer vóór eenrichtingsverkeer, ongeacht volume', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        rows: [
          // Groot éénrichtingsvolume.
          mkRow({ counterparty_name: 'grote-eenrichting', amount: -10000 }),
          // Klein maar heen-én-weer.
          mkRow({ counterparty_name: 'kleine-heen-en-weer', amount: -10 }),
          mkRow({ counterparty_name: 'kleine-heen-en-weer', amount: 5 }),
        ],
      }),
    )

    const body = await (await GET(req(`accountId=${ACCOUNT_ID}`))).json()

    expect(body.counterparties[0].name).toBe('kleine-heen-en-weer')
    expect(body.counterparties[1].name).toBe('grote-eenrichting')
  })

  it('toont de meest voorkomende naamvariant', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        rows: [
          mkRow({ counterparty_iban: 'NL91ABNA0417164300', counterparty_name: 'ALBERT HEIJN 1234', amount: -10 }),
          mkRow({ counterparty_iban: 'NL91ABNA0417164300', counterparty_name: 'Albert Heijn', amount: -10 }),
          mkRow({ counterparty_iban: 'NL91ABNA0417164300', counterparty_name: 'Albert Heijn', amount: -10 }),
        ],
      }),
    )

    const body = await (await GET(req(`accountId=${ACCOUNT_ID}`))).json()

    expect(body.counterparties[0].name).toBe('Albert Heijn')
  })

  it('slaat rijen zonder IBAN én zonder naam over', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        rows: [
          mkRow({ counterparty_iban: null, counterparty_name: '', amount: -10 }),
          mkRow({ counterparty_iban: 'NL91ABNA0417164300', counterparty_name: null, amount: -10 }),
        ],
      }),
    )

    const body = await (await GET(req(`accountId=${ACCOUNT_ID}`))).json()

    expect(body.counterparties).toHaveLength(1)
    expect(body.scanned).toBe(2)
  })

  it('pagineert door boven de 1000-rijen-cap en telt scanned correct', async () => {
    const rows: Row[] = Array.from({ length: 1500 }, (_, i) =>
      mkRow({ counterparty_iban: 'NL91ABNA0417164300', amount: i % 2 === 0 ? -1 : 1 }),
    )
    mockCreateClient.mockResolvedValue(buildClient({ rows }))

    const body = await (await GET(req(`accountId=${ACCOUNT_ID}`))).json()

    expect(body.scanned).toBe(1500)
    expect(body.truncated).toBe(false)
    // Nog steeds correct samengevoegd tot één groep over beide pagina's heen.
    expect(body.counterparties).toHaveLength(1)
    expect(body.counterparties[0].outgoingCount + body.counterparties[0].incomingCount).toBe(1500)
  })

  it('markeert truncated: true boven MAX_PAGES (25 × 1000)', async () => {
    // 25 volle pagina's van 1000: page 24 (index) levert nog precies 1000 rijen,
    // dus de lus breekt niet vanzelf af — bij page 25 slaat de MAX_PAGES-check toe.
    const rows: Row[] = Array.from({ length: 25000 }, (_, i) =>
      mkRow({ counterparty_iban: `NL${String(i).padStart(2, '0')}BANK0000000000`, amount: -1 }),
    )
    mockCreateClient.mockResolvedValue(buildClient({ rows }))

    const body = await (await GET(req(`accountId=${ACCOUNT_ID}`))).json()

    expect(body.scanned).toBe(25000)
    expect(body.truncated).toBe(true)
  })
})
