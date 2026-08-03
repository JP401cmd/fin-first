import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor GET /api/ai-execution-prefs — met nadruk op de ONTBREKENDE-KOLOM-
 * terugval.
 *
 * Waarom die terugval een eigen suite verdient: `useExecutionMode`
 * (lib/ai/local/use-execution-mode.ts) blijft bij een niet-ok antwoord bewust in
 * 'resolving' hangen, en dan vertrekt er NIETS — ook het cloudpad niet. Elk
 * oppervlak dat op die hook gate't (chat, categorisatie, en sinds de on-device
 * editie ook /nieuws) valt dus stil zolang `profiles.ai_execution_prefs` in een
 * omgeving nog niet bestaat. Eén niet-toegepaste migratie legde zo een hele
 * pagina plat; deze suite pint vast dat de route dan terugvalt op de
 * hoofdschakelaar in plaats van een 500 te geven.
 *
 * `lib/ai/privacy-gate.ts#readPrefsRow` is de tweede lezer van dezelfde kolom en
 * doet dit al; de twee horen gelijk te lopen.
 */

const mockGetCachedUser = vi.fn()
const mockFrom = vi.fn()
const mockCheckTierGate = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))

vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: (...args: unknown[]) => mockGetCachedUser(...args),
}))

vi.mock('@/lib/require-tier', () => ({
  checkTierGate: (...args: unknown[]) => mockCheckTierGate(...args),
}))

const { GET, POST } = await import('./route')

/** Gate-object zoals `checkTierGate` het teruggeeft als het abonnement mist. */
const GEEN_AI = { subscriptions: [], error: 'Deze functie vereist een AI abonnement' }

const USER = { id: 'user-1' }

/**
 * Bouwt een `from('profiles')`-mock die per SELECT-kolomlijst een ander antwoord
 * geeft — precies wat de terugval nodig heeft: de brede select faalt, de smalle
 * slaagt.
 */
function buildFrom(byColumns: Record<string, { data?: unknown; error?: unknown }>) {
  return vi.fn(() => ({
    select: vi.fn((columns: string) => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: byColumns[columns]?.data ?? null,
          error: byColumns[columns]?.error ?? null,
        }),
      })),
    })),
    // POST doet een own-row update; die legt `updates` vast zodat de test kan
    // zien of er daadwerkelijk geschreven is.
    update: vi.fn((payload: unknown) => {
      updates.push(payload)
      return { eq: vi.fn().mockResolvedValue({ error: null }) }
    }),
  }))
}

/** Payloads van alle `profiles.update(...)`-aanroepen binnen één test. */
let updates: unknown[] = []

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/ai-execution-prefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const UNDEFINED_COLUMN = { code: '42703', message: 'column does not exist' }

beforeEach(() => {
  vi.clearAllMocks()
  updates = []
  mockGetCachedUser.mockResolvedValue(USER)
  mockCheckTierGate.mockResolvedValue(null)
})

describe('GET /api/ai-execution-prefs', () => {
  it('401 zonder sessie', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    mockFrom.mockImplementation(buildFrom({}))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('leest de voorkeuren wanneer de kolom bestaat', async () => {
    mockFrom.mockImplementation(
      buildFrom({
        'privacy_mode, ai_execution_prefs, ai_enabled': {
          data: { privacy_mode: false, ai_execution_prefs: { nieuws: 'lokaal' } },
        },
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.modes.nieuws).toBe('lokaal')
    expect(body.modes.gesprek).toBe('cloud') // volgt de hoofdschakelaar
  })

  it('valt bij een ONTBREKENDE KOLOM terug op de hoofdschakelaar in plaats van 500', async () => {
    mockFrom.mockImplementation(
      buildFrom({
        'privacy_mode, ai_execution_prefs, ai_enabled': { error: UNDEFINED_COLUMN },
        'privacy_mode, ai_enabled': { data: { privacy_mode: true } },
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.privacyMode).toBe(true)
    expect(body.prefs).toEqual({})
    // Zonder overrides volgt élke groep de hoofdschakelaar → allemaal lokaal.
    expect(body.modes.nieuws).toBe('lokaal')
    expect(body.modes.gesprek).toBe('lokaal')
  })

  it('valt terug op cloud wanneer ook privacy_mode nog niet bestaat', async () => {
    mockFrom.mockImplementation(
      buildFrom({
        'privacy_mode, ai_execution_prefs, ai_enabled': { error: UNDEFINED_COLUMN },
        'privacy_mode, ai_enabled': { error: UNDEFINED_COLUMN },
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.privacyMode).toBe(false)
    expect(body.modes.nieuws).toBe('cloud')
  })

  it('ontbreekt ai_enabled óók, dan blijft de hoofdschakelaar staan (geen stille cloud)', async () => {
    // Twee 42703'en achter elkaar: de brede select valt om, en de smalle
    // ('privacy_mode, ai_enabled') óók — want in dit scenario is ai_enabled de
    // ontbrekende kolom. Zonder de derde, kale select zou de route hier
    // `privacy_mode: false` hardcoden en élke groep naar 'cloud' sturen, terwijl
    // deze gebruiker juist privé-modus AAN heeft. Fail-open op de verkeerde as.
    mockFrom.mockImplementation(
      buildFrom({
        'privacy_mode, ai_execution_prefs, ai_enabled': { error: UNDEFINED_COLUMN },
        'privacy_mode, ai_enabled': { error: UNDEFINED_COLUMN },
        privacy_mode: { data: { privacy_mode: true } },
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.privacyMode).toBe(true)
    expect(body.modes.documenten).toBe('lokaal')
    // Alleen het écht onleesbare veld valt terug op de default.
    expect(body.aiEnabled).toBe(true)
  })

  it('geeft WEL 500 bij een andere leesfout — een DB-storing mag geen privé-modus openen', async () => {
    mockFrom.mockImplementation(
      buildFrom({
        'privacy_mode, ai_execution_prefs, ai_enabled': {
          error: { code: '08006', message: 'connection failure' },
        },
      }),
    )

    const res = await GET()
    expect(res.status).toBe(500)
  })
})

/**
 * Het REVOCATIE-GAT.
 *
 * De zuiver lokale paden (pensioen-PDF, aangifte-PDF, rekenhulp, vaste lasten,
 * categorisatie) doen tijdens het genereren nul server-calls. Deze GET was
 * daarmee de laatste server-aanraking vóór het genereren — en hij zei niets over
 * het abonnement. Wie ooit met geldig abonnement een groep op lokaal zette, bleef
 * daarna onbeperkt on-device genereren.
 *
 * De twee helften horen samen getest: de GET moet de stand MELDEN (zodat het
 * genereren stopt) en de POST moet het TERUGZETTEN naar cloud blijven toestaan
 * (zodat niemand opgesloten raakt in een privé-modus die hij niet meer kan
 * verlaten).
 */
describe('abonnementsstand in het antwoord — revocatie op het lokale pad', () => {
  beforeEach(() => {
    mockFrom.mockImplementation(
      buildFrom({
        'privacy_mode, ai_execution_prefs, ai_enabled': {
          data: { privacy_mode: false, ai_execution_prefs: { documenten: 'lokaal' } },
        },
      }),
    )
  })

  it('GET meldt een geldig abonnement', async () => {
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.hasAiSubscription).toBe(true)
  })

  it('GET meldt een VERLOPEN abonnement — het signaal waarop de hook lokaal stopt', async () => {
    mockCheckTierGate.mockResolvedValue(GEEN_AI)

    const res = await GET()
    const body = await res.json()

    // Geen 403: lezen blijft vrij, anders kan deze gebruiker zijn keuze niet
    // meer terugzetten. Alleen de stand verandert.
    expect(res.status).toBe(200)
    expect(body.hasAiSubscription).toBe(false)
    expect(body.modes.documenten).toBe('lokaal')
  })

  it('POST naar LOKAAL blijft geweigerd zonder abonnement (403, niets geschreven)', async () => {
    mockCheckTierGate.mockResolvedValue(GEEN_AI)

    const res = await POST(postRequest({ group: 'documenten', mode: 'lokaal' }))

    expect(res.status).toBe(403)
    expect(updates).toHaveLength(0)
  })

  it('POST terug naar CLOUD mag ALTIJD — niemand-opgesloten-principe', async () => {
    mockCheckTierGate.mockResolvedValue(GEEN_AI)

    const res = await POST(postRequest({ group: 'documenten', mode: 'cloud' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.modes.documenten).toBe('cloud')
    expect(updates).toHaveLength(1)
    // De tier-gate wordt op deze weg bewust niet eens geraadpleegd.
    expect(mockCheckTierGate).not.toHaveBeenCalled()
  })

  it('POST die de override WIST mag ook zonder abonnement', async () => {
    mockCheckTierGate.mockResolvedValue(GEEN_AI)

    const res = await POST(postRequest({ group: 'documenten', mode: null }))

    expect(res.status).toBe(200)
    expect(updates).toHaveLength(1)
    expect((updates[0] as { ai_execution_prefs: Record<string, unknown> }).ai_execution_prefs)
      .not.toHaveProperty('documenten')
  })
})

/**
 * De KILL-SWITCH op het lokale pad — dezelfde klasse als het revocatie-gat
 * hierboven, en om exact dezelfde reden.
 *
 * `profiles.ai_enabled` is de knop "AI uit" op /mijn/privacy. Elke cloudroute
 * handhaaft 'm zelf, maar de zuiver lokale paden raken tijdens het genereren
 * geen enkele route meer aan. Deze GET is daar de laatste server-uitspraak — en
 * hij zweeg over de kill-switch. Wie AI uitzette, kreeg on-device gewoon nog
 * generatie over zijn aangifte, UPO en transactieomschrijvingen.
 */
describe('kill-switch in het antwoord — ai_enabled op het lokale pad', () => {
  it('GET meldt een UITGEZETTE kill-switch', async () => {
    mockFrom.mockImplementation(
      buildFrom({
        'privacy_mode, ai_execution_prefs, ai_enabled': {
          data: { privacy_mode: true, ai_execution_prefs: {}, ai_enabled: false },
        },
      }),
    )

    const res = await GET()
    const body = await res.json()

    // Geen 403 — net als bij het abonnement blijft LEZEN vrij, anders kan deze
    // gebruiker zijn keuze niet meer terugzetten naar cloud.
    expect(res.status).toBe(200)
    expect(body.aiEnabled).toBe(false)
    expect(body.modes.documenten).toBe('lokaal')
  })

  it('GET meldt een AANSTAANDE kill-switch', async () => {
    mockFrom.mockImplementation(
      buildFrom({
        'privacy_mode, ai_execution_prefs, ai_enabled': {
          data: { privacy_mode: false, ai_execution_prefs: {}, ai_enabled: true },
        },
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.aiEnabled).toBe(true)
  })

  it('een ONTBREKENDE ai_enabled telt als AAN, niet als uit', async () => {
    // De kolom is nullable met default `true`; ontbreekt hij in een omgeving —
    // of staat er NULL — dan is dat "geen uitspraak". Dit als `false` lezen zou
    // AI voor iedereen stilleggen.
    mockFrom.mockImplementation(
      buildFrom({
        'privacy_mode, ai_execution_prefs, ai_enabled': {
          data: { privacy_mode: false, ai_execution_prefs: {} },
        },
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.aiEnabled).toBe(true)
  })
})
