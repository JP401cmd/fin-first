import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ToekomstOverlay, type OverlayBalloonDef } from './toekomst-overlay'

/**
 * Bewaakt dat de tips-overlay daadwerkelijk sluit: zowel het ✕ (via portal naar
 * document.body) als de blurred achtergrond roepen `onClose` aan.
 */
describe('ToekomstOverlay — sluiten', () => {
  const balloons: OverlayBalloonDef[] = [
    {
      id: 'inkomen',
      icon: null,
      kicker: 'Je inkomen',
      body: 'x',
      cta: 'y',
      row: 'top',
      emphasis: 'accumulation',
      onActivate: () => {},
    },
  ]

  it('roept onClose aan bij klik op het ✕ (portal) én op de achtergrond', () => {
    const onClose = vi.fn()
    render(
      <ToekomstOverlay
        visible
        balloons={balloons}
        onEmphasisChange={() => {}}
        onClose={onClose}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )

    const closers = screen.getAllByLabelText('Tips sluiten')
    expect(closers.length).toBeGreaterThanOrEqual(2) // achtergrond + ✕
    closers.forEach((el) => fireEvent.click(el))
    expect(onClose).toHaveBeenCalled()
  })

  it('rendert geen sluit-knoppen als de overlay onzichtbaar is', () => {
    render(
      <ToekomstOverlay
        visible={false}
        balloons={balloons}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    expect(screen.queryByLabelText('Tips sluiten')).toBeNull()
  })
})
