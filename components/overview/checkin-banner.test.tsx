import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CheckinBanner } from './checkin-banner'

/**
 * Tests voor CheckinBanner — verschijnt alleen in de eerste week van de maand
 * wanneer de check-in enabled + niet voltooid is, én het account al vóór deze
 * maand bestond (`seed.eligible`, UR3-10).
 *
 * Die laatste gate maakt de banner volledig seed-gedreven: de accountleeftijd
 * is server-kennis. Zonder seed rendert de banner daarom niets meer — de oude
 * client-fetch naar /api/monthly-checkin zou nooit kunnen weten of het account
 * oud genoeg is en zou de nudge op dag één alsnog tonen.
 */

const realFetch = global.fetch

beforeEach(() => {
  sessionStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  global.fetch = realFetch
})

describe('CheckinBanner', () => {
  const seed = (over: Partial<{ enabled: boolean; completed: boolean; eligible: boolean }> = {}) => ({
    enabled: true, completed: false, eligible: true, ...over,
  })

  it('toont niets buiten de eerste week van de maand', async () => {
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z')) // dag 15
    const { container } = render(<CheckinBanner seed={seed()} />)
    await vi.advanceTimersByTimeAsync(10)
    expect(container.firstChild).toBeNull()
  })

  it('toont banner in eerste week wanneer enabled + niet voltooid + eligible', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z')) // dag 3
    render(<CheckinBanner seed={seed()} />)
    await vi.waitFor(() => {
      expect(screen.getByText(/Check-in mei/i)).toBeTruthy()
    })
    const link = screen.getByText('Start').closest('a')
    expect(link?.getAttribute('href')).toBe('/core/checkin')
  })

  it('toont niets wanneer al voltooid', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z'))
    const { container } = render(<CheckinBanner seed={seed({ completed: true })} />)
    await vi.advanceTimersByTimeAsync(10)
    expect(container.firstChild).toBeNull()
  })

  it('toont niets wanneer check-in uitgeschakeld', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z'))
    const { container } = render(<CheckinBanner seed={seed({ enabled: false })} />)
    await vi.advanceTimersByTimeAsync(10)
    expect(container.firstChild).toBeNull()
  })

  it('toont niets wanneer deze maand al weggeklikt', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z'))
    sessionStorage.setItem('checkin_banner_dismissed', '2026-05')
    const { container } = render(<CheckinBanner seed={seed()} />)
    await vi.advanceTimersByTimeAsync(10)
    expect(container.firstChild).toBeNull()
  })

  it('toont de banner zonder ook maar iets te fetchen (server-seed)', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z')) // eerste week
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    render(<CheckinBanner seed={seed()} />)
    await vi.waitFor(() => {
      expect(screen.getByText(/Check-in mei/i)).toBeTruthy()
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // ── UR3-10: één ding tegelijk in de eerste minuut ────────────────────────
  it('toont niets op een vers account, ook in de eerste week (AC 3)', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z'))
    const { container } = render(<CheckinBanner seed={seed({ eligible: false })} />)
    await vi.advanceTimersByTimeAsync(10)
    expect(container.firstChild).toBeNull()
  })

  it('toont niets zonder seed — de accountleeftijd is server-kennis', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z'))
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    const { container } = render(<CheckinBanner />)
    await vi.advanceTimersByTimeAsync(10)
    expect(container.firstChild).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('draagt module-tokens, geen Tailwind-standaardkleuren (kleurconventie)', async () => {
    vi.setSystemTime(new Date('2026-05-03T12:00:00Z'))
    const { container } = render(<CheckinBanner seed={seed()} />)
    await vi.waitFor(() => expect(screen.getByText(/Check-in mei/i)).toBeTruthy())
    expect(container.innerHTML).not.toMatch(/violet-/)
    expect(container.innerHTML).toMatch(/kern-/)
  })
})
