/**
 * Unit tests voor de debt-calculations in `lib/debt-data.ts`.
 *
 * Fase 1 dekking: `computeDefaultMonthlyPayment` — centrale helper die door
 * de quick-add wizard (`buildDebtDraft`) en later ook door de full-form wordt
 * hergebruikt. De vier repayment-takken (annuiteit, lineair, aflossingsvrij,
 * null) + edge-cases (ratePct=0, years=null) zijn hier gevalideerd.
 */

import { describe, it, expect } from 'vitest'
import { computeDefaultMonthlyPayment } from './debt-data'

describe('computeDefaultMonthlyPayment', () => {
  it('annuiteit: 300k @ 3.5% over 30j ≈ 1347', () => {
    // Standaard PMT-formule: 300000 * (mr * (1+mr)^n) / ((1+mr)^n - 1)
    // met mr = 3.5/100/12 en n = 360 → 1347.13
    const payment = computeDefaultMonthlyPayment(300000, 3.5, 30, 'annuiteit')
    expect(payment).toBeCloseTo(1347, 0)
  })

  it('lineair: 100k @ 5% over 10j eerste maand → aflossing + rente = 1250', () => {
    // Vaste aflossing: 100000 / 120 = 833.33
    // Rente maand 1: 100000 * 0.05 / 12 = 416.67
    // Totaal: 1250.00
    const payment = computeDefaultMonthlyPayment(100000, 5, 10, 'lineair')
    expect(payment).toBeCloseTo(1250, 2)
  })

  it('aflossingsvrij: 50k @ 10% → 416.67 per maand (alleen rente)', () => {
    const payment = computeDefaultMonthlyPayment(50000, 10, null, 'aflossingsvrij')
    expect(payment).toBe(416.67)
  })

  it('annuiteit met ratePct=0 valt terug op balance / months', () => {
    const payment = computeDefaultMonthlyPayment(120000, 0, 10, 'annuiteit')
    expect(payment).toBe(1000)
  })

  it('aflossingsvrij negeert years=null en berekent nog steeds rente', () => {
    const payment = computeDefaultMonthlyPayment(10000, 6, null, 'aflossingsvrij')
    // 10000 * 0.06 / 12 = 50
    expect(payment).toBe(50)
  })

  it('annuiteit met years=null → 0 (onvoldoende data voor PMT)', () => {
    const payment = computeDefaultMonthlyPayment(100000, 4, null, 'annuiteit')
    expect(payment).toBe(0)
  })

  it('null repayment met years=null → 0', () => {
    // Fallback: geen aflossingsmodel én geen looptijd → geen betaling berekend.
    const payment = computeDefaultMonthlyPayment(50000, 5, null, null)
    expect(payment).toBe(0)
  })
})
