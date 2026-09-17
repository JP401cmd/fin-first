import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/mijn/account',
}))

import { AbonnementSection } from './abonnement-section'

beforeEach(() => replace.mockReset())
import { parseAddonDeeplink } from '@/lib/subscription-catalog'

/**
 * V-002 — de AI-upsell linkt naar /mijn/account?addon=ai; dan opent het
 * upgrade-sheet ("Binnenkort") van de AI-add-on direct.
 */
describe('AbonnementSection — deeplink ?addon=', () => {
  it('opent het AI-upgrade-sheet bij het laden als initialAddon="ai"', () => {
    render(<AbonnementSection activeSubscriptions={[]} initialAddon="ai" />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Binnenkort')
    expect(dialog).toHaveTextContent(/AI/)
    // Geen belofte van directe checkout.
    expect(dialog).not.toHaveTextContent(/reken af/i)
    fireEvent.click(screen.getAllByRole('button', { name: 'Sluiten' })[0])
    expect(screen.queryByRole('dialog')).toBeNull()
    // Eenmalig: de deeplink verdwijnt uit de URL, anders opent verversen hem weer.
    expect(replace).toHaveBeenCalledWith('/mijn/account', { scroll: false })
  })

  it('opent het sheet ook als de pagina al open stond (soft-navigatie wijzigt alleen de prop)', () => {
    const { rerender } = render(<AbonnementSection activeSubscriptions={[]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<AbonnementSection activeSubscriptions={[]} initialAddon="ai" />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Binnenkort')
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
