import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PUT /api/profile (TPR-14) — de schrijfkant van /mijn/profiel.
 *
 * Pint: sessie-gate (401 zonder upsert), zod-allowlist (onbekende sleutels
 * bereiken de DB niet, `id` komt uit de sessie), validatie van de rekenmotor-
 * velden (geboortedatum, huishoudtype), de `income_source`-regel, de error-
 * envelope zonder rauwe DB-melding en de best-effort opruiming van het
 * uitgestelde inkomen-veld.
 */

type Row = Record<string, unknown>

const state: {
  user: { id: string } | null
  upsertError: unknown
  prefs: Row | null
  upserts: Row[]
  updates: Row[]
} = { user: { id: 'u1' }, upsertError: null, prefs: null, upserts: [], updates: [] }

function makeSupabase() {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: state.user } }) },
    from: () => {
      const q: Record<string, unknown> = {}
      q.upsert = (row: Row) => {
        state.upserts.push(row)
        return Promise.resolve({ error: state.upsertError })
      }
      q.select = () => q
      q.eq = () => q
      q.single = () => Promise.resolve({ data: { feature_preferences: state.prefs }, error: null })
      q.update = (row: Row) => {
        state.updates.push(row)
        return { eq: () => Promise.resolve({ error: null }) }
      }
      return q
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(makeSupabase()),
}))

import { PUT } from './route'

const VALID: Row = {
  full_name: 'Tessa',
  date_of_birth: '1985-04-01',
  country: 'NL',
  household_type: 'samen',
  marketplace_display_name: '  ',
  number_of_children: 1,
  children_ages: [4],
  housing_type: 'koop',
  net_monthly_income: 4200,
}

const put = (body: unknown) =>
  PUT(new Request('http://localhost/api/profile', { method: 'PUT', body: JSON.stringify(body) }))

beforeEach(() => {
  state.user = { id: 'u1' }
  state.upsertError = null
  state.prefs = null
  state.upserts = []
  state.updates = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('PUT /api/profile', () => {
  it('401 zonder sessie en schrijft niets', async () => {
    state.user = null
    const res = await put(VALID)
    expect(res.status).toBe(401)
    expect(state.upserts).toHaveLength(0)
  })

  it('schrijft de eigen rij met het id uit de sessie, niet uit de body', async () => {
    const res = await put({ ...VALID, id: 'iemand-anders', role: 'superadmin' })
    expect(res.status).toBe(200)
    expect(state.upserts).toHaveLength(1)
    const row = state.upserts[0]
    expect(row.id).toBe('u1')
    expect(row).not.toHaveProperty('role')
    expect(row.date_of_birth).toBe('1985-04-01')
    expect(row.household_type).toBe('samen')
    // Lege/witruimte-bibliotheeknaam → null ("Anoniem").
    expect(row.marketplace_display_name).toBeNull()
    expect(row.income_source).toBe('manual')
  })

  it('leeg geboortedatum- en inkomensveld → null, en de inkomensbron blijft ongemoeid', async () => {
    const res = await put({ ...VALID, date_of_birth: '', net_monthly_income: null, country: '' })
    expect(res.status).toBe(200)
    const row = state.upserts[0]
    expect(row.date_of_birth).toBeNull()
    expect(row.net_monthly_income).toBeNull()
    expect(row.country).toBe('NL')
    expect(row).not.toHaveProperty('income_source')
  })

  it.each([
    ['onbestaande datum', '2026-02-31'],
    ['toekomst', '2999-01-01'],
    ['vóór 1900', '1899-12-31'],
    ['geen ISO-formaat', '01-04-1985'],
  ])('weigert een ongeldige geboortedatum (%s) met 400 en schrijft niets', async (_, dob) => {
    const res = await put({ ...VALID, date_of_birth: dob })
    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: string }
    expect(data.error).toContain('Vul een geldige geboortedatum in.')
    expect(state.upserts).toHaveLength(0)
  })

  it('weigert een huishoudtype buiten de canonieke drie (ook de oude default "single")', async () => {
    const res = await put({ ...VALID, household_type: 'single' })
    expect(res.status).toBe(400)
    expect(state.upserts).toHaveLength(0)
  })

  it('500 via de envelope zonder de rauwe DB-melding', async () => {
    state.upsertError = { message: 'permission denied for relation profiles_pkey', code: '42501' }
    const res = await put(VALID)
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('profiles_pkey')
  })

  it("haalt 'income' uit de uitgestelde onboarding-velden en laat de rest staan", async () => {
    state.prefs = { deferred_onboarding_fields: ['income', 'expenses'], andere_sleutel: true }
    const res = await put(VALID)
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([
      {
        feature_preferences: {
          deferred_onboarding_fields: ['expenses'],
          andere_sleutel: true,
        },
      },
    ])
  })

  it('raakt feature_preferences niet aan bij inkomen 0', async () => {
    state.prefs = { deferred_onboarding_fields: ['income'] }
    await put({ ...VALID, net_monthly_income: 0 })
    expect(state.updates).toHaveLength(0)
  })
})
