import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RETENTION_MONTHS } from '@/lib/retention'

/**
 * Tests voor GET /api/cron/retention ([Arch F3] Recht 4, ADR 0059):
 *   - auth-matrix (fail-closed): prod zonder secret → 500; fout secret → 401;
 *     dev zonder secret → ok; correct secret → ok;
 *   - happy path: purge per retentie-tabel + lead_intakes-RPC + job_runs-registratie;
 *   - fout-pad: een gefaalde tabel-delete → 500 + job_runs status 'error'.
 */

const mockRecordJobRun = vi.fn()
vi.mock('@/lib/job-runs', () => ({ recordJobRun: (...a: unknown[]) => mockRecordJobRun(...a) }))

interface Cfg {
  deleteErrorTable: string | null
  rpcError: boolean
}
let cfg: Cfg
let deletedTables: string[]
let rpcCalls: string[]

function makeService() {
  function from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      delete: () => b,
      lt: () => {
        deletedTables.push(table)
        return Promise.resolve(
          cfg.deleteErrorTable === table
            ? { count: null, error: { message: `mock-fout ${table}` } }
            : { count: 5, error: null },
        )
      },
    }
    return b
  }
  const rpc = vi.fn(async (name: string) => {
    rpcCalls.push(name)
    return { error: cfg.rpcError ? { message: 'rpc-fout' } : null }
  })
  return { from, rpc }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => makeService() }))

import { GET } from './route'

function req(secret?: string): Request {
  const url = secret
    ? `https://x.test/api/cron/retention?secret=${secret}`
    : 'https://x.test/api/cron/retention'
  return new Request(url)
}

const ORIG = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  deletedTables = []
  rpcCalls = []
  cfg = { deleteErrorTable: null, rpcError: false }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  delete process.env.VERCEL_ENV
  process.env.CRON_SECRET = 'cron-secret'
})

afterEach(() => {
  process.env = { ...ORIG }
})

describe('cron auth-matrix (fail-closed)', () => {
  it('productie zonder CRON_SECRET → 500', async () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.CRON_SECRET
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(deletedTables).toHaveLength(0)
    expect(mockRecordJobRun).not.toHaveBeenCalled()
  })

  it('fout secret → 401', async () => {
    const res = await GET(req('verkeerd'))
    expect(res.status).toBe(401)
    expect(deletedTables).toHaveLength(0)
  })

  it('dev zonder secret → verwerkt (200)', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req())
    expect(res.status).toBe(200)
  })

  it('correct secret → 200', async () => {
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
  })
})

describe('cron verwerking', () => {
  it('purget elke retentie-tabel + lead_intakes-RPC + logt job_runs', async () => {
    const res = await GET(req('cron-secret'))
    const body = await res.json()

    // Elke tabel uit de single source is gepurged.
    for (const table of Object.keys(RETENTION_MONTHS)) {
      expect(deletedTables).toContain(table)
    }
    expect(deletedTables).toHaveLength(Object.keys(RETENTION_MONTHS).length)

    // lead_intakes via de bestaande SECURITY DEFINER-functie.
    expect(rpcCalls).toContain('purge_expired_lead_intakes')

    expect(body.success).toBe(true)
    expect(body.lead_intakes_purged).toBe(true)
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'retention', status: 'success' }),
    )
  })

  it('een gefaalde tabel-delete → 500 + job_runs status error', async () => {
    cfg.deleteErrorTable = 'error_logs'
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(500)
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'retention', status: 'error' }),
    )
  })

  it('nooit een rauwe error.message in de response-body', async () => {
    cfg.deleteErrorTable = 'error_logs'
    const res = await GET(req('cron-secret'))
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('mock-fout')
  })
})
