import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PUT /api/feature-preferences — R5 (integratietoets ADR 0103).
 *
 * `profiles.cashflow_basis_prefs` (de budget-uitsluitlijst uit ADR 0103) en
 * `profiles.feature_preferences` zijn TWEE onafhankelijke JSONB-kolommen op
 * dezelfde rij, geschreven door TWEE aparte routes (`/api/parameters` resp.
 * `/api/feature-preferences`). Zonder een gescoopte `UPDATE` zou een naïeve
 * `upsert(hele-rij)` op deze route een concurrent geschreven `cashflow_basis_prefs`
 * kunnen overschrijven met wat de route toevallig in-memory had (of ontbreken).
 *
 * Deze test bewijst het tegendeel: de route doet een `.update()` met UITSLUITEND
 * `feature_preferences` als payload — een kolom-gescoopte UPDATE kan
 * `cashflow_basis_prefs` op de rij per definitie niet raken, ongeacht wat een
 * andere schrijver daar gelijktijdig mee doet.
 */

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/feature-registry', () => ({
  UNIFIED_FEATURES: [
    { id: 'feat-free', requiredTier: null },
    { id: 'feat-pro', requiredTier: 'pro' },
  ],
  hasSubscription: (subs: string[], tier: string | null) => tier == null || subs.includes(tier),
}))

import { PUT } from './route'

const USER = 'user-1'

/** Alle `.update(...)`-payloads die de route naar `profiles` stuurde. */
let updatePayloads: Record<string, unknown>[] = []

function buildClient(opts: { activeSubscriptions?: string[] }) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: USER } }, error: null }),
    },
    from(table: string) {
      if (table !== 'profiles') throw new Error(`onverwachte tabel: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { active_subscriptions: opts.activeSubscriptions ?? [] },
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updatePayloads.push(patch)
          return {
            eq: async () => ({ error: null }),
          }
        },
      }
    },
  }
}

function req(preferences: Record<string, boolean>): Request {
  return new Request('http://localhost/api/feature-preferences', {
    method: 'PUT',
    body: JSON.stringify({ preferences }),
  })
}

beforeEach(() => {
  updatePayloads = []
  mockCreateClient.mockReset()
})

describe('PUT /api/feature-preferences — R5: raakt cashflow_basis_prefs nooit', () => {
  it('de UPDATE-payload draagt uitsluitend feature_preferences, geen cashflow_basis_prefs-sleutel', async () => {
    mockCreateClient.mockResolvedValue(buildClient({ activeSubscriptions: [] }))

    const res = await PUT(req({ 'feat-free': true }))

    expect(res.status).toBe(200)
    expect(updatePayloads).toHaveLength(1)
    expect(Object.keys(updatePayloads[0])).toEqual(['feature_preferences'])
    expect(updatePayloads[0]).not.toHaveProperty('cashflow_basis_prefs')
  })

  it('blijft kolom-gescoopt ook wanneer de body een cashflow_basis_prefs-sleutel meestuurt (genegeerd, niet doorgeschreven)', async () => {
    // De route leest `body.preferences` en niets anders uit de body — een
    // meegestuurde `cashflow_basis_prefs` (per ongeluk of kwaadwillig) mag de
    // UPDATE-payload niet bereiken.
    mockCreateClient.mockResolvedValue(buildClient({ activeSubscriptions: [] }))
    const body = { preferences: { 'feat-free': true }, cashflow_basis_prefs: { v: 1, excludedIncomeBudgetIds: ['x'], excludedExpenseBudgetIds: [] } }
    const res = await PUT(new Request('http://localhost/api/feature-preferences', { method: 'PUT', body: JSON.stringify(body) }))

    expect(res.status).toBe(200)
    expect(Object.keys(updatePayloads[0])).toEqual(['feature_preferences'])
  })

  it('subscription-gated features worden stil geweigerd, maar de payload blijft kolom-gescoopt', async () => {
    mockCreateClient.mockResolvedValue(buildClient({ activeSubscriptions: [] }))

    const res = await PUT(req({ 'feat-free': true, 'feat-pro': true }))
    const body = (await res.json()) as { preferences: Record<string, boolean> }

    expect(body.preferences).toEqual({ 'feat-free': true })
    expect(Object.keys(updatePayloads[0])).toEqual(['feature_preferences'])
  })
})
