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
  ontbrekendeTabel: string | null
  rpcError: boolean
  /** Storage-listing van de screenshots-bucket faalt (ADR 0152). */
  storageError: boolean
}
let cfg: Cfg
let deletedTables: string[]
let rpcCalls: string[]
let storageRemoved: string[]

// Eén levend account met één verlopen (> 90 dagen) en één vers beeld, plus één
// prefix van een verdwenen account (wees) — de retentie hoort 3 van de 4 te wissen.
const LIVE = '11111111-1111-4111-8111-111111111111'
const WEES = '22222222-2222-4222-8222-222222222222'
const STORAGE_TREE: Record<string, { name: string; id: string | null; created_at: string | null }[]> = {
  '': [
    { name: LIVE, id: null, created_at: null },
    { name: WEES, id: null, created_at: null },
  ],
  [LIVE]: [
    { name: 'oud.png', id: 'a', created_at: '2020-01-01T00:00:00.000Z' },
    { name: 'vers.png', id: 'b', created_at: new Date().toISOString() },
  ],
  [WEES]: [{ name: 'w.png', id: 'c', created_at: new Date().toISOString() }],
}

function makeService() {
  function from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      delete: () => b,
      select: () => b,
      update: () => b,
      // `profiles`: bestaanscheck van de prefixen; `user_reports`: pad loskoppelen.
      in: (_col: string, values: string[]) =>
        Promise.resolve(
          table === 'profiles'
            ? { data: values.filter((v) => v === LIVE).map((id) => ({ id })), error: null }
            : { data: null, error: null },
        ),
      lt: () => {
        deletedTables.push(table)
        return Promise.resolve(
          cfg.deleteErrorTable === table
            ? { count: null, error: { message: `mock-fout ${table}` } }
            : cfg.ontbrekendeTabel === table
              ? { count: null, error: { message: `Could not find the table 'public.${table}'`, code: 'PGRST205' } }
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
  // Alleen de screenshots-bucket heeft inhoud; pension-documents is leeg (zoals live).
  const storage = {
    from: (bucket: string) => ({
      list: async (dir: string) =>
        cfg.storageError
          ? { data: null, error: { message: `mock-storage-fout ${bucket}` } }
          : { data: bucket === 'user-report-screenshots' ? (STORAGE_TREE[dir] ?? []) : [], error: null },
      remove: async (paths: string[]) => {
        storageRemoved.push(...paths.map((p) => `${bucket}/${p}`))
        return { data: [], error: null }
      },
    }),
  }
  // Bevestiging van een wees-kandidaat: WEES bestaat niet meer in auth.users.
  const auth = {
    admin: {
      getUserById: async (id: string) =>
        id === WEES
          ? { data: { user: null }, error: { status: 404, code: 'user_not_found', message: 'User not found' } }
          : { data: { user: { id } }, error: null },
    },
  }
  return { from, rpc, storage, auth }
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
  storageRemoved = []
  cfg = { deleteErrorTable: null, ontbrekendeTabel: null, rpcError: false, storageError: false }
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
    // Plus error_log_resolutions: zelfde termijn als error_logs, maar op
    // `last_seen_at` en dus buiten de created_at-lus (ADR 0113).
    expect(deletedTables).toContain('error_log_resolutions')
    // Plus user_activity_days: 400 dagen op de `date`-kolom `day` (ADR 0146).
    expect(deletedTables).toContain('user_activity_days')
    // Plus user_activity_modules: dezelfde 400 dagen op `day` (ADR 0147, fase 2).
    expect(deletedTables).toContain('user_activity_modules')
    expect(deletedTables).toHaveLength(Object.keys(RETENTION_MONTHS).length + 3)

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

  it('een nog niet uitgerolde user_activity_days is geen storing: 200 + success + overgeslagen (ADR 0146)', async () => {
    cfg.ontbrekendeTabel = 'user_activity_days'
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.overgeslagen).toContain('user_activity_days')
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'retention', status: 'success' }),
    )
  })

  it('een nog niet uitgerolde user_activity_modules is ook geen storing (ADR 0147, fase 2)', async () => {
    cfg.ontbrekendeTabel = 'user_activity_modules'
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.overgeslagen).toContain('user_activity_modules')
  })

  it('een ándere fout op user_activity_modules blijft wél een storing', async () => {
    cfg.deleteErrorTable = 'user_activity_modules'
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(500)
  })

  it('een ándere fout op user_activity_days blijft wél een storing', async () => {
    cfg.deleteErrorTable = 'user_activity_days'
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(500)
  })

  it('nooit een rauwe error.message in de response-body', async () => {
    cfg.deleteErrorTable = 'error_logs'
    const res = await GET(req('cron-secret'))
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('mock-fout')
  })

  /**
   * ADR 0152: de schermafbeeldingen bij meldingen leven in een storage-bucket
   * zonder FK-cascade. De cron wist wezen (account weg) en verlopen beelden
   * (> 90 dagen) en telt ze apart; een storage-fout is een storing, geen ruis.
   */
  it('veegt de user-scoped buckets: verlopen én wezen, vers beeld van een levend account blijft', async () => {
    const res = await GET(req('cron-secret'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(storageRemoved.sort()).toEqual([
      `user-report-screenshots/${LIVE}/oud.png`,
      `user-report-screenshots/${WEES}/w.png`,
    ])
    expect(body.deleted['storage:user-report-screenshots']).toBe(1)
    expect(body.deleted['storage:pension-documents']).toBe(0)
    expect(body.storage_wees).toEqual({ 'user-report-screenshots': 1, 'pension-documents': 0 })
  })

  it('een storage-fout op de screenshots-bucket → 500 + job_runs status error, zonder rauwe melding', async () => {
    cfg.storageError = true
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('mock-storage-fout')
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'retention', status: 'error' }),
    )
  })
})
