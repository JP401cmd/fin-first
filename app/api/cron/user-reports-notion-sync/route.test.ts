import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Tests voor GET /api/cron/user-reports-notion-sync:
 *   - auth-matrix identiek aan app/api/cron/retention/route.test.ts (fail-closed)
 *   - rijen met notion_sync_attempts >= 5 worden uitgesloten via de query
 *     (.lt('notion_sync_attempts', MAX_ATTEMPTS))
 *   - recordJobRun aangeroepen met job 'user-reports-notion-sync'
 *   - een niet-geconfigureerd Notion-token (pushReportToNotion → not-configured)
 *     zet de job NIET op 'error' (inrichting ≠ storing)
 *   - credentials worden ÉÉN keer opgehaald, vóór de lus, en meegegeven aan
 *     elke push; zonder token stopt de run meteen
 */

const mockRecordJobRun = vi.fn()
vi.mock('@/lib/job-runs', () => ({ recordJobRun: (...a: unknown[]) => mockRecordJobRun(...a) }))

const mockPushReportToNotion = vi.fn()
const mockGetNotionCredentials = vi.fn()
vi.mock('@/lib/user-reports/notion', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/user-reports/notion')>()
  return {
    ...actual,
    pushReportToNotion: (...a: unknown[]) => mockPushReportToNotion(...a),
    getNotionCredentials: () => mockGetNotionCredentials(),
  }
})

const CREDENTIALS = { token: 'ntn_test', dataSourceId: 'ds-test' }

interface Cfg {
  rows: Record<string, unknown>[]
  selectError: { message: string } | null
}
let cfg: Cfg
let inCalls: Array<{ col: string; values: unknown[] }>
let ltCalls: Array<{ col: string; value: unknown }>

function makeService() {
  function from(table: string) {
    if (table !== 'user_reports') throw new Error(`onverwachte tabel: ${table}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      in: (col: string, values: unknown[]) => {
        inCalls.push({ col, values })
        return b
      },
      lt: (col: string, value: unknown) => {
        ltCalls.push({ col, value })
        return b
      },
      order: () => b,
      limit: () =>
        Promise.resolve(
          cfg.selectError ? { data: null, error: cfg.selectError } : { data: cfg.rows, error: null },
        ),
    }
    return b
  }
  return { from }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => makeService() }))

import { GET } from './route'

function req(secret?: string): Request {
  const url = secret
    ? `https://x.test/api/cron/user-reports-notion-sync?secret=${secret}`
    : 'https://x.test/api/cron/user-reports-notion-sync'
  return new Request(url)
}

function mkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    user_id: 'user-1',
    email: 'melder@test.nl',
    report_type: 'bug',
    screen_label: 'Overzicht',
    description: 'Iets werkt niet.',
    expected: null,
    consent_inzage: true,
    route: '/overzicht',
    page_title: 'Overzicht',
    user_agent: 'vitest-agent',
    viewport: '1920x1080',
    app_version: '1.0.0',
    screenshot_path: null,
    notion_page_id: null,
    notion_sync_status: 'pending',
    notion_sync_attempts: 0,
    notion_last_error: null,
    created_at: '2026-08-06T10:00:00.000Z',
    ...overrides,
  }
}

const ORIG = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  inCalls = []
  ltCalls = []
  cfg = { rows: [], selectError: null }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  delete process.env.VERCEL_ENV
  process.env.CRON_SECRET = 'cron-secret'
  mockPushReportToNotion.mockResolvedValue({ ok: true, pageId: 'p1' })
  mockGetNotionCredentials.mockResolvedValue(CREDENTIALS)
})

afterEach(() => {
  process.env = { ...ORIG }
})

describe('cron auth-matrix (fail-closed, identiek aan /api/cron/retention)', () => {
  it('productie zonder CRON_SECRET → 500', async () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.CRON_SECRET
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(mockPushReportToNotion).not.toHaveBeenCalled()
    expect(mockRecordJobRun).not.toHaveBeenCalled()
  })

  it('fout secret → 401', async () => {
    const res = await GET(req('verkeerd'))
    expect(res.status).toBe(401)
    expect(mockPushReportToNotion).not.toHaveBeenCalled()
  })

  it('dev zonder secret → verwerkt (200)', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req())
    expect(res.status).toBe(200)
  })

  it('geldig secret → 200', async () => {
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
  })
})

describe('cron verwerking — query sluit uitgeputte rijen uit', () => {
  it('query filtert op notion_sync_attempts < 5 (MAX_ATTEMPTS) en status pending/error', async () => {
    cfg.rows = [mkRow()]
    await GET(req('cron-secret'))

    expect(ltCalls).toContainEqual({ col: 'notion_sync_attempts', value: 5 })
    expect(inCalls).toContainEqual({ col: 'notion_sync_status', values: ['pending', 'error'] })
  })
})

describe('cron verwerking — recordJobRun', () => {
  it('aangeroepen met job "user-reports-notion-sync"', async () => {
    cfg.rows = [mkRow()]
    await GET(req('cron-secret'))

    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'user-reports-notion-sync' }),
    )
  })

  it('gemengd resultaat (1 synced, 1 failed) → status error + juiste summary', async () => {
    cfg.rows = [mkRow({ id: 'row-ok' }), mkRow({ id: 'row-fail' })]
    mockPushReportToNotion
      .mockResolvedValueOnce({ ok: true, pageId: 'p1' })
      .mockResolvedValueOnce({ ok: false, reason: 'error', error: 'notion 500' })

    const res = await GET(req('cron-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.synced).toBe(1)
    expect(body.failed).toBe(1)
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'user-reports-notion-sync', status: 'error' }),
    )
  })

  it('alle rijen synced → status success', async () => {
    cfg.rows = [mkRow({ id: 'row-ok' })]
    mockPushReportToNotion.mockResolvedValue({ ok: true, pageId: 'p1' })

    await GET(req('cron-secret'))

    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'user-reports-notion-sync', status: 'success' }),
    )
  })
})

describe('cron verwerking — niet-geconfigureerd Notion-token is geen storing', () => {
  it('alle rijen not-configured → job blijft "success", geen error-tekst', async () => {
    cfg.rows = [mkRow({ id: 'row-1' }), mkRow({ id: 'row-2' })]
    mockPushReportToNotion.mockResolvedValue({ ok: false, reason: 'not-configured' })

    const res = await GET(req('cron-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.not_configured).toBe(2)
    expect(body.failed).toBe(0)
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        job: 'user-reports-notion-sync',
        status: 'success',
        error: null,
      }),
    )
  })
})

describe('cron verwerking — meldingen zonder inhoud', () => {
  it('overgeslagen rijen tellen niet als storing: job blijft "success", apart geteld', async () => {
    // Een lege melding krijgt bewust nooit een kaartje. Als 'failed' tellen zou
    // de dagelijkse job voor eeuwig op 'error' staan door één "test"-melding.
    cfg.rows = [mkRow({ id: 'row-ok' }), mkRow({ id: 'row-leeg' })]
    mockPushReportToNotion
      .mockResolvedValueOnce({ ok: true, pageId: 'p1' })
      .mockResolvedValueOnce({ ok: false, reason: 'geen-inhoud' })

    const res = await GET(req('cron-secret'))
    const body = await res.json()

    expect(body.synced).toBe(1)
    expect(body.skipped_leeg).toBe(1)
    expect(body.failed).toBe(0)
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        job: 'user-reports-notion-sync',
        status: 'success',
        error: null,
      }),
    )
  })
})

describe('cron verwerking — credentials één keer, niet per rij', () => {
  it('haalt de credentials precies één keer op bij een batch van 3 en geeft ze aan elke push mee', async () => {
    cfg.rows = [mkRow({ id: 'r1' }), mkRow({ id: 'r2' }), mkRow({ id: 'r3' })]

    await GET(req('cron-secret'))

    // Vóór deze fix deed pushReportToNotion zelf per rij twee app_settings-
    // queries; bij 50 rijen waren dat er 100 voor één en dezelfde waarde.
    expect(mockGetNotionCredentials).toHaveBeenCalledTimes(1)
    expect(mockPushReportToNotion).toHaveBeenCalledTimes(3)
    for (const call of mockPushReportToNotion.mock.calls) {
      expect(call[2]).toEqual(CREDENTIALS)
    }
  })

  it('geen token → geen enkele push-poging, alle rijen als not_configured, job blijft success', async () => {
    // De koppeling is niet ingericht. Doorlopen zou 50× hetzelfde antwoord
    // geven; en omdat 'not-configured' bewust geen pogingen ophoogt, zou de
    // batch morgen even groot zijn. Dus: meteen stoppen.
    cfg.rows = [mkRow({ id: 'r1' }), mkRow({ id: 'r2' })]
    mockGetNotionCredentials.mockResolvedValue(null)

    const res = await GET(req('cron-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockPushReportToNotion).not.toHaveBeenCalled()
    expect(body.candidates).toBe(2)
    expect(body.not_configured).toBe(2)
    expect(body.synced).toBe(0)
    expect(body.failed).toBe(0)
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        job: 'user-reports-notion-sync',
        status: 'success',
        error: null,
      }),
    )
  })
})

describe('cron verwerking — select-fout', () => {
  it('kan openstaande meldingen niet ophalen → 500 + job_runs status error, geen rauwe DB-message', async () => {
    cfg.selectError = { message: 'BOOM-SELECT-DETAIL' }
    const res = await GET(req('cron-secret'))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('BOOM-SELECT-DETAIL')
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'user-reports-notion-sync', status: 'error' }),
    )
  })
})
