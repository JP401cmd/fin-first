import { describe, it, expect } from 'vitest'
import {
  buildVoice,
  freedomDays,
  freedomLabel,
  formatEUR,
} from './gespreksstarters'

describe('buildVoice', () => {
  it('household uses jullie + plural verbs', () => {
    const v = buildVoice('household')
    expect(v.subj).toBe('jullie')
    expect(v.subjCap).toBe('Jullie')
    expect(v.poss).toBe('jullie')
    expect(v.hebt).toBe('hebben')
    expect(v.wilt).toBe('willen')
    expect(v.bent).toBe('zijn')
    expect(v.voelt).toBe('voelen jullie je')
    expect(v.samen).toBe('samen')
  })

  it('solo uses je/jij + singular verbs', () => {
    const v = buildVoice('solo')
    expect(v.subj).toBe('je')
    expect(v.subjCap).toBe('Je')
    expect(v.poss).toBe('je')
    expect(v.hebt).toBe('hebt')
    expect(v.wilt).toBe('wilt')
    expect(v.bent).toBe('bent')
    expect(v.voelt).toBe('voel je je')
    expect(v.samen).toBe('voor jezelf')
  })
})

describe('freedomDays', () => {
  it('returns 0 when dailyExpenses <= 0', () => {
    expect(freedomDays(1000, 0)).toBe(0)
  })
  it('rounds amount / dailyExpenses', () => {
    expect(freedomDays(1000, 100)).toBe(10)
    expect(freedomDays(-450, 100)).toBe(5) // uses absolute value
  })
})

describe('freedomLabel', () => {
  it('formats days, months and years in Dutch', () => {
    expect(freedomLabel(1)).toBe('1 dag')
    expect(freedomLabel(5)).toBe('5 dagen')
    expect(freedomLabel(30)).toBe('1 maanden')
    expect(freedomLabel(45)).toBe('1 maanden en 15 dagen')
    expect(freedomLabel(365)).toBe('1 jaar')
    expect(freedomLabel(400)).toBe('1 jaar en 1 maanden')
  })
})

describe('formatEUR', () => {
  it('formats whole euros nl-NL', () => {
    expect(formatEUR(1234)).toContain('1.234')
    expect(formatEUR(1234)).toContain('€')
  })
})
