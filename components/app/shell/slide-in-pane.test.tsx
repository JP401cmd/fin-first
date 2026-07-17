import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SlideInPane } from './slide-in-pane'

/**
 * A11y-regressie: de pane-header mag NOOIT twee knoppen met dezelfde
 * accessible name ('Sluiten') bevatten. Bug: zonder `onBack` viel de
 * ←-knop terug op aria-label 'Sluiten' — botsend met de ✕-knop.
 * Fix: de ←-knop heet altijd 'Terug'; ✕ is de enige 'Sluiten'.
 */
describe('SlideInPane — unieke accessible names in de header', () => {
  afterEach(cleanup)

  it('heeft zonder onBack precies één knop "Sluiten" en één knop "Terug"', () => {
    render(<SlideInPane open onClose={() => {}} title="Bezit"><p>inhoud</p></SlideInPane>)

    expect(screen.getAllByRole('button', { name: 'Sluiten' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Terug' })).toHaveLength(1)
  })

  it('heeft mét onBack nog steeds unieke labels naar de juiste handlers', () => {
    const onBack = vi.fn()
    const onClose = vi.fn()
    render(
      <SlideInPane open onClose={onClose} onBack={onBack} title="Bezit"><p>inhoud</p></SlideInPane>,
    )

    const sluiten = screen.getAllByRole('button', { name: 'Sluiten' })
    const terug = screen.getAllByRole('button', { name: 'Terug' })
    expect(sluiten).toHaveLength(1)
    expect(terug).toHaveLength(1)

    terug[0].click()
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()

    sluiten[0].click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sluit nog steeds via de ←-knop (Terug) wanneer geen onBack is doorgegeven', () => {
    const onClose = vi.fn()
    render(<SlideInPane open onClose={onClose} title="Bezit"><p>inhoud</p></SlideInPane>)

    screen.getByRole('button', { name: 'Terug' }).click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
