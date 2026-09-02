import { describe, it, expect } from 'vitest'
import { computeScalarFreedomMilestones } from './scalar-router'

/**
 * ADR 0127 D4 — mijlpalen onder 'nu-stoppen': er is geen doelvermogen om 25/50/75/100%
 * tegen te kruisen. De router antwoordt bewust LEEG mét reden (geen degradatie, geen
 * verzonnen scalar-doel).
 */
const basis = {
  netWorth: 250_000,
  monthlyExpenses: 2_500,
  monthlySavings: 800,
  dateOfBirth: '1986-01-01',
}

describe("computeScalarFreedomMilestones — 'nu-stoppen'", () => {
  it('leeg mét reden: geen mijlpalen bereikt/bereikbaar, engine kernel, geen fallback', () => {
    const out = computeScalarFreedomMilestones({ ...basis, strategy: 'nu-stoppen' })
    expect(out.engine).toBe('kernel')
    expect(out.fallbackReason).toBeUndefined()
    expect(out.notApplicableReason).toMatch(/nu-stoppen/)
    expect(out.result.anyReachable).toBe(false)
    expect(out.result.allReached).toBe(false)
    expect(out.result.nextMilestone).toBeNull()
    expect(out.result.currentFreedomPct).toBe(0)
    for (const m of out.result.milestones) expect(m.reached).toBe(false)
  })

  it('zonder de strategie (of met deplete) is het gedrag ongewijzigd: echte mijlpalen', () => {
    const out = computeScalarFreedomMilestones({ ...basis, strategy: 'deplete' })
    expect(out.notApplicableReason).toBeUndefined()
    expect(out.result.milestones.length).toBeGreaterThan(0)
    expect(out.result.currentFreedomPct).toBeGreaterThan(0)
  })
})
