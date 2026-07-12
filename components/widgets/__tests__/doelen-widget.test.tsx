import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DoelenWidget } from '../doelen-widget'
import type { DashboardData } from '../widget-renderer'

/**
 * Test voor de DoelenWidget-empty-state (H-07b). De full-size lege staat
 * MOET een CTA naar /toekomst/doelen tonen ("Geen CTA = doodlopend").
 */

// WidgetShell full-size wikkelt content in ScrollableContent, dat ResizeObserver
// gebruikt — niet aanwezig in jsdom. Minimale mock.
beforeAll(() => {
  if (typeof globalThis !== 'undefined' && !globalThis.ResizeObserver) {
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver
  }
})

const emptyData = { topGoals: [], goals: 0 } as unknown as DashboardData

describe('DoelenWidget — lege staat (H-07b)', () => {
  it('full-size zonder doelen toont een CTA-link naar /toekomst/doelen', () => {
    const { container } = render(<DoelenWidget size="full" data={emptyData} />)
    // Kop + CTA-label aanwezig.
    expect(screen.getByText('Nog geen doelen ingesteld')).toBeTruthy()
    const cta = screen.getByText('Stel je eerste doel')
    expect(cta).toBeTruthy()
    // De CTA is een link naar /toekomst/doelen.
    const link = container.querySelector('a[href="/toekomst/doelen"]')
    expect(link).toBeTruthy()
    expect(link?.textContent).toContain('Stel je eerste doel')
  })

  it('CTA voldoet aan de tap-target-eis (min-h-11)', () => {
    const { container } = render(<DoelenWidget size="full" data={emptyData} />)
    const link = container.querySelector('a[href="/toekomst/doelen"]')
    expect(link?.className).toContain('min-h-11')
  })
})
