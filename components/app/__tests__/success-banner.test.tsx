/**
 * Smoke test for SuccessBanner.
 *
 * Covers:
 *  1. Basic render — message shows, container carries role="status"
 *     + aria-live="polite" for screenreader announcement.
 *  2. Auto-dismiss timer — banner disappears after durationMs using
 *     vitest's fake timers so we don't rely on real elapsed time.
 *  3. Undo link — renders only when undoHref (or onUndo) is supplied
 *     and carries the configured label.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SuccessBanner } from '../success-banner'

// next/link is a client-only wrapper — render a plain <a> so the
// assertions can be on a standard anchor element.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

describe('SuccessBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the message with role=status and aria-live=polite', () => {
    render(<SuccessBanner message="Je hebt je budget opgezet." />)

    const banner = screen.getByRole('status')
    expect(banner).toBeInTheDocument()
    expect(banner.getAttribute('aria-live')).toBe('polite')
    expect(banner.textContent).toContain('Je hebt je budget opgezet.')
    // The UPPERCASE kicker anchors the banner to the krant-esthetiek.
    expect(banner.textContent).toContain('GELUKT')
  })

  it('auto-dismisses after durationMs', () => {
    render(
      <SuccessBanner message="Klaar." durationMs={5000} />
    )

    // Banner present before the timer fires.
    expect(screen.getByRole('status')).toBeInTheDocument()

    // Advance just past the 5s threshold — act() flushes the React
    // state update triggered by the setTimeout callback.
    act(() => {
      vi.advanceTimersByTime(5001)
    })

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('renders the undo link when undoHref is supplied', () => {
    render(
      <SuccessBanner
        message="Je hebt je budget opgezet."
        undoHref="/core/budgets?undo=last"
        undoLabel="Ongedaan maken"
      />
    )

    const undo = screen.getByRole('link', { name: 'Ongedaan maken' })
    expect(undo).toBeInTheDocument()
    expect(undo.getAttribute('href')).toBe('/core/budgets?undo=last')
  })

  it('omits the undo link when neither undoHref nor onUndo is provided', () => {
    render(<SuccessBanner message="Alles opgeslagen." />)

    expect(screen.queryByRole('link', { name: /Ongedaan maken/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Ongedaan maken/i })).toBeNull()
  })

  it('exposes the close button with a Dutch aria-label', () => {
    render(<SuccessBanner message="Klaar." />)

    expect(screen.getByRole('button', { name: 'Sluiten' })).toBeInTheDocument()
  })
})
