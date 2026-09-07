import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommandPalette } from './command-palette'

/**
 * De ⌘K-actie "Alles synchroniseren" MOET dezelfde ronde draaien als de
 * sync-knop in de header.
 *
 * Gemeld 7 sep 2026: "bij het synchroniseren van prijzen werden de bankgegevens
 * niet meegenomen". Terecht — het palet riep
 * `triggerGlobalSync({ exchanges: [], wallets: [], pricesOnly: true })` aan, en
 * `pricesOnly` schakelt de bankstap, de exchanges én de wallets uit. De
 * verwachting van de melder ("hooguit 1× per uur, hooguit 10× per dag, via de
 * algemene knop, niet per bank aanklikken") is precies wat de rem in
 * `lib/sync/global-sync.ts#planBankSyncs` al doet — alleen bereikte het palet
 * die planner nooit.
 *
 * Deze test pint de bedrading, niet de rem: gaat de bankkoppeling als DOEL mee
 * de ronde in, en blijft `pricesOnly` uit? Wat de planner er vervolgens mee doet
 * (meenemen of overslaan) staat in `lib/sync/global-sync.test.ts`.
 */

const triggerGlobalSync = vi.fn()
const getBankAttempts = vi.fn(() => ({}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/components/sync/global-sync-provider', () => ({
  useGlobalSync: () => ({ triggerGlobalSync, getBankAttempts }),
}))

vi.mock('@/components/app/feature-access-provider', () => ({
  useModuleAccess: () => ({
    activeModules: ['vermogensregistratie'],
    subscriptions: [],
    isModuleActive: () => true,
    refreshModules: vi.fn(),
  }),
}))

/** Bankkoppeling die twee dagen geleden synchroniseerde — ruim buiten de uur-rem. */
const BANK = {
  id: 'bca-1',
  account_name: 'Betaalrekening',
  iban_tail: '0596',
  provider_name: 'Rabobank',
  provider_logo: null,
  provider_id: 'ob-rabobank',
  health: {
    state: 'linked' as const,
    expiringSoon: false,
    daysUntilExpiry: 80,
    lastSyncedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  bank_account_id: 'ba-1',
  carrier_name: 'Rabobank betaalrekening',
  carrier_iban_tail: '0596',
  last_synced_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  daily_requests: 0,
  rate_limit_reset_date: null,
  balance_change: null,
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body }
}

beforeEach(() => {
  triggerGlobalSync.mockClear()
  getBankAttempts.mockClear()
  // jsdom kent scrollIntoView niet; het auto-scroll-effect roept het aan bij mount.
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/integrations/connections') {
        return Promise.resolve(jsonResponse({ exchanges: [], wallets: [], recentSyncs: [] }))
      }
      if (url === '/api/bank-connect/linked-accounts') {
        return Promise.resolve(jsonResponse({ accounts: [BANK] }))
      }
      return Promise.resolve(jsonResponse({}))
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CommandPalette — "Alles synchroniseren" draait de volledige ronde', () => {
  it('geeft de bankkoppelingen als doel mee en zet géén pricesOnly', async () => {
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)

    fireEvent.click(screen.getByText('Alles synchroniseren'))

    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))

    const params = triggerGlobalSync.mock.calls[0][0] as {
      banks?: Array<{ connectionAccountId: string }>
      pricesOnly?: boolean
    }
    expect(params.banks?.map((b) => b.connectionAccountId)).toEqual(['bca-1'])
    expect(params.pricesOnly).toBe(false)
  })

  it('leest de poging-stempels uit, zodat een falende koppeling niet elke klik een dagtik kost', async () => {
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)

    fireEvent.click(screen.getByText('Alles synchroniseren'))

    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))
    expect(getBankAttempts).toHaveBeenCalled()
  })

  it('valt terug op een kale prijzenronde zodra er geen enkele koppeling is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/integrations/connections') {
          return Promise.resolve(jsonResponse({ exchanges: [], wallets: [], recentSyncs: [] }))
        }
        // Bank-lijst niet beschikbaar → niet-fataal, lege lijst.
        if (url === '/api/bank-connect/linked-accounts') {
          return Promise.resolve({ ok: false, status: 500, headers: new Headers(), json: async () => ({}) })
        }
        return Promise.resolve(jsonResponse({}))
      }),
    )

    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)

    fireEvent.click(screen.getByText('Alles synchroniseren'))

    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))
    const params = triggerGlobalSync.mock.calls[0][0] as {
      banks?: unknown[]
      pricesOnly?: boolean
    }
    expect(params.banks).toEqual([])
    expect(params.pricesOnly).toBe(true)
  })
})
