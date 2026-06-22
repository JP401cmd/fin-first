/**
 * Tests voor HideInSimple — het modus-gestuurde hard-hide-primitive.
 *
 * Covers:
 *  1. Verborgen in 'simple', zichtbaar in 'full'.
 *  2. Een modus-wissel laat de inhoud verschijnen/verdwijnen.
 *  3. Zero DOM-node in 'simple' (geen wrapper → geen layout-impact).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import {
  DisplayModeProvider,
  useDisplayMode,
  type DisplayMode,
} from '@/lib/hooks/use-display-mode'
import { HideInSimple } from './hide-in-simple'

// Stub fetch zodat de optimistische PUT bij een modus-wissel geen echte
// netwerk-call doet (geen unhandled rejection).
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function renderInMode(mode: DisplayMode) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <HideInSimple>
        <p data-testid="diepte">diepte-inhoud</p>
      </HideInSimple>
    </DisplayModeProvider>,
  )
}

// Helper-consumer die de modus toggelt — bovenin de provider-boom.
function ToggleProbe() {
  const { toggle } = useDisplayMode()
  return (
    <button data-testid="mode-toggle" onClick={toggle}>
      toggle
    </button>
  )
}

describe('HideInSimple', () => {
  it('verbergt de inhoud in modus simple', () => {
    renderInMode('simple')
    expect(screen.queryByTestId('diepte')).toBeNull()
  })

  it('toont de inhoud in modus full', () => {
    renderInMode('full')
    expect(screen.queryByTestId('diepte')).toBeTruthy()
  })

  it('beweegt mee met een modus-wissel (verschijnt bij simple → full)', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <ToggleProbe />
        <HideInSimple>
          <p data-testid="diepte">diepte-inhoud</p>
        </HideInSimple>
      </DisplayModeProvider>,
    )
    expect(screen.queryByTestId('diepte')).toBeNull()
    act(() => {
      screen.getByTestId('mode-toggle').click()
    })
    expect(screen.queryByTestId('diepte')).toBeTruthy()
  })

  it('rendert geen enkele DOM-node in simple (geen wrapper → geen layout-impact)', () => {
    const { container } = renderInMode('simple')
    expect(container.innerHTML).toBe('')
  })
})
