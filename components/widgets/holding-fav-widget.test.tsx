import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { HoldingFavWidget } from './holding-fav-widget'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { FavoriteHolding } from './widget-renderer'

// Privacy default zichtbaar (bedragen niet gemaskeerd) — spiegelt holdings-widget.test.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

beforeEach(() => {
  mockPrivacy.masked = false
})

class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.IntersectionObserver = MockObserver as unknown as typeof IntersectionObserver
global.ResizeObserver = MockObserver as unknown as typeof ResizeObserver

function makeHolding(overrides: Partial<FavoriteHolding> = {}): FavoriteHolding {
  return {
    id: 'h1',
    name: 'Vanguard FTSE All-World',
    ticker: 'VWRL',
    units: 42,
    currentPrice: 105.5,
    totalValue: 12000,
    totalCost: 10000,
    returnPct: 20,
    dailyChangePct: 1.25,
    lastPriceUpdate: '2026-07-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('HoldingFavWidget — vrijheidstijd (Geld is opgeslagen tijd)', () => {
  it('xl: toont exact de canonieke vrijheidstijd van de positiewaarde', () => {
    const holding = makeHolding()
    const dailyExp = 100
    // Canonieke engine-uitvoer voor dezelfde input — de render mag hier niet van driften.
    const expected = formatFreedomTimeString(
      calculateFreedomTime(holding.totalValue, dailyExp),
      'short',
    )
    const { container } = render(<HoldingFavWidget size="xl" holding={holding} dailyExp={dailyExp} />)
    const text = container.textContent ?? ''
    expect(text).toContain(`≈ ${expected} vrijheid`)
    // XL benut de bredere KPI-strip: extra context t.o.v. de kleine tegels.
    expect(text).toContain('Kostprijs')
    expect(text).toContain('Eenheden')
    expect(text).toContain('Totaal rendement')
  })

  it('full: toont dezelfde canonieke vrijheidstijd', () => {
    const holding = makeHolding()
    const dailyExp = 100
    const expected = formatFreedomTimeString(
      calculateFreedomTime(holding.totalValue, dailyExp),
      'short',
    )
    const { container } = render(<HoldingFavWidget size="full" holding={holding} dailyExp={dailyExp} />)
    expect(container.textContent ?? '').toContain(`≈ ${expected} vrijheid`)
  })

  it('geen vrijheidstijd-regel zonder dagtarief (mock-/empty-bundel)', () => {
    const { container } = render(<HoldingFavWidget size="xl" holding={makeHolding()} />)
    expect(container.textContent ?? '').not.toContain('vrijheid')
  })

  it('markeert een verouderde koers (> 5 dagen) in de xl-strip', () => {
    const holding = makeHolding({ lastPriceUpdate: '2000-01-01T00:00:00.000Z' })
    const { container } = render(<HoldingFavWidget size="xl" holding={holding} dailyExp={100} />)
    expect(container.textContent ?? '').toContain('verouderd')
  })
})
