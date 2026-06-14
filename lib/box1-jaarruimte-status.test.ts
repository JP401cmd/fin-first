import { describe, it, expect } from 'vitest'
import {
  box1JaarruimteStatus,
  computeJaarruimte,
  JAARRUIMTE_FRANCHISE_2026,
} from './jaarruimte'

// ── box1JaarruimteStatus — neutral branch ─────────────────────────────────────

describe('box1JaarruimteStatus — neutral (geen inkomen)', () => {
  it('netMonthly 0 → grossYearly 0, status neutral', () => {
    const result = box1JaarruimteStatus({ netMonthly: 0, marginaalTarief: 0.3697 })
    expect(result.grossYearly).toBe(0)
    expect(result.status).toBe('neutral')
  })

  it('marginaalTarief 0 → grossYearly 0, status neutral', () => {
    const result = box1JaarruimteStatus({ netMonthly: 3000, marginaalTarief: 0 })
    expect(result.grossYearly).toBe(0)
    expect(result.status).toBe('neutral')
  })

  it('marginaalTarief >= 1 → grossYearly 0, status neutral', () => {
    const result = box1JaarruimteStatus({ netMonthly: 3000, marginaalTarief: 1 })
    expect(result.grossYearly).toBe(0)
    expect(result.status).toBe('neutral')
  })

  it('marginaalTarief > 1 → grossYearly 0, status neutral', () => {
    const result = box1JaarruimteStatus({ netMonthly: 3000, marginaalTarief: 1.5 })
    expect(result.grossYearly).toBe(0)
    expect(result.status).toBe('neutral')
  })
})

// ── box1JaarruimteStatus — warn (jaarruimte > 0) ──────────────────────────────

describe('box1JaarruimteStatus — warn (onbenutte jaarruimte)', () => {
  it('netMonthly 3000, marginaalTarief 0.3697 → grossYearly ≈ 57116, status warn', () => {
    // grossYearly = (3000 × 12) / (1 − 0.3697) = 36000 / 0.6303 ≈ 57115.65
    const result = box1JaarruimteStatus({ netMonthly: 3000, marginaalTarief: 0.3697 })
    expect(result.grossYearly).toBeCloseTo(57115.65, 0)
    expect(result.status).toBe('warn')
  })

  it('grossYearly is consistent with computeJaarruimte input', () => {
    const { grossYearly, status } = box1JaarruimteStatus({ netMonthly: 3000, marginaalTarief: 0.3697 })
    const jr = computeJaarruimte(grossYearly, 0)
    // When jaarruimte > 0, status must be warn
    expect(jr.jaarruimte).toBeGreaterThan(0)
    expect(status).toBe('warn')
  })

  it('high income (4000/mnd, 0.4950) → grossYearly above franchise, status warn', () => {
    // grossYearly = (4000 × 12) / (1 − 0.4950) = 48000 / 0.505 ≈ 95049.50
    const result = box1JaarruimteStatus({ netMonthly: 4000, marginaalTarief: 0.4950 })
    expect(result.grossYearly).toBeCloseTo(95049.5, 1)
    expect(result.grossYearly).toBeGreaterThan(JAARRUIMTE_FRANCHISE_2026)
    expect(result.status).toBe('warn')
  })

  it('grossYearly just above franchise has positive jaarruimte → warn', () => {
    // Franchise 2026 = 19172. netMonthly = 1030, marg = 0.3697
    // grossYearly = (1030 × 12) / 0.6303 ≈ 19608 > 19172 → grondslag > 0 → jaarruimte > 0
    const result = box1JaarruimteStatus({ netMonthly: 1030, marginaalTarief: 0.3697 })
    expect(result.grossYearly).toBeGreaterThan(JAARRUIMTE_FRANCHISE_2026)
    const jr = computeJaarruimte(result.grossYearly, 0)
    expect(jr.jaarruimte).toBeGreaterThan(0)
    expect(result.status).toBe('warn')
  })
})

// ── box1JaarruimteStatus — good (jaarruimte fully used / below franchise) ─────

describe('box1JaarruimteStatus — good (geen onbenutte jaarruimte)', () => {
  it('netMonthly 1000, marginaalTarief 0.3697 → grossYearly below franchise → jaarruimte 0 → good', () => {
    // grossYearly = (1000 × 12) / 0.6303 = 12000 / 0.6303 ≈ 19038 < 19172 (franchise 2026)
    const result = box1JaarruimteStatus({ netMonthly: 1000, marginaalTarief: 0.3697 })
    expect(result.grossYearly).toBeCloseTo(19038.4, 0)
    expect(result.grossYearly).toBeLessThan(JAARRUIMTE_FRANCHISE_2026)
    // Verify via computeJaarruimte: grondslag = 0 → jaarruimte = 0
    const jr = computeJaarruimte(result.grossYearly, 0)
    expect(jr.jaarruimte).toBe(0)
    expect(result.status).toBe('good')
  })

  it('netMonthly producing grossYearly exactly at franchise → jaarruimte 0 → good', () => {
    // grossYearly = franchise exactly → grondslag 0 → jaarruimte 0
    const grossYearly = JAARRUIMTE_FRANCHISE_2026
    const jr = computeJaarruimte(grossYearly, 0)
    expect(jr.jaarruimte).toBe(0)
    // Derive the netMonthly that would produce this grossYearly:
    // netMonthly = grossYearly × (1 − marginaalTarief) / 12
    const marginaalTarief = 0.3697
    const netMonthly = (grossYearly * (1 - marginaalTarief)) / 12
    const result = box1JaarruimteStatus({ netMonthly, marginaalTarief })
    expect(result.grossYearly).toBeCloseTo(grossYearly, 0)
    expect(result.status).toBe('good')
  })
})

// ── Consistency: box1JaarruimteStatus.status is always consistent with computeJaarruimte ─

describe('box1JaarruimteStatus — consistency with computeJaarruimte', () => {
  it('status always reflects what computeJaarruimte returns for the derived grossYearly', () => {
    const cases = [
      { netMonthly: 0, marginaalTarief: 0.3697 },
      { netMonthly: 1000, marginaalTarief: 0.3697 },
      { netMonthly: 3000, marginaalTarief: 0.3697 },
      { netMonthly: 5000, marginaalTarief: 0.4950 },
    ]
    for (const c of cases) {
      const { status, grossYearly } = box1JaarruimteStatus(c)
      if (grossYearly <= 0) {
        expect(status, `netMonthly=${c.netMonthly}`).toBe('neutral')
      } else {
        const jr = computeJaarruimte(grossYearly, 0)
        const expected = !jr.hasData ? 'neutral' : jr.jaarruimte > 0 ? 'warn' : 'good'
        expect(status, `netMonthly=${c.netMonthly}`).toBe(expected)
      }
    }
  })
})
