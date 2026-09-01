/**
 * Component-test voor het afsluitmoment na een geldcheck-in.
 *
 * De check-in-pagina zelf (2200+ regels, eigen Supabase-client en zes API-
 * fetches) is te zwaar om zinnig te mounten; de afrond-flow is daarom
 * afgesplitst tot dít component, dat het contract draagt waar de pagina op
 * bouwt: welke kop/duiding er staat, en dat de navigatie (`onDismiss`) PAS
 * volgt wanneer de viering weg is — niet bij het opslaan.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'
import { CheckinAfsluitViering } from './afsluit-viering'

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('CheckinAfsluitViering — standaard afsluiting', () => {
  it('toont het constaterende maandbeeld zonder mijlpaal-taal', () => {
    render(<CheckinAfsluitViering reeks={1} onDismiss={() => {}} />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Check-in')).toBeTruthy()
    expect(screen.getByText('staat vast').tagName).toBe('EM')
    expect(screen.getByText('Tot volgende maand.')).toBeTruthy()
  })

  it('toont ook bij een gebroken reeks (0) de gewone afsluiting — nooit een straf-melding', () => {
    render(<CheckinAfsluitViering reeks={0} onDismiss={() => {}} />)
    expect(screen.getByText('Tot volgende maand.')).toBeTruthy()
    expect(screen.queryByText(/op rij/i)).toBeNull()
    expect(screen.queryByText(/gebroken|kwijt|helaas/i)).toBeNull()
  })

  it('toont geen mijlpaal bij een niet-mijlpaal-lengte', () => {
    render(<CheckinAfsluitViering reeks={4} onDismiss={() => {}} />)
    expect(screen.getByText('Check-in')).toBeTruthy()
    expect(screen.queryByText('Mijlpaal')).toBeNull()
  })
})

describe('CheckinAfsluitViering — reeks-mijlpaal', () => {
  it.each([
    [3, 'Drie'],
    [6, 'Zes'],
    [12, 'Twaalf'],
  ])('erkent een reeks van %i maanden', (reeks, telwoord) => {
    render(<CheckinAfsluitViering reeks={reeks} onDismiss={() => {}} />)
    expect(screen.getByText('Mijlpaal')).toBeTruthy()
    // Kop draagt het telwoord + het italic accent; de duiding behoudt de
    // primaire terugkoppeling dat het maandbeeld is vastgelegd (review 1 sep —
    // kop en reeksZin zeiden anders tweemaal hetzelfde).
    expect(screen.getByText(new RegExp(`^${telwoord} maanden$`))).toBeTruthy()
    expect(screen.getByText('op rij').tagName).toBe('EM')
    expect(screen.getByText('Je maandbeeld staat vast — tot volgende maand.')).toBeTruthy()
  })
})

describe('CheckinAfsluitViering — navigatie pas bij dismiss', () => {
  it('roept onDismiss niet aan zolang de viering staat', () => {
    const onDismiss = vi.fn()
    render(<CheckinAfsluitViering reeks={3} onDismiss={onDismiss} />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('roept onDismiss aan na de auto-dismiss (incl. fade-out)', () => {
    const onDismiss = vi.fn()
    render(<CheckinAfsluitViering reeks={3} onDismiss={onDismiss} />)
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('roept onDismiss direct aan bij de sluitknop', () => {
    const onDismiss = vi.fn()
    render(<CheckinAfsluitViering reeks={1} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('toont de viering opnieuw bij een volgende afronding (guard="none")', () => {
    const { unmount } = render(
      <CheckinAfsluitViering reeks={1} onDismiss={() => {}} />,
    )
    expect(screen.getByRole('status')).toBeTruthy()
    unmount()
    // Geen localStorage-guard: een volgende maand verdient opnieuw een beat.
    render(<CheckinAfsluitViering reeks={2} onDismiss={() => {}} />)
    expect(screen.getByRole('status')).toBeTruthy()
  })
})
