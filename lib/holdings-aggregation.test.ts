import { describe, it, expect } from 'vitest'
import {
  computePositionFromTransactions,
  valuePosition,
  type PositionTransaction,
} from './holdings-aggregation'

describe('computePositionFromTransactions', () => {
  it('geeft een lege positie terug zonder transacties', () => {
    const agg = computePositionFromTransactions([])
    expect(agg.netUnits).toBe(0)
    expect(agg.isClosed).toBe(true)
    expect(agg.realizedPnL).toBe(0)
  })

  it('Shell-voorbeeld: 10 kopen @ €10 + 5 verkopen @ €15 → 5 over, kostprijs €10, gerealiseerd €25', () => {
    const txs: PositionTransaction[] = [
      { type: 'buy', units: 10, price_per_unit: 10, date: '2024-01-01' },
      { type: 'sell', units: 5, price_per_unit: 15, date: '2024-06-01' },
    ]
    const agg = computePositionFromTransactions(txs)
    expect(agg.netUnits).toBe(5)
    expect(agg.avgCost).toBeCloseTo(10, 6)
    expect(agg.realizedPnL).toBeCloseTo(25, 6)
    expect(agg.isClosed).toBe(false)

    const valued = valuePosition(agg, 20)
    expect(valued.currentValue).toBeCloseTo(100, 6) // 5 × 20
    expect(valued.unrealizedPnL).toBeCloseTo(50, 6) // (20−10) × 5
    expect(valued.totalPnL).toBeCloseTo(75, 6) // 25 realized + 50 unrealized
  })

  it('TAKEAWAY (echte data): 465 gekocht − 465 verkocht → netto 0, gerealiseerd ≈ €290', () => {
    // Exact de 8 transacties uit de productie-DB voor holding 566f0f4d-…
    const txs: PositionTransaction[] = [
      { type: 'buy', units: 10, price_per_unit: 99.62, date: '2021-01-11' },
      { type: 'buy', units: 40, price_per_unit: 76.48, date: '2021-06-08' },
      { type: 'sell', units: 20, price_per_unit: 81.91, date: '2021-09-01' },
      { type: 'buy', units: 15, price_per_unit: 61, date: '2021-11-17' },
      { type: 'buy', units: 200, price_per_unit: 12.87, date: '2023-11-09' },
      { type: 'buy', units: 120, price_per_unit: 10.66, date: '2024-08-06' },
      { type: 'buy', units: 80, price_per_unit: 12.865, date: '2024-08-16' },
      { type: 'sell', units: 445, price_per_unit: 19.11, date: '2025-02-24' },
    ]
    const agg = computePositionFromTransactions(txs)
    expect(agg.netUnits).toBe(0)
    expect(agg.isClosed).toBe(true)
    expect(agg.totalBoughtUnits).toBe(465)
    expect(agg.totalSoldUnits).toBe(465)
    // Realized ≈ €290 (de gebruiker zag €290 indicatief).
    expect(agg.realizedPnL).toBeGreaterThan(285)
    expect(agg.realizedPnL).toBeLessThan(295)

    // Gesloten positie → marktwaarde 0, totaal = realized.
    const valued = valuePosition(agg, 19.11)
    expect(valued.currentValue).toBe(0)
    expect(valued.unrealizedPnL).toBe(0)
    expect(valued.totalPnL).toBeCloseTo(agg.realizedPnL, 6)
  })

  it('sorteert zelf op datum (volgorde-onafhankelijk)', () => {
    const ordered = computePositionFromTransactions([
      { type: 'buy', units: 10, price_per_unit: 10, date: '2024-01-01' },
      { type: 'sell', units: 5, price_per_unit: 15, date: '2024-06-01' },
    ])
    const shuffled = computePositionFromTransactions([
      { type: 'sell', units: 5, price_per_unit: 15, date: '2024-06-01' },
      { type: 'buy', units: 10, price_per_unit: 10, date: '2024-01-01' },
    ])
    expect(shuffled).toEqual(ordered)
  })

  it('trekt transactiekosten van het gerealiseerde resultaat af', () => {
    const agg = computePositionFromTransactions([
      { type: 'buy', units: 10, price_per_unit: 10, date: '2024-01-01', fees: 1 },
      { type: 'sell', units: 10, price_per_unit: 12, date: '2024-06-01', fees: 1 },
    ])
    // 10×(12−10)=20 gerealiseerd, −2 kosten = 18.
    expect(agg.netUnits).toBe(0)
    expect(agg.realizedPnL).toBeCloseTo(18, 6)
    expect(agg.totalFees).toBeCloseTo(2, 6)
  })

  it('telt dividend als inkomsten bij het gerealiseerde resultaat', () => {
    const agg = computePositionFromTransactions([
      { type: 'buy', units: 10, price_per_unit: 10, date: '2024-01-01' },
      { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 5, date: '2024-03-01' },
    ])
    expect(agg.netUnits).toBe(10)
    expect(agg.dividends).toBeCloseTo(5, 6)
    expect(agg.realizedPnL).toBeCloseTo(5, 6)
  })
})
