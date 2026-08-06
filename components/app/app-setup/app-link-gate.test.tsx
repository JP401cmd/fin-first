/**
 * Unit tests voor `<AppLinkGate>` — het koppelscherm dat een app-tab toont
 * wanneer de setup voltooid is maar geen enkel item (meer) aan de app is
 * gekoppeld. Dekt: kandidaten-selectie, POST per selectie naar het per-item
 * toggle-endpoint (dezelfde vlag als de instelling op de bezitting zelf),
 * refresh/onLinked na succes, fout-banner, en de voeg-eerst-toe-state
 * zonder kandidaten.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { Coins } from 'lucide-react'
import { AppLinkGate } from './app-link-gate'

// ── Mocks ────────────────────────────────────────────────────

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/core/assets/crypto',
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => ({ masked: false }),
}))

// ── Helpers ──────────────────────────────────────────────────

function baseProps() {
  return {
    kicker: 'Bezittingen koppelen',
    title: 'Koppel je crypto-bezittingen',
    intro: 'Kies welke bezittingen je volgt.',
    itemNoun: 'bezitting',
    icon: Coins,
    candidates: [
      { id: 'a-btc', name: 'Bitcoin', value: 12000 },
      { id: 'a-eth', name: 'Ethereum', value: 8000 },
    ],
    endpoint: '/api/assets/toggle-holdings',
    emptyCopy: 'Nog geen bezitting geregistreerd.',
    emptyCtaLabel: 'Voeg bezitting toe',
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  refreshMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ── Tests ────────────────────────────────────────────────────

describe('AppLinkGate — keuzescherm', () => {
  it('toont alle kandidaten met naam', () => {
    render(<AppLinkGate {...baseProps()} />)
    expect(screen.getByText('Bitcoin')).toBeTruthy()
    expect(screen.getByText('Ethereum')).toBeTruthy()
  })

  it('disabelt Koppelen zonder selectie en enabelt na aanvinken', () => {
    render(<AppLinkGate {...baseProps()} />)
    const button = screen.getByRole('button', { name: 'Koppelen' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)

    fireEvent.click(screen.getByRole('checkbox', { name: /bitcoin/i }))
    expect(button.disabled).toBe(false)
  })

  it('POST per geselecteerd item {id, enabled:true} naar het endpoint en refresht', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    const onLinked = vi.fn()
    render(<AppLinkGate {...baseProps()} onLinked={onLinked} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /bitcoin/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /ethereum/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Koppelen' }))

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
    expect(onLinked).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string))
    expect(bodies).toEqual([
      { id: 'a-btc', enabled: true },
      { id: 'a-eth', enabled: true },
    ])
    expect(fetchMock.mock.calls.every((c) => c[0] === '/api/assets/toggle-holdings')).toBe(true)
  })

  it('toont de server-fout als banner en refresht dan niet', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Koppelen mislukt op de server' }),
    })
    render(<AppLinkGate {...baseProps()} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /bitcoin/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Koppelen' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Koppelen mislukt op de server'),
    )
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe('AppLinkGate — zonder kandidaten', () => {
  it('toont de voeg-eerst-toe-state met CTA naar de items-tab (pad zonder query)', () => {
    render(<AppLinkGate {...baseProps()} candidates={[]} />)
    expect(screen.getByText('Nog geen bezitting geregistreerd.')).toBeTruthy()
    const cta = screen.getByRole('link', { name: 'Voeg bezitting toe' }) as HTMLAnchorElement
    expect(cta.getAttribute('href')).toBe('/core/assets/crypto')
    // Geen koppelen-knop in deze staat
    expect(screen.queryByRole('button', { name: 'Koppelen' })).toBeNull()
  })
})
