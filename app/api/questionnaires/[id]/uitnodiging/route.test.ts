import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PATCH /api/questionnaires/[id]/uitnodiging — wat de gebruiker met de popup doet
 * (ADR 0147).
 *
 * Vastgelegd:
 *   - 401 zonder sessie, 400 op een onbekende actie (zod), 404 op een inactieve
 *     of niet-bestaande lijst;
 *   - zonder eigen rij wordt er eerst één aangemaakt met bron 'regel' (de enige
 *     bron die de gebruiker onder RLS mag schrijven);
 *   - de update raakt UITSLUITEND de vier staat-kolommen waarop de gebruiker
 *     kolomrecht heeft — nooit bron/bron_detail, want dan zou de policy de
 *     hele schrijfactie weigeren.
 */

type Resultaat = { data: unknown; error: unknown }

let resultaten: Record<string, Resultaat[]>
let inserts: { tabel: string; rij: Record<string, unknown> }[]
let updates: { tabel: string; rij: Record<string, unknown>; eq: [string, unknown][] }[]
const mockClaims = vi.fn()

function keten(tabel: string) {
  const volgende = (): Resultaat => resultaten[tabel]?.shift() ?? { data: null, error: null }
  const eq: [string, unknown][] = []
  const k: Record<string, unknown> = {}
  for (const m of ['select', 'is', 'in', 'order', 'limit']) k[m] = () => k
  k.eq = (kolom: string, waarde: unknown) => {
    eq.push([kolom, waarde])
    return k
  }
  k.maybeSingle = async () => volgende()
  k.single = async () => volgende()
  k.then = (resolve: (r: Resultaat) => unknown) => resolve(volgende())
  k.insert = (rij: Record<string, unknown>) => {
    inserts.push({ tabel, rij })
    return k
  }
  k.update = (rij: Record<string, unknown>) => {
    updates.push({ tabel, rij, eq })
    return k
  }
  return k
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: (tabel: string) => keten(tabel) })),
  getAuthClaims: (...args: unknown[]) => mockClaims(...args),
}))

import { PATCH } from './route'

const USER = 'user-1'
const QID = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'
const params = { params: Promise.resolve({ id: QID }) }

function req(body: unknown) {
  return new Request(`http://localhost/api/questionnaires/${QID}/uitnodiging`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const NIEUWE_RIJ = {
  questionnaire_id: QID,
  bron: 'regel',
  invited_at: '2026-09-15T09:00:00.000Z',
  shown_at: null,
  snoozed_until: null,
  dismissed_at: null,
  dismiss_count: 0,
}

beforeEach(() => {
  resultaten = {}
  inserts = []
  updates = []
  mockClaims.mockReset().mockResolvedValue({ sub: USER, email: 'user@test.nl' })
})

describe('PATCH uitnodiging', () => {
  it('401 zonder sessie', async () => {
    mockClaims.mockResolvedValue(null)
    expect((await PATCH(req({ actie: 'gezien' }), params)).status).toBe(401)
  })

  it('400 op een onbekende actie', async () => {
    const res = await PATCH(req({ actie: 'wegklikken' }), params)
    expect(res.status).toBe(400)
    expect(inserts).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })

  it('404 (geen 500) op een id dat geen uuid is', async () => {
    const res = await PATCH(req({ actie: 'gezien' }), { params: Promise.resolve({ id: 'geen-uuid' }) })
    expect(res.status).toBe(404)
  })

  it('404 op een inactieve of onbekende vragenlijst', async () => {
    resultaten = { questionnaires: [{ data: null, error: null }] }
    const res = await PATCH(req({ actie: 'later' }), params)
    expect(res.status).toBe(404)
    expect(inserts).toHaveLength(0)
  })

  it('404 zonder eigen rij op een lijst die niet op "iedereen" staat — geen rij fabriceren', async () => {
    resultaten = {
      questionnaires: [{ data: { id: QID, verspreiding: { doelgroep: { modus: 'handmatig' } } }, error: null }],
      questionnaire_invitations: [{ data: null, error: null }],
    }
    const res = await PATCH(req({ actie: 'later' }), params)
    expect(res.status).toBe(404)
    expect(inserts).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })

  it('"later" zonder bestaande rij: insert bron regel, daarna alleen de vier staat-kolommen', async () => {
    resultaten = {
      questionnaires: [{ data: { id: QID, verspreiding: null }, error: null }],
      questionnaire_invitations: [
        { data: null, error: null }, // eigen rij bestaat nog niet
        { data: NIEUWE_RIJ, error: null }, // de insert
        { data: null, error: null }, // de update
      ],
    }

    const voor = Date.now()
    const res = await PATCH(req({ actie: 'later' }), params)
    expect(res.status).toBe(200)

    expect(inserts).toHaveLength(1)
    expect(inserts[0].rij).toMatchObject({
      questionnaire_id: QID,
      user_id: USER,
      bron: 'regel',
      bron_detail: { iedereen: true },
    })

    expect(updates).toHaveLength(1)
    // De kolomrechten van de gebruiker, letterlijk: niets meer, niets minder.
    expect(Object.keys(updates[0].rij).sort()).toEqual([
      'dismiss_count',
      'dismissed_at',
      'shown_at',
      'snoozed_until',
    ])
    expect(updates[0].eq).toEqual([
      ['questionnaire_id', QID],
      ['user_id', USER],
    ])

    const invitation = ((await res.json()) as { invitation: Record<string, unknown> }).invitation
    expect(invitation.dismiss_count).toBe(1)
    expect(invitation.shown_at).not.toBeNull()
    // Standaard snooze = 7 dagen (POPUP_STANDAARD) vanaf nu.
    const tot = new Date(invitation.snoozed_until as string).getTime()
    expect(tot).toBeGreaterThanOrEqual(voor + 7 * 86_400_000 - 5_000)
    expect(tot).toBeLessThanOrEqual(Date.now() + 7 * 86_400_000 + 5_000)
    expect(invitation.bron).toBe('regel')
    expect(invitation.invited_at).toBe(NIEUWE_RIJ.invited_at)
  })

  it('"niet_meer" op een bestaande rij zet dismissed_at en verhoogt de teller niet', async () => {
    resultaten = {
      questionnaires: [{ data: { id: QID, verspreiding: null }, error: null }],
      questionnaire_invitations: [
        { data: { ...NIEUWE_RIJ, shown_at: '2026-09-14T09:00:00.000Z', dismiss_count: 1 }, error: null },
        { data: null, error: null }, // de update
      ],
    }

    const res = await PATCH(req({ actie: 'niet_meer' }), params)
    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(0)

    const invitation = ((await res.json()) as { invitation: Record<string, unknown> }).invitation
    expect(invitation.dismissed_at).not.toBeNull()
    expect(invitation.dismiss_count).toBe(1)
    // shown_at wordt alleen de EERSTE keer gestempeld.
    expect(invitation.shown_at).toBe('2026-09-14T09:00:00.000Z')
  })
})
