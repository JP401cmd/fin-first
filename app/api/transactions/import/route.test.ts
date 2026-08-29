import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/transactions/import — het serverpad van de bestandsimport (B7, fase 3).
 *
 * Wat deze tests bewaken, in volgorde van belang:
 *
 *  1. **De route is de schrijver, niet de client.** `user_id`, `account_id`,
 *     `source` en `import_hash` worden hier bepaald; een client die iets anders
 *     beweert wordt genegeerd, en een rekening die hij niet mag zien levert 403.
 *  2. **Twee lagen, in de juiste volgorde en met de juiste sleutel.** Laag 1
 *     spiegelt de rekening-gescopede unieke index INCLUSIEF `bank_seq` (R6: een
 *     hash-only vergelijking zou twee échte boekingen samensmelten). Laag 2 komt
 *     erná en is overrulebaar.
 *  3. **Dedup verhindert alleen INSERTs.** Geen enkele update/upsert/delete op
 *     `transactions`, en een bestaande rij houdt haar handmatige budget-
 *     toewijzing (FR11).
 *
 * De Supabase-stub is bewust geen call-queue maar een piepklein in-memory
 * `transactions`-tabelletje dat de filters écht toepast — alleen zo bewijst een
 * test het scope-gedrag in plaats van de aanroepvolgorde.
 */

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

import { GET, POST, MAX_ROWS_PER_REQUEST } from './route'
import { computeHash } from '@/lib/parsers/shared'

const USER_ID = 'user-1'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const OTHER_ACCOUNT = '22222222-2222-4222-8222-222222222222'
const BUDGET = '33333333-3333-4333-8333-333333333333'
const FOREIGN_BUDGET = '44444444-4444-4444-8444-444444444444'

type TxRow = {
  id: string
  user_id: string
  account_id: string
  date: string
  amount: number
  import_hash: string | null
  bank_seq: string | null
  counterparty_iban?: string | null
  counterparty_name?: string | null
  budget_id?: string | null
  category_source?: string | null
  source?: string | null
  /** Zonder waarde = persoonlijk; alleen 'shared' is voor laag 1b zichtbaar. */
  ownership?: 'personal' | 'shared'
}

/** Minimale geldige rij zoals de import-pagina 'm stuurt. */
function row(over: Record<string, unknown> = {}) {
  return {
    date: '2026-07-01',
    amount: -12.5,
    description: 'Albert Heijn 1234',
    counterparty_name: 'Albert Heijn',
    counterparty_iban: 'NL91 ABNA 0417 1643 00',
    bank_seq: null,
    ...over,
  }
}

function makeSupabase(existing: TxRow[], opts: { visibleAccounts?: string[]; visibleBudgets?: string[]; linked?: string[]; failInserts?: boolean; accountOwnership?: 'personal' | 'shared'; sharedAccounts?: string[]; accountUserId?: string; partnerVisibility?: 'none' | 'balance' | 'full' } = {}) {
  const visibleAccounts = opts.visibleAccounts ?? [ACCOUNT, OTHER_ACCOUNT]
  const visibleBudgets = opts.visibleBudgets ?? [BUDGET]
  /**
   * Welke rekeningen `ownership = 'shared'` dragen. Standaard geen enkele: laag
   * 1b hoort dan niet te draaien en het serverpad is niet verplicht.
   * `accountOwnership: 'shared'` is de korte vorm voor "alle zichtbare
   * rekeningen zijn gedeeld".
   */
  const sharedAccounts = new Set(
    opts.sharedAccounts ?? (opts.accountOwnership === 'shared' ? visibleAccounts : []),
  )
  const ownershipOf = (id: string) => (sharedAccounts.has(id) ? 'shared' : 'personal')
  const inserted: Record<string, unknown>[][] = []
  /** Elke niet-insert-mutatie op `transactions`. Moet altijd leeg blijven. */
  const transactionMutations: string[] = []
  const dedupQueries: { eqs: Record<string, unknown>; gte: string | null; lte: string | null }[] = []
  /** Leesronden van laag 1b, herkenbaar aan de omgekeerde `.neq('user_id')`. */
  const householdQueries: { eqs: Record<string, unknown>; neqs: Record<string, unknown> }[] = []
  let nextId = 1

  function builder(table: string) {
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: Record<string, unknown>[] = []
    let cols = ''
    const eqs: Record<string, unknown> = {}
    const neqs: Record<string, unknown> = {}
    let inList: unknown[] | null = null
    let gte: string | null = null
    let lte: string | null = null
    let range: [number, number] | null = null

    const b: Record<string, unknown> = {}
    const self = () => b
    b.select = (c?: string) => { cols = c ?? ''; return b }
    b.order = self
    b.limit = self
    b.not = self
    b.in = (_col: string, vals: unknown[]) => { inList = vals; return b }
    b.eq = (col: string, val: unknown) => { eqs[col] = val; return b }
    b.neq = (col: string, val: unknown) => { neqs[col] = val; return b }
    b.gte = (_col: string, val: string) => { gte = val; return b }
    b.lte = (_col: string, val: string) => { lte = val; return b }
    b.range = (from: number, to: number) => { range = [from, to]; return b }
    b.insert = (rows: unknown) => {
      op = 'insert'
      payload = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[]
      if (table === 'transactions') {
        inserted.push(payload)
        if (!opts.failInserts) {
          for (const r of payload) {
            existing.push({
              id: `new-${nextId++}`,
              user_id: r.user_id as string,
              account_id: r.account_id as string,
              date: r.date as string,
              amount: r.amount as number,
              import_hash: (r.import_hash ?? null) as string | null,
              bank_seq: (r.bank_seq ?? null) as string | null,
              counterparty_iban: (r.counterparty_iban ?? null) as string | null,
              counterparty_name: (r.counterparty_name ?? null) as string | null,
              budget_id: (r.budget_id ?? null) as string | null,
              source: (r.source ?? null) as string | null,
            })
          }
        }
      }
      return b
    }
    b.update = () => { op = 'update'; if (table === 'transactions') transactionMutations.push('update'); return b }
    b.delete = () => { op = 'update'; if (table === 'transactions') transactionMutations.push('delete'); return b }
    b.upsert = () => { op = 'update'; if (table === 'transactions') transactionMutations.push('upsert'); return b }

    function resolve(): { data: unknown; error: unknown } {
      if (op === 'insert') {
        if (opts.failInserts) return { data: null, error: { message: 'duplicate key value' } }
        return {
          data: payload.map((r, i) => ({
            id: `new-${nextId - payload.length + i}`,
            date: r.date,
            description: r.description,
            counterparty_name: r.counterparty_name,
            counterparty_iban: r.counterparty_iban,
            amount: r.amount,
            import_hash: r.import_hash,
            budget_id: r.budget_id,
            reference: r.reference,
            transaction_type: r.transaction_type,
          })),
          error: null,
        }
      }
      if (op !== 'select') return { data: payload, error: null }

      if (table === 'bank_accounts') {
        const id = eqs['id'] as string | undefined
        // POST: één rekening opzoeken om schrijfrecht + eigendom te bepalen.
        // De route leest sinds ADR 0118 óók `user_id` en `partner_visibility`
        // (partner-import-gate). Default in de mock: de importeur ís de
        // rekeninghouder en gedeelde rekeningen staan op 'full' — dan draait
        // laag 1b precies zoals vóór de gate; de gate-scenario's zetten
        // `accountUserId`/`partnerVisibility` expliciet.
        if (id !== undefined) {
          return {
            data: visibleAccounts.includes(id)
              ? {
                  id,
                  ownership: ownershipOf(id),
                  user_id: opts.accountUserId ?? USER_ID,
                  partner_visibility: sharedAccounts.has(id) ? (opts.partnerVisibility ?? 'full') : null,
                }
              : null,
            error: null,
          }
        }
        // GET: de lijst-query naar gedeelde rekeningen.
        const rows = visibleAccounts
          .filter((a) => eqs['ownership'] === undefined || ownershipOf(a) === eqs['ownership'])
          .map((a) => ({ id: a }))
        return { data: rows, error: null }
      }
      if (table === 'budgets') {
        const ids = (inList ?? []).filter((i) => visibleBudgets.includes(i as string))
        return { data: ids.map((id) => ({ id })), error: null }
      }
      if (table === 'bank_connection_accounts') {
        return { data: (opts.linked ?? []).map((id) => ({ bank_account_id: id })), error: null }
      }
      if (table === 'transactions') {
        const scoped = existing.filter((r) =>
          (eqs['user_id'] === undefined || r.user_id === eqs['user_id']) &&
          // Laag 1b draait de eigenaarsfilter om: alles BEHALVE de eigen rijen.
          (neqs['user_id'] === undefined || r.user_id !== neqs['user_id']) &&
          (eqs['ownership'] === undefined || (r.ownership ?? 'personal') === eqs['ownership']) &&
          (eqs['account_id'] === undefined || r.account_id === eqs['account_id']) &&
          (gte === null || r.date >= gte) &&
          (lte === null || r.date <= lte)
        )
        if (cols === 'date, amount, counterparty_iban, counterparty_name') {
          let rows = scoped
          if (range) rows = rows.slice(range[0], range[1] + 1)
          return {
            data: rows.map((r) => ({
              date: r.date,
              amount: r.amount,
              counterparty_iban: r.counterparty_iban ?? null,
              counterparty_name: r.counterparty_name ?? null,
            })),
            error: null,
          }
        }
        // Laag 1 (eigen rijen) of laag 1b (partnerrijen) — beide lezen
        // `import_hash, bank_seq`; de omgekeerde eigenaarsfilter onderscheidt ze.
        if (neqs['user_id'] !== undefined) householdQueries.push({ eqs: { ...eqs }, neqs: { ...neqs } })
        else dedupQueries.push({ eqs: { ...eqs }, gte, lte })
        let rows = scoped.filter((r) => r.import_hash !== null)
        if (range) rows = rows.slice(range[0], range[1] + 1)
        return { data: rows.map((r) => ({ import_hash: r.import_hash, bank_seq: r.bank_seq })), error: null }
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
    transactionMutations,
    dedupQueries,
    householdQueries,
    existing,
  }
}

function request(body: unknown) {
  return new Request('https://app.trifinity.nl/api/transactions/import', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/transactions/import — toegang', () => {
  it('weigert een rekening die de gebruiker niet mag zien, zonder iets weg te schrijven', async () => {
    const { client, inserted } = makeSupabase([], { visibleAccounts: [OTHER_ACCOUNT] })
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row()] }))

    expect(res.status).toBe(403)
    expect(inserted).toHaveLength(0)
  })

  it('weigert een budget dat de gebruiker niet mag zien', async () => {
    const { client, inserted } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row({ budget_id: FOREIGN_BUDGET })] }))

    expect(res.status).toBe(400)
    expect(inserted).toHaveLength(0)
  })

  it('weigert een body zonder rijen met een client-veilige 400 (zod)', async () => {
    const { client } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [] }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(typeof body.error).toBe('string')
  })

  it('weigert meer rijen dan één verzoek mag dragen', async () => {
    const { client } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    const rows = Array.from({ length: MAX_ROWS_PER_REQUEST + 1 }, (_, i) => row({ bank_seq: `${i}` }))
    const res = await POST(request({ account_id: ACCOUNT, rows }))

    expect(res.status).toBe(400)
  })
})

describe('POST /api/transactions/import — laag 1 (indexsleutel)', () => {
  it('slaat een rij over die al op DEZELFDE rekening staat', async () => {
    const hash = await computeHash('2026-07-01', -12.5, 'Albert Heijn 1234')
    const { client, inserted } = makeSupabase([
      { id: 'tx-1', user_id: USER_ID, account_id: ACCOUNT, date: '2026-07-01', amount: -12.5, import_hash: hash, bank_seq: null },
    ])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row()] }))
    const body = await res.json()

    expect(body).toMatchObject({ inserted: 0, duplicates: 1 })
    expect(body.skipped).toEqual([{ import_hash: hash, bank_seq: null, layer: 'exact' }])
    expect(inserted).toHaveLength(0)
  })

  it('importeert een identieke boeking die op een ANDERE rekening staat (R6)', async () => {
    const hash = await computeHash('2026-07-01', -12.5, 'Albert Heijn 1234')
    const { client, inserted } = makeSupabase([
      { id: 'tx-1', user_id: USER_ID, account_id: OTHER_ACCOUNT, date: '2026-07-01', amount: -12.5, import_hash: hash, bank_seq: null },
    ])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row()] }))
    const body = await res.json()

    expect(body).toMatchObject({ inserted: 1, duplicates: 0 })
    expect(inserted[0][0]).toMatchObject({ account_id: ACCOUNT, import_hash: hash })
  })

  it('houdt twee échte boekingen met gelijke hash maar verschillend Volgnr naast elkaar (R6)', async () => {
    const hash = await computeHash('2026-07-01', -12.5, 'Albert Heijn 1234')
    const { client, inserted } = makeSupabase([
      { id: 'tx-1', user_id: USER_ID, account_id: ACCOUNT, date: '2026-07-01', amount: -12.5, import_hash: hash, bank_seq: '001' },
    ])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row({ bank_seq: '002' })] }))
    const body = await res.json()

    expect(body).toMatchObject({ inserted: 1, duplicates: 0 })
    expect(inserted[0][0]).toMatchObject({ bank_seq: '002' })
  })

  it('ontdubbelt binnen de batch zelf — twee identieke rijen leveren één insert', async () => {
    const { client, inserted } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row(), row()] }))
    const body = await res.json()

    expect(body).toMatchObject({ inserted: 1, duplicates: 1 })
    expect(inserted[0]).toHaveLength(1)
  })
})

/**
 * Laag 1b — de partner op een GEDEELDE rekening.
 *
 * Op een `ownership='shared'`-rekening mogen beide partners importeren. Laag 1
 * filtert op `.eq('user_id', …)` en de unieke index droeg `user_id` in de
 * sleutel, dus vóór deze laag ving niets de tweede reeks af: beide partners
 * kregen een volledige dubbele transactiereeks te zien én mee te tellen.
 *
 * De twee filters van de loader zijn samen de privacy-control. Daarom staat
 * hieronder niet alleen "vangt de partnerrij af", maar óók dat een PERSOONLIJKE
 * rij van diezelfde partner buiten beeld blijft, en dat de hele leesronde op een
 * persoonlijke rekening achterwege blijft.
 */
describe('POST /api/transactions/import — laag 1b (partner op gedeelde rekening)', () => {
  const PARTNER_ID = 'user-2'

  /** Dezelfde boeking, weggeschreven door de partner op de gedeelde rekening. */
  async function partnerRow(over: Partial<TxRow> = {}): Promise<TxRow> {
    return {
      id: 'tx-partner',
      user_id: PARTNER_ID,
      account_id: ACCOUNT,
      date: '2026-07-01',
      amount: -12.5,
      import_hash: await computeHash('2026-07-01', -12.5, 'Albert Heijn 1234'),
      bank_seq: null,
      ownership: 'shared',
      ...over,
    }
  }

  it('slaat een rij over die de partner al op deze gedeelde rekening zette', async () => {
    const existing = [await partnerRow()]
    const { client, inserted } = makeSupabase(existing, { accountOwnership: 'shared' })
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row({ ownership: 'shared' })] }))
    const body = await res.json()

    expect(body).toMatchObject({ inserted: 0, duplicates: 0, duplicates_household_partner: 1 })
    expect(body.skipped).toEqual([
      { import_hash: existing[0].import_hash, bank_seq: null, layer: 'household_partner' },
    ])
    // De kern van de bug: zonder deze laag stond de reeks er twee keer.
    expect(inserted).toHaveLength(0)
    expect(existing).toHaveLength(1)
  })

  it('telt meerdere partner-duplicaten los van `duplicates` en `duplicates_cross_source`', async () => {
    const rows = [
      row({ description: 'Boeking A', counterparty_iban: null, counterparty_name: null }),
      row({ description: 'Boeking B', counterparty_iban: null, counterparty_name: null }),
      row({ description: 'Boeking C', counterparty_iban: null, counterparty_name: null }),
    ]
    // A en B staan al bij de partner; C is nieuw.
    const existing: TxRow[] = [
      await partnerRow({ id: 'p-a', import_hash: await computeHash('2026-07-01', -12.5, 'Boeking A') }),
      await partnerRow({ id: 'p-b', import_hash: await computeHash('2026-07-01', -12.5, 'Boeking B') }),
    ]
    const { client, inserted } = makeSupabase(existing, { accountOwnership: 'shared' })
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows }))
    const body = await res.json()

    expect(body).toMatchObject({
      inserted: 1,
      duplicates: 0,
      duplicates_household_partner: 2,
      duplicates_cross_source: { total: 0 },
    })
    expect(inserted[0]).toHaveLength(1)
    expect(inserted[0][0]).toMatchObject({ description: 'Boeking C' })
  })

  it('houdt de laag-1-reden wanneer de rij óók van de gebruiker zelf al bestaat', async () => {
    const hash = await computeHash('2026-07-01', -12.5, 'Albert Heijn 1234')
    const { client } = makeSupabase([
      { id: 'tx-eigen', user_id: USER_ID, account_id: ACCOUNT, date: '2026-07-01', amount: -12.5, import_hash: hash, bank_seq: null, ownership: 'shared' },
      await partnerRow(),
    ], { accountOwnership: 'shared' })
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row({ ownership: 'shared' })] }))
    const body = await res.json()

    // Eén keer geteld, met de directere reden — niet dubbel in twee tellers.
    expect(body).toMatchObject({ inserted: 0, duplicates: 1, duplicates_household_partner: 0 })
    expect(body.skipped).toHaveLength(1)
    expect(body.skipped[0].layer).toBe('exact')
  })

  it('negeert een PERSOONLIJKE rij van de partner — de ownership-filter is de tweede gordel', async () => {
    // Zo'n rij is voor deze gebruiker niet zichtbaar in zijn transactielijst;
    // 'm hier laten meewegen zou stil andermans privé-boeking blootleggen én
    // een eigen transactie ten onrechte weggooien.
    const { client, inserted } = makeSupabase([await partnerRow({ ownership: 'personal' })], {
      accountOwnership: 'shared',
    })
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row({ ownership: 'shared' })] }))
    const body = await res.json()

    expect(body).toMatchObject({ inserted: 1, duplicates_household_partner: 0 })
    expect(inserted[0]).toHaveLength(1)
  })

  it('stelt de partner-query op een PERSOONLIJKE rekening niet eens', async () => {
    const { client, householdQueries, inserted } = makeSupabase([await partnerRow()])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row()] }))
    const body = await res.json()

    // Geen extra round-trip, en het bestaande gedrag verandert niet.
    expect(householdQueries).toHaveLength(0)
    expect(body).toMatchObject({ inserted: 1, duplicates: 0, duplicates_household_partner: 0 })
    expect(inserted[0]).toHaveLength(1)
  })

  it('leest de partnerrijen met beide filters: .neq op user_id én .eq op ownership', async () => {
    const { client, householdQueries } = makeSupabase([], { accountOwnership: 'shared' })
    mockCreateClient.mockResolvedValue(client)

    await POST(request({ account_id: ACCOUNT, rows: [row({ ownership: 'shared' })] }))

    expect(householdQueries.length).toBeGreaterThan(0)
    for (const q of householdQueries) {
      expect(q.neqs).toMatchObject({ user_id: USER_ID })
      expect(q.eqs).toMatchObject({ account_id: ACCOUNT, ownership: 'shared' })
    }
  })

  it('weigert een partner-import op een gedeelde rekening die niet op full staat (ADR 0118)', async () => {
    // De rekening is van de partner en deelt alleen het saldo. Zonder deze gate
    // zou laag 1b via RLS een lege partnerset lezen en de reeks stil verdubbelen.
    const { client, householdQueries, inserted } = makeSupabase([], {
      accountOwnership: 'shared',
      accountUserId: PARTNER_ID,
      partnerVisibility: 'balance',
    })
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row({ ownership: 'shared' })] }))

    expect(res.status).toBe(403)
    expect(inserted).toHaveLength(0)
    expect(householdQueries).toHaveLength(0)
  })

  it('laat de partner wél importeren wanneer de rekening op full staat', async () => {
    const existing = [await partnerRow({ user_id: 'user-3' })]
    const { client, inserted } = makeSupabase(existing, {
      accountOwnership: 'shared',
      accountUserId: PARTNER_ID,
      partnerVisibility: 'full',
    })
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row({ ownership: 'shared' })] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ inserted: 0, duplicates_household_partner: 1 })
    // Alles is partner-dedup: er is geen enkele insert-batch geweest.
    expect(inserted).toHaveLength(0)
  })
})

describe('POST /api/transactions/import — laag 2 (cross-bron)', () => {
  /** Zelfde boeking, andere omschrijvingstekst → andere hash, gelijke tegenpartij. */
  const bankRow: TxRow = {
    id: 'tx-bank',
    user_id: USER_ID,
    account_id: ACCOUNT,
    date: '2026-07-01',
    amount: -12.5,
    import_hash: 'hash-van-de-bankrij',
    bank_seq: null,
    counterparty_iban: 'NL91ABNA0417164300',
    counterparty_name: 'ALBERT HEIJN 1234',
    budget_id: BUDGET,
    category_source: 'manual',
  }

  it('herkent een cross-bron-duplicaat, meldt de reden terug en voegt niets in', async () => {
    const { client, inserted, existing } = makeSupabase([{ ...bankRow }])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row({ description: 'BEA, Betaalpas AH 1234' })] }))
    const body = await res.json()

    expect(body).toMatchObject({
      inserted: 0,
      duplicates: 0,
      duplicates_cross_source: { iban: 1, name: 0, total: 1 },
    })
    expect(body.skipped).toEqual([
      expect.objectContaining({ layer: 'cross_source', reason: 'iban' }),
    ])
    expect(inserted).toHaveLength(0)
    // FR11: de bestaande rij is niet aangeraakt en houdt haar budget.
    expect(existing).toHaveLength(1)
    expect(existing[0]).toMatchObject({ id: 'tx-bank', budget_id: BUDGET, category_source: 'manual' })
  })

  it('voegt een bewust overrulede cross-bron-treffer alsnog in, mét source "import"', async () => {
    const { client, inserted } = makeSupabase([{ ...bankRow }])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({
      account_id: ACCOUNT,
      rows: [row({ description: 'BEA, Betaalpas AH 1234', allow_cross_source: true })],
    }))
    const body = await res.json()

    expect(body).toMatchObject({ inserted: 1, duplicates_cross_source: { total: 0 } })
    expect(body.skipped).toEqual([])
    expect(inserted[0][0]).toMatchObject({ source: 'import' })
  })

  it('importeert een échte transactie met gelijke datum en bedrag maar een andere tegenpartij', async () => {
    const { client, inserted } = makeSupabase([{ ...bankRow }])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({
      account_id: ACCOUNT,
      rows: [row({
        description: 'Jumbo Utrecht',
        counterparty_name: 'Jumbo',
        counterparty_iban: 'NL02RABO0123456789',
      })],
    }))
    const body = await res.json()

    expect(body).toMatchObject({ inserted: 1, duplicates: 0, duplicates_cross_source: { total: 0 } })
    expect(inserted[0][0]).toMatchObject({ counterparty_name: 'Jumbo' })
  })

  it('telt een rij die zowel laag-1- als laag-2-duplicaat is precies één keer, met de laag-1-reden', async () => {
    const hash = await computeHash('2026-07-01', -12.5, 'Albert Heijn 1234')
    const { client } = makeSupabase([
      // Dezelfde boeking staat er twee keer: één keer met identieke hash (laag 1)
      // en één keer als bankrij met dezelfde tegenpartij (laag 2).
      { id: 'tx-exact', user_id: USER_ID, account_id: ACCOUNT, date: '2026-07-01', amount: -12.5, import_hash: hash, bank_seq: null, counterparty_iban: 'NL91ABNA0417164300' },
      { ...bankRow },
    ])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row()] }))
    const body = await res.json()

    expect(body).toMatchObject({ inserted: 0, duplicates: 1, duplicates_cross_source: { total: 0 } })
    expect(body.skipped).toHaveLength(1)
    expect(body.skipped[0].layer).toBe('exact')
  })
})

describe('POST /api/transactions/import — de route is de schrijver', () => {
  it('negeert een door de client verzonnen import_hash en herberekent hem', async () => {
    const { client, inserted } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    await POST(request({ account_id: ACCOUNT, rows: [row({ import_hash: 'verzonnen' })] }))

    const expected = await computeHash('2026-07-01', -12.5, 'Albert Heijn 1234')
    expect(inserted[0][0]).toMatchObject({ import_hash: expected })
  })

  it('negeert een door de client meegestuurde user_id, account_id en source', async () => {
    const { client, inserted } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    await POST(request({
      account_id: ACCOUNT,
      rows: [row({ user_id: 'iemand-anders', account_id: OTHER_ACCOUNT, source: 'bank' })],
    }))

    expect(inserted[0][0]).toMatchObject({ user_id: USER_ID, account_id: ACCOUNT, source: 'import' })
  })

  it('raakt bestaande rijen nooit aan — geen update, upsert of delete op transactions', async () => {
    const hash = await computeHash('2026-07-01', -12.5, 'Albert Heijn 1234')
    const { client, transactionMutations } = makeSupabase([
      { id: 'tx-1', user_id: USER_ID, account_id: ACCOUNT, date: '2026-07-01', amount: -12.5, import_hash: hash, bank_seq: null, budget_id: BUDGET },
    ])
    mockCreateClient.mockResolvedValue(client)

    await POST(request({ account_id: ACCOUNT, rows: [row(), row({ date: '2026-07-02', bank_seq: 'x' })] }))

    expect(transactionMutations).toEqual([])
  })

  it('leest de duplicaatcontrole gescoped op user_id én account_id', async () => {
    const { client, dedupQueries } = makeSupabase([])
    mockCreateClient.mockResolvedValue(client)

    await POST(request({ account_id: ACCOUNT, rows: [row()] }))

    expect(dedupQueries.length).toBeGreaterThan(0)
    for (const q of dedupQueries) {
      expect(q.eqs).toMatchObject({ user_id: USER_ID, account_id: ACCOUNT })
    }
  })

  it('rapporteert een mislukte insert-chunk als `failed` in plaats van een 500', async () => {
    const { client } = makeSupabase([], { failInserts: true })
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(request({ account_id: ACCOUNT, rows: [row()] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ inserted: 0, failed: 1 })
  })
})

describe('POST /api/transactions/import — grote import', () => {
  it('schrijft 3.000 rijen weg over drie verzoeken zonder stil te vallen of te dubbelen', async () => {
    const store: TxRow[] = []
    const { client, inserted } = makeSupabase(store)
    mockCreateClient.mockResolvedValue(client)

    let totalInserted = 0
    for (let batch = 0; batch < 3; batch++) {
      const rows = Array.from({ length: MAX_ROWS_PER_REQUEST }, (_, i) => row({
        description: `Boeking ${batch * MAX_ROWS_PER_REQUEST + i}`,
        amount: -(1 + i / 100),
        counterparty_iban: null,
        counterparty_name: null,
      }))
      const res = await POST(request({ account_id: ACCOUNT, rows }))
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.failed).toBe(0)
      totalInserted += body.inserted
    }

    expect(totalInserted).toBe(3 * MAX_ROWS_PER_REQUEST)
    expect(store).toHaveLength(3 * MAX_ROWS_PER_REQUEST)
    // 1.000 rijen per verzoek = 5 chunks van 200; drie verzoeken = 15 inserts.
    expect(inserted).toHaveLength(15)
  })

  it('herkent bij een herhaald verzoek alles als duplicaat (idempotent — veilige retry)', async () => {
    const store: TxRow[] = []
    const { client } = makeSupabase(store)
    mockCreateClient.mockResolvedValue(client)

    const rows = Array.from({ length: 50 }, (_, i) => row({
      description: `Boeking ${i}`,
      counterparty_iban: null,
      counterparty_name: null,
    }))

    const first = await (await POST(request({ account_id: ACCOUNT, rows }))).json()
    const second = await (await POST(request({ account_id: ACCOUNT, rows }))).json()

    expect(first).toMatchObject({ inserted: 50, duplicates: 0 })
    expect(second).toMatchObject({ inserted: 0, duplicates: 50 })
    expect(store).toHaveLength(50)
  })
})

describe('GET /api/transactions/import — welke rekeningen moeten via de route', () => {
  it('levert de rekeningen met een actieve bankkoppeling', async () => {
    const { client } = makeSupabase([], { linked: [ACCOUNT, ACCOUNT, OTHER_ACCOUNT] })
    mockCreateClient.mockResolvedValue(client)

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.server_path_account_ids.sort()).toEqual([ACCOUNT, OTHER_ACCOUNT].sort())
  })

  it('levert óók een GEDEELDE rekening zonder bankkoppeling', async () => {
    // De tweede schrijver is hier de partner, niet de sync. Zonder deze tak
    // blijft zo'n rekening op het clientpad, en dat filtert op de eigen user_id
    // — precies het gat waardoor beide partners een dubbele reeks kregen.
    const { client } = makeSupabase([], { linked: [], sharedAccounts: [ACCOUNT] })
    mockCreateClient.mockResolvedValue(client)

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.server_path_account_ids).toEqual([ACCOUNT])
  })

  it('levert de UNIE en noemt een rekening die aan beide gronden voldoet één keer', async () => {
    const { client } = makeSupabase([], { linked: [ACCOUNT], sharedAccounts: [ACCOUNT, OTHER_ACCOUNT] })
    mockCreateClient.mockResolvedValue(client)

    const res = await GET()
    const body = await res.json()

    expect(body.server_path_account_ids.sort()).toEqual([ACCOUNT, OTHER_ACCOUNT].sort())
  })

  it('laat een persoonlijke, ongekoppelde rekening op het clientpad', async () => {
    const { client } = makeSupabase([], { linked: [], sharedAccounts: [] })
    mockCreateClient.mockResolvedValue(client)

    const res = await GET()
    const body = await res.json()

    expect(body.server_path_account_ids).toEqual([])
  })

  it('geeft 401 zonder sessie', async () => {
    const { client } = makeSupabase([])
    client.auth.getUser = vi.fn(async () => ({ data: { user: null } })) as never
    mockCreateClient.mockResolvedValue(client)

    const res = await GET()
    expect(res.status).toBe(401)
  })
})
