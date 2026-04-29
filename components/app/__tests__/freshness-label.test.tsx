/**
 * Smoke tests for <FreshnessLabel>.
 *
 * Covers:
 *  1. Fresh (within budget) — renders only "Bijgewerkt om HH:mm", no kicker.
 *  2. Stale (past budget) — renders "VEROUDERD" kicker before the timestamp.
 *  3. `null` input — renders "Nog niet bijgewerkt" placeholder.
 *  4. Same-year, not-today date — renders "d MMM" without time.
 *  5. Older-than-this-year date — renders "d MMM yyyy".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FreshnessLabel } from '../freshness-label'

// All tests pin "now" to 2026-04-17 13:30 Europe/Amsterdam-ish — matches the
// current date the component is being authored against and gives clean
// same-day / same-year / past-year branches without timezone surprises.
const FIXED_NOW = new Date(2026, 3, 17, 13, 30, 0) // April is month index 3

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('FreshnessLabel', () => {
  it('renders HH:mm for a fresh same-day timestamp without the stale kicker', () => {
    // 10 minutes ago — well inside the default 60-minute budget.
    const tenMinAgo = new Date(FIXED_NOW.getTime() - 10 * 60_000)
    render(<FreshnessLabel timestamp={tenMinAgo} />)

    expect(screen.getByText(/Bijgewerkt om 13:20/)).toBeInTheDocument()
    expect(screen.queryByText('VEROUDERD')).not.toBeInTheDocument()
  })

  it('renders the VEROUDERD kicker when the timestamp is past the budget', () => {
    // 90 minutes ago — beyond default 60-minute budget.
    const ninetyMinAgo = new Date(FIXED_NOW.getTime() - 90 * 60_000)
    render(<FreshnessLabel timestamp={ninetyMinAgo} />)

    expect(screen.getByText('VEROUDERD')).toBeInTheDocument()
    expect(screen.getByText(/Bijgewerkt om 12:00/)).toBeInTheDocument()
  })

  it('respects a custom budgetMinutes threshold', () => {
    // 6 minutes ago — stale under a 5-minute budget, fresh under the default.
    const sixMinAgo = new Date(FIXED_NOW.getTime() - 6 * 60_000)
    render(<FreshnessLabel timestamp={sixMinAgo} budgetMinutes={5} />)

    expect(screen.getByText('VEROUDERD')).toBeInTheDocument()
  })

  it('renders "Nog niet bijgewerkt" for a null timestamp', () => {
    render(<FreshnessLabel timestamp={null} />)

    expect(screen.getByText('Nog niet bijgewerkt')).toBeInTheDocument()
    expect(screen.queryByText(/Bijgewerkt om/)).not.toBeInTheDocument()
    expect(screen.queryByText('VEROUDERD')).not.toBeInTheDocument()
  })

  it('renders "Nog niet bijgewerkt" when the timestamp string is unparseable', () => {
    render(<FreshnessLabel timestamp="not-a-real-date" />)

    expect(screen.getByText('Nog niet bijgewerkt')).toBeInTheDocument()
  })

  it('renders "d MMM" for a past date in the same year', () => {
    // 2026-03-05 — same year as FIXED_NOW (2026), different day.
    const sameYear = new Date(2026, 2, 5, 9, 15, 0)
    render(<FreshnessLabel timestamp={sameYear} />)

    expect(screen.getByText(/5 mrt/)).toBeInTheDocument()
    // No HH:mm branch on past dates.
    expect(screen.queryByText(/09:15/)).not.toBeInTheDocument()
  })

  it('renders "d MMM yyyy" for a date in a previous year', () => {
    const lastYear = new Date(2025, 10, 20, 9, 15, 0) // 20 nov 2025
    render(<FreshnessLabel timestamp={lastYear} />)

    expect(screen.getByText(/20 nov 2025/)).toBeInTheDocument()
  })

  it('honours a custom prefix', () => {
    const tenMinAgo = new Date(FIXED_NOW.getTime() - 10 * 60_000)
    render(<FreshnessLabel timestamp={tenMinAgo} prefix="Laatste check" />)

    expect(screen.getByText(/Laatste check 13:20/)).toBeInTheDocument()
  })

  it('accepts an ISO string and parses it correctly', () => {
    const iso = new Date(FIXED_NOW.getTime() - 15 * 60_000).toISOString()
    render(<FreshnessLabel timestamp={iso} />)

    expect(screen.getByText(/Bijgewerkt om 13:15/)).toBeInTheDocument()
  })
})
