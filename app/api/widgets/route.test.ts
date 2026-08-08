import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WidgetPref } from '@/lib/widget-catalog'

/**
 * PUT /api/widgets — server-side size-sanitering.
 *
 * DE BUG DIE DEZE SUITE PINT: `sanitizeSize` gebruikte `getWidgetDef(id)?.sizes`.
 * Dynamische id's (`spend_limit:*`, `budget_fav:*`, `holding_fav:*`) hebben per
 * ontwerp geen catalog-def, dus viel `'xl'` daar STIL terug naar `'half'`: de
 * gebruiker koos Double, kreeg Half, zonder enige foutmelding. De fix leest de
 * canonieke matenbron `getWidgetSizes(id)`, die de prefix-takken kent.
 *
 * De tests kijken naar wat er DAADWERKELIJK in `widget_prefs` wordt geschreven —
 * niet naar de HTTP-status. Alleen zo bijt de proef: draai de fix terug en de
 * xl-round-trip wordt rood.
 */

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

/** Vangt de `widget_prefs`-payload die de route naar `profiles` schrijft. */
let savedPrefs: WidgetPref[] | null = null

function stubSupabase({ user = { id: 'U1' } as { id: string } | null } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      update: (payload: { widget_prefs: { widgets: WidgetPref[] } }) => {
        savedPrefs = payload.widget_prefs.widgets
        return {
          eq: () => ({
            select: async () => ({ data: [{ id: 'U1' }], error: null }),
          }),
        }
      },
    }),
  }
}

async function put(widgets: unknown[]) {
  const { PUT } = await import('./route')
  return PUT(
    new Request('http://localhost/api/widgets', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ widgets }),
    }),
  )
}

beforeEach(() => {
  savedPrefs = null
  mockCreateClient.mockResolvedValue(stubSupabase())
})

describe('PUT /api/widgets — xl round-trip voor dynamische id\'s', () => {
  it('persisteert xl voor een spend_limit:-widget (niet stil naar half)', async () => {
    const res = await put([{ id: 'spend_limit:POT-1', enabled: true, size: 'xl', order: 0 }])
    expect(res.status).toBe(200)
    expect(savedPrefs).toEqual([
      { id: 'spend_limit:POT-1', enabled: true, size: 'xl', order: 0 },
    ])
  })

  it('persisteert xl ook voor budget_fav:/holding_fav: (bewust aanvaard bijeffect)', async () => {
    await put([
      { id: 'budget_fav:B1', enabled: true, size: 'xl', order: 0 },
      { id: 'holding_fav:H1', enabled: true, size: 'xl', order: 1 },
    ])
    expect(savedPrefs?.map(w => w.size)).toEqual(['xl', 'xl'])
  })

  it('laat een spend_limit:-widget door het id-filter', async () => {
    await put([
      { id: 'spend_limit:POT-1', enabled: true, size: 'quarter', order: 0 },
      { id: 'bestaat_niet', enabled: true, size: 'quarter', order: 1 },
    ])
    expect(savedPrefs?.map(w => w.id)).toEqual(['spend_limit:POT-1'])
  })

  it('mini wordt nooit gepersisteerd (→ quarter)', async () => {
    await put([{ id: 'spend_limit:POT-1', enabled: true, size: 'mini', order: 0 }])
    expect(savedPrefs?.[0].size).toBe('quarter')
  })

  it('een onbekende maat valt terug op half', async () => {
    await put([{ id: 'spend_limit:POT-1', enabled: true, size: 'gigantisch', order: 0 }])
    expect(savedPrefs?.[0].size).toBe('half')
  })

  it('401 zonder ingelogde gebruiker, en er wordt niets geschreven', async () => {
    mockCreateClient.mockResolvedValue(stubSupabase({ user: null }))
    const res = await put([{ id: 'spend_limit:POT-1', enabled: true, size: 'xl', order: 0 }])
    expect(res.status).toBe(401)
    expect(savedPrefs).toBeNull()
  })
})
