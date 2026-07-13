import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Tests voor GET /api/briefing/email/cron:
 *   - auth-matrix: prod zonder secret → 500; fout secret → 401; dev zonder secret → ok;
 *   - happy path: opt-in-gebruiker met snapshot → sendEmail + week-gate geschreven;
 *   - week-gate: al verzonden deze week → skip (geen mail);
 *   - geen snapshot → skip; RESEND niet gezet (skipped) → gate NIET geschreven.
 */

// ── Mocks ────────────────────────────────────────────────────────────
const mockSendEmail = vi.fn()
const mockReadSnapshot = vi.fn()
const mockRecordJobRun = vi.fn()

vi.mock('@/lib/email', () => ({ sendEmail: (...a: unknown[]) => mockSendEmail(...a) }))
vi.mock('@/lib/job-runs', () => ({ recordJobRun: (...a: unknown[]) => mockRecordJobRun(...a) }))
vi.mock('@/lib/briefing/snapshot', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/briefing/snapshot')>()
  return { ...actual, readBriefingSnapshot: (...a: unknown[]) => mockReadSnapshot(...a) }
})

// Configureerbare service-mock.
interface ServiceConfig {
  profiles: Array<{ id: string }>
  profilesError: { message: string } | null
  gateValue: string | null
  email: string | null
}
let cfg: ServiceConfig
const upserts: Array<{ table: string; payload: unknown }> = []

function makeService() {
  const auth = {
    admin: {
      getUserById: vi.fn(async () => ({ data: { user: cfg.email ? { email: cfg.email } : null } })),
    },
  }
  function from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      maybeSingle: async () => {
        if (table === 'app_settings') return { data: cfg.gateValue ? { value: cfg.gateValue } : null, error: null }
        return { data: null, error: null }
      },
      upsert: (payload: unknown) => {
        upserts.push({ table, payload })
        return Promise.resolve({ error: null })
      },
      then: (resolve: (v: unknown) => void) => {
        if (table === 'profiles') {
          resolve({ data: cfg.profilesError ? null : cfg.profiles, error: cfg.profilesError })
        } else {
          resolve({ data: null, error: null })
        }
      },
    }
    return b
  }
  return { from, auth }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => makeService() }))

import { GET } from './route'

function req(secret?: string): Request {
  const url = secret
    ? `https://x.test/api/briefing/email/cron?secret=${secret}`
    : 'https://x.test/api/briefing/email/cron'
  return new Request(url)
}

const ORIG = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  upserts.length = 0
  cfg = {
    profiles: [{ id: 'a1b2c3d4-0000-4000-8000-000000000001' }],
    profilesError: null,
    gateValue: null,
    email: 'user@test.nl',
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  process.env.NEXT_PUBLIC_APP_URL = 'https://trifinity.app'
  delete process.env.VERCEL_ENV
  process.env.CRON_SECRET = 'cron-secret'
  process.env.EMAIL_UNSUB_SECRET = 'unsub-secret'
  // Snapshot met entries + freedom zodat de template een mail oplevert.
  mockReadSnapshot.mockResolvedValue({
    week: '2026-W28',
    lastManualRefresh: '',
    refreshedAt: '2026-07-13T06:00:00.000Z',
    entries: [{ id: 'e1', category: 'observation', text: 'Je week ging goed.' }],
    freedomSnapshot: { totalFreedomDays: 1500, netWorth: 100000, monthlyExpenses: 2000, capturedAt: '2026-07-13T06:00:00.000Z' },
    previousFreedomSnapshot: undefined,
  })
  mockSendEmail.mockResolvedValue({ ok: true })
})

afterEach(() => {
  process.env = { ...ORIG }
})

describe('cron auth-matrix', () => {
  it('productie zonder CRON_SECRET → 500', async () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.CRON_SECRET
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('fout secret → 401', async () => {
    const res = await GET(req('verkeerd'))
    expect(res.status).toBe(401)
    expect(mockSendEmail).not.toHaveBeenCalled()
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
  it('opt-in-gebruiker met snapshot → mail + week-gate geschreven', async () => {
    const res = await GET(req('cron-secret'))
    const body = await res.json()
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    // List-Unsubscribe-headers meegegeven
    const arg = mockSendEmail.mock.calls[0][0]
    expect(arg.headers['List-Unsubscribe']).toContain('/api/briefing/email/unsubscribe?token=')
    expect(arg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    // week-gate weggeschreven
    expect(upserts.some((u) => u.table === 'app_settings')).toBe(true)
    expect(body.summary.sent).toBe(1)
  })

  it('al verzonden deze week → skip (geen mail)', async () => {
    // amsterdamWeekKey(now) is de echte huidige week; zet de gate daarop.
    const { amsterdamWeekKey } = await import('@/lib/briefing/snapshot')
    cfg.gateValue = amsterdamWeekKey(new Date())
    const res = await GET(req('cron-secret'))
    const body = await res.json()
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(body.summary.skipped_week).toBe(1)
  })

  it('geen snapshot → skip', async () => {
    mockReadSnapshot.mockResolvedValue(null)
    const res = await GET(req('cron-secret'))
    const body = await res.json()
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(body.summary.skipped_no_snapshot).toBe(1)
  })

  it('RESEND niet gezet (skipped) → week-gate NIET geschreven', async () => {
    mockSendEmail.mockResolvedValue({ ok: false, skipped: true })
    const res = await GET(req('cron-secret'))
    const body = await res.json()
    expect(body.summary.skipped_no_resend).toBe(1)
    expect(upserts.some((u) => u.table === 'app_settings')).toBe(false)
  })

  it('geen enkel secret (dev) → 500 fail-closed op unsubscribe-token', async () => {
    // Dev (geen VERCEL_ENV): de CRON_SECRET-auth laat het door (dev zonder secret),
    // maar zonder EMAIL_UNSUB_SECRET én zonder CRON_SECRET kan geen veilig
    // afmeld-token getekend worden → fail-closed 500, geen mail.
    delete process.env.CRON_SECRET
    delete process.env.EMAIL_UNSUB_SECRET
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('EMAIL_UNSUB_SECRET afwezig maar CRON_SECRET aanwezig → fallback, 200', async () => {
    delete process.env.EMAIL_UNSUB_SECRET
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })
})
