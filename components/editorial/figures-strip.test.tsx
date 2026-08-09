/**
 * Tests voor de APP-7-stripnorm op `FiguresStrip`.
 *
 * De norm: in de weergavemodus "Eenvoudig" toont een figures-strip app-breed
 * maximaal 2 cellen — afgedwongen in de primitive, niet met losse ternaries op
 * de call-sites. "Volledig" blijft exact zoals het was.
 *
 * Covers:
 *  1. 4 figures → 2 cellen in 'simple', 4 cellen in 'full'.
 *  2. De kolom-grid wordt in 'simple' naar 2 geforceerd.
 *  3. `alwaysFull` schakelt de reductie uit (rapportages, blueprint-previews).
 *  4. `simpleFigures` heeft voorrang op "de eerste twee".
 *  5. `simpleFigures` wordt óók afgekapt op 2 (de max is hard).
 *  6. Buiten een provider valt de strip terug op 'simple' (de fallback-val).
 */
import { describe, it, expect } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import {
  DisplayModeProvider,
  type DisplayMode,
} from '@/lib/hooks/use-display-mode'
import { FiguresStrip, SIMPLE_MAX_FIGURES, type FigureProps } from './index'

const FIGURES: FigureProps[] = [
  { kicker: 'Inkomen', amount: '€ 4.000' },
  { kicker: 'Uitgaven', amount: '€ 2.500' },
  { kicker: 'Sparen', amount: '€ 1.000' },
  { kicker: 'Schulden', amount: '€ 500', variant: 'winner' },
]

/** Aantal gerenderde cellen — elke cel draagt de print-hook `data-figure-amount`. */
function cellCount(container: HTMLElement): number {
  return container.querySelectorAll('[data-figure-amount]').length
}

function renderStrip(mode: DisplayMode, props: Partial<ComponentProps<typeof FiguresStrip>> = {}) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <FiguresStrip cols={4} figures={FIGURES} {...props} />
    </DisplayModeProvider>,
  )
}

describe('FiguresStrip — stripnorm Eenvoudig vs Volledig (APP-7)', () => {
  it('simple: toont maximaal 2 cellen — de eerste twee', () => {
    const { container } = renderStrip('simple')
    expect(cellCount(container)).toBe(SIMPLE_MAX_FIGURES)
    expect(screen.getByText('Inkomen')).toBeTruthy()
    expect(screen.getByText('Uitgaven')).toBeTruthy()
    expect(screen.queryByText('Sparen')).toBeNull()
    expect(screen.queryByText('Schulden')).toBeNull()
  })

  it('full: toont alle vier cellen (ongewijzigd gedrag)', () => {
    const { container } = renderStrip('full')
    expect(cellCount(container)).toBe(4)
    expect(screen.getByText('Sparen')).toBeTruthy()
    expect(screen.getByText('Schulden')).toBeTruthy()
  })

  it('simple: forceert het grid naar 2 kolommen; full houdt cols={4}', () => {
    const { container: simple } = renderStrip('simple')
    expect(simple.querySelector('[data-figures-strip]')?.className).toContain('sm:grid-cols-2')

    const { container: full } = renderStrip('full')
    expect(full.querySelector('[data-figures-strip]')?.className).toContain('sm:grid-cols-4')
  })

  it('alwaysFull: geen reductie, ook niet in simple', () => {
    const { container } = renderStrip('simple', { alwaysFull: true })
    expect(cellCount(container)).toBe(4)
    expect(screen.getByText('Schulden')).toBeTruthy()
    expect(container.querySelector('[data-figures-strip]')?.className).toContain('sm:grid-cols-4')
  })

  it('simpleFigures: kiest expliciet welke twee cellen blijven staan', () => {
    const { container } = renderStrip('simple', {
      simpleFigures: [FIGURES[1], FIGURES[3]],
    })
    expect(cellCount(container)).toBe(2)
    expect(screen.getByText('Uitgaven')).toBeTruthy()
    expect(screen.getByText('Schulden')).toBeTruthy()
    // "de eerste twee" wordt genegeerd zodra simpleFigures is meegegeven
    expect(screen.queryByText('Inkomen')).toBeNull()
    expect(screen.queryByText('Sparen')).toBeNull()
  })

  it('simpleFigures raakt full niet: daar blijven alle figures staan', () => {
    const { container } = renderStrip('full', {
      simpleFigures: [FIGURES[1], FIGURES[3]],
    })
    expect(cellCount(container)).toBe(4)
    expect(screen.getByText('Inkomen')).toBeTruthy()
    expect(screen.getByText('Sparen')).toBeTruthy()
  })

  it('simpleFigures wordt óók afgekapt op het maximum van 2', () => {
    const { container } = renderStrip('simple', { simpleFigures: FIGURES })
    expect(cellCount(container)).toBe(SIMPLE_MAX_FIGURES)
  })

  it('zonder DisplayModeProvider valt de strip terug op simple (fallback-val)', () => {
    // useDisplayMode() defaultet buiten een provider op 'simple'. Oppervlakken
    // die búiten de app-boom renderen (previews, print) moeten daarom expliciet
    // `alwaysFull` zetten — deze test pint dat gedrag zodat het niet verrast.
    const { container } = render(<FiguresStrip cols={4} figures={FIGURES} />)
    expect(cellCount(container)).toBe(SIMPLE_MAX_FIGURES)

    const { container: optedOut } = render(
      <FiguresStrip cols={4} figures={FIGURES} alwaysFull />,
    )
    expect(cellCount(optedOut)).toBe(4)
  })
})
