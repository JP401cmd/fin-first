import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const replace = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
  usePathname: () => '/mijn/account',
}))

import { AbonnementSection } from './abonnement-section'

beforeEach(() => {
  replace.mockReset()
  refresh.mockReset()
})
import { parseAddonDeeplink } from '@/lib/subscription-catalog'

/**
 * V-002 — de AI-upsell linkt naar /mijn/account?addon=ai. In de beta (ADR 0157)
 * opent daar de beta-keuze voor die add-on in plaats van het "Binnenkort"-sheet.
 */
describe('AbonnementSection — deeplink ?addon=', () => {
  it('opent de beta-keuze voor AI bij het laden als initialAddon="ai"', async () => {
    render(<AbonnementSection activeSubscriptions={[]} initialAddon="ai" />)
    expect(screen.getByTestId('beta-addon-dialog-ai')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Niet nu' }))
    // De sheet sluit geanimeerd; daarna is hij weg.
    await vi.waitFor(() => expect(screen.queryByTestId('beta-addon-dialog-ai')).toBeNull())
    // Eenmalig: de deeplink verdwijnt uit de URL, anders opent verversen hem weer.
    expect(replace).toHaveBeenCalledWith('/mijn/account', { scroll: false })
  })

  it('opent de keuze ook als de pagina al open stond (soft-navigatie wijzigt alleen de prop)', () => {
    const { rerender } = render(<AbonnementSection activeSubscriptions={[]} />)
    expect(screen.queryByTestId('beta-addon-dialog-ai')).toBeNull()
    rerender(<AbonnementSection activeSubscriptions={[]} initialAddon="ai" />)
    expect(screen.getByTestId('beta-addon-dialog-ai')).toBeInTheDocument()
  })

  it('een actieve add-on is in de beta direct uit te zetten', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, tier: 'connected', active: false, subscriptions: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<AbonnementSection activeSubscriptions={['connected']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Connected uitzetten' }))
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      tier: 'connected',
      active: false,
      source: 'mijn-privacy',
    })
    vi.unstubAllGlobals()
  })

  it('opent niets zonder deeplink', () => {
    render(<AbonnementSection activeSubscriptions={[]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opent niets als de add-on al actief is', () => {
    render(<AbonnementSection activeSubscriptions={['ai']} initialAddon="ai" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('parseAddonDeeplink', () => {
  it('accepteert alleen bekende add-ons', () => {
    expect(parseAddonDeeplink('ai')).toBe('ai')
    expect(parseAddonDeeplink('connected')).toBe('connected')
    expect(parseAddonDeeplink('gratis')).toBeNull()
    expect(parseAddonDeeplink('iets')).toBeNull()
    expect(parseAddonDeeplink(['ai', 'ai'])).toBeNull()
    expect(parseAddonDeeplink(undefined)).toBeNull()
  })
})
