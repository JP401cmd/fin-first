import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { HoldingsWidget } from './holdings-widget'
import type { DashboardData } from './widget-renderer'
import { buildAssetReturnBreakdown, summarizePortfolioReturn, RETURN_BASIS_LABELS, type AssetReturnInput } from '@/lib/asset-return'

// Privacy default zichtbaar (bedragen niet gemaskeerd) — spiegelt assets-widget.test.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

beforeEach(() => {
  mockPrivacy.masked = false
})

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

/**
 * Bezittingen achter de fixture. De PENSIOENPOT staat er bewust in: die is het
 * hart van kaart H7 (fout E). Onder de oude formule
 * (`Σ value − Σ purchaseValue` over investment + retirement + crypto) rekende
 * deze widget €120.000 pensioen met `purchase_value = 0` als volledige winst
 * mee — (180.000 − 50.000) / 50.000 = +260,0% in plaats van +20,0%.
 */
const FIXTURE_ASSETS: AssetReturnInput[] = [
  { id: 'inv', name: 'Wereldindexfonds', assetType: 'investment', value: 60000, purchaseValue: 50000 },
  { id: 'pens', name: 'Pensioenfonds', assetType: 'retirement', value: 120000, purchaseValue: 0 },
  { id: 'cash', name: 'Betaalrekening', assetType: 'cash', value: 40000, purchaseValue: 40000 },
]

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    totalAssets: 220000,
    // Gerealiseerd rendement komt uit de ECHTE motor — de widget consumeert dit
    // veld en rekent zelf niets meer (kaart H7).
    assetReturn: summarizePortfolioReturn(buildAssetReturnBreakdown(FIXTURE_ASSETS)),
    monthlyContributions: 500,
    monthlyExpenses: 3000,
    dailyExpenseRate: 100,
    assetsByType: [
      { type: 'retirement', value: 120000, purchaseValue: 0, expectedReturn: 0.02 },
      { type: 'investment', value: 60000, purchaseValue: 50000, expectedReturn: 0.07 },
      { type: 'cash', value: 40000, purchaseValue: 40000, expectedReturn: 0 },
    ],
    householdOverrides: null,
    partnerOverrides: null,
    ...overrides,
  } as unknown as DashboardData
}

describe('HoldingsWidget — werkelijk rendement (Q3: vervangt de expected_return-aanname)', () => {
  it('full-size: toont het gerealiseerde rendement uit de canonieke motor, niet "Verwacht"', () => {
    const { container } = render(<HoldingsWidget size="full" data={makeData()} />)
    const text = container.textContent ?? ''
    // Portefeuillerendement = (60.000 − 50.000) / 50.000 = +20,0%
    expect(text).toContain(RETURN_BASIS_LABELS.portfolioSincePurchase.label)
    expect(text).toContain('+20,0%')
    // De aanname-framing is verdwenen.
    expect(text).not.toContain('Verwacht')
  })

  it('quarter-size: toont het gerealiseerde rendement-percentage', () => {
    const { container } = render(<HoldingsWidget size="quarter" data={makeData()} />)
    const text = container.textContent ?? ''
    expect(text).toContain(RETURN_BASIS_LABELS.portfolioSincePurchase.label)
    expect(text).toContain('+20,0%')
    expect(text).not.toContain('Verwacht')
  })

  it('KAART H7 (fout E): telt een pensioenpot zonder kostprijs NIET als winst', () => {
    // Given: €120.000 pensioen met purchase_value = 0 naast €60.000 belegd
    // (kostprijs €50.000). When: de widget rendert.
    const { container } = render(<HoldingsWidget size="full" data={makeData()} />)
    const text = container.textContent ?? ''
    // Then: +20,0% (alleen de belegde pot), niet +260,0% (de oude formule die
    // het hele pensioensaldo als winst opnam).
    expect(text).toContain('+20,0%')
    expect(text).not.toContain('+260,0%')
    // En de WAARDE-regel houdt pensioen wél binnen: "wat staat er belegd" is een
    // andere vraag dan "wat is erop verdiend".
    expect(text).toContain(RETURN_BASIS_LABELS.portfolioSincePurchase.label)
  })

  it('toont geen rendement-regel als er geen kostprijs bekend is (deel-door-nul-guard)', () => {
    const data = makeData({
      assetReturn: summarizePortfolioReturn(buildAssetReturnBreakdown([
        { id: 'inv', name: 'Wereldindexfonds', assetType: 'investment', value: 60000, purchaseValue: 0 },
      ])),
    } as unknown as Partial<DashboardData>)
    const { container } = render(<HoldingsWidget size="full" data={data} />)
    const text = container.textContent ?? ''
    expect(text).not.toContain(RETURN_BASIS_LABELS.portfolioSincePurchase.label)
    expect(text).not.toContain('Verwacht')
  })
})
