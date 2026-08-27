import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Idempotentietest voor `POST /api/onboarding/aangifte-import`.
 *
 * De route bewaakte dubbele submits met een cache in PROCESGEHEUGEN. Op
 * Vercel is elke instantie kortlevend, dus een tweede submit na een koude
 * start schreef assets en debts opnieuw weg. Bovendien mintte de review-stap
 * een VERSE `idempotency_key` per submit-poging, waardoor de dedup ook op een
 * warme instantie principieel niet kon raken.
 *
 * De fix: een SERVER-AFGELEIDE contenthash + een duurzame claim in
 * `import_idempotency`. Deze suite pint het gedrag vast dat daadwerkelijk
 * telt — dezelfde invoer tweemaal aanbieden verandert de tweede keer niets.
 *
 * De Supabase-mock hieronder is bewust STATEFUL: een stub die altijd
 * "geen conflict" teruggeeft zou de dedup wegtesten in plaats van bewijzen.
 */

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
  getAuthClaims: vi.fn(),
}))

import { POST, DELETE } from './route'
import { deriveAangifteImportKey } from '@/lib/aangifte/import-key'
import type { AangifteImportPayload } from '@/lib/aangifte/types'

const USER = { id: 'user-1' }

// ── Mini in-memory Postgres ─────────────────────────────────────────
//
// Genoeg om de claim-semantiek echt te draaien: unieke PK op
// (user_id, scope, key) met 23505 bij conflict, plus filterbare
// select/update/delete.

interface Row {
  [k: string]: unknown
}

interface FakeDb {
  import_idempotency: Row[]
  assets: Row[]
  debts: Row[]
  balance_snapshots: Row[]
  profiles: Row[]
  /** Zet op true om de eerstvolgende asset-insert te laten falen. */
  failAssetInsert: boolean
  /** Aantal keren dat het afronden van de claim (status->done) moet falen. */
  failClaimCompletes: number
}

let db: FakeDb
let idCounter = 0

type Filter = ['eq' | 'lt' | 'in', string, unknown]

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(([op, col, val]) => {
    if (op === 'eq') return row[col] === val
    if (op === 'in') return (val as unknown[]).includes(row[col])
    if (op === 'lt') return String(row[col]) < String(val)
    return true
  })
}

class Query {
  private filters: Filter[] = []
  private op: 'insert' | 'update' | 'delete' | null = null
  private payload: Row | null = null

  constructor(private table: keyof FakeDb) {}

  select() {
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push(['eq', col, val])
    return this
  }
  lt(col: string, val: unknown) {
    this.filters.push(['lt', col, val])
    return this
  }
  in(col: string, val: unknown) {
    this.filters.push(['in', col, val])
    return this
  }
  insert(row: Row) {
    this.op = 'insert'
    this.payload = row
    return this
  }
  update(row: Row) {
    this.op = 'update'
    this.payload = row
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }

  private rows(): Row[] {
    return db[this.table] as Row[]
  }

  private run(): { data: unknown; error: unknown } {
    const table = this.rows()

    if (this.op === 'insert') {
      const row = { ...(this.payload as Row) }

      // Unieke PK op de claim-tabel — dit is de kern van de dedup.
      if (this.table === 'import_idempotency') {
        const clash = table.find(
          (r) =>
            r.user_id === row.user_id &&
            r.scope === row.scope &&
            r.key === row.key,
        )
        if (clash) {
          return {
            data: null,
            error: { code: '23505', message: 'duplicate key' },
          }
        }
        if (row.created_at == null) row.created_at = new Date().toISOString()
      }

      if (this.table === 'assets' && db.failAssetInsert) {
        return { data: null, error: { code: 'XX000', message: 'boom' } }
      }

      if (row.id == null) row.id = `${this.table}-${++idCounter}`
      table.push(row)
      return { data: { id: row.id }, error: null }
    }

    const matched = table.filter((r) => matches(r, this.filters))

    if (this.op === 'update') {
      const marksDone =
        this.table === 'import_idempotency' &&
        (this.payload as Row | null)?.status === 'done'
      if (marksDone && db.failClaimCompletes > 0) {
        db.failClaimCompletes -= 1
        return { data: null, error: { code: '08006', message: 'connection lost' } }
      }
      for (const r of matched) Object.assign(r, this.payload)
      return { data: matched.map((r) => ({ key: r.key })), error: null }
    }

    if (this.op === 'delete') {
      db[this.table] = table.filter(
        (r) => !matches(r, this.filters),
      ) as never
      return { data: matched, error: null }
    }

    return { data: matched, error: null }
  }

  single() {
    return Promise.resolve(this.run())
  }
  maybeSingle() {
    const res = this.run()
    const data = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data
    return Promise.resolve({ data, error: res.error })
  }
  then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
    return Promise.resolve(this.run()).then(resolve)
  }
}

// ── Payload-helpers ─────────────────────────────────────────────────

function basePayload(
  overrides: Partial<AangifteImportPayload> = {},
): AangifteImportPayload {
  return {
    assets: [
      {
        asset_type: 'savings',
        name: 'Spaarrekening',
        current_value: 25000,
        field3: null,
      },
    ],
    debts: [
      {
        debt_type: 'student_loan',
        name: 'DUO',
        current_balance: 8000,
        field3: null,
      },
    ],
    profile_updates: { gross_annual_income: 60000 },
    peildatum: '2025-01-01',
    tax_year: 2024,
    idempotency_key: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  }
}

function postRequest(body: unknown) {
  return {
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Parameters<typeof POST>[0]
}

function deleteRequest(peildatum: string) {
  return {
    url: `https://x.test/api/onboarding/aangifte-import?peildatum=${peildatum}`,
  } as unknown as Parameters<typeof DELETE>[0]
}

beforeEach(() => {
  idCounter = 0
  db = {
    import_idempotency: [],
    assets: [],
    debts: [],
    balance_snapshots: [],
    profiles: [],
    failAssetInsert: false,
    failClaimCompletes: 0,
  }
  mockAuthGetUser.mockReset().mockResolvedValue({ data: { user: USER } })
  mockFrom.mockReset().mockImplementation(
    (table: string) => new Query(table as keyof FakeDb),
  )
})

// ── De sleutel zelf ─────────────────────────────────────────────────

describe('deriveAangifteImportKey', () => {
  it('is stabiel over decimalenruis heen — 1234.5 en 1234.50 geven dezelfde sleutel', () => {
    const a = basePayload({
      assets: [
        { asset_type: 'savings', name: 'Spaar', current_value: 1234.5, field3: null },
      ],
    })
    const b = basePayload({
      assets: [
        { asset_type: 'savings', name: 'Spaar', current_value: 1234.5, field3: null },
      ],
    })
    // Expliciet de klassieke drijvendekomma-val: 0.1 + 0.2 === 0.30000000000000004
    const c = basePayload({
      assets: [
        {
          asset_type: 'savings',
          name: 'Spaar',
          current_value: 1234.5 + 0.0000000001,
          field3: null,
        },
      ],
    })
    expect(deriveAangifteImportKey(a, USER.id)).toBe(deriveAangifteImportKey(b, USER.id))
    expect(deriveAangifteImportKey(a, USER.id)).toBe(deriveAangifteImportKey(c, USER.id))
  })

  it('negeert de client-idempotency_key volledig', () => {
    const a = basePayload({ idempotency_key: '11111111-1111-4111-8111-111111111111' })
    const b = basePayload({ idempotency_key: '22222222-2222-4222-8222-222222222222' })
    expect(deriveAangifteImportKey(a, USER.id)).toBe(deriveAangifteImportKey(b, USER.id))
  })

  it('is onafhankelijk van de rijvolgorde', () => {
    const rows = [
      { asset_type: 'savings' as const, name: 'A', current_value: 100, field3: null },
      { asset_type: 'cash' as const, name: 'B', current_value: 200, field3: null },
    ]
    const a = basePayload({ assets: rows })
    const b = basePayload({ assets: [rows[1], rows[0]] })
    expect(deriveAangifteImportKey(a, USER.id)).toBe(deriveAangifteImportKey(b, USER.id))
  })

  it('is onderscheidend — één gewijzigd bedrag geeft een andere sleutel', () => {
    const a = basePayload()
    const b = basePayload({
      assets: [
        {
          asset_type: 'savings',
          name: 'Spaarrekening',
          current_value: 25000.01,
          field3: null,
        },
      ],
    })
    expect(deriveAangifteImportKey(a, USER.id)).not.toBe(deriveAangifteImportKey(b, USER.id))
  })

  it('is onderscheidend — een verwijderde rij geeft een andere sleutel', () => {
    const a = basePayload()
    const b = basePayload({ debts: [] })
    expect(deriveAangifteImportKey(a, USER.id)).not.toBe(deriveAangifteImportKey(b, USER.id))
  })

  it('correleert niet tussen gebruikers — identieke inhoud geeft een andere sleutel', () => {
    // Privacy: de sleutel is een hash OVER bedragen en namen. Zonder de
    // gebruiker in de invoer zouden twee mensen met dezelfde aangifte-inhoud
    // dezelfde hash krijgen — een correleerbaar gegeven in de tabel.
    const payload = basePayload()
    expect(deriveAangifteImportKey(payload, 'user-1')).not.toBe(
      deriveAangifteImportKey(payload, 'user-2'),
    )
  })
})

// ── De kerntest ─────────────────────────────────────────────────────

describe('POST /api/onboarding/aangifte-import — idempotentie', () => {
  it('schrijft bij een tweede identieke submit NIETS opnieuw', async () => {
    const first = await POST(postRequest(basePayload()))
    const firstBody = await first.json()

    expect(first.status).toBe(200)
    expect(firstBody.ok).toBe(true)
    expect(firstBody.already_imported).toBe(false)
    expect(db.assets).toHaveLength(1)
    expect(db.debts).toHaveLength(1)

    const second = await POST(postRequest(basePayload()))
    const secondBody = await second.json()

    expect(second.status).toBe(200)
    expect(secondBody.ok).toBe(true)
    // Toets 5 — zichtbare terugkoppeling: replay is te onderscheiden.
    expect(secondBody.already_imported).toBe(true)
    // De kern: geen tweede schrijfronde.
    expect(db.assets).toHaveLength(1)
    expect(db.debts).toHaveLength(1)
    // En het antwoord verwijst naar de rijen van de EERSTE import.
    expect(secondBody.asset_ids).toEqual(firstBody.asset_ids)
    expect(secondBody.debt_ids).toEqual(firstBody.debt_ids)
  })

  it('dedupt ook wanneer de client een andere idempotency_key stuurt', async () => {
    // Dit is precies het geval dat de review-stap produceert: elke submit
    // mint een verse UUID. Een client-bepaalde sleutel zou hier falen.
    await POST(postRequest(basePayload()))
    expect(db.assets).toHaveLength(1)

    const second = await POST(
      postRequest(
        basePayload({ idempotency_key: '99999999-9999-4999-8999-999999999999' }),
      ),
    )
    const body = await second.json()

    expect(second.status).toBe(200)
    expect(body.already_imported).toBe(true)
    expect(db.assets).toHaveLength(1)
  })

  it('laat een GECORRIGEERDE her-import wél door', async () => {
    await POST(postRequest(basePayload()))
    expect(db.assets).toHaveLength(1)

    const corrected = basePayload({
      assets: [
        {
          asset_type: 'savings',
          name: 'Spaarrekening',
          current_value: 26000,
          field3: null,
        },
      ],
    })
    const res = await POST(postRequest(corrected))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.already_imported).toBe(false)
    expect(db.assets).toHaveLength(2)
  })

  it('geeft 409 zolang een gelijktijdige import nog loopt', async () => {
    const payload = basePayload()
    // Verse `pending`-claim = een andere request is nu bezig.
    db.import_idempotency.push({
      user_id: USER.id,
      scope: 'aangifte_import',
      key: deriveAangifteImportKey(payload, USER.id),
      peildatum: payload.peildatum,
      status: 'pending',
      response: null,
      created_at: new Date().toISOString(),
    })

    const res = await POST(postRequest(payload))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.ok).toBe(false)
    expect(db.assets).toHaveLength(0)
  })

  it('neemt een verweesde pending-claim over na 15 minuten', async () => {
    const payload = basePayload()
    db.import_idempotency.push({
      user_id: USER.id,
      scope: 'aangifte_import',
      key: deriveAangifteImportKey(payload, USER.id),
      peildatum: payload.peildatum,
      status: 'pending',
      response: null,
      // 30 minuten oud — het proces dat hem legde is gestorven.
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    })

    const res = await POST(postRequest(payload))

    expect(res.status).toBe(200)
    expect(db.assets).toHaveLength(1)
  })

  it('geeft de claim vrij als de import mislukt, zodat een retry mag', async () => {
    db.failAssetInsert = true
    const failed = await POST(postRequest(basePayload()))

    expect(failed.status).toBe(500)
    // Compenserende deletes ruimden op, en de claim is weg.
    expect(db.assets).toHaveLength(0)
    expect(db.import_idempotency).toHaveLength(0)

    // Retry met exact dezelfde inhoud (en dus dezelfde contenthash) mag.
    db.failAssetInsert = false
    const retry = await POST(postRequest(basePayload()))
    const body = await retry.json()

    expect(retry.status).toBe(200)
    expect(body.already_imported).toBe(false)
    expect(db.assets).toHaveLength(1)
  })

  it('geeft via DELETE de claim vrij zodat een bewuste her-import mag', async () => {
    await POST(postRequest(basePayload()))
    expect(db.assets).toHaveLength(1)
    expect(db.import_idempotency).toHaveLength(1)

    const del = await DELETE(deleteRequest('2025-01-01'))
    expect(del.status).toBe(200)
    expect(db.assets).toHaveLength(0)
    // De escape hatch: zonder dit blokkeert de contenthash permanent.
    expect(db.import_idempotency).toHaveLength(0)

    const again = await POST(postRequest(basePayload()))
    const body = await again.json()
    expect(body.already_imported).toBe(false)
    expect(db.assets).toHaveLength(1)
  })

  it('rondt de claim alsnog af als de eerste poging faalt', async () => {
    // Regressie: faalt het afronden (status -> done), dan blijft de claim
    // `pending`. Na de 15-minuten-overname zou een volgende identieke import
    // die verweesde claim overnemen en ALLES OPNIEUW schrijven — precies de
    // dubbele import die deze route hoort te voorkomen.
    db.failClaimCompletes = 1

    const res = await POST(postRequest(basePayload()))
    expect(res.status).toBe(200)
    expect(db.assets).toHaveLength(1)

    // De herkansing moet de claim wél op 'done' hebben gezet.
    expect(db.import_idempotency).toHaveLength(1)
    expect(db.import_idempotency[0].status).toBe('done')

    // En daarmee blijft een verouderde claim onmogelijk: zelfs een submit
    // ver na het overname-venster schrijft niets opnieuw.
    db.import_idempotency[0].created_at = new Date(
      Date.now() - 60 * 60 * 1000,
    ).toISOString()

    const second = await POST(postRequest(basePayload()))
    const body = await second.json()
    expect(body.already_imported).toBe(true)
    expect(db.assets).toHaveLength(1)
  })

  it('scoopt de claim per gebruiker — een andere gebruiker wordt niet geblokkeerd', async () => {
    await POST(postRequest(basePayload()))
    expect(db.assets).toHaveLength(1)

    // Toets 4: assets/debts zijn eigen-rij, dus de sleutel gaat MÉT user_id.
    // Twee gebruikers met toevallig dezelfde aangifte-inhoud mogen elkaar
    // niet blokkeren.
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } } })
    const res = await POST(postRequest(basePayload()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.already_imported).toBe(false)
    expect(db.assets).toHaveLength(2)
  })
})
