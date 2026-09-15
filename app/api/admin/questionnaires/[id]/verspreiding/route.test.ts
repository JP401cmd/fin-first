import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET/PUT /api/admin/questionnaires/[id]/verspreiding — beheer stelt in wie een
 * vragenlijst krijgt (ADR 0147).
 *
 * Vastgelegd:
 *   - superadmin-gate: 401 zonder sessie, 403 zonder rol, en dan géén
 *     service-role-aanraking;
 *   - PUT schrijft de instelling via de SESSIE-client (RLS blijft de tweede
 *     slotgracht) en synchroniseert de handmatige rijen via de service-role:
 *     ontbrekende erbij, weggehaalde eruit — en alleen bron 'handmatig';
 *   - de gekozen personen belanden NOOIT in de lijstrij (die is leesbaar voor
 *     elke ingelogde gebruiker);
 *   - GET telt uitgenodigd/gezien/uitgesteld/geweigerd/gestart/afgerond, zonder
 *     ooit een user_id uit de invullingen te lezen (ADR 0146).
 */

type Resultaat = { data: unknown; error: unknown }
interface Aanroep {
  tabel: string
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete'
  payload?: unknown
  opts?: unknown
  eq: [string, unknown][]
  in: [string, unknown[]][]
}

let sessieResultaten: Record<string, Resultaat[]>
let serviceResultaten: Record<string, Resultaat[]>
let sessieCalls: Aanroep[]
let serviceCalls: Aanroep[]

const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockLogAdminAction = vi.fn()

function maakKeten(store: Record<string, Resultaat[]>, calls: Aanroep[]) {
  return (tabel: string) => {
    const call: Aanroep = { tabel, op: 'select', eq: [], in: [] }
    calls.push(call)
    const volgende = (): Resultaat => store[tabel]?.shift() ?? { data: null, error: null }
    const k: Record<string, unknown> = {}
    k.select = () => k
    k.order = () => k
    k.eq = (kolom: string, waarde: unknown) => (call.eq.push([kolom, waarde]), k)
    k.in = (kolom: string, waarden: unknown[]) => (call.in.push([kolom, waarden]), k)
    k.insert = (rij: unknown) => ((call.op = 'insert'), (call.payload = rij), k)
    k.upsert = (rij: unknown, opts?: unknown) => ((call.op = 'upsert'), (call.payload = rij), (call.opts = opts), k)
    k.update = (rij: unknown) => ((call.op = 'update'), (call.payload = rij), k)
    k.delete = () => ((call.op = 'delete'), k)
    k.maybeSingle = async () => volgende()
    k.single = async () => volgende()
    k.then = (resolve: (r: Resultaat) => unknown) => resolve(volgende())
    return k
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (tabel: string) => maakKeten(sessieResultaten, sessieCalls)(tabel),
  })),
}))
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: vi.fn(() => ({ from: (tabel: string) => maakKeten(serviceResultaten, serviceCalls)(tabel) })),
}))
vi.mock('@/lib/admin', () => ({
  isSuperAdmin: (...args: unknown[]) => mockIsSuperAdmin(...args),
}))
vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}))

import { GET, PUT } from './route'

const SUPERADMIN = { id: 'admin-1', email: 'admin@trifinity.nl' }
const QID = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'
const U1 = '11111111-2222-4333-8444-555555555555'
const U2 = '66666666-7777-4888-8999-000000000000'
const params = { params: Promise.resolve({ id: QID }) }

function req(body: unknown) {
  return new Request(`http://localhost/api/admin/questionnaires/${QID}/verspreiding`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function uitnodiging(over: Partial<Record<string, unknown>> = {}) {
  return {
    user_id: U1,
    bron: 'regel',
    bron_detail: null,
    invited_at: '2026-09-10T08:00:00.000Z',
    shown_at: null,
    snoozed_until: null,
    dismissed_at: null,
    ...over,
  }
}

beforeEach(() => {
  sessieResultaten = {}
  serviceResultaten = {}
  sessieCalls = []
  serviceCalls = []
  mockGetUser.mockReset().mockResolvedValue({ data: { user: SUPERADMIN } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
})

describe('superadmin-gate', () => {
  it('GET → 401 zonder sessie, geen service-client-aanraking', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    expect((await GET(new Request('http://localhost'), params)).status).toBe(401)
    expect(serviceCalls).toHaveLength(0)
  })

  it('GET → 403 voor een ingelogde niet-superadmin', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    expect((await GET(new Request('http://localhost'), params)).status).toBe(403)
    expect(serviceCalls).toHaveLength(0)
  })

  it('PUT → 403 voor een ingelogde niet-superadmin, ook met geldige body', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await PUT(req({ doelgroep: { modus: 'iedereen' }, handmatig: [] }), params)
    expect(res.status).toBe(403)
    expect(sessieCalls.filter((c) => c.op === 'update')).toHaveLength(0)
    expect(serviceCalls).toHaveLength(0)
  })
})

describe('GET', () => {
  it('telt de uitnodigingen en de invullingen, en leest nooit een user_id uit de sessies', async () => {
    const straks = new Date(Date.now() + 3 * 86_400_000).toISOString()
    const eerder = new Date(Date.now() - 3 * 86_400_000).toISOString()
    sessieResultaten = {
      questionnaires: [
        { data: { verspreiding: { doelgroep: { modus: 'handmatig', regels: [], groep_ids: [] } } }, error: null },
      ],
    }
    serviceResultaten = {
      questionnaire_invitations: [
        {
          data: [
            uitnodiging({ bron: 'handmatig', bron_detail: { email: 'een@test.nl' } }),
            uitnodiging({ user_id: U2, shown_at: eerder }),
            uitnodiging({ user_id: 'u3', shown_at: eerder, snoozed_until: straks }),
            uitnodiging({ user_id: 'u4', shown_at: eerder, snoozed_until: eerder, dismissed_at: eerder }),
          ],
          error: null,
        },
      ],
      questionnaire_sessions: [
        { data: [{ id: 's1', completed_at: null }, { id: 's2', completed_at: eerder }], error: null },
      ],
    }

    const res = await GET(new Request('http://localhost'), params)
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      verspreiding: { doelgroep: { modus: string } }
      handmatig: { user_id: string; email: string | null }[]
      statistiek: Record<string, number>
    }

    expect(data.verspreiding.doelgroep.modus).toBe('handmatig')
    expect(data.handmatig).toEqual([
      { user_id: U1, email: 'een@test.nl', invited_at: '2026-09-10T08:00:00.000Z' },
    ])
    expect(data.statistiek).toEqual({
      uitgenodigd: 4,
      gezien: 3,
      uitgesteld: 1,
      geweigerd: 1,
      gestart: 2,
      afgerond: 1,
    })
  })

  it('valt terug op de standaard als de kolom nog niet bestaat (42703) en de tabel ontbreekt', async () => {
    sessieResultaten = { questionnaires: [{ data: null, error: { code: '42703' } }] }
    serviceResultaten = {
      questionnaire_invitations: [{ data: null, error: { code: '42P01' } }],
      questionnaire_sessions: [{ data: null, error: { code: '42P01' } }],
    }

    const res = await GET(new Request('http://localhost'), params)
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      verspreiding: { doelgroep: { modus: string }; popup: { aan: boolean } }
      handmatig: unknown[]
      statistiek: Record<string, number>
    }
    expect(data.verspreiding.doelgroep.modus).toBe('iedereen')
    expect(data.verspreiding.popup.aan).toBe(false)
    expect(data.handmatig).toEqual([])
    expect(data.statistiek.uitgenodigd).toBe(0)
  })
})

describe('PUT', () => {
  it('schrijft de instelling zonder de personen en synchroniseert de handmatige rijen', async () => {
    sessieResultaten = { questionnaires: [{ data: null, error: null }] }
    serviceResultaten = {
      questionnaire_invitations: [
        // bestaande handmatige rijen
        { data: [{ user_id: U1, bron: 'handmatig' }], error: null },
        { data: null, error: null }, // insert
        { data: null, error: null }, // delete
      ],
    }

    const res = await PUT(
      req({
        doelgroep: { modus: 'handmatig' },
        popup: { aan: true },
        handmatig: [{ user_id: U2, email: 'twee@test.nl' }],
      }),
      params,
    )
    expect(res.status).toBe(200)

    // 1. de instelling zelf: sessie-client, en zónder de personen.
    const update = sessieCalls.find((c) => c.op === 'update')
    expect(update?.tabel).toBe('questionnaires')
    expect(update?.eq).toEqual([['id', QID]])
    const geschreven = (update?.payload as { verspreiding: Record<string, unknown> }).verspreiding
    expect(geschreven).not.toHaveProperty('handmatig')
    expect(geschreven.doelgroep).toMatchObject({ modus: 'handmatig' })

    // 2. de nieuwe persoon erbij, met zijn adres in bron_detail — als UPSERT op
    //    de PK, zodat een bestaande regel-rij van die persoon handmatig wordt
    //    i.p.v. een 23505 te geven.
    const upsert = serviceCalls.find((c) => c.op === 'upsert')
    expect(upsert?.payload).toEqual([
      { questionnaire_id: QID, user_id: U2, bron: 'handmatig', bron_detail: { email: 'twee@test.nl' } },
    ])
    expect(upsert?.opts).toEqual({ onConflict: 'questionnaire_id,user_id' })
    expect(serviceCalls.filter((c) => c.op === 'insert')).toHaveLength(0)

    // 3. de weggehaalde persoon eruit — alleen zijn HANDMATIGE rij.
    const del = serviceCalls.find((c) => c.op === 'delete')
    expect(del?.eq).toEqual([
      ['questionnaire_id', QID],
      ['bron', 'handmatig'],
    ])
    expect(del?.in).toEqual([['user_id', [U1]]])

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'questionnaire.verspreiding',
        targetLabel: QID,
        detail: { modus: 'handmatig', regels: 0, handmatig: 1, groepen: [], popup: true, toegevoegd: [U2], verwijderd: [U1] },
      }),
    )

    const data = (await res.json()) as { success: boolean; handmatig: unknown[] }
    expect(data.success).toBe(true)
    expect(data.handmatig).toEqual([{ user_id: U2, email: 'twee@test.nl' }])
  })

  it('wissel naar modus regels verwijdert eerder handmatig gekozen personen, ook als de sheet ze meestuurt', async () => {
    sessieResultaten = { questionnaires: [{ data: null, error: null }] }
    serviceResultaten = {
      questionnaire_invitations: [
        { data: [{ user_id: U1, bron: 'handmatig' }], error: null },
        { data: null, error: null }, // delete
      ],
    }

    const res = await PUT(
      req({
        doelgroep: { modus: 'regels', regels: [{ soort: 'actieve_dagen_30', min: 3 }] },
        handmatig: [{ user_id: U1, email: 'een@test.nl' }],
      }),
      params,
    )
    expect(res.status).toBe(200)
    expect(serviceCalls.filter((c) => c.op === 'upsert' || c.op === 'insert')).toHaveLength(0)
    const del = serviceCalls.find((c) => c.op === 'delete')
    expect(del?.in).toEqual([['user_id', [U1]]])
    const data = (await res.json()) as { handmatig: unknown[] }
    expect(data.handmatig).toEqual([])
  })

  it('raakt niets aan als de lijst ongewijzigd blijft', async () => {
    sessieResultaten = { questionnaires: [{ data: null, error: null }] }
    serviceResultaten = {
      questionnaire_invitations: [{ data: [{ user_id: U1, bron: 'handmatig' }], error: null }],
    }

    const res = await PUT(
      req({ doelgroep: { modus: 'handmatig' }, handmatig: [{ user_id: U1, email: 'een@test.nl' }] }),
      params,
    )
    expect(res.status).toBe(200)
    expect(serviceCalls.filter((c) => c.op === 'insert' || c.op === 'delete')).toHaveLength(0)
  })

  it('400 op een ongeldige modus (zod), vóór elke schrijfactie', async () => {
    const res = await PUT(req({ doelgroep: { modus: 'sommigen' }, handmatig: [] }), params)
    expect(res.status).toBe(400)
    expect(sessieCalls.filter((c) => c.op === 'update')).toHaveLength(0)
    expect(serviceCalls).toHaveLength(0)
  })

  describe('modus groepen (fase 3)', () => {
    const G1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const G2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
    const body = { doelgroep: { modus: 'groepen', groep_ids: [G1, G2] }, handmatig: [] }

    it('400 als een gekozen groep niet bestaat — en dan wordt NIETS geschreven', async () => {
      serviceResultaten = { user_groups: [{ data: [{ id: G1 }], error: null }] }

      const res = await PUT(req(body), params)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe('Een of meer gekozen groepen bestaan niet (meer)')

      const lezing = serviceCalls.find((c) => c.tabel === 'user_groups')
      expect(lezing?.in).toEqual([['id', [G1, G2]]])
      expect(sessieCalls.filter((c) => c.op === 'update')).toHaveLength(0)
      expect(serviceCalls.filter((c) => c.op !== 'select')).toHaveLength(0)
      expect(mockLogAdminAction).not.toHaveBeenCalled()
    })

    it('400 als de groepentabel nog niet is uitgerold', async () => {
      serviceResultaten = { user_groups: [{ data: null, error: { code: '42P01' } }] }
      const res = await PUT(req(body), params)
      expect(res.status).toBe(400)
      expect(sessieCalls.filter((c) => c.op === 'update')).toHaveLength(0)
    })

    it('alle groepen bestaan → de instelling wordt opgeslagen', async () => {
      sessieResultaten = { questionnaires: [{ data: null, error: null }] }
      serviceResultaten = {
        user_groups: [{ data: [{ id: G1 }, { id: G2 }], error: null }],
        questionnaire_invitations: [{ data: [], error: null }],
      }
      const res = await PUT(req(body), params)
      expect(res.status).toBe(200)
      const update = sessieCalls.find((c) => c.op === 'update')
      expect((update?.payload as { verspreiding: { doelgroep: unknown } }).verspreiding.doelgroep).toMatchObject({
        modus: 'groepen',
        groep_ids: [G1, G2],
      })
    })
  })

  it('500 als de instelling niet weggeschreven kan worden — geen halve synchronisatie', async () => {
    sessieResultaten = { questionnaires: [{ data: null, error: { code: '42501', message: 'denied' } }] }
    const res = await PUT(req({ doelgroep: { modus: 'iedereen' }, handmatig: [] }), params)
    expect(res.status).toBe(500)
    expect(serviceCalls).toHaveLength(0)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })
})
