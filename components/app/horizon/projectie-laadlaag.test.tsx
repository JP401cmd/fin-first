import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import {
  ProjectieLaadlaag,
  PROJECTIE_LAADLAAG_DREMPEL_MS,
  PROJECTIE_LAADLAAG_TEKST,
} from './projectie-laadlaag'

/**
 * B-057 — Fin's wachtstand op de Toekomst-grafiek: zichtbaar zodra de projectie
 * langer dan de drempel verouderd is, nooit bij een korte hersolve (flikkeren),
 * en de aria-live-regio blijft altijd gemount.
 */
describe('ProjectieLaadlaag', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('in rust: regio gemount, niets zichtbaar, geen aria-busy', () => {
    render(<ProjectieLaadlaag pending={false} />)
    const laag = screen.getByTestId('projectie-laadlaag')
    expect(laag.getAttribute('aria-live')).toBe('polite')
    expect(laag.getAttribute('aria-busy')).toBeNull()
    expect(laag.getAttribute('data-zichtbaar')).toBe('false')
    expect(screen.queryByText(PROJECTIE_LAADLAAG_TEKST)).toBeNull()
  })

  it('pending boven de drempel: Fin + "Projectie bijwerken…" + aria-busy', () => {
    render(<ProjectieLaadlaag pending />)
    const laag = screen.getByTestId('projectie-laadlaag')
    expect(laag.getAttribute('aria-busy')).toBe('true')
    // Vóór de drempel nog niets — geen flikkeren bij een korte hersolve.
    expect(laag.getAttribute('data-zichtbaar')).toBe('false')
    act(() => {
      vi.advanceTimersByTime(PROJECTIE_LAADLAAG_DREMPEL_MS)
    })
    expect(laag.getAttribute('data-zichtbaar')).toBe('true')
    expect(screen.getAllByText(PROJECTIE_LAADLAAG_TEKST).length).toBeGreaterThan(0)
    // De laag vangt geen muis: hover/zoom op de grafiek blijven werken.
    expect(laag.className).toContain('pointer-events-none')
  })

  it('een hersolve korter dan de drempel toont nooit iets', () => {
    const { rerender } = render(<ProjectieLaadlaag pending />)
    act(() => {
      vi.advanceTimersByTime(PROJECTIE_LAADLAAG_DREMPEL_MS - 1)
    })
    rerender(<ProjectieLaadlaag pending={false} />)
    act(() => {
      vi.advanceTimersByTime(PROJECTIE_LAADLAAG_DREMPEL_MS * 2)
    })
    expect(screen.getByTestId('projectie-laadlaag').getAttribute('data-zichtbaar')).toBe('false')
    expect(screen.queryByText(PROJECTIE_LAADLAAG_TEKST)).toBeNull()
  })

  it('verdwijnt weer zodra pending vervalt', () => {
    const { rerender } = render(<ProjectieLaadlaag pending />)
    act(() => {
      vi.advanceTimersByTime(PROJECTIE_LAADLAAG_DREMPEL_MS)
    })
    expect(screen.getByTestId('projectie-laadlaag').getAttribute('data-zichtbaar')).toBe('true')
    rerender(<ProjectieLaadlaag pending={false} />)
    expect(screen.getByTestId('projectie-laadlaag').getAttribute('data-zichtbaar')).toBe('false')
    expect(screen.getByTestId('projectie-laadlaag').getAttribute('aria-busy')).toBeNull()
  })
})
