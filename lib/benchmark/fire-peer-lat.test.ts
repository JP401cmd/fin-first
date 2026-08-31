import { describe, it, expect } from 'vitest'
import { firePeerAgeForAge, FIRE_PEER_AGE_BY_BAND } from './fire-peer-lat'

describe('fire-peer-lat — FIRE-nastrevers-lat per cohortband', () => {
  it('volgt de gecureerde tabel op de bestaande AGE_BANDS-grenzen', () => {
    expect(firePeerAgeForAge(24)).toBe(55)
    expect(firePeerAgeForAge(25)).toBe(55)
    expect(firePeerAgeForAge(34)).toBe(55)
    expect(firePeerAgeForAge(35)).toBe(58)
    expect(firePeerAgeForAge(44)).toBe(58)
    expect(firePeerAgeForAge(45)).toBe(62)
    expect(firePeerAgeForAge(54)).toBe(62)
    expect(firePeerAgeForAge(55)).toBe(65)
    expect(firePeerAgeForAge(70)).toBe(65)
    expect(firePeerAgeForAge(80)).toBe(65)
  })

  it('elke band heeft een lat die vóór of op de bandgrens-plus-runway ligt', () => {
    for (const age of Object.values(FIRE_PEER_AGE_BY_BAND)) {
      expect(age).toBeGreaterThanOrEqual(55)
      expect(age).toBeLessThanOrEqual(65)
    }
  })
})
