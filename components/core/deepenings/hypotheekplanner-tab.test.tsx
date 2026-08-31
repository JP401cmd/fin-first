import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import type { Asset } from '@/lib/asset-data'

/**
 * UR2-14 — de Hypotheekplanner-tab mag op de woning-entry geen dead-end meer
 * zijn. Tot deze fix viel `/overzicht/bezittingen/eigen_huis?tab=hypotheekplanner`
 * zonder getrackte woning terug op een tekstblok ("Activeer woonbalans-tracking
 * op je woning…") zónder enige actie: de schakelaar zat verstopt als checkbox
 * in het bezitting-bewerkformulier, en heette daar bovendien anders.
 *
 * Deze suite bewijst drie dingen op de gerenderde DOM (niet op de broncode):
 *  1. de tab biedt een werkende koppel-actie i.p.v. de oude dode tekst;
 *  2. koppelen schrijft dezelfde vlag als het formulier
 *     (`POST /api/assets/toggle-woonbalans`, `{ id, enabled: true }`);
 *  3. een woning van de PARTNER wordt niet als kandidaat aangeboden — lezen op
 *     `assets` is huishoud-gedeeld, maar de toggle-write is strikt eigen-rij.
 *
 * Harness gespiegeld op `verhuurrendement-tab.test.tsx`: een chainbare
 * Proxy-mock van de supabase-client die elke query met lege data beantwoordt,
 * zodat de tab op zijn koppel-pad uitkomt zonder één zware kind-component te
 * mounten.
 */

function makeSupabase() {
  function builder(): Record<string, unknown> {
    const target: Record<string, unknown> = {
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null })),
    }
    return new Proxy(target, {
      get(t, prop: string) {
        if (prop in t) return (t as Record<string, unknown>)[prop]
        return () => builder()
      },
    })
  }
  return {
    from: () => builder(),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }
}

vi.mock('@/lib/supabase/client', () => ({ createClient: () => makeSupabase() }))

// Setup ooit voltooid: we testen het koppelscherm ná de setup-gate, niet de
// eenmalige setup zelf.
vi.mock('@/components/app/app-setup/use-is-setup-completed', () => ({
  useIsAppSetupCompleted: () => true,
}))

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/overzicht/bezittingen/eigen_huis',
}))

import { HypotheekplannerTab } from './hypotheekplanner-tab'

// ── Fixtures ─────────────────────────────────────────────────

function house(overrides: Partial<Asset> & Pick<Asset, 'id' | 'name'>): Asset {
  return {
    asset_type: 'eigen_huis',
    current_value: 450000,
    user_id: 'u1',
    is_active: true,
    has_woonbalans_tracking: false,
    ...overrides,
  } as Asset
}

beforeEach(() => {
  refresh.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('HypotheekplannerTab — woning-entry zonder gekoppelde woning', () => {
  it('toont een koppelscherm met actie i.p.v. de oude dode empty-state', async () => {
    render(
      <HypotheekplannerTab
        type="eigen_huis"
        moduleActive
        assets={[house({ id: 'a1', name: 'Eigen woning Amersfoort' })]}
        currentUserId="u1"
      />,
    )

    const knop = await screen.findByRole('button', { name: 'Koppelen' })
    expect(knop).toBeTruthy()
    expect(screen.getByText('Eigen woning Amersfoort')).toBeTruthy()

    // De oude dead-end mag niet terugkomen — inclusief de derde featurenaam.
    expect(screen.queryByText('Nog niets getrackt')).toBeNull()
    expect(screen.queryByText(/woonbalans/i)).toBeNull()
  })

  it('koppelen POST\'t de woning naar /api/assets/toggle-woonbalans', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <HypotheekplannerTab
        type="eigen_huis"
        moduleActive
        assets={[house({ id: 'a1', name: 'Eigen woning Amersfoort' })]}
        currentUserId="u1"
      />,
    )

    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Koppelen' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/assets/toggle-woonbalans')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ id: 'a1', enabled: true })
  })

  it('biedt een partnerwoning niet als kandidaat aan (write is eigen-rij)', async () => {
    render(
      <HypotheekplannerTab
        type="eigen_huis"
        moduleActive
        assets={[
          house({ id: 'a1', name: 'Eigen woning Amersfoort' }),
          house({ id: 'a2', name: 'Woning van partner', user_id: 'u2' }),
        ]}
        currentUserId="u1"
      />,
    )

    await screen.findByRole('button', { name: 'Koppelen' })
    expect(screen.getByText('Eigen woning Amersfoort')).toBeTruthy()
    expect(screen.queryByText('Woning van partner')).toBeNull()
  })

  it('zonder enige woning: voeg-eerst-toe-state met CTA, geen dode tekst', async () => {
    render(
      <HypotheekplannerTab
        type="eigen_huis"
        moduleActive
        assets={[]}
        currentUserId="u1"
      />,
    )

    expect(await screen.findByRole('link', { name: 'Voeg woning toe' })).toBeTruthy()
    expect(screen.queryByText('Nog niets getrackt')).toBeNull()
  })
})
