import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CoachMelding } from './coach-melding'

const base = {
  headerLabel: 'Tip van Fin', shown: 'Koppel je bank.', showCursor: false, done: true,
  cta: 'Bank koppelen', ctaHref: '/core/cash/connect',
}

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('CoachMelding', () => {
  it('toont label, getypte tekst en CTA wanneer done', () => {
    render(<CoachMelding {...base} onClose={vi.fn()} onCtaActivate={vi.fn()} onOpenChat={vi.fn()} />)
    expect(screen.getByText('Tip van Fin')).toBeInTheDocument()
    expect(screen.getByText('Koppel je bank.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Bank koppelen/i })).toBeInTheDocument()
  })

  it('geeft de sluitknop een tapzone van 44x44, vrij van de avatar (H17)', () => {
    render(<CoachMelding {...base} onClose={vi.fn()} onCtaActivate={vi.fn()} onOpenChat={vi.fn()} />)
    const close = screen.getByRole('button', { name: /Sluiten/i })
    // h-11/w-11 = 2,75rem = 44px — de app-brede touch-target-eis.
    expect(close.className).toContain('h-11')
    expect(close.className).toContain('w-11')
    // right-12 (48px) houdt de knopbox rechts vrij van de 36px-avatar op
    // right:10px (die tot 46px vanaf rechts loopt).
    expect(close.className).toContain('right-12')
  })

  it('verbergt de CTA zolang niet done', () => {
    render(<CoachMelding {...base} done={false} onClose={vi.fn()} onCtaActivate={vi.fn()} onOpenChat={vi.fn()} />)
    expect(screen.queryByRole('link', { name: /Bank koppelen/i })).not.toBeInTheDocument()
  })

  it('× sluit zonder de chat te openen', () => {
    const onClose = vi.fn(); const onOpenChat = vi.fn()
    render(<CoachMelding {...base} onClose={onClose} onCtaActivate={vi.fn()} onOpenChat={onOpenChat} />)
    fireEvent.click(screen.getByRole('button', { name: /Sluiten/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onOpenChat).not.toHaveBeenCalled()
  })

  it('klik op de body opent de chat', () => {
    const onOpenChat = vi.fn()
    render(<CoachMelding {...base} onClose={vi.fn()} onCtaActivate={vi.fn()} onOpenChat={onOpenChat} />)
    fireEvent.click(screen.getByTestId('coach-melding-body'))
    expect(onOpenChat).toHaveBeenCalledTimes(1)
  })

  it('CTA-klik activeert CTA en opent niet de chat', () => {
    const onCtaActivate = vi.fn(); const onOpenChat = vi.fn()
    render(<CoachMelding {...base} onClose={vi.fn()} onCtaActivate={onCtaActivate} onOpenChat={onOpenChat} />)
    fireEvent.click(screen.getByRole('link', { name: /Bank koppelen/i }))
    expect(onCtaActivate).toHaveBeenCalledTimes(1)
    expect(onOpenChat).not.toHaveBeenCalled()
  })

  it('toont de cursor alleen wanneer showCursor true', () => {
    const { rerender } = render(
      <CoachMelding {...base} showCursor={false} onClose={vi.fn()} onCtaActivate={vi.fn()} onOpenChat={vi.fn()} />,
    )
    expect(screen.queryByText('▮')).not.toBeInTheDocument()
    rerender(
      <CoachMelding {...base} showCursor={true} onClose={vi.fn()} onCtaActivate={vi.fn()} onOpenChat={vi.fn()} />,
    )
    expect(screen.getByText('▮')).toBeInTheDocument()
  })
})

/**
 * W-016 — de uitknop op de kaart zelf ("Niet meer uit jezelf"), het moment van
 * ergernis. Optioneel in het contract: een host die de keuze niet aanbiedt, rendert
 * hem niet.
 */
describe('CoachMelding — "Niet meer uit jezelf" (W-016)', () => {
  it('toont de link alleen wanneer de host hem aanbiedt', () => {
    const { unmount } = render(
      <CoachMelding {...base} onClose={vi.fn()} onCtaActivate={vi.fn()} onOpenChat={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /Niet meer uit jezelf/i })).toBeNull()
    unmount()

    render(
      <CoachMelding
        {...base}
        onClose={vi.fn()}
        onCtaActivate={vi.fn()}
        onOpenChat={vi.fn()}
        onStopProactief={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /Niet meer uit jezelf/i })).toBeInTheDocument()
  })

  it('verschijnt pas na het uittypen, samen met de CTA', () => {
    render(
      <CoachMelding
        {...base}
        done={false}
        onClose={vi.fn()}
        onCtaActivate={vi.fn()}
        onOpenChat={vi.fn()}
        onStopProactief={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /Niet meer uit jezelf/i })).toBeNull()
  })

  it('roept de host aan en valt niet door naar de body-klik (chat blijft dicht)', () => {
    const onStopProactief = vi.fn()
    const onOpenChat = vi.fn()
    render(
      <CoachMelding
        {...base}
        onClose={vi.fn()}
        onCtaActivate={vi.fn()}
        onOpenChat={onOpenChat}
        onStopProactief={onStopProactief}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Niet meer uit jezelf/i }))
    expect(onStopProactief).toHaveBeenCalledTimes(1)
    expect(onOpenChat).not.toHaveBeenCalled()
  })
})
