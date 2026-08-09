/**
 * Tests voor DepthSection — de modus-gestuurde inklapbare diepte-sectie.
 *
 * Covers:
 *  1. Ingeklapt in 'simple', open in 'full' (default-open = modus).
 *  2. Handmatige klik overschrijft binnen de sessie (ephemeral).
 *  3. Een modus-wissel beweegt de sectie weer mee.
 *  4. A11y: echte <button> met correcte aria-expanded.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import {
  DisplayModeProvider,
  useDisplayMode,
  type DisplayMode,
} from '@/lib/hooks/use-display-mode'
import { DepthSection } from './depth-section'

// Stub fetch zodat de optimistische PUT bij een modus-wissel geen echte
// netwerk-call doet (en geen unhandled rejection veroorzaakt).
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function renderInMode(mode: DisplayMode) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <DepthSection title="Test" summary="samenvatting">
        <p>diepte-inhoud</p>
      </DepthSection>
    </DisplayModeProvider>,
  )
}

// Helper-consumer die de modus toggelt — bovenin de provider-boom zodat een
// wissel de DepthSection eronder beïnvloedt.
function ToggleProbe() {
  const { toggle } = useDisplayMode()
  return (
    <button data-testid="mode-toggle" onClick={toggle}>
      toggle
    </button>
  )
}

describe('DepthSection', () => {
  it('is ingeklapt in modus simple', () => {
    renderInMode('simple')
    expect(screen.getByTestId('depth-section').getAttribute('data-collapsed')).toBe('true')
    expect(screen.getByTestId('depth-section-toggle').getAttribute('aria-expanded')).toBe('false')
    // Samenvatting zichtbaar wanneer ingeklapt.
    expect(screen.getByTestId('depth-section-summary')).toBeTruthy()
  })

  it('is open in modus full', () => {
    renderInMode('full')
    expect(screen.getByTestId('depth-section').getAttribute('data-collapsed')).toBe('false')
    expect(screen.getByTestId('depth-section-toggle').getAttribute('aria-expanded')).toBe('true')
  })

  it('handmatige klik overschrijft de modus-default binnen de sessie', () => {
    renderInMode('simple')
    const toggle = screen.getByTestId('depth-section-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    act(() => {
      toggle.click()
    })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('depth-section').getAttribute('data-collapsed')).toBe('false')
  })

  it('een modus-wissel beweegt de sectie mee', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <ToggleProbe />
        <DepthSection title="Test">
          <p>inhoud</p>
        </DepthSection>
      </DisplayModeProvider>,
    )
    const section = screen.getByTestId('depth-section')
    expect(section.getAttribute('data-collapsed')).toBe('true')
    act(() => {
      screen.getByTestId('mode-toggle').click()
    })
    expect(section.getAttribute('data-collapsed')).toBe('false')
  })

  it('rendert de header als een echte <button>', () => {
    renderInMode('full')
    expect(screen.getByTestId('depth-section-toggle').tagName).toBe('BUTTON')
  })

  // De dichtgeklapte inhoud is alleen VISUEEL weg (`max-h-0 opacity-0
  // overflow-hidden`). Zonder `inert` blijft ze in de tab-volgorde én in de
  // toegankelijkheidsboom staan: een toetsenbordgebruiker tabt dan in knoppen die
  // niemand ziet. Dat raakt het defaultpad — nieuwe accounts staan op Eenvoudig,
  // waar de sectie dicht begint.
  it('haalt de dichtgeklapte inhoud uit tab-volgorde en a11y-boom (inert)', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <ToggleProbe />
        <DepthSection title="Test">
          <button type="button">verborgen knop</button>
        </DepthSection>
      </DisplayModeProvider>,
    )
    const content = screen.getByTestId('depth-section-content')
    expect(content.hasAttribute('inert')).toBe(true)

    // En weer bereikbaar zodra de sectie opengaat — anders zou `inert` de
    // uitgeklapte inhoud onbedienbaar maken, wat erger is dan het origineel.
    act(() => {
      screen.getByTestId('mode-toggle').click()
    })
    expect(screen.getByTestId('depth-section-content').hasAttribute('inert')).toBe(false)
  })
})
