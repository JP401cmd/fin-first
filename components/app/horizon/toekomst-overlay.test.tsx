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

  it('blur-scrim dekt de volle inhoud (top-0 + expliciete hoogte), niet één viewport (geen inset-0/fixed)', () => {
    // Regressie voor "blur zit te hoog / maar de helft geblurrd" op desktop:
    // de scrim is een child van de gescrolde scroll-container. `inset-0`/`fixed`
    // hangt 'm aan de inhoud-oorsprong en is maar één viewport hoog, dus bij
    // scrollTop > 0 blijft de onderkant scherp. De fix dekt de VOLLE scrollHeight.
    render(
      <ToekomstOverlay
        visible
        balloons={balloons}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    const scrim = screen
      .getAllByLabelText('Tips sluiten')
      .find((el) => el.className.includes('backdrop-blur-md'))
    expect(scrim).toBeTruthy()
    expect(scrim!.className).not.toMatch(/inset-0/)
    expect(scrim!.className).not.toMatch(/\bfixed\b/)
    expect(scrim!.className).toMatch(/\btop-0\b/)
    // Hoogte komt uit een inline style (volle inhoudshoogte), niet uit een
    // viewport-gebonden klasse.
    expect(scrim!.getAttribute('style') ?? '').toMatch(/height/)
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
