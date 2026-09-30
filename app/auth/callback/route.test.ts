import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor GET /auth/callback — vooral de besloten-testfase-tak (ADR 0047):
 * een niet-uitgenodigd adres dat de hook weigert, moet naar
 * `/login?not_invited=1` redirecten (zowel via het code-uitwisselingspad als
 * via het OAuth `error`/`error_description`-pad), terwijl al het bestaande
 * gedrag (succes, kale annulering, verlopen link) ongewijzigd blijft.
 */

const mockExchangeCodeForSession = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
  })),
}))

// Krant 2C: de preset-beslissing zelf (vers account, bèta) staat in
// lib/krant/aanmelden.test.ts tegen een nep-database; hier alleen of de
// callback hem juist aanroept en de bestemming goed kiest.
const mockZetKrantPreset = vi.fn()
vi.mock('@/lib/krant/aanmelden', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/krant/aanmelden')>()),
  zetKrantPresetBijAanmelden: (...a: unknown[]) => mockZetKrantPreset(...a),
}))

import { GET } from './route'

const ORIGIN = 'https://app.trifinity.nl'

function requestFor(path: string) {
  return new Request(`${ORIGIN}${path}`)
}

function locationOf(res: Response): string {
  const loc = res.headers.get('location')
  expect(loc).toBeTruthy()
  return loc!
}

beforeEach(() => {
  mockExchangeCodeForSession.mockReset()
  mockZetKrantPreset.mockReset()
})

describe('GET /auth/callback — Krant-ingang (Krant 2C, ADR 0192)', () => {
  const KRANT = '/auth/callback?code=abc&next=%2Fonboarding%2Fkrant&product=krant'
  // created_at: net aangemaakt (de Krant-preset eist een vers account, security-run 0.92.28).
  const sessie = { data: { user: { id: 'user-vers', created_at: new Date().toISOString() } }, error: null }

  it('vers account + product=krant → preset op de eigen id, door naar /onboarding/krant', async () => {
    mockExchangeCodeForSession.mockResolvedValue(sessie)
    mockZetKrantPreset.mockResolvedValue(true)
    const res = await GET(requestFor(KRANT))
    expect(mockZetKrantPreset).toHaveBeenCalledTimes(1)
    expect(mockZetKrantPreset).toHaveBeenCalledWith(expect.anything(), 'user-vers', { aangemaaktOp: sessie.data.user.created_at })
    expect(locationOf(res)).toBe(`${ORIGIN}/onboarding/krant`)
  })

  it('bestaand account (of buiten de bèta): preset geweigerd → niet naar de Krant-onboarding, maar de gewone landing', async () => {
    mockExchangeCodeForSession.mockResolvedValue(sessie)
    mockZetKrantPreset.mockResolvedValue(false)
    const res = await GET(requestFor(KRANT))
    expect(locationOf(res)).toBe(`${ORIGIN}/dashboard`)
  })

  it('een fout bij het zetten laat de aanmelding niet stranden: gewone landing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockExchangeCodeForSession.mockResolvedValue(sessie)
    mockZetKrantPreset.mockRejectedValue(new Error('db weg'))
    const res = await GET(requestFor(KRANT))
    expect(locationOf(res)).toBe(`${ORIGIN}/dashboard`)
    spy.mockRestore()
  })

  it.each(['budget', 'KRANT', '', 'geheel'])('onbekend of ander product (%s) → geen Krant-preset', async (product) => {
    mockExchangeCodeForSession.mockResolvedValue(sessie)
    const res = await GET(requestFor(`/auth/callback?code=abc&next=%2Foverzicht&product=${encodeURIComponent(product)}`))
    expect(mockZetKrantPreset).not.toHaveBeenCalled()
    expect(locationOf(res)).toBe(`${ORIGIN}/overzicht`)
  })

  it('zonder product blijft alles bij het oude, ook met next=/onboarding/krant (de pagina toetst zelf)', async () => {
    mockExchangeCodeForSession.mockResolvedValue(sessie)
    const res = await GET(requestFor('/auth/callback?code=abc&next=%2Foverzicht'))
    expect(mockZetKrantPreset).not.toHaveBeenCalled()
    expect(locationOf(res)).toBe(`${ORIGIN}/overzicht`)
  })

  it('next blijft een veilige relatieve route, ook met product=krant', async () => {
    mockExchangeCodeForSession.mockResolvedValue(sessie)
    mockZetKrantPreset.mockResolvedValue(true)
    const res = await GET(requestFor('/auth/callback?code=abc&next=%2F%2Fevil.com&product=krant'))
    expect(locationOf(res)).toBe(`${ORIGIN}/dashboard`)
  })

  it('geen preset zonder een geslaagde code-uitwisseling', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { message: 'invalid flow state, expired' } })
    const res = await GET(requestFor(KRANT))
    expect(mockZetKrantPreset).not.toHaveBeenCalled()
    expect(locationOf(res)).toBe(`${ORIGIN}/login?confirm_error=1`)
  })
})

describe('GET /auth/callback — bestaand gedrag (ongewijzigd)', () => {
  it('redirect naar `next` (of home) bij een geslaagde code-uitwisseling', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    const res = await GET(requestFor('/auth/callback?code=abc&next=/overzicht'))
    expect(locationOf(res)).toBe(`${ORIGIN}/overzicht`)
  })

  it('weigert een onveilig `next`-pad en valt terug op de safe-redirect-fallback', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    const res = await GET(requestFor('/auth/callback?code=abc&next=//evil.com'))
    // /dashboard = het "ga naar home"-doel; de middleware vertaalt hem daarna
    // naar het gekozen homescherm (profiles.home_screen).
    expect(locationOf(res)).toBe(`${ORIGIN}/dashboard`)
  })

  it('kale /login?confirm_error=1 bij ontbrekende code en geen ?error=', async () => {
    const res = await GET(requestFor('/auth/callback'))
    expect(locationOf(res)).toBe(`${ORIGIN}/login?confirm_error=1`)
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('kale /login (zonder banner) bij OAuth-annulering (?error=access_denied)', async () => {
    const res = await GET(requestFor('/auth/callback?error=access_denied'))
    expect(locationOf(res)).toBe(`${ORIGIN}/login`)
  })

  it('/login?confirm_error=1 bij een niet-sentinel code-uitwisselingsfout (verlopen link)', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: 'invalid flow state, expired' },
    })
    const res = await GET(requestFor('/auth/callback?code=abc'))
    expect(locationOf(res)).toBe(`${ORIGIN}/login?confirm_error=1`)
  })
})

describe('GET /auth/callback — besloten testfase (ADR 0047)', () => {
  it('redirect naar /login?not_invited=1 als de code-uitwisseling de sentinel teruggeeft', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: 'TRIFINITY_NOT_INVITED: dit e-mailadres staat niet op de lijst.' },
    })
    const res = await GET(requestFor('/auth/callback?code=abc'))
    expect(locationOf(res)).toBe(`${ORIGIN}/login?not_invited=1`)
  })

  it('herkent de sentinel case-insensitief in de code-uitwisselingsfout', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: 'trifinity_not_invited: nope' },
    })
    const res = await GET(requestFor('/auth/callback?code=abc'))
    expect(locationOf(res)).toBe(`${ORIGIN}/login?not_invited=1`)
  })

  it('redirect naar /login?not_invited=1 als OAuth `error_description` de sentinel bevat', async () => {
    const res = await GET(
      requestFor(
        '/auth/callback?error=server_error&error_description=' +
          encodeURIComponent('TRIFINITY_NOT_INVITED: geen toegang'),
      ),
    )
    expect(locationOf(res)).toBe(`${ORIGIN}/login?not_invited=1`)
  })

  it('redirect naar /login?not_invited=1 als de sentinel in het OAuth `error`-veld zelf zit', async () => {
    const res = await GET(
      requestFor('/auth/callback?error=' + encodeURIComponent('TRIFINITY_NOT_INVITED')),
    )
    expect(locationOf(res)).toBe(`${ORIGIN}/login?not_invited=1`)
  })

  it('een gewone OAuth-annulering (access_denied, geen sentinel) blijft de kale /login', async () => {
    const res = await GET(
      requestFor('/auth/callback?error=access_denied&error_description=User+cancelled'),
    )
    expect(locationOf(res)).toBe(`${ORIGIN}/login`)
  })
})
