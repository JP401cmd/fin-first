import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Tests voor GET /api/cron/alerts-sweep (ADR 0102):
 *   - auth-matrix (fail-closed), spiegelt /api/cron/retention;
 *   - geen pushconfiguratie -> stille no-op, cron blijft groen, geen state-write;
 *   - happy path: melding verstuurd, state weggeschreven, job_runs 'success';
 *   - kanaalfout: state NIET doorgeschoven, job_runs 'error', geen rauwe fout
 *     in de response.
 */

const mockRecordJobRun = vi.fn()
vi.mock('@/lib/job-runs', () => ({ recordJobRun: (...a: unknown[]) => mockRecordJobRun(...a) }))

const mockSendPush = vi.fn()
let pushConfigured = true
vi.mock('@/lib/alerts/push', () => ({
  isPushConfigured: () => pushConfigured,
  appBaseUrl: () => 'https://trifinity.app',
  sendPush: (...a: unknown[]) => mockSendPush(...a),
}))

const mockSaveState = vi.fn()
vi.mock('@/lib/alerts/store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/alerts/store')>('@/lib/alerts/store')
  return {
    ...actual,
    saveSweepState: (...a: unknown[]) => mockSaveState(...a),
  }
})

interface Cfg {
  errorRows: { context: string | null; message: string; created_at: string }[]
  failedRuns: { job: string; created_at: string }[]
  watermark: string | null
  readError: boolean
}
let cfg: Cfg

/** Minimale query-builder die de vier leesvormen van de route dekt. */
function makeService() {
  function from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      gt: () => b,
      order: () => b,
      upsert: () => Promise.resolve({ error: null }),
      maybeSingle: () =>
        Promise.resolve(
          table === 'app_settings'
            ? { data: null, error: null }
            : { data: { created_at: new Date().toISOString() }, error: null },
        ),
      limit: () => {
        if (table === 'error_logs') {
          return Promise.resolve(
            cfg.readError
              ? { data: null, error: { message: 'mock-leesfout' } }
              : { data: cfg.errorRows, error: null },
          )
        }
        return b
      },
      then: (resolve: (v: unknown) => unknown) => {
        // Terminale await op `.select().in(...)` (app_settings) of
        // `.select().eq().gt()` (job_runs).
        if (table === 'app_settings') {
          const rows = cfg.watermark
            ? [{ key: 'alerts_error_watermark', value: cfg.watermark }]
            : []
          return Promise.resolve({ data: rows, error: null }).then(resolve)
        }
        return Promise.resolve({ data: cfg.failedRuns, error: null }).then(resolve)
      },
    }
    return b
  }
  return { from }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => makeService() }))

import { GET } from './route'

function req(secret?: string): Request {
  const url = secret
    ? `https://x.test/api/cron/alerts-sweep?secret=${secret}`
    : 'https://x.test/api/cron/alerts-sweep'
  return new Request(url)
}

const ORIG = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  pushConfigured = true
  mockSendPush.mockResolvedValue({ sent: true })
  cfg = {
    errorRows: [],
    failedRuns: [],
    watermark: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    readError: false,
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  delete process.env.VERCEL_ENV
  process.env.CRON_SECRET = 'cron-secret'
})

afterEach(() => {
  process.env = { ...ORIG }
})

describe('cron auth-matrix (fail-closed)', () => {
  it('productie zonder CRON_SECRET -> 500, niets gedaan', async () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.CRON_SECRET
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(mockRecordJobRun).not.toHaveBeenCalled()
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  it('fout secret -> 401', async () => {
    const res = await GET(req('verkeerd'))
    expect(res.status).toBe(401)
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  it('dev zonder secret -> verwerkt (200)', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req())
    expect(res.status).toBe(200)
  })

  it('correct secret -> 200', async () => {
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
  })
})

describe('alerts-sweep verwerking', () => {
  it('geen pushconfiguratie -> stille no-op, cron blijft groen', async () => {
    pushConfigured = false
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSaveState).not.toHaveBeenCalled()
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'alerts-sweep', status: 'success' }),
    )
  })

  it('nieuwe fout -> melding verstuurd + state weggeschreven + job_runs success', async () => {
    cfg.errorRows = [
      {
        context: 'onRequestError:route',
        message: 'Budget 12 niet gevonden',
        created_at: new Date().toISOString(),
      },
    ]
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    expect(mockSendPush).toHaveBeenCalledTimes(1)
    expect(mockSaveState).toHaveBeenCalledTimes(1)
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'alerts-sweep', status: 'success' }),
    )
  })

  it('volle batch -> meerdere leesrondes en achterstand gemeld', async () => {
    // Sinds de sweep dagelijks draait, moet één ronde meer dan één batch kunnen
    // legen; wat dan nog overblijft hoort als `backlog` zichtbaar te zijn op
    // /beheer/jobs i.p.v. stil achter te lopen op de instroom.
    cfg.errorRows = Array.from({ length: 500 }, (_, i) => ({
      context: 'onRequestError:route',
      message: `Budget ${i} niet gevonden`,
      created_at: new Date().toISOString(),
    }))
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { backlog: boolean; errors_scanned: number }
    expect(body.backlog).toBe(true)
    expect(body.errors_scanned).toBeGreaterThan(500)
  })

  it('kanaalfout -> state niet doorgeschoven, job_runs error', async () => {
    cfg.errorRows = [
      {
        context: 'onRequestError:route',
        message: 'Budget 12 niet gevonden',
        created_at: new Date().toISOString(),
      },
    ]
    mockSendPush.mockResolvedValue({ sent: false, skipped: 'send-failed' })
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(500)
    expect(mockSaveState).not.toHaveBeenCalled()
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'alerts-sweep', status: 'error' }),
    )
  })

  it('leesfout -> 500 zonder rauwe error.message in de body', async () => {
    cfg.readError = true
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('mock-leesfout')
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'alerts-sweep', status: 'error' }),
    )
  })
})
