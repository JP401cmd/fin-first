import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor POST /api/user-reports (meldingen van testgebruikers):
 *   - 401 zonder ingelogde gebruiker
 *   - 400-matrix: payload onleesbaar/ontbrekend, zod-validatie, screenshot-regels
 *   - validatiefouten zijn NEDERLANDS — nooit een rauwe zod-tekst
 *   - 429 wanneer de reserveer-RPC de rem laat afgaan
 *   - happy path per type (bug/vraag/aanbeveling): juiste RPC-argumenten, {ok,id}
 *   - Notion-push faalt → response toch 200 (kernbelofte: de melding is nooit kwijt)
 *   - nooit een rauwe error.message in de response-body
 *
 * De rem + insert lopen sinds migratie 20260806161500 via de atomaire RPC
 * `reserve_user_report_slot` (advisory lock in de database), niet meer via een
 * count-dan-insert in deze route. De route telt dus zelf niets meer; wat hier
 * getest wordt is dat hij de RPC correct voedt en zijn drie uitkomsten
 * (toegestaan / geweigerd / fout) juist vertaalt naar HTTP.
 *
 * Mock-stijl gespiegeld op app/api/cron/retention/route.test.ts (auth-matrix).
 */

const mockAuthGetUser = vi.fn()
const mockRpc = vi.fn()
const mockStorageUpload = vi.fn()
const mockPushReportToNotion = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    rpc: (...a: unknown[]) => mockRpc(...a),
    storage: { from: () => ({ upload: (...a: unknown[]) => mockStorageUpload(...a) }) },
  })),
}))

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: vi.fn(() => ({ __service: true })),
}))

// Mock alléén de IO-kant (pushReportToNotion); USER_REPORT_COLUMNS/types blijven echt.
vi.mock('@/lib/user-reports/notion', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/user-reports/notion')>()
  return { ...actual, pushReportToNotion: (...a: unknown[]) => mockPushReportToNotion(...a) }
})

import { POST } from './route'

const USER = { id: 'user-1', email: 'user@test.nl' }

interface Cfg {
  /** false = de rem in de database weigerde deze melding. */
  slotAllowed: boolean
  rpcError: { message: string } | null
}
let cfg: Cfg
/** De argumenten waarmee de route `reserve_user_report_slot` voedde. */
let capturedRpcArgs: Record<string, unknown> | null

/**
 * Bootst de RPC na: de database vult `user_id`/`email` zelf en geeft de
 * volledige rij als `report` terug — precies zoals `returns table (…)` via
 * PostgREST binnenkomt (een array met één rij).
 */
function makeRpc() {
  return vi.fn((fn: string, args: Record<string, unknown>) => {
    if (fn !== 'reserve_user_report_slot') throw new Error(`onverwachte rpc: ${fn}`)
    capturedRpcArgs = args
    if (cfg.rpcError) return Promise.resolve({ data: null, error: cfg.rpcError })
    if (!cfg.slotAllowed) {
      return Promise.resolve({
        data: [{ slot_allowed: false, slot_used: 5, slot_limit: 5, report: null }],
        error: null,
      })
    }
    return Promise.resolve({
      data: [
        {
          slot_allowed: true,
          slot_used: 1,
          slot_limit: 5,
          report: {
            id: args.p_id,
            user_id: USER.id,
            email: USER.email,
            report_type: args.p_report_type,
            screen_label: args.p_screen_label,
            description: args.p_description,
            expected: args.p_expected,
            consent_inzage: args.p_consent_inzage,
            route: args.p_route,
            page_title: args.p_page_title,
            user_agent: args.p_user_agent,
            viewport: args.p_viewport,
            app_version: args.p_app_version,
            screenshot_path: args.p_screenshot_path,
            notion_page_id: null,
            notion_sync_status: 'pending',
            notion_sync_attempts: 0,
            notion_last_error: null,
            created_at: '2026-08-06T10:00:00.000Z',
          },
        },
      ],
      error: null,
    })
  })
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'bug',
    screen: 'Overzicht',
    description: 'Er gaat iets fout op dit scherm.',
    expected: 'Het zou moeten werken.',
    consent: true,
    context: {
      pathname: '/overzicht',
      pageTitle: 'Overzicht',
      userAgent: 'vitest-agent/1.0',
      viewport: '1920x1080',
      appVersion: '1.0.0',
    },
    ...overrides,
  }
}

function makeRequest(
  payload: unknown,
  file?: { name?: string; type?: string; size?: number } | null,
): Request {
  const fd = new FormData()
  fd.set('payload', JSON.stringify(payload))
  if (file) {
    const bytes = new Uint8Array(file.size ?? 10)
    fd.set('screenshot', new File([bytes], file.name ?? 'shot.png', { type: file.type ?? 'image/png' }))
  }
  return { formData: () => Promise.resolve(fd) } as unknown as Request
}

beforeEach(() => {
  vi.clearAllMocks()
  cfg = { slotAllowed: true, rpcError: null }
  capturedRpcArgs = null
  mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
  mockRpc.mockImplementation(makeRpc())
  mockStorageUpload.mockResolvedValue({ error: null })
  mockPushReportToNotion.mockResolvedValue({ ok: true, pageId: 'notion-page-1' })
})

describe('POST /api/user-reports — auth', () => {
  it('401 zonder ingelogde gebruiker', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST({} as Request)
    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('POST /api/user-reports — payload onleesbaar/ontbrekend (400)', () => {
  it('request.formData() zelf faalt → 400', async () => {
    const req = { formData: () => Promise.reject(new Error('boom')) } as unknown as Request
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Ongeldig verzoek.')
  })

  it('geen payload-veld in de FormData → 400', async () => {
    const fd = new FormData()
    const req = { formData: () => Promise.resolve(fd) } as unknown as Request
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Melding ontbreekt.')
  })

  it('payload is geen string (bv. per ongeluk een bestand) → 400', async () => {
    const fd = new FormData()
    fd.set('payload', new File([new Uint8Array(1)], 'x.json'))
    const req = { formData: () => Promise.resolve(fd) } as unknown as Request
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Melding ontbreekt.')
  })

  it('payload is ongeldig JSON → 400', async () => {
    const fd = new FormData()
    fd.set('payload', 'dit-is-geen-json{')
    const req = { formData: () => Promise.resolve(fd) } as unknown as Request
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Melding kon niet gelezen worden.')
  })
})

describe('POST /api/user-reports — zod-validatie (400)', () => {
  it('description < 5 tekens → 400 validation_error, Nederlandse tekst', async () => {
    const req = makeRequest(basePayload({ description: 'kort' }))
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe('validation_error')
    expect(body.error).toBe('Je omschrijving is te kort. Schrijf minstens 5 tekens.')
  })

  it('ontbrekend screen bij bug → 400', async () => {
    const req = makeRequest(basePayload({ type: 'bug', screen: undefined }))
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('Vul in op welk scherm je dit tegenkwam.')
  })

  it('ontbrekend screen bij vraag → 400', async () => {
    const req = makeRequest(
      basePayload({ type: 'vraag', screen: undefined, consent: false }),
    )
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('Vul in op welk scherm je dit tegenkwam.')
  })

  it('aanbeveling met screen meegestuurd → 400 (niet toegestaan)', async () => {
    const req = makeRequest(
      basePayload({ type: 'aanbeveling', screen: 'Overzicht', expected: undefined, consent: false }),
    )
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('Bij een wens hoort geen scherm.')
  })

  it('aanbeveling met consent: true → 400 (niet toegestaan)', async () => {
    const req = makeRequest(
      basePayload({ type: 'aanbeveling', screen: undefined, expected: undefined, consent: true }),
    )
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('Bij een wens hoort geen toestemmingsvraag.')
  })

  it('aanbeveling met een meegestuurd screenshot → 400', async () => {
    const req = makeRequest(
      basePayload({ type: 'aanbeveling', screen: undefined, expected: undefined, consent: false }),
      { type: 'image/png' },
    )
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('Bij een aanbeveling kun je geen schermafbeelding meesturen.')
  })

  it('verkeerde mime → 400', async () => {
    const req = makeRequest(basePayload(), { type: 'application/pdf' })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('Alleen PNG, JPEG of WebP tot 4 MB.')
  })

  it('bestand > 4 MB → 400', async () => {
    const req = makeRequest(basePayload(), { type: 'image/png', size: 4 * 1024 * 1024 + 1 })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('Alleen PNG, JPEG of WebP tot 4 MB.')
  })

  it('ongeldig viewport-formaat → 400', async () => {
    const req = makeRequest(
      basePayload({ context: { ...basePayload().context, viewport: '1920' } }),
    )
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('De schermafmeting van je melding kon niet gelezen worden.')
  })
})

describe('POST /api/user-reports — validatiefouten zijn Nederlands', () => {
  // De melding wordt in een volledig Nederlandse chatflow ingestuurd; een rauwe
  // zod-tekst ("Too big: expected string to have <=4000 characters") zou daar de
  // enige Engelse zin zijn, mét een veldnaam die de melder niets zegt.
  const ENGELSE_ZOD_SPOREN = [
    /Too big/i,
    /Too small/i,
    /expected/i,
    /characters/i,
    /Invalid/i,
    /Required/i,
  ]

  it.each([
    ['te lange omschrijving', basePayload({ description: 'x'.repeat(4001) })],
    ['te korte omschrijving', basePayload({ description: 'kort' })],
    ['te lange verwachting', basePayload({ expected: 'x'.repeat(4001) })],
    ['onbekend type', basePayload({ type: 'geen-geldig-type' })],
    ['ontbrekend scherm', basePayload({ screen: undefined })],
    ['kapot viewport', basePayload({ context: { ...basePayload().context, viewport: 'kapot' } })],
    ['consent geen boolean', basePayload({ consent: 'ja' })],
  ])('%s → Nederlandse tekst, geen zod-Engels', async (_naam, payload) => {
    const res = await POST(makeRequest(payload))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('validation_error')
    for (const spoor of ENGELSE_ZOD_SPOREN) {
      expect(body.error).not.toMatch(spoor)
    }
    // Eindigt als volzin en noemt geen technische veldnaam.
    expect(body.error).toMatch(/\.$/)
    expect(body.error).not.toMatch(/description|screen|viewport|appVersion|userAgent|pathname/)
  })

  it('te lange omschrijving noemt de grens in mensentaal', async () => {
    const res = await POST(makeRequest(basePayload({ description: 'x'.repeat(4001) })))
    expect((await res.json()).error).toBe(
      'Je omschrijving is te lang. Houd het op maximaal 4.000 tekens.',
    )
  })
})

describe('POST /api/user-reports — throttle (429)', () => {
  it('RPC weigert (rem bereikt) → 429 met de Nederlandse tekst', async () => {
    cfg.slotAllowed = false
    const req = makeRequest(basePayload())
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(429)
    expect(body.code).toBe('rate_limited')
    expect(body.error).toBe('Je hebt al veel meldingen gestuurd. Probeer het over een uur nog eens.')
  })

  it('bij weigering wordt er GEEN Notion-kaartje aangemaakt', async () => {
    cfg.slotAllowed = false
    await POST(makeRequest(basePayload()))
    expect(mockPushReportToNotion).not.toHaveBeenCalled()
  })

  it('de route telt niet meer zelf — de rem zit volledig in de RPC', async () => {
    // Vroeger deed de route een count-dan-insert (TOCTOU: N gelijktijdige
    // verzoeken lazen allemaal 0). Nu is er precies één databaseaanroep die
    // tellen én invoegen doet, dus er valt niets meer tussen te wringen.
    await POST(makeRequest(basePayload()))
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc.mock.calls[0][0]).toBe('reserve_user_report_slot')
  })

  it('geeft de limiet niet mee aan de RPC (zou de rem oprekbaar maken)', async () => {
    await POST(makeRequest(basePayload()))
    expect(Object.keys(capturedRpcArgs!)).not.toContain('p_limit')
  })
})

describe('POST /api/user-reports — happy path per type', () => {
  it('bug: RPC gevoed met juiste waarden, response {ok:true,id}', async () => {
    const req = makeRequest(basePayload({ type: 'bug' }))
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(typeof body.id).toBe('string')
    expect(body.id).toBe(capturedRpcArgs!.p_id)

    expect(capturedRpcArgs).toMatchObject({
      p_report_type: 'bug',
      p_screen_label: 'Overzicht',
      p_description: 'Er gaat iets fout op dit scherm.',
      p_expected: 'Het zou moeten werken.',
      p_consent_inzage: true,
      p_route: '/overzicht',
      p_page_title: 'Overzicht',
      p_user_agent: 'vitest-agent/1.0',
      p_viewport: '1920x1080',
      p_app_version: '1.0.0',
    })
  })

  it('stuurt user_id/email NIET mee — die stelt de database zelf vast', async () => {
    // Anders zou een directe PostgREST-aanroep op naam van een ander kunnen
    // melden. De RPC leest auth.uid() en auth.users.email.
    await POST(makeRequest(basePayload()))
    const keys = Object.keys(capturedRpcArgs!)
    expect(keys).not.toContain('p_user_id')
    expect(keys).not.toContain('p_email')
  })

  it('vraag: juiste waarden richting de RPC', async () => {
    const req = makeRequest(basePayload({ type: 'vraag', expected: undefined }))
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(capturedRpcArgs).toMatchObject({
      p_report_type: 'vraag',
      p_screen_label: 'Overzicht',
      p_expected: null,
    })
  })

  it('aanbeveling: consent_inzage geforceerd false, screen_label/expected null', async () => {
    const req = makeRequest(
      basePayload({ type: 'aanbeveling', screen: undefined, expected: undefined, consent: false }),
    )
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(capturedRpcArgs).toMatchObject({
      p_report_type: 'aanbeveling',
      p_screen_label: null,
      p_expected: null,
      p_consent_inzage: false,
    })
  })

  it('roept pushReportToNotion aan met de service-client en de ingevoegde rij', async () => {
    const req = makeRequest(basePayload())
    await POST(req)
    expect(mockPushReportToNotion).toHaveBeenCalledTimes(1)
    const [serviceArg, rowArg] = mockPushReportToNotion.mock.calls[0]
    expect(serviceArg).toEqual({ __service: true })
    expect(rowArg.id).toBe(capturedRpcArgs!.p_id)
  })

  it('een geüpload screenshot gaat als pad mee in dezelfde RPC-aanroep', async () => {
    // Het pad kan niet nagestuurd worden: user_reports heeft bewust geen
    // eigen-rij UPDATE-policy, dus een na-update zou stil 0 rijen raken.
    await POST(makeRequest(basePayload(), { type: 'image/png' }))
    expect(capturedRpcArgs!.p_screenshot_path).toBe(`${USER.id}/${capturedRpcArgs!.p_id}.png`)
  })
})

describe('POST /api/user-reports — Notion-push faalt → melding blijft bewaard', () => {
  it('pushReportToNotion gooit → response toch 200, rij is ingevoegd', async () => {
    mockPushReportToNotion.mockRejectedValue(new Error('notion is plat'))
    const req = makeRequest(basePayload())
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(capturedRpcArgs).not.toBeNull()
  })

  it('pushReportToNotion resolvet not-ok → response toch 200', async () => {
    mockPushReportToNotion.mockResolvedValue({ ok: false, reason: 'error', error: 'notion 500' })
    const req = makeRequest(basePayload())
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })
})

describe('POST /api/user-reports — geen rauwe error.message in de response', () => {
  it('RPC-fout → generieke 500-tekst, geen DB-detail lekt naar de client', async () => {
    cfg.rpcError = { message: 'BOOM-DB-DETAIL-COLUMN-XYZ' }
    const req = makeRequest(basePayload())
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('BOOM-DB-DETAIL-COLUMN-XYZ')
  })

  it('een PostgrestError wordt server-side leesbaar gelogd, niet als [object Object]', async () => {
    // Een PostgrestError is een plat object, geen Error-instantie. `String(err)`
    // maakte daar '[object Object]' van — de bruikbaarste helft van elke DB-fout
    // verdween daarmee uit de logs.
    const logged: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      logged.push(a.map(String).join(' '))
    })
    cfg.rpcError = {
      message: 'permission denied for function reserve_user_report_slot',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ code: '42501', details: 'iets', hint: 'grant execute' } as any),
    }

    await POST(makeRequest(basePayload()))

    const regel = logged.join('\n')
    expect(regel).not.toContain('[object Object]')
    expect(regel).toContain('permission denied for function reserve_user_report_slot')
    expect(regel).toContain('code=42501')
    spy.mockRestore()
  })
})
