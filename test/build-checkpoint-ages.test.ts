import { describe, it, expect } from 'vitest'
import { buildCheckpointAges } from '../components/app/horizon/phase-analysis/opbouw/monte-carlo-opbouw'

describe('buildCheckpointAges', () => {
  it('returns ~5 checkpoints for buildCheckpointAges(30, 50)', () => {
    const result = buildCheckpointAges(30, 50)
    // Should generate approximately 5 checkpoints
    expect(result.length).toBeGreaterThanOrEqual(4)
    expect(result.length).toBeLessThanOrEqual(6)
    // All ages must be > currentAge (30)
    for (const age of result) {
      expect(age).toBeGreaterThan(30)
    }
    // Must be sorted ascending
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1])
    }
  })

  it('always includes fireAge in checkpoints', () => {
    const result = buildCheckpointAges(30, 50)
    expect(result).toContain(50)
  })

  it('handles currentAge === fireAge', () => {
    const result = buildCheckpointAges(50, 50)
    // endAge (55) <= startAge (55) → returns [effectiveFireAge] = [50]
    expect(result).toContain(50)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('handles young user (20, 40)', () => {
    const result = buildCheckpointAges(20, 40)
    // Should generate checkpoints between 25 and 45
    expect(result.length).toBeGreaterThanOrEqual(4)
    expect(result.length).toBeLessThanOrEqual(6)
    // All ages > 20
    for (const age of result) {
      expect(age).toBeGreaterThan(20)
    }
    // Must include fire age
    expect(result).toContain(40)
    // Must be sorted
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1])
    }
  })

  it('has no duplicate ages', () => {
    // Test several combos for uniqueness
    const combos: [number, number | null][] = [
      [30, 50],
      [20, 40],
      [25, 60],
      [35, 36],
      [50, 50],
      [40, null],
    ]
    for (const [currentAge, fireAge] of combos) {
      const result = buildCheckpointAges(currentAge, fireAge)
      const unique = new Set(result)
      expect(unique.size).toBe(result.length)
    }
  })

  it('handles null fireAge (defaults to currentAge + 30)', () => {
    const result = buildCheckpointAges(30, null)
    // effectiveFireAge = 60, so should include 60
    expect(result).toContain(60)
    expect(result.length).toBeGreaterThanOrEqual(4)
  })
})
