import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PageStatusBannerBody, statusBannerTone } from './page-status-banner-body'

/**
 * `PageStatusBannerBody` — één uiterlijk voor `PageStatusBanner` en `KaternMelding`.
 * De block-variant wordt aan de banner-DOM vastgepind in
 * `page-status-banner.dom.test.tsx`; hier de takken die de banner niet raakt.
 */

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const ACTIE = { label: 'Naar je AOW-strategie', href: '/toekomst/instellingen?strategie=aow' }

describe('statusBannerTone', () => {
  it('informatief = horizon-toon, ongeacht de status', () => {
    expect(statusBannerTone('warn', true)).toEqual({
      bg: 'bg-gradient-to-r from-horizon-50 to-stone-50',
      stripe: 'bg-horizon-500',
      kickerText: 'text-horizon-700',
    })
  })

  it('alarm volgt het stoplicht, niet een module-accent', () => {
    const t = statusBannerTone('bad', false)
    expect(t.stripe).toBe('bg-red-500')
    expect(t.kickerText).toBe('text-red-700')
  })
})

describe('PageStatusBannerBody — block', () => {
  it('zonder onMinimize geen knop; zonder actie en extra geen actie-rij', () => {
    const { container } = render(
      <PageStatusBannerBody tone={statusBannerTone('warn', false)} kicker="Aandacht" title="Titel" />,
    )
    expect(screen.queryByRole('button', { name: 'Minimaliseren' })).toBeNull()
    expect(container.querySelector('.mt-3')).toBeNull()
    expect(screen.getByText('Titel').className).toContain('mt-1')
  })

  it('kicker null: de titel neemt de kicker-plek in en staat er maar één keer', () => {
    render(<PageStatusBannerBody tone={statusBannerTone('neutral', true)} kicker={null} title="Huis" />)
    expect(screen.getAllByText('Huis')).toHaveLength(1)
    expect(screen.getByText('Huis').className).not.toContain('mt-1')
  })
})

describe('PageStatusBannerBody — compact (katern-melding)', () => {
  it('rendert de mobiele regel én de block-inhoud vanaf lg, met dezelfde Minimaliseren-knop', () => {
    const onMinimize = vi.fn()
    const { container } = render(
      <PageStatusBannerBody
        variant="compact"
        tone={statusBannerTone('warn', false)}
        kicker="Aandacht"
        title="Geen AOW op je tijdas"
        explanation="Er staat geen actieve AOW-gebeurtenis op je tijdas."
        action={ACTIE}
        onMinimize={onMinimize}
        rootProps={{ 'data-testid': 'x', 'data-ernst': 'warn' }}
      />,
    )
    const wortel = screen.getByTestId('x')
    expect(wortel.getAttribute('data-ernst')).toBe('warn')
    expect(container.querySelector('.lg\\:hidden')).not.toBeNull()
    expect(container.querySelector('.hidden.lg\\:block')).not.toBeNull()
    const knoppen = screen.getAllByRole('button', { name: 'Minimaliseren' })
    expect(knoppen).toHaveLength(2)
    fireEvent.click(knoppen[0])
    fireEvent.click(knoppen[1])
    expect(onMinimize).toHaveBeenCalledTimes(2)
  })

  it('uitleg op mobiel pas na een tik, gekoppeld via aria-controls', () => {
    render(
      <PageStatusBannerBody
        variant="compact"
        tone={statusBannerTone('warn', false)}
        kicker="Aandacht"
        title="Titel"
        explanation="Uitleg"
      />,
    )
    const toggle = screen.getByRole('button', { name: /Titel/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    // Alleen de lg-kopie van de uitleg staat er.
    expect(screen.getAllByText('Uitleg')).toHaveLength(1)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const id = toggle.getAttribute('aria-controls')!
    expect(document.getElementById(id)?.textContent).toBe('Uitleg')
  })

  it('zonder uitleg is de titel geen knop', () => {
    render(
      <PageStatusBannerBody
        variant="compact"
        tone={statusBannerTone('neutral', true)}
        kicker={null}
        title="Huis"
      />,
    )
    expect(screen.queryByRole('button', { name: /Huis/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Minimaliseren' })).toBeNull()
  })
})
