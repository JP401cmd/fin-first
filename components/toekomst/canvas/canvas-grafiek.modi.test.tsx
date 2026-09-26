/**
 * De drie modi van het canvas springen niet (ADR 0179 D3, visuele check 26 sep).
 *
 * Geldstroom bleef 2–5 s leeg zonder laadstand en was lager dan Vermogen, zodat het
 * canvas bij een modus-wissel versprong. Pint:
 *  - de drie modi liggen in één gridcel en Vermogen blijft in elke modus gemonteerd,
 *    dus de celhoogte (= de hoogste laag) verandert niet bij een wissel; geen laag is
 *    nog `position: absolute` (dat haalde de actieve laag uit de hoogte);
 *  - zolang de Geldstroom-chunk laadt staat Fins wachtstand in die cel.
 *
 * De grafieken zelf zijn gestubd (elders getest); `next/dynamic` geeft hier altijd de
 * laadstand, zoals vóór de chunk binnen is.
 */
import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import type { CanvasModus } from '@/lib/horizon/katern-copy'

vi.mock('next/dynamic', () => ({
  default: (_loader: unknown, opties: { loading: () => ReactNode }) =>
    function Laden() {
      return <>{opties.loading()}</>
    },
}))
vi.mock('@/components/app/horizon/sim-chart', () => ({ SimChart: () => <div data-testid="sim-chart" /> }))
vi.mock('@/components/app/horizon/wealth-composition-chart', () => ({
  WealthCompositionChart: () => <div data-testid="samenstelling-chart" />,
}))
vi.mock('@/components/app/horizon/zoomable-chart-container', () => ({
  ZoomableChartContainer: ({ children }: { children: (min: number, max: number, c: object) => ReactNode }) => (
    <>{children(40, 90, {})}</>
  ),
}))
vi.mock('@/components/app/horizon/toekomst-overlay', () => ({
  ToekomstOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/app/horizon/events-timeline', () => ({ EventsTimeline: () => null }))
vi.mock('@/components/app/horizon/phase-bar', () => ({ PhaseBar: () => null }))

import { CanvasGrafiek, type CanvasGrafiekProps } from './canvas-grafiek'

function renderModus(modus: CanvasModus) {
  const props = {
    modus,
    currentAge: 40,
    chartEndAge: 90,
    simResult: { fireAge: 52, fireAgeFractional: 52.3, strategy: 'deplete' },
    heroFireAge: { age: 52.3 },
    useHouseholdMainLine: false,
    usePartnerMainLine: false,
    hasPerspectiveHero: false,
    viewDisplaySimRows: [],
    viewWealthCompositionRows: [],
    eventsForTimeline: [],
    toonFasebalk: false,
    ieViewMode: 'lines',
    userAowAge: { fractional: 67.25 },
  } as unknown as CanvasGrafiekProps
  return render(<CanvasGrafiek {...props} />)
}

describe('CanvasGrafiek — de modi delen één cel', () => {
  it.each<CanvasModus>(['vermogen', 'samenstelling', 'geldstroom'])(
    'in %s: alle lagen in dezelfde gridcel, geen absolute laag, Vermogen gemonteerd',
    (modus) => {
      renderModus(modus)
      const cel = screen.getByTestId('canvas-modi')
      expect(cel.className).toContain('grid')
      const lagen = Array.from(cel.children) as HTMLElement[]
      expect(lagen).toHaveLength(3)
      for (const laag of lagen) {
        expect(laag.className).toContain('col-start-1')
        expect(laag.className).toContain('row-start-1')
        expect(laag.style.position).toBe('')
      }
      expect(screen.getByTestId('canvas-vermogen').contains(screen.getByTestId('sim-chart'))).toBe(true)
    },
  )
})

describe('CanvasGrafiek — Geldstroom heeft een laadstand', () => {
  it('toont Fins wachtstand in de cel zolang de grafiek laadt', () => {
    renderModus('geldstroom')
    const geldstroom = screen.getByTestId('canvas-geldstroom')
    const laden = screen.getByTestId('geldstroom-laden')
    expect(geldstroom.contains(laden)).toBe(true)
    expect(laden.querySelector('[data-testid="projectie-laadlaag"]')?.getAttribute('aria-busy')).toBe('true')
  })

  it('laadt niets zolang Geldstroom niet actief is', () => {
    renderModus('vermogen')
    expect(screen.queryByTestId('geldstroom-laden')).toBeNull()
  })
})
