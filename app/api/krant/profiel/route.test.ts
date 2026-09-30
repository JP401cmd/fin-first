import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { maakNepClient, type NepRij } from '@/lib/krant/nep-client.fixture'
import { profielResponseSchema } from '@/lib/krant/contract'

/**
 * /api/krant/profiel (Krant 2C, ADR 0192) — de web-tegenhanger van
 * /api/v1/krant/profiel, met de cookie-sessie en een nep-Supabase die filters
 * toepast (een ontbrekende `.eq('user_id')` levert zichtbaar de rij van B op).
 *   - 401 zonder sessie;
 *   - 404 voor wie de tijdlijn niet leest (achter de gesloten vlag), GET én PUT,
 *     zonder schrijfactie;
 *   - PUT strikt: krant_variant, afgeleid_at, herkomst, tijdlijn_*, versie,
 *     user_id en onbekende sleutels → 400 zonder schrijfactie; rubrieken alleen
 *     uit NEWS_CATEGORIES, hoogstens 20;
 *   - herkomst 'zelf' voor elk meegestuurd veld, ook null; overgeslagen velden
 *     ongemoeid; idempotent;
 *   - geen service-role (bron-scan).
 */

const mockGetVerifiedUser = vi.fn()
let nep: ReturnType<typeof maakNepClient>
/** De eigen profielrijen: niet geblokkeerd (de blokkadetoets leest `profiles.blocked_at`, security-run 0.92.28). */
const PROFIELEN: NepRij[] = [
  { id: 'user-a', blocked_at: null },
  { id: 'user-b', blocked_at: null },
  { id: 'user-c', blocked_at: null },
]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => nep.client),
}))
vi.mock('@/lib/supabase/cached-user', () => ({
  getVerifiedUser: (...a: unknown[]) => mockGetVerifiedUser(...a),
  getCachedUser: (...a: unknown[]) => mockGetVerifiedUser(...a),
}))
const mockKrantBronVoor = vi.fn()
vi.mock('@/lib/krant/tijdlijn-bron', async (importActual) => ({
  leestTijdlijn: (await importActual<typeof import('@/lib/krant/tijdlijn-bron')>()).leestTijdlijn,
  krantBronVoor: (...a: unknown[]) => mockKrantBronVoor(...a),
}))

import { GET, PUT } from './route'

const RIJ_A: NepRij = {
  user_id: 'user-a',
  profiel_versie: 1,
  geboortejaar: 1985,
  huishouden: 'alleen',
  kinderen: null,
  werk: ['loondienst'],
  inkomen: '2500-3250',
  wonen: 'huur-vrije-sector',
  hypotheek_restschuld: null,
  hypotheek_rentevast: null,
  woonplan: null,
  spaargeld: '5k-25k',
  beleggingen: null,
  beleggingen_vorm: null,
  schulden: null,
  pensioen_werkgever: 'ja',
  pensioen_lijfrente: null,
  rubrieken: null,
  herkomst: { inkomen: 'afgeleid' },
  afgeleid_at: '2026-09-28T05:30:00+00:00',
  krant_variant: 'tijdlijn',
  tijdlijn_vernieuwd_at: null,
}
const RIJ_B: NepRij = { ...RIJ_A, user_id: 'user-b', inkomen: 'boven-5500', herkomst: {} }

const putReq = (body: unknown) =>
  new Request('https://x.test/api/krant/profiel', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
const upserts = () => nep.queriesOp('nieuwsprofiel').filter((q) => q.stappen.some((s) => s.m === 'upsert'))

beforeEach(() => {
  vi.clearAllMocks()
  nep = maakNepClient({ nieuwsprofiel: [{ ...RIJ_A }, { ...RIJ_B }], profiles: [...PROFIELEN] })
  mockGetVerifiedUser.mockResolvedValue({ id: 'user-a' })
  mockKrantBronVoor.mockResolvedValue({ bron: 'tijdlijn', krantAccount: true, variant: null, inBeta: true, kanAiKiezen: false })
})

describe('toegang', () => {
  it('401 zonder sessie, zonder iets te lezen', async () => {
    mockGetVerifiedUser.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
    expect((await PUT(putReq({ woonplan: null }))).status).toBe(401)
    expect(nep.queries).toHaveLength(0)
  })

  // Security-run 0.92.28 (🟡-1): gelijk aan vereisBearer in de native API.
  it('een geblokkeerd account → 404 op GET en PUT, zonder schrijfactie', async () => {
    nep = maakNepClient({ nieuwsprofiel: [{ ...RIJ_A }], profiles: [{ id: 'user-a', blocked_at: '2026-10-01T00:00:00Z' }] })
    expect((await GET()).status).toBe(404)
    expect((await PUT(putReq({ woonplan: 'geen-koopplan' }))).status).toBe(404)
    expect(upserts()).toHaveLength(0)
  })

  it.each(['wacht', 'oud'] as const)('404 bij bron %s (buiten de bèta), GET en PUT, zonder schrijfactie', async (bron) => {
    mockKrantBronVoor.mockResolvedValue({ bron, krantAccount: bron === 'wacht', variant: null, inBeta: false, kanAiKiezen: false })
    expect((await GET()).status).toBe(404)
    expect((await PUT(putReq({ woonplan: 'geen-koopplan' }))).status).toBe(404)
    expect(upserts()).toHaveLength(0)
    expect(nep.rijen('nieuwsprofiel')[0]).toEqual(RIJ_A)
    expect(mockKrantBronVoor).toHaveBeenCalledWith(expect.anything(), 'user-a')
  })

  it('tijdlijnlezer met de AI-laag (bron ai) mag ook', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'ai', krantAccount: false, variant: 'ai', inBeta: true, kanAiKiezen: true })
    expect((await PUT(putReq({ woonplan: 'geen-koopplan' }))).status).toBe(200)
  })
})

describe('GET', () => {
  it('alleen de eigen rij, volgens het contract, met expliciete kolommen', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = profielResponseSchema.parse(await res.json())
    expect(body.profiel.inkomen).toBe('2500-3250')
    expect(body.herkomst).toEqual({ inkomen: 'afgeleid' })
    const q = nep.queriesOp('nieuwsprofiel')[0]!
    expect(q.stappen).toContainEqual({ m: 'eq', args: ['user_id', 'user-a'] })
    const kolommen = q.stappen.find((s) => s.m === 'select')!.args[0] as string
    expect(kolommen).not.toContain('*')
    expect(kolommen).not.toMatch(/krant_variant|tijdlijn_/)
  })
})

describe('PUT — strikt', () => {
  it.each([
    ['krant_variant', { krant_variant: 'ai' }],
    ['afgeleid_at', { afgeleid_at: '2026-01-01T00:00:00Z' }],
    ['herkomst', { herkomst: { inkomen: 'zelf' } }],
    ['tijdlijn_vernieuwd_at', { tijdlijn_vernieuwd_at: null }],
    ['tijdlijn_gelezen_tot', { tijdlijn_gelezen_tot: null }],
    ['versie', { versie: 1 }],
    ['user_id', { user_id: 'user-b', woonplan: null }],
    ['onbekende sleutel', { foo: 1 }],
    ['een lege body', {}],
    ['een rubriek die niet bestaat', { rubrieken: ['sport'] }],
    ['dubbele rubrieken', { rubrieken: ['rente', 'rente'] }],
    ['meer dan 20 rubrieken', { rubrieken: Array.from({ length: 21 }, () => 'rente') }],
    ['een band die niet bestaat', { inkomen: 'miljoen' }],
  ])('400 bij %s, zonder schrijfactie', async (_naam, body) => {
    const res = await PUT(putReq(body))
    expect(res.status).toBe(400)
    expect(typeof (await res.json()).error).toBe('string')
    expect(upserts()).toHaveLength(0)
    expect(nep.rijen('nieuwsprofiel')[0]).toEqual(RIJ_A)
  })
})

describe('PUT — schrijven', () => {
  it("elk meegestuurd veld wordt 'zelf', ook null; overgeslagen velden en de rij van B blijven ongemoeid", async () => {
    const res = await PUT(putReq({ inkomen: '3250-4250', kinderen: null, rubrieken: ['rente', 'pensioen'] }))
    expect(res.status).toBe(200)
    const body = profielResponseSchema.parse(await res.json())
    expect(body.profiel.inkomen).toBe('3250-4250')
    expect(body.profiel.rubrieken).toEqual(['rente', 'pensioen'])
    expect(body.herkomst).toEqual({ inkomen: 'zelf', kinderen: 'zelf', rubrieken: 'zelf' })

    const a = nep.rijen('nieuwsprofiel').find((r) => r.user_id === 'user-a')!
    expect(a.spaargeld).toBe('5k-25k') // overgeslagen
    expect(a.geboortejaar).toBe(1985)
    expect(a.krant_variant).toBe('tijdlijn')
    expect(a.afgeleid_at).toBe(RIJ_A.afgeleid_at)
    expect(nep.rijen('nieuwsprofiel').find((r) => r.user_id === 'user-b')).toEqual(RIJ_B)

    const rij = upserts()[0]!.stappen.find((s) => s.m === 'upsert')!.args[0] as Record<string, unknown>
    expect(rij.user_id).toBe('user-a')
    expect(Object.keys(rij)).not.toEqual(expect.arrayContaining(['krant_variant']))
    for (const k of ['krant_variant', 'afgeleid_at', 'tijdlijn_vernieuwd_at']) expect(rij).not.toHaveProperty(k)
  })

  it('idempotent: twee keer hetzelfde geeft dezelfde rij', async () => {
    await PUT(putReq({ woonplan: 'kopen-binnen-2-jaar' }))
    const na1 = { ...nep.rijen('nieuwsprofiel')[0] }
    await PUT(putReq({ woonplan: 'kopen-binnen-2-jaar' }))
    const na2 = { ...nep.rijen('nieuwsprofiel')[0] }
    delete na1.updated_at
    delete na2.updated_at
    expect(na2).toEqual(na1)
    expect(nep.rijen('nieuwsprofiel')).toHaveLength(2)
  })

  it('een nieuwe lezer zonder rij krijgt er één (upsert op user_id)', async () => {
    mockGetVerifiedUser.mockResolvedValue({ id: 'user-c' })
    const res = await PUT(putReq({ geboortejaar: 1990 }))
    expect(res.status).toBe(200)
    const c = nep.rijen('nieuwsprofiel').find((r) => r.user_id === 'user-c')!
    expect(c).toMatchObject({ geboortejaar: 1990, herkomst: { geboortejaar: 'zelf' } })
  })

  it('een DB-fout → generieke 500 zonder details', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    nep = maakNepClient({ nieuwsprofiel: [{ ...RIJ_A }], profiles: [...PROFIELEN] }, { fouten: { 'nieuwsprofiel:upsert': 'permission denied for column krant_variant' } })
    const res = await PUT(putReq({ woonplan: null }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('permission')
    spy.mockRestore()
  })
})

describe('bron-scan', () => {
  const src = readFileSync(join(__dirname, 'route.ts'), 'utf8')
  it('gebruikt nooit de service-role en hergebruikt de v1-helpers en het v1-schema', () => {
    expect(src).not.toMatch(/supabase\/service|getServiceClient|SERVICE_ROLE/)
    expect(src).toMatch(/from '@\/lib\/krant\/v1-profiel'/)
    expect(src).toMatch(/profielPutBodySchema/)
    expect(src).not.toMatch(/z\.(strictObject|object)\(/)
  })
})
