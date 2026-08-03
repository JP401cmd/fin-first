import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor POST /api/briefing/refresh — de handmatige dagelijkse ververs.
 *
 * Sinds de briefing-redactie ook ON-DEVICE kan draaien is deze route gesplitst:
 *
 *  - geen `stap`        → cloudpad, ongewijzigd (compose + model-call + opslaan)
 *  - `?stap=compose`    → alleen deterministisch componeren, GEEN model-call
 *  - `?stap=persist`    → de on-device geredigeerde teksten aannemen en opslaan
 *
 * Het zwaartepunt van deze suite is de HER-SANITATIE op de persist-stap: de
 * server recomposeert de briefjes zelf en draait de nummer-guard opnieuw tegen
 * díe bron. Zonder dat zou een POST met verzonnen bedragen de enige harde eis
 * van deze functie (niet creatief zijn met cijfers) omzeilen.
 */

const mockCheckTierGate = vi.fn()
const mockAssertCloudAllowed = vi.fn()
const mockIsCloudAllowed = vi.fn()
const mockLoadAndCompose = vi.fn()
const mockReadSnapshot = vi.fn()
const mockApplyManualRefresh = vi.fn()
const mockRedactBriefing = vi.fn()
const mockLoadDirectives = vi.fn()
const mockRecordAiUsage = vi.fn()

vi.mock('@/lib/ai-credits', () => ({
  recordAiUsage: (...args: unknown[]) => mockRecordAiUsage(...args),
}))
vi.mock('@/lib/require-tier', () => ({
  checkTierGate: (...args: unknown[]) => mockCheckTierGate(...args),
}))
vi.mock('@/lib/ai/privacy-gate', () => ({
  assertCloudAllowed: (...args: unknown[]) => mockAssertCloudAllowed(...args),
  isCloudAllowed: (...args: unknown[]) => mockIsCloudAllowed(...args),
}))
vi.mock('@/lib/briefing/overview-briefing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/briefing/overview-briefing')>()
  return {
    ...actual,
    // Alleen de dure loader vervangen; sanitizeAiHeadline en
    // OVERVIEW_BRIEFING_MAX blijven de ECHTE implementatie — die worden hier
    // juist getest.
    loadAndComposeOverviewBriefing: (...args: unknown[]) => mockLoadAndCompose(...args),
  }
})
vi.mock('@/lib/briefing/snapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/briefing/snapshot')>()
  return {
    ...actual,
    readBriefingSnapshot: (...args: unknown[]) => mockReadSnapshot(...args),
    applyManualRefresh: (...args: unknown[]) => mockApplyManualRefresh(...args),
  }
})
vi.mock('@/lib/briefing/redactie', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/briefing/redactie')>()
  return {
    ...actual,
    // De model-call en de app_settings-lezing vervangen; de guard
    // (sanitizeRedactedText) en applyRedactie blijven ECHT.
    redactBriefing: (...args: unknown[]) => mockRedactBriefing(...args),
    loadBriefingDirectives: (...args: unknown[]) => mockLoadDirectives(...args),
  }
})

const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

import { POST } from './route'
import type { BriefingEntry } from '@/lib/types/briefing'

const USER = { id: 'user-1' }

/** Deterministische bronbriefjes — de "waarheid" waartegen de guard meet. */
const BRON: BriefingEntry[] = [
  { id: 'finance:networth', category: 'observation', text: 'Je vermogen groeide met €1.234 deze maand.' },
  { id: 'finance:savings', category: 'tip', text: 'Je spaarquote staat op 31%.' },
]

const FREEDOM = { totalFreedomDays: 1000, netWorth: 125000, monthlyExpenses: 2400 }

function buildSupabase(user: { id: string } | null = USER) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  }
}

function req(search = '', body?: unknown): Request {
  return new Request(`http://localhost/api/briefing/refresh${search}`, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
}

/** De briefjes zoals ze uiteindelijk naar applyManualRefresh gingen. */
function persistedEntries(): BriefingEntry[] {
  return mockApplyManualRefresh.mock.calls[0][2] as BriefingEntry[]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateClient.mockResolvedValue(buildSupabase())
  mockCheckTierGate.mockResolvedValue(null)
  mockAssertCloudAllowed.mockResolvedValue(null)
  mockIsCloudAllowed.mockResolvedValue(false) // groep staat op lokaal
  mockReadSnapshot.mockResolvedValue(null)
  mockLoadDirectives.mockResolvedValue({ temporal: [], functional: [] })
  mockLoadAndCompose.mockResolvedValue({
    entries: BRON,
    freedom: FREEDOM,
    input: { finance: null },
  })
  mockApplyManualRefresh.mockImplementation(
    async (_s: unknown, _u: unknown, entries: BriefingEntry[], opts: { headline?: string }) => ({
      allowed: true,
      snapshot: {
        week: '2026-W31',
        lastManualRefresh: '2026-08-02',
        refreshedAt: '2026-08-02T10:00:00.000Z',
        entries,
        headline: opts?.headline,
      },
    }),
  )
  mockRedactBriefing.mockResolvedValue({ headline: null, texts: new Map() })
})

describe('POST /api/briefing/refresh — poorten', () => {
  it('401 zonder sessie, vóór elke dataophaling', async () => {
    mockCreateClient.mockResolvedValue(buildSupabase(null))
    const res = await POST(req('?stap=compose'))
    expect(res.status).toBe(401)
    expect(mockLoadAndCompose).not.toHaveBeenCalled()
  })

  it('400 bij een onbekende stap', async () => {
    const res = await POST(req('?stap=hack'))
    expect(res.status).toBe(400)
    expect(mockLoadAndCompose).not.toHaveBeenCalled()
  })

  it('cloudpad: 403 zodra de groep lokaal draait (privé-gate wint)', async () => {
    mockAssertCloudAllowed.mockResolvedValue(
      new Response(JSON.stringify({ error: 'privé', code: 'privacy_mode_active' }), { status: 403 }),
    )
    const res = await POST(req())
    expect(res.status).toBe(403)
    // Geen enkele dataophaling en zeker geen model-call.
    expect(mockLoadAndCompose).not.toHaveBeenCalled()
    expect(mockRedactBriefing).not.toHaveBeenCalled()
  })

  it('lokale stappen: 403 zodra de groep juist in de CLOUD draait', async () => {
    mockIsCloudAllowed.mockResolvedValue(true)
    for (const stap of ['compose', 'persist']) {
      const res = await POST(req(`?stap=${stap}`, { texts: [] }))
      expect(res.status).toBe(403)
    }
    expect(mockLoadAndCompose).not.toHaveBeenCalled()
  })

  it('403 zonder AI-abonnement, op beide paden, vóór het dure werk', async () => {
    mockCheckTierGate.mockResolvedValue({ error: 'AI-abonnement vereist' })
    for (const search of ['', '?stap=compose']) {
      const res = await POST(req(search, search ? undefined : undefined))
      expect(res.status).toBe(403)
    }
    expect(mockLoadAndCompose).not.toHaveBeenCalled()
  })
})

describe('POST ?stap=compose — deterministisch, zonder model', () => {
  it('levert de briefjes + het gecondenseerde directives-blok', async () => {
    const res = await POST(req('?stap=compose'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.allowed).toBe(true)
    expect(body.entries).toHaveLength(2)
    expect(typeof body.directivesBlock).toBe('string')
  })

  it('roept GEEN model aan — dat is de hele reden dat deze stap bestaat', async () => {
    await POST(req('?stap=compose'))
    expect(mockRedactBriefing).not.toHaveBeenCalled()
  })

  it('respecteert de 1×-per-dag-poort en doet dan geen loaders', async () => {
    mockReadSnapshot.mockResolvedValue({
      week: '2026-W31',
      lastManualRefresh: new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Amsterdam',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
      refreshedAt: '2026-08-02T08:00:00.000Z',
      entries: [],
    })
    const res = await POST(req('?stap=compose'))
    const body = await res.json()
    expect(body.allowed).toBe(false)
    expect(mockLoadAndCompose).not.toHaveBeenCalled()
  })

  it('verbruikt de dagteller NIET (dat doet pas persist)', async () => {
    await POST(req('?stap=compose'))
    expect(mockApplyManualRefresh).not.toHaveBeenCalled()
  })
})

describe('POST ?stap=persist — server-side her-sanitatie (harde eis)', () => {
  it('neemt een geldige herschrijving over (alle bron-getallen letterlijk terug)', async () => {
    const res = await POST(
      req('?stap=persist', {
        headline: 'Een week met €1.234 erbij.',
        texts: [
          { id: 'finance:networth', text: 'Mooi: er kwam €1.234 aan vermogen bij deze maand.' },
        ],
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.herschreven).toBe(1)
    expect(body.totaal).toBe(2)
    expect(persistedEntries()[0].text).toContain('Mooi: er kwam €1.234')
  })

  it('WEIGERT een tekst met een VERZONNEN getal — origineel blijft staan', async () => {
    const res = await POST(
      req('?stap=persist', {
        texts: [
          { id: 'finance:networth', text: 'Je vermogen groeide met €1.234 en je rendement was 9,9%.' },
        ],
      }),
    )
    const body = await res.json()
    expect(body.herschreven).toBe(0)
    expect(persistedEntries()[0].text).toBe(BRON[0].text)
  })

  it('WEIGERT een tekst waarin een bron-getal ontbreekt (het klassieke "1234 euro")', async () => {
    const res = await POST(
      req('?stap=persist', {
        texts: [{ id: 'finance:networth', text: 'Je vermogen groeide met 1234 euro deze maand.' }],
      }),
    )
    const body = await res.json()
    expect(body.herschreven).toBe(0)
    expect(persistedEntries()[0].text).toBe(BRON[0].text)
  })

  it('WEIGERT volledig verzonnen tekst zonder enige relatie met de bron', async () => {
    const res = await POST(
      req('?stap=persist', {
        texts: [
          { id: 'finance:networth', text: 'Je hebt €999.999 gewonnen, stop met werken!' },
          { id: 'finance:savings', text: 'Je spaarquote staat op 95%.' },
        ],
      }),
    )
    const body = await res.json()
    expect(body.herschreven).toBe(0)
    expect(persistedEntries().map((e) => e.text)).toEqual(BRON.map((e) => e.text))
  })

  it('negeert een onbekend id — geen nieuw briefje via de achterdeur', async () => {
    const res = await POST(
      req('?stap=persist', {
        texts: [{ id: 'verzonnen:id', text: 'Koop bitcoin.' }],
      }),
    )
    const body = await res.json()
    expect(body.herschreven).toBe(0)
    expect(persistedEntries()).toHaveLength(2)
    expect(persistedEntries().map((e) => e.text)).toEqual(BRON.map((e) => e.text))
  })

  it('meet tegen de VERSE server-compositie, niet tegen wat de client stuurde', async () => {
    // De data is tussen compose en persist gewijzigd: het bedrag is nu anders.
    mockLoadAndCompose.mockResolvedValue({
      entries: [{ ...BRON[0], text: 'Je vermogen groeide met €2.000 deze maand.' }],
      freedom: FREEDOM,
      input: { finance: null },
    })
    const res = await POST(
      req('?stap=persist', {
        // Herschrijving van de OUDE tekst — mag niet meer door.
        texts: [{ id: 'finance:networth', text: 'Er kwam €1.234 bij deze maand.' }],
      }),
    )
    const body = await res.json()
    expect(body.herschreven).toBe(0)
    expect(persistedEntries()[0].text).toBe('Je vermogen groeide met €2.000 deze maand.')
  })

  it('kapt een te lange kopzin af naar null (sanitizeAiHeadline)', async () => {
    await POST(req('?stap=persist', { headline: 'x'.repeat(200), texts: [] }))
    const opts = mockApplyManualRefresh.mock.calls[0][3] as { headline?: string }
    expect(opts.headline).toBeUndefined()
  })

  it('accepteert een nette kopzin', async () => {
    await POST(req('?stap=persist', { headline: '  "Een rustige week."  ', texts: [] }))
    const opts = mockApplyManualRefresh.mock.calls[0][3] as { headline?: string }
    expect(opts.headline).toBe('Een rustige week.')
  })

  it('400 bij een body die niet aan het schema voldoet', async () => {
    const res = await POST(req('?stap=persist', { texts: [{ id: '', text: 'x' }] }))
    expect(res.status).toBe(400)
    expect(mockApplyManualRefresh).not.toHaveBeenCalled()
  })

  it('roept ook hier GEEN model aan', async () => {
    await POST(req('?stap=persist', { texts: [] }))
    expect(mockRedactBriefing).not.toHaveBeenCalled()
  })

  it('respecteert de dagpoort van applyManualRefresh', async () => {
    mockApplyManualRefresh.mockResolvedValue({
      allowed: false,
      snapshot: { refreshedAt: '2026-08-02T08:00:00.000Z', entries: [] },
    })
    const res = await POST(req('?stap=persist', { texts: [] }))
    const body = await res.json()
    expect(body.allowed).toBe(false)
  })
})

describe('POST (cloudpad) — ongewijzigd gedrag', () => {
  it('componeert, redigeert via het model en slaat op', async () => {
    mockRedactBriefing.mockResolvedValue({
      headline: 'Kop uit de cloud.',
      texts: new Map([['finance:networth', 'Er kwam €1.234 bij.']]),
    })
    const res = await POST(req())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.allowed).toBe(true)
    expect(mockRedactBriefing).toHaveBeenCalledTimes(1)
    expect(body.headline).toBe('Kop uit de cloud.')
    expect(body.herschreven).toBe(1)
    expect(body.totaal).toBe(2)
  })

  it('valt terug op de deterministische teksten wanneer de redactie niets oplevert', async () => {
    const res = await POST(req())
    const body = await res.json()
    expect(body.herschreven).toBe(0)
    expect(persistedEntries().map((e) => e.text)).toEqual(BRON.map((e) => e.text))
  })
})

/**
 * CREDITREGISTRATIE — 'briefing' was een gedefinieerde AiFeatureKey met kosten 2
 * die NERGENS werd geregistreerd. De duurste terugkerende AI-functie na
 * rapporten was daarmee ongemeten: onzichtbaar in het verbruiksoverzicht én
 * niet meetellend voor de credit-gates van de andere routes, die uit dezelfde
 * maandbucket lezen.
 */
describe('POST /api/briefing/refresh — creditregistratie', () => {
  it('cloudpad: registreert 1× wanneer de redactie iets heeft opgeleverd', async () => {
    mockRedactBriefing.mockResolvedValue({
      headline: 'Een sterke maand.',
      texts: new Map([['finance:savings', 'Je spaarquote staat op 31%.']]),
    })

    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(mockRecordAiUsage).toHaveBeenCalledTimes(1)
    expect(mockRecordAiUsage).toHaveBeenCalledWith(expect.anything(), 'user-1', 'briefing')
  })

  it('cloudpad: registreert NIET bij een stille terugval naar de deterministische tekst', async () => {
    // redactBriefing degradeert stil bij een AI-fout of een door de nummer-guard
    // afgekeurde output — de gebruiker kreeg dan geen AI-waarde, dus rekenen we
    // niet af. Zelfde maatstaf als de `herschreven`-teller in het antwoord.
    mockRedactBriefing.mockResolvedValue({ headline: null, texts: new Map() })

    const res = await POST(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.herschreven).toBe(0)
    expect(mockRecordAiUsage).not.toHaveBeenCalled()
  })

  it('lokaal pad: registreert nooit — daar draait het model op het eigen toestel', async () => {
    await POST(req('?stap=compose'))
    await POST(req('?stap=persist', { texts: [] }))

    expect(mockRecordAiUsage).not.toHaveBeenCalled()
  })
})
