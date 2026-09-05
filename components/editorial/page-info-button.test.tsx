/**
 * Tests voor de pagina-`i` (PageInfoButton) — met nadruk op de RONDLEIDING-sectie
 * die ADR 0130 eraan toevoegde.
 *
 * Twee dingen liggen hier vast:
 *
 *  1. De sectie verschijnt ALLEEN wanneer de pagina een rondleiding heeft. De
 *     `i` staat op tientallen pagina's; een knop die daar overal opduikt en
 *     nergens werkt, is erger dan geen knop.
 *  2. De sheet gaat eerst DICHT en de rondleiding start pas daarna. De
 *     ShellOverlay houdt zolang hij open staat de scroll-lock én het
 *     overlay-signaal vast, en de spotlight verbergt zichzelf precies zolang die
 *     teller boven nul staat — meteen starten zou dus een onzichtbare rondleiding
 *     geven. Dat is geen cosmetische vertraging maar de reden dat hij bestaat.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { PageInfoButton } from './page-info-button'
import type { PageInfoContent } from '@/lib/page-info-content'

const CONTENT: PageInfoContent = {
  insight: 'Hoe je ervoor staat in één blik.',
  grip: 'Klik op een hefboom voor verdieping.',
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PageInfoButton — de rondleiding-sectie', () => {
  it('toont geen RONDLEIDING-sectie zonder `onStartTour`', () => {
    render(<PageInfoButton content={CONTENT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wat zie ik hier?' }))

    expect(screen.queryByText('RONDLEIDING')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Start de rondleiding opnieuw' }),
    ).not.toBeInTheDocument()
  })

  it('toont de sectie én de knop zodra de pagina een rondleiding heeft', () => {
    render(<PageInfoButton content={CONTENT} onStartTour={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wat zie ik hier?' }))

    expect(screen.getByText('RONDLEIDING')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Start de rondleiding opnieuw' }),
    ).toBeInTheDocument()
  })

  it('sluit de sheet eerst en start de rondleiding pas daarna', () => {
    vi.useFakeTimers()
    const onStartTour = vi.fn()
    render(<PageInfoButton content={CONTENT} onStartTour={onStartTour} />)

    fireEvent.click(screen.getByRole('button', { name: 'Wat zie ik hier?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start de rondleiding opnieuw' }))

    // Direct ná de klik nog niet: de overlay geeft zijn scroll-lock pas vrij
    // wanneer hij daadwerkelijk gesloten is.
    expect(onStartTour).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onStartTour).toHaveBeenCalledTimes(1)
  })
})
