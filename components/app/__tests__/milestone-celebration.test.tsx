/**
 * Component-test voor MilestoneCelebration.
 *
 * Borgt de drie kern-eigenschappen van de ingetogen viering:
 *  1. rendert de Playfair-kop,
 *  2. sluit zichzelf na de auto-dismiss-duur (fake timers),
 *  3. once-guard: een tweede render met dezelfde key toont niets meer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import {
  MilestoneCelebration,
  hasCelebrated,
  markCelebrated,
} from '../milestone-celebration'

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('MilestoneCelebration', () => {
  it('rendert de kop en de duiding als live-status', () => {
    render(
      <MilestoneCelebration
        celebrationKey="test-render"
        title="Eerste mijlpaal"
        meaning="Een stuk vrijheid dat vaststaat."
      />,
    )
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Eerste mijlpaal')).toBeTruthy()
    expect(screen.getByText('Een stuk vrijheid dat vaststaat.')).toBeTruthy()
    // Sluitknop is een echte, toegankelijke button.
    expect(screen.getByRole('button', { name: 'Sluiten' })).toBeTruthy()
  })

  it('rendert een <em>-accent binnen de kop', () => {
    render(
      <MilestoneCelebration
        celebrationKey="test-em"
        title={
          <>
            Je eerste <em>bezitting</em> staat.
          </>
        }
        meaning="Duiding."
      />,
    )
    const em = screen.getByText('bezitting')
    expect(em.tagName).toBe('EM')
  })

  it('roept onDismiss aan na de auto-dismiss-duur', () => {
    const onDismiss = vi.fn()
    render(
      <MilestoneCelebration
        celebrationKey="test-dismiss"
        title="Kop"
        meaning="M"
        durationMs={4500}
        onDismiss={onDismiss}
      />,
    )
    expect(onDismiss).not.toHaveBeenCalled()

    // Auto-dismiss-timer verstrijkt → fade-out start, maar onDismiss volgt pas
    // ná de fade (260ms).
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(260)
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('sluit direct bij een klik op de sluitknop', () => {
    const onDismiss = vi.fn()
    render(
      <MilestoneCelebration
        celebrationKey="test-close"
        title="Kop"
        meaning="M"
        onDismiss={onDismiss}
      />,
    )
    act(() => {
      screen.getByRole('button', { name: 'Sluiten' }).click()
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('once-guard: tweede render met dezelfde key toont niets en geeft de parent vrij', () => {
    const { unmount } = render(
      <MilestoneCelebration
        celebrationKey="test-once"
        title="Eerste keer"
        meaning="M"
      />,
    )
    expect(screen.getByText('Eerste keer')).toBeTruthy()
    expect(hasCelebrated('test-once')).toBe(true)
    unmount()

    const onDismiss = vi.fn()
    render(
      <MilestoneCelebration
        celebrationKey="test-once"
        title="Tweede keer"
        meaning="M"
        onDismiss={onDismiss}
      />,
    )
    expect(screen.queryByText('Tweede keer')).toBeNull()
    // Het overslaan-pad geeft de parent-state meteen vrij.
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('hasCelebrated/markCelebrated: guard-helpers werken per key', () => {
    expect(hasCelebrated('helper-key')).toBe(false)
    markCelebrated('helper-key')
    expect(hasCelebrated('helper-key')).toBe(true)
    // Andere key blijft ongemoeid.
    expect(hasCelebrated('andere-key')).toBe(false)
  })
})
