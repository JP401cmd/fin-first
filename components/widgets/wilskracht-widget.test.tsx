import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { WilskrachtWidget } from './wilskracht-widget'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'
import type { DashboardData } from './widget-renderer'
import type { WidgetSize } from '@/lib/widget-catalog'

// jsdom kent geen ResizeObserver; WidgetShell gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

function makeData(overrides: Partial<DashboardData>): DashboardData {
  return { ...MOCK_DASHBOARD_DATA, ...overrides }
}

const SIZES: WidgetSize[] = ['quarter', 'half', 'full']

describe('WilskrachtWidget — fractionele vrijheidsdagen worden afgerond weergegeven', () => {
  it('toont geen lange decimalen in het headline-cijfer (half)', () => {
    const { container } = render(
      <WilskrachtWidget size="half" data={makeData({ totalFreedomDaysWon: 18.399999 })} />,
    )
    expect(container.textContent).toContain('+18.4')
    expect(container.textContent).not.toContain('18.399999')
  })

  it('toont geen lange decimalen in het hero-cijfer (full) en in "open potentieel"', () => {
    const { container } = render(
      <WilskrachtWidget
        size="full"
        data={makeData({ totalFreedomDaysWon: 18.399999, totalFreedomDaysOpen: 7.2500001 })}
      />,
    )
    expect(container.textContent).toContain('+18.4')
    expect(container.textContent).not.toContain('18.399999')
    expect(container.textContent).toContain('+7.3d')
    expect(container.textContent).not.toContain('7.2500001')
  })

  it('toont hele dagen zonder decimaal', () => {
    const { container } = render(
      <WilskrachtWidget size="full" data={makeData({ totalFreedomDaysWon: 18 })} />,
    )
    expect(container.textContent).toContain('+18')
    expect(container.textContent).not.toContain('+18.0')
  })
})

describe('WilskrachtWidget — a11y voortgangsbalk', () => {
  it.each(SIZES)('rendert een progressbar met aria-waarden (%s)', (size) => {
    const { container } = render(
      <WilskrachtWidget size={size} data={makeData({ completionRatio: 42 })} />,
    )
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar).not.toBeNull()
    expect(bar?.getAttribute('aria-valuenow')).toBe('42')
    expect(bar?.getAttribute('aria-valuemin')).toBe('0')
    expect(bar?.getAttribute('aria-valuemax')).toBe('100')
  })

  it('klemt aria-valuenow af op 100 bij ratio > 100', () => {
    const { container } = render(
      <WilskrachtWidget size="full" data={makeData({ completionRatio: 130 })} />,
    )
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('100')
  })
})
