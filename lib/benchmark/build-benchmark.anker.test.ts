import { describe, it, expect } from 'vitest'
import { buildBenchmarkReport, type BenchmarkUserMetrics } from './build-benchmark'
import { deriveCohort } from './cohort'

/**
 * ADR 0129 F3a (J) — onder een vast stop-anker is er geen vrijheidsleeftijd om met
 * een peer te vergelijken: de metric wordt n.v.t. mét reden, de andere vier blijven.
 */
const user: BenchmarkUserMetrics = {
  healthScoreTotal: 70,
  fireAgeFractional: 62,
  savingsRate6m: 18,
  netWorth: 250_000,
  yearlyIncome: 60_000,
  dailyExpenseRate: 80,
}
const cohort = deriveCohort({ date_of_birth: '1984-06-01', household_type: 'single' }, new Date('2026-09-05'))

describe('buildBenchmarkReport — fire_age onder een vast anker', () => {
  it.each(['aow', 'now', 'age'] as const)('%s: userValue null met de n.v.t.-reden; de vergelijking blijft 5 metrics', (anchor) => {
    const report = buildBenchmarkReport({ user: { ...user, fireStopAnchor: anchor }, cohort, displayName: null, generatedAt: '2026-09-05T00:00:00Z' })
    const fire = report.metrics.find((m) => m.key === 'fire_age')!
    expect(report.metrics).toHaveLength(5)
    expect(fire.userValue).toBeNull()
    expect(fire.caption).toMatch(/^Niet van toepassing: je stopmoment ligt vast/)
    expect(fire.caption).not.toMatch(/\bAOW\b|kunt stoppen/i)
  })

  it('solved (of weggelaten): de vergelijking zoals voorheen', () => {
    const a = buildBenchmarkReport({ user, cohort, displayName: null, generatedAt: '2026-09-05T00:00:00Z' })
    const b = buildBenchmarkReport({ user: { ...user, fireStopAnchor: 'solved' }, cohort, displayName: null, generatedAt: '2026-09-05T00:00:00Z' })
    const fireA = a.metrics.find((m) => m.key === 'fire_age')!
    const fireB = b.metrics.find((m) => m.key === 'fire_age')!
    expect(fireA.userValue).toBe(62)
    expect(fireB).toEqual(fireA)
    expect(fireA.caption).not.toMatch(/Niet van toepassing/)
  })
})
