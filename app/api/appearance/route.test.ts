import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor PUT /api/appearance — de kleur-personalisatie van /mijn/uiterlijk.
 *
 * Tot F2 (ADR 0174 D3) had deze route geen tests. Vastgepind:
 *   - 401 zonder sessie, met de app-brede tekst.
 *   - `topbar_color`: `#rrggbb` (lowercase opgeslagen), `null` = de standaard,
 *     en de standaardkleur zelf wordt óók `null`. Alles anders: 400 met de
 *     platte error-envelope, en er wordt niets geschreven.
 *   - Alleen `topbar_color` meesturen is geldig, en raakt `module_colors` en
 *     `budget_colors` NIET: die sleutels komen dan niet in de upsert.
 *   - De bestaande kleur-maps blijven ruim: één ongeldige waarde laat de rest
 *     opslaan (onboarding stuurt alleen `module_colors`).
 *   - Own-row: de upsert draagt `id = user.id`.
 *   - Een DB-fout geeft een generieke 500, zonder de ruwe fouttekst.
 */

const mockGetUser = vi.fn()
const mockUpsert = vi.fn()
const mockFrom = vi.fn(() => ({ upsert: mockUpsert }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

import { PUT } from './route'

const USER = { id: 'user-1' }

beforeEach(() => {
  mockGetUser.mockReset()
  mockUpsert.mockReset()
  mockFrom.mockClear()
  mockGetUser.mockResolvedValue({ data: { user: USER } })
  mockUpsert.mockResolvedValue({ error: null })
})

function putRequest(body: unknown) {
  return new Request('http://localhost/api/appearance', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** De rij die naar de upsert ging. */
function upserted(): Record<string, unknown> {
  expect(mockUpsert).toHaveBeenCalledTimes(1)
  return mockUpsert.mock.calls[0][0] as Record<string, unknown>
}

describe('PUT /api/appearance — sessie', () => {
  it('401 zonder sessie, met de app-brede tekst, en schrijft niets', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await PUT(putRequest({ topbar_color: '#1f2a44' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Niet ingelogd' })
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('PUT /api/appearance — topbar_color', () => {
  it('alleen topbar_color is geldig en raakt de andere kleurgroepen niet', async () => {
    const res = await PUT(putRequest({ topbar_color: '#1f2a44' }))

    expect(res.status).toBe(200)
    const row = upserted()
    expect(row).toMatchObject({ id: USER.id, topbar_color: '#1f2a44' })
    expect(row).not.toHaveProperty('module_colors')
    expect(row).not.toHaveProperty('budget_colors')
    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(await res.json()).toMatchObject({ success: true, topbar_color: '#1f2a44' })
  })

  it('schrijft alleen de whitelist: extra sleutels (role, id, household_id) vallen weg', async () => {
    // Mass-assignment-vangnet. De guard-trigger op profiles bewaakt alleen
    // role/commercial_tier/active_subscriptions; household_id e.d. niet. Een
    // latere refactor naar `upsert({ id: user.id, ...body })` moet hier rood worden.
    await PUT(putRequest({
      topbar_color: '#1f2a44',
      role: 'superadmin',
      id: 'iemand-anders',
      household_id: 'ander-huishouden',
      feature_preferences: { x: 1 },
    }))

    const row = upserted()
    expect(Object.keys(row).sort()).toEqual(['id', 'topbar_color', 'updated_at'])
    expect(row.id).toBe(USER.id)
  })

  it('slaat lowercase op: de DB-check is ^#[0-9a-f]{6}$', async () => {
    await PUT(putRequest({ topbar_color: '#1D4E6B' }))

    expect(upserted().topbar_color).toBe('#1d4e6b')
  })

  it('null is een reset naar de standaard', async () => {
    const res = await PUT(putRequest({ topbar_color: null }))

    expect(res.status).toBe(200)
    const row = upserted()
    expect(row).toHaveProperty('topbar_color', null)
  })

  it('de standaardkleur zelf wordt null, ook in hoofdletters', async () => {
    await PUT(putRequest({ topbar_color: '#3F4A5E' }))

    expect(upserted()).toHaveProperty('topbar_color', null)
  })

  it.each([
    ['een kleurnaam', 'red'],
    ['drie cijfers', '#fff'],
    ['geen hekje', '1f2a44'],
    ['acht cijfers', '#1f2a44ff'],
    ['een afsluitende newline', '#1f2a44\n'],
    ['een voorafgaande newline', '\n#1f2a44'],
    ['CSS-injectie', '#1f2a44; background: url(x)'],
    ['een getal', 123],
  ])('400 met de error-envelope bij %s — en er wordt niets geschreven', async (_, value) => {
    const res = await PUT(putRequest({ topbar_color: value }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('een ongeldige topbar_color blokkeert ook geldige accenten in dezelfde call', async () => {
    const res = await PUT(putRequest({ topbar_color: 'blauw', module_colors: { kern: '#123456' } }))

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('stuurt de response zonder topbar_color als het veld niet meekwam', async () => {
    const res = await PUT(putRequest({ module_colors: { kern: '#123456' } }))

    expect(await res.json()).not.toHaveProperty('topbar_color')
    expect(upserted()).not.toHaveProperty('topbar_color')
  })
})

describe('PUT /api/appearance — kleur-maps (bestaand gedrag)', () => {
  it('alleen module_colors (het onboarding-pad) blijft werken', async () => {
    const res = await PUT(putRequest({ module_colors: { kern: '#ABCDEF', wil: '#123456' } }))

    expect(res.status).toBe(200)
    const row = upserted()
    expect(row.module_colors).toEqual({ kern: '#abcdef', wil: '#123456' })
    expect(row).not.toHaveProperty('budget_colors')
  })

  it('één ongeldige waarde laat de rest van de map opslaan', async () => {
    await PUT(putRequest({ budget_colors: { income: '#00ff00', expense: 'rood', onbekend: '#111111' } }))

    expect(upserted().budget_colors).toEqual({ income: '#00ff00' })
  })

  it('400 als er niets geldigs binnenkomt', async () => {
    const res = await PUT(putRequest({ module_colors: { kern: 'rood' } }))

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Geen geldige kleuren ontvangen' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij een lege body', async () => {
    const res = await PUT(putRequest({}))

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij malformed JSON', async () => {
    const res = await PUT(
      new Request('http://localhost/api/appearance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{ geen json',
      }),
    )

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('PUT /api/appearance — DB-fout', () => {
  it('500 met een generieke tekst, zonder de ruwe fout', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockUpsert.mockResolvedValue({ error: { message: 'new row violates check constraint "profiles_topbar_color_check"' } })

    const res = await PUT(putRequest({ topbar_color: '#1f2a44' }))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Fout bij opslaan kleuren')
    expect(JSON.stringify(body)).not.toContain('constraint')
    spy.mockRestore()
  })
})
