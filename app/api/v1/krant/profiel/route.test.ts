import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NEP_JWT } from '@/lib/supabase/bearer.fixture'
import { maakNepClient, type NepRij } from '@/lib/krant/nep-client.fixture'
import { profielResponseSchema } from '@/lib/krant/contract'

/**
 * /api/v1/krant/profiel (Krant 3A, ADR 0187) met de ECHTE vereisBearer en een
 * nep-Supabase die filters toepast — een ontbrekende `.eq('user_id')` zou
 * zichtbaar de rij van lezer B opleveren.
 *   - 401 zonder Bearer, 403 zonder module nieuws, 403 bij een mutatie met Origin;
 *   - GET: alleen de eigen rij, expliciete kolommen, respons volgens het contract;
 *   - PUT: strikt — krant_variant, afgeleid_at, tijdlijn_vernieuwd_at, herkomst,
 *     versie en onbekende sleutels zijn een 400 zonder schrijfactie;
 *   - PUT: alleen de meegegeven velden, herkomst 'zelf' bovenop de bestaande,
 *     getUser-verificatie, de rij van B blijft ongemoeid;
 *   - DB-fout → generieke 500.
 */

const mockCreateClient = vi.fn()
vi.mock('@supabase/supabase-js', async (importActual) => ({
  ...(await importActual<typeof import('@supabase/supabase-js')>()),
  createClient: (...a: unknown[]) => mockCreateClient(...a),
}))

const mockKrantBronVoor = vi.fn()
vi.mock('@/lib/krant/tijdlijn-bron', () => ({ krantBronVoor: (...a: unknown[]) => mockKrantBronVoor(...a) }))

import { GET, PUT } from './route'

const mockGetClaims = vi.fn()
const mockGetUser = vi.fn()
let nep: ReturnType<typeof maakNepClient>

const RIJ_A: NepRij = {
  user_id: 'user-a',
  profiel_versie: 1,
  geboortejaar: 1985,
  huishouden: 'fiscaal-partner',
  kinderen: null,
  werk: ['loondienst'],
  inkomen: '3250-4250',
  wonen: 'koop-met-hypotheek',
  hypotheek_restschuld: '150k-300k',
  hypotheek_rentevast: 'boven-5-jaar',
  woonplan: null,
  spaargeld: '25k-50k',
  beleggingen: 'tot-25k',
  beleggingen_vorm: ['fondsen'],
  schulden: ['geen'],
  pensioen_werkgever: 'ja',
  pensioen_lijfrente: null,
  rubrieken: null,
  herkomst: { geboortejaar: 'afgeleid', inkomen: 'afgeleid', onzin: 'x' },
  afgeleid_at: '2026-09-28T05:30:00+00:00',
  krant_variant: 'tijdlijn',
  tijdlijn_gelezen_tot: '2026-09-28T08:00:00+00:00',
}
const RIJ_B: NepRij = { ...RIJ_A, user_id: 'user-b', inkomen: 'boven-5500', herkomst: {} }

function maakNep(opties?: Parameters<typeof maakNepClient>[1]) {
  nep = maakNepClient(
    {
      profiles: [
        { id: 'user-a', active_modules: ['nieuws'] },
        { id: 'user-c', active_modules: ['budgetteren'] },
      ],
      nieuwsprofiel: [{ ...RIJ_A }, { ...RIJ_B }],
    },
    opties,
  )
}

const bearer = { authorization: `Bearer ${NEP_JWT}` }
const getReq = (headers: Record<string, string> = bearer) => new Request('https://x.test/api/v1/krant/profiel', { headers })
const putReq = (body: unknown, headers: Record<string, string> = bearer) =>
  new Request('https://x.test/api/v1/krant/profiel', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

function alsGebruiker(id: string) {
  mockGetClaims.mockResolvedValue({ data: { claims: { sub: id, role: 'authenticated' } }, error: null })
  mockGetUser.mockResolvedValue({ data: { user: { id, role: 'authenticated', is_anonymous: false } }, error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  maakNep()
  mockCreateClient.mockImplementation(() => ({ ...nep.client, auth: { getClaims: mockGetClaims, getUser: mockGetUser } }))
  alsGebruiker('user-a')
  mockKrantBronVoor.mockResolvedValue({ bron: 'tijdlijn', krantAccount: false, variant: null, inBeta: true, kanAiKiezen: false })
})

describe('toegang', () => {
  it('401 zonder Bearer (ook met alleen een cookie)', async () => {
    expect((await GET(getReq({}))).status).toBe(401)
    expect((await GET(getReq({ cookie: 'sb-x-auth-token=abc' }))).status).toBe(401)
    expect((await PUT(putReq({ woonplan: null }, {}))).status).toBe(401)
  })

  it('403 zonder module nieuws, vóór er een profiel gelezen wordt', async () => {
    alsGebruiker('user-c')
    expect((await GET(getReq())).status).toBe(403)
    expect(nep.queriesOp('nieuwsprofiel')).toHaveLength(0)
  })

  it.each(['ai', 'wacht'] as const)('403 op PUT als de bron %s is (alleen tijdlijnlezers schrijven, security G2)', async (bron) => {
    mockKrantBronVoor.mockResolvedValue({ bron, krantAccount: bron === 'wacht', variant: null, inBeta: false, kanAiKiezen: false })
    const res = await PUT(putReq({ woonplan: 'geen-koopplan' }))
    expect(res.status).toBe(403)
    expect(mockKrantBronVoor).toHaveBeenCalledWith(expect.anything(), 'user-a')
    expect(nep.queriesOp('nieuwsprofiel').filter((q) => q.stappen.some((s) => s.m === 'upsert'))).toHaveLength(0)
    expect(nep.rijen('nieuwsprofiel')[0]).toEqual(RIJ_A)
  })

  it('GET blijft open voor een lezer die niet de tijdlijn leest (inzage)', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'ai', krantAccount: false, variant: 'ai', inBeta: false, kanAiKiezen: true })
    expect((await GET(getReq())).status).toBe(200)
    expect(mockKrantBronVoor).not.toHaveBeenCalled()
  })

  it('403 op PUT met Origin', async () => {
    const res = await PUT(putReq({ woonplan: null }, { ...bearer, origin: 'https://evil.test' }))
    expect(res.status).toBe(403)
    expect(nep.queriesOp('nieuwsprofiel')).toHaveLength(0)
  })
})

describe('GET', () => {
  it('geeft alleen de eigen rij, volgens het contract, met geschoonde herkomst', async () => {
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const body = profielResponseSchema.parse(await res.json())
    expect(body.profiel.inkomen).toBe('3250-4250')
    expect(body.profiel.hypotheek).toEqual({ restschuld: '150k-300k', rentevast: 'boven-5-jaar' })
    expect(body.herkomst).toEqual({ geboortejaar: 'afgeleid', inkomen: 'afgeleid' })
    expect(body.afgeleidAt).toBe('2026-09-28T05:30:00+00:00')
    expect(JSON.stringify(body)).not.toContain('tijdlijn')

    const q = nep.queriesOp('nieuwsprofiel')[0]
    expect(q.stappen).toContainEqual({ m: 'eq', args: ['user_id', 'user-a'] })
    const kolommen = q.stappen.find((s) => s.m === 'select')!.args[0] as string
    expect(kolommen).not.toContain('*')
    expect(kolommen).not.toMatch(/krant_variant|tijdlijn_/)
    expect(mockGetClaims).toHaveBeenCalled()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('geen rij → het lege profiel', async () => {
    alsGebruiker('user-a')
    nep = maakNepClient({ profiles: [{ id: 'user-a', active_modules: ['nieuws'] }], nieuwsprofiel: [{ ...RIJ_B }] })
    const body = profielResponseSchema.parse(await (await GET(getReq())).json())
    expect(body.profiel.inkomen).toBeNull()
    expect(body.herkomst).toEqual({})
    expect(body.afgeleidAt).toBeNull()
  })

  it('één ongeldige kolom maakt alleen dat veld null', async () => {
    nep = maakNepClient({
      profiles: [{ id: 'user-a', active_modules: ['nieuws'] }],
      nieuwsprofiel: [{ ...RIJ_A, spaargeld: 'miljoenen' }],
    })
    const body = profielResponseSchema.parse(await (await GET(getReq())).json())
    expect(body.profiel.spaargeld).toBeNull()
    expect(body.profiel.inkomen).toBe('3250-4250')
  })

  it('een DB-fout → generieke 500 zonder details', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    maakNep({ fouten: { 'nieuwsprofiel:select': 'permission denied for column x' } })
    const res = await GET(getReq())
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('permission')
    spy.mockRestore()
  })
})

describe('PUT — strikt', () => {
  it.each([
    ['krant_variant', { krant_variant: 'tijdlijn' }],
    ['afgeleid_at', { afgeleid_at: '2026-01-01T00:00:00Z' }],
    ['tijdlijn_vernieuwd_at', { tijdlijn_vernieuwd_at: null }],
    ['tijdlijn_gelezen_tot', { tijdlijn_gelezen_tot: null }],
    ['herkomst', { herkomst: { inkomen: 'zelf' } }],
    ['versie', { versie: 1 }],
    ['user_id', { user_id: 'user-b', woonplan: null }],
    ['onbekende sleutel', { foo: 1 }],
    ['een geldig veld náást krant_variant', { woonplan: 'geen-koopplan', krant_variant: 'ai' }],
    ['lege body', {}],
    ['ongeldige band', { inkomen: 'heel-veel' }],
    ['onvolledig samengesteld veld', { hypotheek: { restschuld: 'tot-150k' } }],
    ['21 rubrieken (DB-CHECK ≤ 20)', { rubrieken: Array.from({ length: 21 }, (_, i) => `rubriek-${i}`) }],
    ['dubbele rubriek', { rubrieken: ['wonen', 'wonen'] }],
    ['dubbel werk', { werk: ['loondienst', 'loondienst'] }],
    ['dubbele schuld', { schulden: ['geen', 'geen'] }],
    ['dubbele beleggingsvorm', { beleggingen: { band: 'tot-25k', vorm: ['fondsen', 'fondsen'] } }],
  ])('%s → 400 zonder schrijfactie', async (_naam, body) => {
    const res = await PUT(putReq(body))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('validation_error')
    expect(nep.queriesOp('nieuwsprofiel')).toHaveLength(0)
  })

  it('ongeldige JSON → 400', async () => {
    const res = await PUT(
      new Request('https://x.test/api/v1/krant/profiel', { method: 'PUT', headers: bearer, body: '{niet json' }),
    )
    expect(res.status).toBe(400)
  })
})

describe('PUT — schrijven', () => {
  it('zet alleen de meegegeven velden, herkomst zelf bovenop de bestaande, eigen rij', async () => {
    const res = await PUT(
      putReq({ woonplan: 'kopen-binnen-2-jaar', hypotheek: { restschuld: 'tot-150k', rentevast: null }, inkomen: null }),
    )
    expect(res.status).toBe(200)
    const body = profielResponseSchema.parse(await res.json())
    expect(body.profiel.woonplan).toBe('kopen-binnen-2-jaar')
    expect(body.profiel.hypotheek).toEqual({ restschuld: 'tot-150k', rentevast: null })
    expect(body.profiel.inkomen).toBeNull()
    expect(body.profiel.spaargeld).toBe('25k-50k')
    expect(body.herkomst).toEqual({ geboortejaar: 'afgeleid', inkomen: 'zelf', woonplan: 'zelf', hypotheek: 'zelf' })

    const upsert = nep.queriesOp('nieuwsprofiel').find((q) => q.stappen.some((s) => s.m === 'upsert'))!
    const [rij, opties] = upsert.stappen.find((s) => s.m === 'upsert')!.args as [Record<string, unknown>, unknown]
    expect(opties).toEqual({ onConflict: 'user_id' })
    expect(rij.user_id).toBe('user-a')
    expect(Object.keys(rij).sort()).toEqual(
      ['herkomst', 'hypotheek_rentevast', 'hypotheek_restschuld', 'inkomen', 'updated_at', 'user_id', 'woonplan'].sort(),
    )

    const [a, b] = nep.rijen('nieuwsprofiel')
    expect(a.krant_variant).toBe('tijdlijn')
    expect(a.afgeleid_at).toBe('2026-09-28T05:30:00+00:00')
    expect(b).toEqual(RIJ_B)

    expect(mockGetUser).toHaveBeenCalled()
    expect(mockGetClaims).not.toHaveBeenCalled()
  })

  it('maakt een rij aan als die er nog niet is', async () => {
    nep = maakNepClient({ profiles: [{ id: 'user-a', active_modules: ['nieuws'] }], nieuwsprofiel: [] })
    const res = await PUT(putReq({ rubrieken: ['wonen'] }))
    expect(res.status).toBe(200)
    const body = profielResponseSchema.parse(await res.json())
    expect(body.profiel.rubrieken).toEqual(['wonen'])
    expect(body.herkomst).toEqual({ rubrieken: 'zelf' })
  })

  it('een schrijffout → generieke 500 zonder details', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    maakNep({ fouten: { 'nieuwsprofiel:upsert': 'permission denied for column krant_variant' } })
    const res = await PUT(putReq({ woonplan: null }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('krant_variant')
    spy.mockRestore()
  })
})
