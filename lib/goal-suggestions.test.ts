import { describe, it, expect } from 'vitest'
import { getGoalSuggestions } from './goal-suggestions'

describe('getGoalSuggestions', () => {
  it('returnt 2 suggesties default voor savings', () => {
    const out = getGoalSuggestions('savings')
    expect(out.length).toBe(2)
    expect(out[0]?.key.startsWith('savings:')).toBe(true)
  })

  it('returnt 2 suggesties voor wealth', () => {
    const out = getGoalSuggestions('wealth')
    expect(out.length).toBe(2)
    expect(out[0]?.key.startsWith('wealth:')).toBe(true)
  })

  it('returnt 2 suggesties voor debt', () => {
    const out = getGoalSuggestions('debt')
    expect(out.length).toBe(2)
    expect(out[0]?.key.startsWith('debt:')).toBe(true)
  })

  it('limit-param beperkt het aantal', () => {
    expect(getGoalSuggestions('savings', 1).length).toBe(1)
    expect(getGoalSuggestions('savings', 5).length).toBeLessThanOrEqual(2)
  })

  it('returnt [] bij onbekende goal_type', () => {
    expect(getGoalSuggestions('unknown')).toEqual([])
    expect(getGoalSuggestions(null)).toEqual([])
    expect(getGoalSuggestions(undefined)).toEqual([])
  })

  it('elke suggestie heeft een text-veld', () => {
    for (const kind of ['savings', 'wealth', 'debt'] as const) {
      for (const s of getGoalSuggestions(kind, 99)) {
        expect(s.text.length).toBeGreaterThan(20)
        expect(s.key).toMatch(/^(savings|wealth|debt):/)
      }
    }
  })
})
