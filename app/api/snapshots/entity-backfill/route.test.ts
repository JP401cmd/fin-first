import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor /api/snapshots/entity-backfill — de per-entiteit historische
 * saldo-backfill (brok B4a). Verifieert het VASTE contract:
 *   GET  → { entities: { id, name, group, subtype, isActive, currentValue,
 *            months: { month, balance }[] }[] } — 24-maands-as, laatste-per-maand
 *            dedupe, alleen actieve eigen entiteiten, 401 zonder sessie,
 *            400 bij ontbrekend/verkeerd entityType.
 *   POST → zod + logische validatie (toekomst-maand, >24 mnd terug, duplicaat,
 *          lege entries), 401/404 (eigenaarschap+is_active), dryRun-preview
 *          (insert vs update, GEEN writes), echte write (valuations-upsert +
 *          balance_snapshots-mirror op `<month>-01`, net_worth_snapshots ONGEMOEID).
 */

const { mockAuthGetUser, mockGetAuthClaims, mockFrom, mockUpsertSingle } = vi.hoisted(() => ({
  mockAuthGetUser: vi.fn(),
  mockGetAuthClaims: vi.fn(),
  mockFrom: vi.fn(),
  mockUpsertSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
  getAuthClaims: mockGetAuthClaims,
}))

vi.mock('@/lib/balance-snapshot', () => ({
  upsertSingleBalanceSnapshot: (...args: unknown[]) => mockUpsertSingle(...args),
}))

import { GET, POST } from './route'

const USER = { id: 'user-1' }
const CLAIMS = { sub: USER.id }
const ENTITY_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  mockAuthGetUser.mockReset()
  mockGetAuthClaims.mockReset()
  mockFrom.mockReset()
  mockUpsertSingle.mockReset()
  mockUpsertSingle.mockResolvedValue({ ok: true })
})

function getRequest(entityType?: string) {
  const qs = entityType !== undefined ? `?entityType=${entityType}` : ''
  return new Request(`http://localhost/api/snapshots/entity-backfill${qs}`)
}
function postRequest(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

/** Huidige kalendermaand als 'YYYY-MM' (lokale tijd). */
function currentMonth(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

// ── GET-mock: from('assets'|'debts') → entities; from('balance_snapshots') → snaps ──
function mockGetChains(
  entityRows: Array<Record<string, unknown>> | null,
  snapRows: Array<Record<string, unknown>> | null,
  opts: { entityError?: unknown; snapError?: unknown } = {},
) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'balance_snapshots') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: snapRows, error: opts.snapError ?? null }),
      }
    }
    // assets / debts
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: entityRows, error: opts.entityError ?? null }),
    }
  })
}

describe('GET /api/snapshots/entity-backfill', () => {
  it('401 zonder sessie', async () => {
    mockGetAuthClaims.mockResolvedValue(null)
    const res = await GET(getRequest('asset'))
    expect(res.status).toBe(401)
  })

  it('400 bij ontbrekend of verkeerd entityType', async () => {
    mockGetAuthClaims.mockResolvedValue(CLAIMS)
    expect((await GET(getRequest())).status).toBe(400)
    expect((await GET(getRequest('portfolio'))).status).toBe(400)
  })

  it('vorm: 24 maanden-as oud→nieuw, group/subtype/currentValue, alleen actieve', async () => {
    mockGetAuthClaims.mockResolvedValue(CLAIMS)
    mockGetChains(
      [{ id: ENTITY_ID, name: 'ETF Wereld', subtype: 'investment', current: 12000 }],
      [],
    )
    const res = await GET(getRequest('asset'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entities).toHaveLength(1)
    const e = json.entities[0]
    expect(e.id).toBe(ENTITY_ID)
    expect(e.name).toBe('ETF Wereld')
    expect(e.subtype).toBe('investment')
    expect(e.group).toBe('beleggingen') // WEALTH_GROUPS[investment]
    expect(e.isActive).toBe(true)
    expect(e.currentValue).toBe(12000)
    expect(e.months).toHaveLength(24)
    // Oud→nieuw: laatste as-punt = huidige kalendermaand.
    expect(e.months[23].month).toBe(currentMonth())
    // Oplopende maand-strings.
    const keys = e.months.map((m: { month: string }) => m.month)
    expect([...keys].sort()).toEqual(keys)
    // Geen snapshots → alle balances null.
    expect(e.months.every((m: { balance: number | null }) => m.balance === null)).toBe(true)
  })

  it('laatste-per-maand dedupe uit balance_snapshots', async () => {
    mockGetAuthClaims.mockResolvedValue(CLAIMS)
    const m = currentMonth()
    mockGetChains(
      [{ id: ENTITY_ID, name: 'Hypotheek', subtype: 'mortgage', current: 240000 }],
      [
        { entity_id: ENTITY_ID, snapshot_date: `${m}-05`, balance: 250000 },
        { entity_id: ENTITY_ID, snapshot_date: `${m}-20`, balance: 248000 }, // wint in de maand
      ],
    )
    const res = await GET(getRequest('debt'))
    const json = await res.json()
    const e = json.entities[0]
    expect(e.group).toBe('wonen') // getDebtGroup(mortgage)
    expect(e.months[23].month).toBe(m)
    expect(e.months[23].balance).toBe(248000)
  })

  it('500 bij DB-fout op entiteiten-query', async () => {
    mockGetAuthClaims.mockResolvedValue(CLAIMS)
    mockGetChains(null, [], { entityError: { message: 'boom' } })
    const res = await GET(getRequest('asset'))
    expect(res.status).toBe(500)
  })
})

// ── POST-mock: entiteit-fetch, existing-snaps (dryRun) en valuations-upsert ──
function mockPostChains(opts: {
  entity: Record<string, unknown> | null
  existing?: Array<Record<string, unknown>>
}) {
  const valuationUpserts: Array<Record<string, unknown>> = []
  mockFrom.mockImplementation((table: string) => {
    if (table === 'assets' || table === 'debts') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: opts.entity, error: null }),
      }
    }
    if (table === 'balance_snapshots') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: opts.existing ?? [], error: null }),
      }
    }
    if (table === 'valuations') {
      return {
        upsert: vi.fn((row: Record<string, unknown>) => {
          valuationUpserts.push(row)
          return Promise.resolve({ error: null })
        }),
      }
    }
    throw new Error(`onverwachte tabel: ${table}`)
  })
  return { valuationUpserts }
}

const ACTIVE_ASSET = { name: 'ETF Wereld', subtype: 'investment', net_worth_inclusion_pct: 100, is_active: true }

describe('POST /api/snapshots/entity-backfill', () => {
  it('401 zonder sessie', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(postRequest({ entityType: 'asset', entityId: ENTITY_ID, entries: [{ month: '2026-05', balance: 1 }] }))
    expect(res.status).toBe(401)
  })

  it('400 bij lege entries', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const res = await POST(postRequest({ entityType: 'asset', entityId: ENTITY_ID, entries: [] }))
    expect(res.status).toBe(400)
  })

  it('400 bij ongeldig maand-formaat', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const res = await POST(postRequest({ entityType: 'asset', entityId: ENTITY_ID, entries: [{ month: '2026-13', balance: 1 }] }))
    expect(res.status).toBe(400)
  })

  it('400 bij maand in de toekomst', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const future = new Date()
    future.setMonth(future.getMonth() + 2)
    const m = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}`
    const res = await POST(postRequest({ entityType: 'asset', entityId: ENTITY_ID, entries: [{ month: m, balance: 1 }] }))
    expect(res.status).toBe(400)
  })

  it('400 bij maand ouder dan 24 maanden terug', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const old = new Date()
    old.setMonth(old.getMonth() - 25)
    const m = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}`
    const res = await POST(postRequest({ entityType: 'asset', entityId: ENTITY_ID, entries: [{ month: m, balance: 1 }] }))
    expect(res.status).toBe(400)
  })

  it('400 bij dubbele maand in invoer', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const m = currentMonth()
    const res = await POST(
      postRequest({ entityType: 'asset', entityId: ENTITY_ID, entries: [{ month: m, balance: 1 }, { month: m, balance: 2 }] }),
    )
    expect(res.status).toBe(400)
  })

  it('400 bij niet-finite balance', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const res = await POST(
      postRequest({ entityType: 'asset', entityId: ENTITY_ID, entries: [{ month: currentMonth(), balance: Infinity }] }),
    )
    expect(res.status).toBe(400)
  })

  it('400 bij ongeldige entityId (geen uuid)', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const res = await POST(postRequest({ entityType: 'asset', entityId: 'niet-een-uuid', entries: [{ month: currentMonth(), balance: 1 }] }))
    expect(res.status).toBe(400)
  })

  it('404 bij niet-bestaande / andermans entiteit', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    mockPostChains({ entity: null })
    const res = await POST(postRequest({ entityType: 'asset', entityId: ENTITY_ID, entries: [{ month: currentMonth(), balance: 1 }] }))
    expect(res.status).toBe(404)
  })

  it('404 bij inactieve entiteit', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    mockPostChains({ entity: { ...ACTIVE_ASSET, is_active: false } })
    const res = await POST(postRequest({ entityType: 'asset', entityId: ENTITY_ID, entries: [{ month: currentMonth(), balance: 1 }] }))
    expect(res.status).toBe(404)
  })

  it('dryRun: preview insert vs update, GEEN writes', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const m = currentMonth()
    const { valuationUpserts } = mockPostChains({
      entity: ACTIVE_ASSET,
      existing: [{ snapshot_date: `${m}-01`, balance: 9000 }], // bestaat al → update
    })
    const res = await POST(
      postRequest({
        entityType: 'asset',
        entityId: ENTITY_ID,
        dryRun: true,
        entries: [
          { month: m, balance: 10000 },
          { month: '2026-01', balance: 5000 },
        ],
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.preview).toEqual([
      { month: m, oldBalance: 9000, newBalance: 10000, action: 'update' },
      { month: '2026-01', oldBalance: null, newBalance: 5000, action: 'insert' },
    ])
    // Geen enkele write.
    expect(valuationUpserts).toHaveLength(0)
    expect(mockUpsertSingle).not.toHaveBeenCalled()
  })

  it('echte write: valuations-upsert + mirror per entry op <month>-01, net_worth_snapshots ONGEMOEID', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const m = currentMonth()
    const { valuationUpserts } = mockPostChains({ entity: ACTIVE_ASSET })
    const res = await POST(
      postRequest({
        entityType: 'asset',
        entityId: ENTITY_ID,
        entries: [{ month: m, balance: 10000 }],
      }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).count).toBe(1)

    // valuations op de historische datum, exact idioom van de LIVE-flow.
    expect(valuationUpserts).toHaveLength(1)
    expect(valuationUpserts[0]).toMatchObject({
      user_id: USER.id,
      entity_type: 'asset',
      entity_id: ENTITY_ID,
      valuation_date: `${m}-01`,
      value: 10000,
    })

    // Mirror-aanroep met snapshot_date `<month>-01` en de actuele entiteit-velden.
    expect(mockUpsertSingle).toHaveBeenCalledTimes(1)
    const [, userIdArg, dateArg, entityArg] = mockUpsertSingle.mock.calls[0]
    expect(userIdArg).toBe(USER.id)
    expect(dateArg).toBe(`${m}-01`)
    expect(entityArg).toMatchObject({
      type: 'asset',
      id: ENTITY_ID,
      name: ACTIVE_ASSET.name,
      subtype: ACTIVE_ASSET.subtype,
      balance: 10000,
      netWorthInclusionPct: 100,
    })

    // net_worth_snapshots wordt NOOIT aangeraakt (strikt gescheiden totalen).
    const touchedTables = mockFrom.mock.calls.map((c) => c[0])
    expect(touchedTables).not.toContain('net_worth_snapshots')
  })

  it('echte write accepteert negatief saldo (parseAmount-semantiek)', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const m = currentMonth()
    const { valuationUpserts } = mockPostChains({ entity: { ...ACTIVE_ASSET, subtype: 'mortgage' } })
    const res = await POST(
      postRequest({ entityType: 'debt', entityId: ENTITY_ID, entries: [{ month: m, balance: -1500 }] }),
    )
    expect(res.status).toBe(200)
    expect(valuationUpserts[0].value).toBe(-1500)
    expect(mockUpsertSingle.mock.calls[0][3].balance).toBe(-1500)
  })

  it('500 wanneer de balance_snapshots-mirror faalt (mirror is primair doel)', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    mockPostChains({ entity: ACTIVE_ASSET })
    mockUpsertSingle.mockResolvedValue({ ok: false, error: 'mirror boom' })
    const res = await POST(
      postRequest({ entityType: 'asset', entityId: ENTITY_ID, entries: [{ month: currentMonth(), balance: 10000 }] }),
    )
    expect(res.status).toBe(500)
  })
})
