import { describe, it, expect, vi, beforeEach } from 'vitest'
import { COACH_DISMISSED_CAP } from '@/lib/coach-state'

/**
 * PUT /api/coach-state — de server-staat van Fins meldingen (ADR 0130).
 *
 * De eigenschap die deze suite bewaakt is dezelfde als bij
 * `app/api/feature-preferences/route.test.ts`: de route doet een
 * READ-MODIFY-WRITE op één jsonb-kolom die door meerdere schrijvers wordt
 * gedeeld. `profiles.module_guide_state` draagt naast `coach:state` ook
 * `welcome:guide` (de welkomstgids) en `coachmark:*` (de eenmalige hints). Een
 * blinde `update({ module_guide_state: { 'coach:state': … } })` zou die
 * stilzwijgend wissen — en dat merk je pas als de gids van een gebruiker
 * opeens weer bij stap 1 staat.
 *
 * Daarnaast: de server, niet de client, zet de tijdstempels.
 */

const { mockCreateClient, mockGetAuthClaims } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetAuthClaims: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: mockGetAuthClaims,
}))

import { PUT } from './route'

const USER = 'user-1'

/** Alle `.update(...)`-payloads die de route naar `profiles` stuurde. */
let updatePayloads: Record<string, unknown>[] = []

function buildClient(existingMap: Record<string, unknown> | null) {
  return {
    from(table: string) {
      if (table !== 'profiles') throw new Error(`onverwachte tabel: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { module_guide_state: existingMap },
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updatePayloads.push(patch)
          return { eq: async () => ({ error: null }) }
        },
      }
    },
  }
}

function req(body: unknown): Request {
  return new Request('http://localhost/api/coach-state', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/** De `coach:state`-waarde uit de laatste geschreven payload. */
function writtenState() {
  const map = updatePayloads.at(-1)?.module_guide_state as Record<string, unknown>
  return map['coach:state'] as {
    dismissed: string[]
    lastDismissedAt: string | null
    guideLastShownAt: string | null
  }
}

/** De hele geschreven jsonb-map (om andere sleutels te controleren). */
function writtenMap(): Record<string, unknown> {
  return updatePayloads.at(-1)?.module_guide_state as Record<string, unknown>
}

beforeEach(() => {
  updatePayloads = []
  mockCreateClient.mockReset()
  mockGetAuthClaims.mockReset()
  mockGetAuthClaims.mockResolvedValue({ sub: USER })
})

describe('PUT /api/coach-state — toegang en invoer', () => {
  it('401 zonder sessie, en schrijft niets', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    mockGetAuthClaims.mockResolvedValue(null)

    const res = await PUT(req({ action: 'dismiss', key: 'gap_bank' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Niet ingelogd', code: 'unauthorized' })
    expect(updatePayloads).toHaveLength(0)
  })

  it('400 bij een onbekende actie', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    const res = await PUT(req({ action: 'wissen' }))
    expect(res.status).toBe(400)
    expect(updatePayloads).toHaveLength(0)
  })

  it('400 bij een sleutel die niet aan het formaat voldoet', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    // Hoofdletters, spaties en te lange sleutels horen er niet in: de jsonb mag
    // geen vrije dumpplaats worden.
    for (const key of ['Gap_Bank', 'gap bank', 'x'.repeat(65), '']) {
      const res = await PUT(req({ action: 'dismiss', key }))
      expect(res.status, `sleutel ${JSON.stringify(key)}`).toBe(400)
    }
    expect(updatePayloads).toHaveLength(0)
  })

  it('400 bij een importLegacy met meer dan 200 sleutels', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    const keys = Array.from({ length: 201 }, (_, i) => `k${i}`)
    const res = await PUT(req({ action: 'importLegacy', keys }))
    expect(res.status).toBe(400)
    expect(updatePayloads).toHaveLength(0)
  })
})

describe('PUT /api/coach-state — dismiss', () => {
  it('voegt de sleutel toe en zet het sluitmoment (server-tijd)', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    const voor = Date.now()

    const res = await PUT(req({ action: 'dismiss', key: 'gap_bank' }))

    expect(res.status).toBe(200)
    const state = writtenState()
    expect(state.dismissed).toEqual(['gap_bank'])
    expect(Date.parse(state.lastDismissedAt!)).toBeGreaterThanOrEqual(voor)
    // De client kan de stempel niet sturen; hij komt van de server.
    expect(state.guideLastShownAt).toBeNull()
  })

  it('laat welcome:guide en coachmark:* onaangeroerd staan', async () => {
    const bestaand = {
      'welcome:guide': { status: 'active', completedStepIds: ['s1'] },
      'coachmark:euro-view': { dismissedAt: '2026-08-01T00:00:00.000Z' },
      'rondleiding:pending': { since: '2026-09-01T00:00:00.000Z' },
    }
    mockCreateClient.mockResolvedValue(buildClient(bestaand))

    await PUT(req({ action: 'dismiss', key: 'path_core' }))

    const map = writtenMap()
    expect(map['welcome:guide']).toEqual(bestaand['welcome:guide'])
    expect(map['coachmark:euro-view']).toEqual(bestaand['coachmark:euro-view'])
    expect(map['rondleiding:pending']).toEqual(bestaand['rondleiding:pending'])
    expect((map['coach:state'] as { dismissed: string[] }).dismissed).toEqual(['path_core'])
  })

  it('ontdubbelt een sleutel die er al in stond', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({ 'coach:state': { dismissed: ['gap_bank'], lastDismissedAt: null, guideLastShownAt: null } }),
    )
    await PUT(req({ action: 'dismiss', key: 'gap_bank' }))
    expect(writtenState().dismissed).toEqual(['gap_bank'])
  })

  it('kapt de lijst af op de cap en laat de oudste vallen', async () => {
    const dismissed = Array.from({ length: COACH_DISMISSED_CAP }, (_, i) => `k${i}`)
    mockCreateClient.mockResolvedValue(
      buildClient({ 'coach:state': { dismissed, lastDismissedAt: null, guideLastShownAt: null } }),
    )
    await PUT(req({ action: 'dismiss', key: 'nieuw' }))
    const next = writtenState().dismissed
    expect(next).toHaveLength(COACH_DISMISSED_CAP)
    expect(next).not.toContain('k0')
    expect(next.at(-1)).toBe('nieuw')
  })

  it('herstelt een corrupte coach:state i.p.v. te falen', async () => {
    mockCreateClient.mockResolvedValue(buildClient({ 'coach:state': 'kapot' }))
    const res = await PUT(req({ action: 'dismiss', key: 'gap_bank' }))
    expect(res.status).toBe(200)
    expect(writtenState().dismissed).toEqual(['gap_bank'])
  })
})

describe('PUT /api/coach-state — guideShown', () => {
  it('zet ALLEEN de dagstempel; dismissed en het sluitmoment blijven zoals ze waren', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({
        'coach:state': {
          dismissed: ['gap_bank'],
          lastDismissedAt: '2026-09-01T09:00:00.000Z',
          guideLastShownAt: null,
        },
      }),
    )
    const voor = Date.now()

    const res = await PUT(req({ action: 'guideShown' }))

    expect(res.status).toBe(200)
    const state = writtenState()
    expect(state.dismissed).toEqual(['gap_bank'])
    expect(state.lastDismissedAt).toBe('2026-09-01T09:00:00.000Z')
    expect(Date.parse(state.guideLastShownAt!)).toBeGreaterThanOrEqual(voor)
  })
})

describe('PUT /api/coach-state — importLegacy', () => {
  it('voegt de oude localStorage-sleutels toe, ontdubbeld', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({ 'coach:state': { dismissed: ['gap_bank'], lastDismissedAt: null, guideLastShownAt: null } }),
    )

    const res = await PUT(req({ action: 'importLegacy', keys: ['gap_bank', 'path_core', 'default'] }))

    expect(res.status).toBe(200)
    expect(writtenState().dismissed).toEqual(['gap_bank', 'path_core', 'default'])
  })

  it('zet GEEN sluitmoment — het echte moment van die oude dismisses is onbekend', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    await PUT(req({ action: 'importLegacy', keys: ['path_core'] }))
    // Zou hij 'nu' zetten, dan zou de rustpauze op route-tips onterecht starten
    // op het moment dat iemand voor het eerst na de migratie de app opent.
    expect(writtenState().lastDismissedAt).toBeNull()
  })

  it('accepteert een lege lijst zonder de bestaande staat te beschadigen', async () => {
    mockCreateClient.mockResolvedValue(
      buildClient({ 'coach:state': { dismissed: ['gap_bank'], lastDismissedAt: null, guideLastShownAt: null } }),
    )
    const res = await PUT(req({ action: 'importLegacy', keys: [] }))
    expect(res.status).toBe(200)
    expect(writtenState().dismissed).toEqual(['gap_bank'])
  })
})
