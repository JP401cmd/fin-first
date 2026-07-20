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
