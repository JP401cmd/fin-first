import { describe, it, expect } from 'vitest'
import {
  terSeverity,
  TER_SEVERITY_THRESHOLDS,
  LOW_TER_BENCHMARK,
  computePortfolioFees,
} from '@/lib/fee-analysis'
import { getWidgetRequiredModule } from '@/lib/module-registry'
import { WIDGET_TO_FEATURE } from '@/lib/feature-registry'

/**
 * Canonieke TER-duiding (single source) + gating-pariteit met de zuster-widget
 * `holdings`. Borgt dat de widget en de detail-modal dezelfde drempels delen en
 * dat `fee_analyzer`/`rebalancing` net als `holdings` module- én feature-gegate zijn.
 */

describe('terSeverity — canonieke drempels', () => {
  it('drempels zijn 0,30% en 0,80% (decimaal)', () => {
    expect(TER_SEVERITY_THRESHOLDS.green).toBe(0.003)
    expect(TER_SEVERITY_THRESHOLDS.orange).toBe(0.008)
  })

  it('< 0,30% → groen', () => {
    expect(terSeverity(0)).toBe('green')
    expect(terSeverity(0.0029)).toBe('green') // 0,29%
  })

  it('0,30%–0,80% → oranje (grenzen inclusief bovengrens)', () => {
    expect(terSeverity(0.003)).toBe('orange') // 0,30%
    expect(terSeverity(0.008)).toBe('orange') // 0,80%
  })

  it('> 0,80% → rood', () => {
    expect(terSeverity(0.0081)).toBe('red') // 0,81%
    expect(terSeverity(0.02)).toBe('red')
  })

  it('LOW_TER_BENCHMARK is 0,20% en duidt als groen', () => {
    expect(LOW_TER_BENCHMARK).toBe(0.002)
    expect(terSeverity(LOW_TER_BENCHMARK)).toBe('green')
  })
})

describe('computePortfolioFees — gewogen TER + holdings zonder TER', () => {
  it('rekent gewogen TER en telt holdings met/zonder TER correct', () => {
    const analysis = computePortfolioFees([
      { name: 'Tracker A', units: 1, current_price: 10_000, avg_purchase_price: 8_000, ter: 0.002 },
      { name: 'Tracker B', units: 1, current_price: 10_000, avg_purchase_price: 9_000, ter: 0.006 },
      { name: 'Los aandeel', units: 1, current_price: 5_000, avg_purchase_price: 4_000 }, // geen TER
    ])

    // Gewogen TER = (10k*0,002 + 10k*0,006 + 5k*0) / 25k = 80 / 25000 = 0,0032
    expect(analysis.weightedTER).toBeCloseTo(0.0032, 6)
    expect(analysis.totalAnnualFee).toBeCloseTo(80, 6)
    expect(analysis.totalPortfolioValue).toBe(25_000)
    expect(analysis.holdingsWithTER).toBe(2)
    expect(analysis.holdingsWithoutTER).toBe(1)
    // Duurste holding eerst
    expect(analysis.perHoldingBreakdown[0].name).toBe('Tracker B')
  })
})

describe('gating-pariteit fee_analyzer / rebalancing met holdings', () => {
  it('module-gate: aandelenregistratie vereist (net als holdings)', () => {
    expect(getWidgetRequiredModule('holdings')).toBe('aandelenregistratie')
    expect(getWidgetRequiredModule('fee_analyzer')).toBe('aandelenregistratie')
    expect(getWidgetRequiredModule('rebalancing')).toBe('aandelenregistratie')
  })

  it('feature-gate: opgenomen in een UNIFIED_FEATURE (WIDGET_TO_FEATURE gedefinieerd)', () => {
    expect(WIDGET_TO_FEATURE['fee_analyzer']).toBeDefined()
    expect(WIDGET_TO_FEATURE['rebalancing']).toBeDefined()
    // Zelfde feature als holdings (vermogensbeheer)
    expect(WIDGET_TO_FEATURE['fee_analyzer']).toBe(WIDGET_TO_FEATURE['holdings'])
  })
})
