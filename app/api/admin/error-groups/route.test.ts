import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor /api/admin/error-groups — de werkvoorraad achter `/beheer/errors`
 * (ADR 0113). Contract:
 *   - 401 zonder sessie, 403 zonder superadmin-rol, vóór élke DB-aanraking;
 *   - GET groepeert logregels tot foutsoorten met een afgeleide open-stand;
 *   - POST vinkt af met SERVER-BEPAALDE cijfers: telling, laatst-gezien en
 *     `resolved_by` komen uit de server, nooit uit de request;
 *   - zod op de mutaties (400 bij een ongeldige signature) en de platte
 *     error-envelope `{ error: string }` (ADR 0044);
 *   - elke mutatie belandt in het auditlog.
 */

const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockLogAdminAction = vi.fn()

interface LogRow {
  id: string
  context: string | null
  message: string
  level: string
  url: string | null
  stack: string | null
  created_at: string
}

let logRows: LogRow[]
/** Totaal in de DB; hoger dan `logRows` = het venster is afgekapt. */
let totalRowCount: number | null
let resolutionRows: unknown[]
let upserted: Record<string, unknown>[]
let deletedSignatures: string[]
let deleteCount: number | null
let touchedTables: string[]

function makeClient() {
  return {
    auth: { getUser: mockGetUser },
    from(table: string) {
      touchedTables.push(table)
      if (table === 'error_logs') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {
          // De head-count-variant (`select('id', { head: true })`) levert direct
          // een promise; het leesvenster ketent door naar .order().limit().
          select: (_cols: string, opts?: { head?: boolean }) =>
            opts?.head
              ? Promise.resolve({ data: null, error: null, count: totalRowCount ?? logRows.length })
              : b,
          order: () => b,
          limit: () => Promise.resolve({ data: logRows, error: null }),
        }
        return b
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => Promise.resolve({ data: resolutionRows, error: null }),
        upsert: (row: Record<string, unknown>) => {
          upserted.push(row)
          return Promise.resolve({ error: null })
        },
        delete: () => b,
        eq: (_col: string, value: string) => {
          deletedSignatures.push(value)
          return Promise.resolve({ error: null, count: deleteCount })
        },
      }
      return b
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => makeClient()) }))
vi.mock('@/lib/admin', () => ({
  isSuperAdmin: (...args: unknown[]) => mockIsSuperAdmin(...args),
}))
vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}))

import { GET, POST, DELETE } from './route'
import { errorSignature } from '@/lib/alerts/error-signature'

const SUPERADMIN = { id: 'admin-1', email: 'admin@trifinity.nl' }

function logRow(over: Partial<LogRow> & { created_at: string }): LogRow {
  return {
    id: `id-${over.created_at}`,
    context: 'window.onerror',
    message: 'Budget niet gevonden',
    level: 'error',
    url: null,
    stack: null,
    ...over,
  }
}

function jsonRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

const SIG = errorSignature('window.onerror', 'Budget niet gevonden')

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: SUPERADMIN } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
  logRows = []
  totalRowCount = null
  resolutionRows = []
  upserted = []
  deletedSignatures = []
  deleteCount = 1
  touchedTables = []
})

describe('superadmin-gate', () => {
  it('GET → 401 zonder sessie, zonder DB-aanraking', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(touchedTables).toHaveLength(0)
  })

  it('GET → 403 voor een ingelogde niet-superadmin', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await GET()
    expect(res.status).toBe(403)
    expect(touchedTables).toHaveLength(0)
  })

  it('POST → 403 voor een niet-superadmin, zonder schrijfactie', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await POST(jsonRequest({ signature: SIG }))
    expect(res.status).toBe(403)
    expect(upserted).toHaveLength(0)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('DELETE → 401 zonder sessie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(jsonRequest({ signature: SIG }))
    expect(res.status).toBe(401)
    expect(deletedSignatures).toHaveLength(0)
  })
})

describe('GET — groeperen', () => {
  it('levert foutsoorten met een samenvatting', async () => {
    logRows = [
      logRow({ created_at: '2026-08-02T10:00:00.000Z', message: 'Budget 42 niet gevonden' }),
      logRow({ created_at: '2026-08-01T10:00:00.000Z', message: 'Budget 99 niet gevonden' }),
      logRow({ created_at: '2026-08-03T10:00:00.000Z', message: 'Verbinding verbroken' }),
    ]
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.groups).toHaveLength(2)
    expect(body.summary).toMatchObject({ totalGroups: 2, openGroups: 2, totalRows: 3 })
    expect(body.truncated).toBe(false)
  })

  it('truncated komt uit een head-count, niet uit rows.length', async () => {
    // Regressie: `rows.length >= MAX_ROWS` kan de PostgREST-cap (max_rows=1000)
    // per definitie niet overschrijden en zou dus altijd false blijven.
    logRows = [logRow({ created_at: '2026-08-01T10:00:00.000Z' })]
    totalRowCount = 5000
    const body = await (await GET()).json()
    expect(body.truncated).toBe(true)
    expect(body.windowSize).toBe(1000)
  })

  it('zet no-store zodat foutteksten niet in een browsercache blijven staan', async () => {
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('POST — afvinken', () => {
  beforeEach(() => {
    logRows = [
      logRow({ created_at: '2026-08-01T10:00:00.000Z' }),
      logRow({ created_at: '2026-08-05T10:00:00.000Z' }),
    ]
  })

  it('400 bij een signature die niet de juiste vorm heeft (zod)', async () => {
    const res = await POST(jsonRequest({ signature: 'niet-hex' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    // Platte envelope: `error` is een string, geen genest object (ADR 0044).
    expect(typeof body.error).toBe('string')
    expect(upserted).toHaveLength(0)
  })

  it('404 als de foutsoort niet in het leesvenster staat', async () => {
    const res = await POST(jsonRequest({ signature: '0123456789abcdef' }))
    expect(res.status).toBe(404)
    expect(upserted).toHaveLength(0)
  })

  it('slaat SERVER-bepaalde cijfers op, niet die van de client', async () => {
    const res = await POST(
      jsonRequest({
        signature: SIG,
        note: 'kaart R6-12',
        // Zou de client dit meesturen, dan mag het niet doorwerken.
        resolved_count: 9999,
        resolved_by: 'iemand-anders',
        last_seen_at: '1999-01-01T00:00:00.000Z',
      }),
    )
    expect(res.status).toBe(200)
    expect(upserted).toHaveLength(1)
    expect(upserted[0]).toMatchObject({
      signature: SIG,
      resolved_count: 2,
      last_seen_at: '2026-08-05T10:00:00.000Z',
      resolved_by: SUPERADMIN.id,
      note: 'kaart R6-12',
    })
  })

  it('logt de beheeractie zonder de foutmelding zelf te kopiëren', async () => {
    await POST(jsonRequest({ signature: SIG }))
    expect(mockLogAdminAction).toHaveBeenCalledTimes(1)
    const [, params] = mockLogAdminAction.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(params).toMatchObject({ action: 'errors.resolve', targetLabel: SIG })
    expect(JSON.stringify(params)).not.toContain('Budget niet gevonden')
  })
})

describe('DELETE — vinkje weghalen', () => {
  it('400 bij een ongeldige signature', async () => {
    const res = await DELETE(jsonRequest({ signature: 'x' }))
    expect(res.status).toBe(400)
    expect(deletedSignatures).toHaveLength(0)
  })

  it('404 als er niets afgevinkt stond', async () => {
    deleteCount = 0
    const res = await DELETE(jsonRequest({ signature: SIG }))
    expect(res.status).toBe(404)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('200 + auditlog bij succes', async () => {
    const res = await DELETE(jsonRequest({ signature: SIG }))
    expect(res.status).toBe(200)
    expect(deletedSignatures).toEqual([SIG])
    const [, params] = mockLogAdminAction.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(params).toMatchObject({ action: 'errors.reopen', targetLabel: SIG })
  })
})
