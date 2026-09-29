import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/krant/tijdlijn/cron (Krant 1C):
 *   - auth-matrix (fail-closed), zonder job_runs-write vóór de auth;
 *   - opruimen (ruimAlleTijdlijnenOp) EERST en in een eigen try — een fout
 *     daar laat de run doorgaan (security G2, 29-09);
 *   - profielselectie GEPAGINEERD (.eq → .order('id') → .range), zodat >1000
 *     profielen niet stil worden afgekapt (eindreview Y4);
 *   - B40 (fase 2): iedereen met de module nieuws en afgeronde onboarding wiens
 *     /nieuws de tijdlijn is — niet wie bewust de AI-Krant koos (krant_variant
 *     'ai') MITS die lezer ook echt AI mag (ai_enabled + AI-abonnement,
 *     eindreview Y2) — zonder AI valt de keuze terug op tijdlijn;
 *   - bèta-slot (tijdelijke schakelaar): zolang TIJDLIJN_BETA_OPEN false is, alleen superadmins;
 *   - bezwaar (profiles.krant_schaduw_bezwaar_at): overgeslagen;
 *   - de hertoets vlak vóór schrijven (`ververs(..., hertoetsVoorSchrijven: true)`)
 *     kan `overgeslagen: true` teruggeven (bezwaar/AI-keuze ná de profielselectie);
 *   - summary = tellingen; een falende lezer stopt de run niet.
 *   - Krant 1E: wie de Krant MET AI koos (en mag) leest dezelfde tijdlijn en
 *     wordt dus óók ververst, mét een AI-stap; de privacy-poort
 *     (isCloudAllowed 'nieuws') draait per AI-lezer vóór de stap bestaat.
 */

const mockRecordJobRun = vi.fn()
vi.mock('@/lib/job-runs', () => ({ recordJobRun: (...a: unknown[]) => mockRecordJobRun(...a) }))
vi.mock('@/lib/krant/editie-loader', () => ({ laadKandidaten: vi.fn(async () => ({ artikelen: [{ id: 'a1' }], ongeldig: 0 })) }))
vi.mock('@/lib/reference-cache', () => ({ getAowLeeftijden: vi.fn(async () => []) }))
const mockVervers = vi.fn()
const mockRuim = vi.fn()
vi.mock('@/lib/krant/tijdlijn-run', () => ({
  ververs: (...a: unknown[]) => mockVervers(...a),
  ruimAlleTijdlijnenOp: (...a: unknown[]) => mockRuim(...a),
}))
const mockIsCloudAllowed = vi.fn()
vi.mock('@/lib/ai/privacy-gate', () => ({ isCloudAllowed: (...a: unknown[]) => mockIsCloudAllowed(...a) }))
const mockMaakAiStap = vi.fn((opties: { cloudToegestaan: boolean }) => ({ stap: 'ai', ...opties }))
vi.mock('@/lib/krant/tijdlijn-ai', () => ({ maakAiStap: (o: { cloudToegestaan: boolean }) => mockMaakAiStap(o) }))
const beta = { open: false }
vi.mock('@/lib/krant/tijdlijn-beta', () => ({
  inTijdlijnBeta: (rol: string | null) => beta.open || rol === 'superadmin',
}))

/** Wie bewust de AI-Krant koos (krant_variant = 'ai'). */
let aiVarianten: Array<{ user_id: string }>
let profielen: Array<Record<string, unknown>>
const inAanroepen: string[][] = []
const rangeAanroepen: Array<[number, number]> = []

/** Paginagrootte zoals de route hem gebruikt (moet gelijk zijn aan TIJDLIJN_CRON_PAGINA). */
const PAGINA = 500

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (kolom: string, waarde: unknown) => {
              expect([kolom, waarde]).toEqual(['onboarding_completed', true])
              return {
                order: (kolom2: string, opts: { ascending?: boolean }) => {
                  expect(kolom2).toBe('id')
                  expect(opts).toEqual({ ascending: true })
                  return {
                    range: async (van: number, tot: number) => {
                      rangeAanroepen.push([van, tot])
                      const gesorteerd = [...profielen.filter((p) => p.onboarding_completed === true)].sort((a, b) =>
                        String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0,
                      )
                      return { data: gesorteerd.slice(van, tot + 1), error: null }
                    },
                  }
                },
              }
            },
          }),
        }
      }
      // nieuwsprofiel: de variant-selectie (alleen 'ai' telt).
      return {
        select: () => ({
          eq: (kolom: string, waarde: unknown) => {
            expect([kolom, waarde]).toEqual(['krant_variant', 'ai'])
            return {
              in: async (_k: string, ids: string[]) => {
                inAanroepen.push(ids)
                return { data: aiVarianten.filter((v) => ids.includes(v.user_id)), error: null }
              },
            }
          },
        }),
      }
    },
  }),
}))

import { GET, TIJDLIJN_CRON_PAGINA } from './route'

const req = (secret?: string) => new Request(secret ? `https://x.test/api/krant/tijdlijn/cron?secret=${secret}` : 'https://x.test/api/krant/tijdlijn/cron')
const ORIG = { ...process.env }

/** Standaard-profiel: Geheel-account met AI toegestaan (ai_enabled + abonnement) tenzij overschreven. */
function profiel(overrides: Record<string, unknown>) {
  return {
    active_modules: null,
    onboarding_completed: true,
    krant_schaduw_bezwaar_at: null,
    ai_enabled: true,
    active_subscriptions: ['ai'],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  beta.open = false
  aiVarianten = []
  inAanroepen.length = 0
  rangeAanroepen.length = 0
  profielen = [
    profiel({ id: 'u-admin', role: 'superadmin', active_modules: null }),
    profiel({ id: 'u-lezer', role: 'user', active_modules: ['nieuws'] }),
    profiel({ id: 'u-geheel', role: 'user', active_modules: null }),
    profiel({ id: 'u-zonder-nieuws', role: 'superadmin', active_modules: ['budgetteren'] }),
    profiel({ id: 'u-onboarding', role: 'superadmin', active_modules: null, onboarding_completed: false }),
  ]
  mockVervers.mockImplementation(async (_s: unknown, i: { userId: string }) => ({ editieId: `e-${i.userId}`, profielType: 'x', leeg: false, items: 2 }))
  mockRuim.mockResolvedValue(1)
  mockIsCloudAllowed.mockResolvedValue(true)
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  delete process.env.VERCEL_ENV
  process.env.CRON_SECRET = 'cron-secret'
})

afterEach(() => {
  process.env = { ...ORIG }
})

const gedraaid = () => mockVervers.mock.calls.map((c) => (c[1] as { userId: string }).userId)

describe('auth (fail-closed)', () => {
  it('productie zonder CRON_SECRET → 500, fout secret → 401; nooit een job_runs-write vóór de auth', async () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.CRON_SECRET
    expect((await GET(req())).status).toBe(500)
    process.env.CRON_SECRET = 'cron-secret'
    expect((await GET(req('verkeerd'))).status).toBe(401)
    expect(mockVervers).not.toHaveBeenCalled()
    expect(mockRecordJobRun).not.toHaveBeenCalled()
  })
})

describe('opruimen (120 dagen): eerst, eigen try, laat de run doorgaan bij een fout', () => {
  it('draait vóór de profielselectie en telt mee in de summary', async () => {
    const res = await GET(req('cron-secret'))
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(mockRuim).toHaveBeenCalledTimes(1)
    expect(summary).toMatchObject({ opgeruimd: 1, opruimenMislukt: false })
  })

  it('een fout bij het opruimen laat de run doorgaan: opruimenMislukt=true, verversingen gaan gewoon door', async () => {
    mockRuim.mockRejectedValueOnce(new Error('kapot'))
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ opruimenMislukt: true, opgeruimd: 0 })
    expect(gedraaid()).toEqual(['u-admin'])
    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ job: 'krant-tijdlijn', status: 'success', error: 'opruimen (120 dagen) mislukt' }),
    )
  })
})

describe('profielselectie: gepagineerd op id', () => {
  it('vraagt de eerste pagina op met range(0, TIJDLIJN_CRON_PAGINA - 1)', async () => {
    await GET(req('cron-secret'))
    expect(rangeAanroepen[0]).toEqual([0, TIJDLIJN_CRON_PAGINA - 1])
    // Onder de paginagrootte: precies één pagina, geen tweede aanroep.
    expect(rangeAanroepen).toHaveLength(1)
  })

  it('meer dan één pagina: blijft doorbladeren tot een pagina kleiner is dan TIJDLIJN_CRON_PAGINA', async () => {
    // PAGINA + 3 profielen (allemaal superadmin zodat ze meetellen), bèta dicht.
    profielen = Array.from({ length: PAGINA + 3 }, (_, i) => profiel({ id: `u-${String(i).padStart(4, '0')}`, role: 'superadmin' }))
    const res = await GET(req('cron-secret'))
    expect(rangeAanroepen).toEqual([
      [0, PAGINA - 1],
      [PAGINA, 2 * PAGINA - 1],
    ])
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ lezers: PAGINA + 3 })
  })
})

describe('wie er ververst wordt', () => {
  it('bèta dicht: alleen de superadmin met module nieuws en afgeronde onboarding', async () => {
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    expect(gedraaid()).toEqual(['u-admin'])
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ lezers: 1, buitenBeta: 2, bezwaar: 0, verversingen: 1, berichten: 2, opgeruimd: 1, fouten: 0 })
  })

  it('bèta open (B40): iedereen met module nieuws — Krant- én Geheel-account, zonder opt-in; nooit zonder module nieuws of onboarding', async () => {
    beta.open = true
    await GET(req('cron-secret'))
    expect(gedraaid().sort()).toEqual(['u-admin', 'u-geheel', 'u-lezer'])
  })

  it('1E: wie de Krant MET AI koos (variant ai, AI toegestaan) wordt óók ververst — mét AI-stap; een Krant-account nooit met AI', async () => {
    beta.open = true
    aiVarianten = [{ user_id: 'u-geheel' }, { user_id: 'u-lezer' }]
    const res = await GET(req('cron-secret'))
    expect(gedraaid().sort()).toEqual(['u-admin', 'u-geheel', 'u-lezer'])
    const perLezer = new Map(mockVervers.mock.calls.map(([, i]) => [(i as { userId: string }).userId, i as { aiStap: unknown }]))
    expect(perLezer.get('u-geheel')!.aiStap).toEqual({ stap: 'ai', cloudToegestaan: true })
    expect(perLezer.get('u-admin')!.aiStap).toBeNull()
    // Het Krant-account (u-lezer) heeft variant ai in de rij, maar krijgt nooit de laag.
    expect(perLezer.get('u-lezer')!.aiStap).toBeNull()
    // De privacy-poort draaide alleen voor de AI-lezer, met groep 'nieuws'.
    expect(mockIsCloudAllowed).toHaveBeenCalledTimes(1)
    expect(mockIsCloudAllowed.mock.calls[0].slice(1)).toEqual(['u-geheel', 'nieuws'])
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ lezers: 3, buitenBeta: 0, aiLezers: 1 })
  })

  it('1E, K6: staat nieuws op lokaal / privé-modus, dan krijgt de laag cloudToegestaan false (en een leesfout telt als nee)', async () => {
    beta.open = true
    aiVarianten = [{ user_id: 'u-geheel' }]
    mockIsCloudAllowed.mockResolvedValueOnce(false)
    await GET(req('cron-secret'))
    expect(mockMaakAiStap).toHaveBeenCalledWith({ cloudToegestaan: false })
    mockMaakAiStap.mockClear()
    mockIsCloudAllowed.mockRejectedValueOnce(new Error('db weg'))
    await GET(req('cron-secret'))
    expect(mockMaakAiStap).toHaveBeenCalledWith({ cloudToegestaan: false })
  })

  it('1E: de summary telt de AI-laag mee — alleen aantallen', async () => {
    beta.open = true
    aiVarianten = [{ user_id: 'u-geheel' }]
    mockVervers.mockImplementation(async (_s: unknown, i: { userId: string }) => ({
      editieId: 'e',
      profielType: 'x',
      leeg: false,
      items: 2,
      ...(i.userId === 'u-geheel'
        ? { ai: { uitkomst: 'met-ai', reden: null, tellers: { getallenTegengehouden: 1, wftTegengehouden: 2, schemaTegengehouden: 0, toelichtingen: 1, toevoegingen: 1, terugvalBericht: 1, terugvalLaag: 0 } } }
        : {}),
    }))
    const res = await GET(req('cron-secret'))
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ aiLezers: 1, aiMetAi: 1, aiQuotum: 0, aiGeweigerd: 0, aiTerugvalLaag: 0, aiTerugvalBericht: 1, aiGetallenTegengehouden: 1, aiWftTegengehouden: 2, aiToevoegingen: 1 })
    for (const v of Object.values(summary)) expect(['number', 'boolean']).toContain(typeof v)
  })

  it('AI gekozen zonder AI toegestaan (ai_enabled false): de keuze wint niet — tóch tijdlijn (eindreview Y2)', async () => {
    beta.open = true
    profielen = profielen.map((p) => (p.id === 'u-geheel' ? { ...p, ai_enabled: false } : p))
    aiVarianten = [{ user_id: 'u-geheel' }]
    await GET(req('cron-secret'))
    expect(gedraaid().sort()).toEqual(['u-admin', 'u-geheel', 'u-lezer'])
  })

  it('AI gekozen zonder AI-abonnement (geen "ai" in active_subscriptions): tóch tijdlijn', async () => {
    beta.open = true
    profielen = profielen.map((p) => (p.id === 'u-geheel' ? { ...p, active_subscriptions: [] } : p))
    aiVarianten = [{ user_id: 'u-geheel' }]
    await GET(req('cron-secret'))
    expect(gedraaid().sort()).toEqual(['u-admin', 'u-geheel', 'u-lezer'])
  })

  it('bezwaar tegen verwerking op de achtergrond: overgeslagen en geteld, de variant wordt voor hem niet eens gevraagd', async () => {
    beta.open = true
    profielen[1].krant_schaduw_bezwaar_at = '2026-09-29T08:00:00Z'
    const res = await GET(req('cron-secret'))
    expect(gedraaid().sort()).toEqual(['u-admin', 'u-geheel'])
    expect(inAanroepen.flat()).not.toContain('u-lezer')
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ bezwaar: 1, lezers: 2 })
  })

  it('niemand in de tijdlijn: geen kandidaten geladen, wel een success-run', async () => {
    profielen = profielen.filter((p) => p.role !== 'superadmin')
    const res = await GET(req('cron-secret'))
    expect(res.status).toBe(200)
    expect(mockVervers).not.toHaveBeenCalled()
    expect(mockRecordJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ job: 'krant-tijdlijn', status: 'success' }))
  })

  it('overgeslagen: de hertoets vlak vóór schrijven zegt dat de lezer intussen bezwaar maakte of de AI-Krant koos', async () => {
    beta.open = true
    mockVervers.mockImplementation(async (_s: unknown, i: { userId: string }) => {
      if (i.userId === 'u-lezer') return { editieId: '', profielType: 'x', leeg: true, items: 0, overgeslagen: true }
      return { editieId: 'e', profielType: 'x', leeg: false, items: 1 }
    })
    const res = await GET(req('cron-secret'))
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    // Bèta open → 3 lezers (u-admin, u-geheel, u-lezer); u-lezer wordt overgeslagen,
    // de andere twee ververst (elk 1 bericht).
    expect(summary).toMatchObject({ overgeslagen: 1, verversingen: 2, fouten: 0, berichten: 2 })
  })

  it('een 23505 (race met de knop op de unieke index) telt als overgeslagen, niet als fout', async () => {
    beta.open = true
    mockVervers.mockImplementation(async (_s: unknown, i: { userId: string }) => {
      if (i.userId === 'u-lezer') throw new Error('[krant/editie-schrijver] items schrijven mislukt: duplicate key value violates unique constraint "krant_editie_items_tijdlijn_lezer_artikel_key"')
      return { editieId: 'e', profielType: 'x', leeg: false, items: 1 }
    })
    const res = await GET(req('cron-secret'))
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ overgeslagen: 1, fouten: 0, verversingen: 2 })
  })

  it('een falende lezer telt als fout en stopt de run niet; summary bevat geen inhoud', async () => {
    beta.open = true
    mockVervers.mockImplementation(async (_s: unknown, i: { userId: string }) => {
      if (i.userId === 'u-lezer') throw new Error('kapot')
      return { editieId: 'e', profielType: 'x', leeg: true, items: 0 }
    })
    const res = await GET(req('cron-secret'))
    const { summary } = (await res.json()) as { summary: Record<string, unknown> }
    expect(summary).toMatchObject({ fouten: 1, verversingen: 2, leeg: 2 })
    expect(JSON.stringify(summary)).not.toMatch(/u-admin|u-lezer|u-geheel|user_id/)
  })
})
