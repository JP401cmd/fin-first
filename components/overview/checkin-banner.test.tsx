import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CheckinBanner } from './checkin-banner'

/**
 * Tests voor CheckinBanner — verschijnt alleen in de eerste week van de
 * maand wanneer de check-in enabled + niet voltooid is.
 */

const realFetch = global.fetch

function mockCheckin(payload: Record<string, unknown>) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(payload),
  }) as unknown as typeof fetch
}

beforeEach(() => {
  sessionStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  global.fetch = realFetch
})

describe('CheckinBanner', () => {
  it('toont niets buiten de eerste week van de maand', async () => {
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z')) // dag 15
    mockCheckin({ enabled: true, completed: false })
    const { container } = render(<CheckinBanner />)
    vi.runOnlyPendingTimers()
    expect(container.firstChild).toBeNull()
  })

  it('toont banner in eerste week wanneer enabled + niet voltooid', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z')) // dag 3
    mockCheckin({ enabled: true, completed: false })
    render(<CheckinBanner />)
    await vi.waitFor(() => {
      expect(screen.getByText(/Check-in mei/i)).toBeTruthy()
    })
    const link = screen.getByText('Start').closest('a')
    expect(link?.getAttribute('href')).toBe('/core/checkin')
  })

  it('toont niets wanneer al voltooid', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z'))
    mockCheckin({ enabled: true, completed: true })
    const { container } = render(<CheckinBanner />)
    await vi.advanceTimersByTimeAsync(10)
    expect(container.firstChild).toBeNull()
  })

  it('toont niets wanneer check-in uitgeschakeld', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z'))
    mockCheckin({ enabled: false, completed: false })
    const { container } = render(<CheckinBanner />)
    await vi.advanceTimersByTimeAsync(10)
    expect(container.firstChild).toBeNull()
  })

  it('toont niets wanneer deze maand al weggeklikt', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z'))
    sessionStorage.setItem('checkin_banner_dismissed', '2026-05')
    mockCheckin({ enabled: true, completed: false })
    const { container } = render(<CheckinBanner />)
    await vi.advanceTimersByTimeAsync(10)
    expect(container.firstChild).toBeNull()
  })

  it('seed aanwezig → toont banner ZONDER fetch', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z')) // eerste week
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    render(<CheckinBanner seed={{ enabled: true, completed: false }} />)
    await vi.waitFor(() => {
      expect(screen.getByText(/Check-in mei/i)).toBeTruthy()
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('seed completed → geen banner, geen fetch', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z'))
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    const { container } = render(<CheckinBanner seed={{ enabled: true, completed: true }} />)
    await vi.advanceTimersByTimeAsync(10)
    expect(container.firstChild).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
