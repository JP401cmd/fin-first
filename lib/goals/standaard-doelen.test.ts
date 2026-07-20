import { describe, it, expect } from 'vitest'
import {
  STANDAARD_DOELEN,
  computeNoodfondsTarget,
  computeVrijheidsgetalTarget,
} from './standaard-doelen'
import { TARGET_EMERGENCY_MONTHS, CLASSIC_MULTIPLIER } from '@/lib/constants'

/**
 * Standaard-doelen = de geünificeerde bron voor de pre-gevulde doel-sjablonen.
 * Kernborging: het noodfonds hanteert dezelfde 6×-uitgaven-grondslag als de
 * widget/bundel + onboarding (optie A), en alle bedragen komen uit de canonieke
 * maand-cijfers (consume, don't recompute).
 */

describe('computeNoodfondsTarget — 6× maanduitgaven (optie A)', () => {
  it('= TARGET_EMERGENCY_MONTHS × maanduitgaven', () => {
    expect(computeNoodfondsTarget({ monthlyIncome: 0, monthlyExpenses: 2000 })).toBe(
      TARGET_EMERGENCY_MONTHS * 2000,
    )
    expect(TARGET_EMERGENCY_MONTHS).toBe(6) // vastgelegde grondslag
  })

  it('valt terug op 70% van het inkomen wanneer uitgaven onbekend zijn', () => {
    // 6 × (3000 × 0.7) = 6 × 2100 = 12600
    expect(computeNoodfondsTarget({ monthlyIncome: 3000, monthlyExpenses: 0 })).toBe(12600)
  })

  it('rondt af op €100', () => {
    // 6 × 1010 = 6060 → al veelvoud van 100; 6 × 1015 = 6090 → 6100
    expect(computeNoodfondsTarget({ monthlyIncome: 0, monthlyExpenses: 1015 })).toBe(6100)
  })

  it('geeft 0 zonder inkomen én uitgaven (geen prefill forceren)', () => {
    expect(computeNoodfondsTarget({ monthlyIncome: 0, monthlyExpenses: 0 })).toBe(0)
  })
})

describe('computeVrijheidsgetalTarget — 25× jaaruitgaven', () => {
  it('= CLASSIC_MULTIPLIER × jaaruitgaven, afgerond op €1.000', () => {
    // 2000 × 12 × 25 = 600.000
    expect(computeVrijheidsgetalTarget({ monthlyIncome: 0, monthlyExpenses: 2000 })).toBe(600000)
    expect(Math.round(CLASSIC_MULTIPLIER)).toBe(25)
  })

  it('geeft 0 zonder uitgaven', () => {
    expect(computeVrijheidsgetalTarget({ monthlyIncome: 5000, monthlyExpenses: 0 })).toBe(0)
  })
})

describe('STANDAARD_DOELEN — catalogus', () => {
  const byKey = Object.fromEntries(STANDAARD_DOELEN.map((d) => [d.key, d]))

  it('bevat de zes verwachte doelen met unieke keys', () => {
    const keys = STANDAARD_DOELEN.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual([
      'noodfonds',
      'vrijheidsgetal',
      'schuldenvrij',
      'vakantie',
      'auto',
      'aanbetaling',
    ])
  })

  it('noodfonds-template consumeert de 6×-uitgaven-grondslag', () => {
    expect(byKey.noodfonds.goalType).toBe('savings')
    expect(byKey.noodfonds.computeTarget({ monthlyIncome: 0, monthlyExpenses: 2000 })).toBe(12000)
  })

  it('vrijheidsgetal is een wealth-doel op 25× jaaruitgaven', () => {
    expect(byKey.vrijheidsgetal.goalType).toBe('wealth')
    expect(byKey.vrijheidsgetal.computeTarget({ monthlyIncome: 0, monthlyExpenses: 1000 })).toBe(300000)
  })

  it('schuldenvrij is een debt-doel zonder data-afgeleid bedrag', () => {
    expect(byKey.schuldenvrij.goalType).toBe('debt')
    expect(byKey.schuldenvrij.computeTarget({ monthlyIncome: 4000, monthlyExpenses: 2000 })).toBe(0)
  })

  it('spaar-richtbedragen zijn statisch (negeren de maand-cijfers)', () => {
    const ctx = { monthlyIncome: 9999, monthlyExpenses: 9999 }
    expect(byKey.vakantie.computeTarget(ctx)).toBe(2500)
    expect(byKey.auto.computeTarget(ctx)).toBe(10000)
    expect(byKey.aanbetaling.computeTarget(ctx)).toBe(30000)
  })

  it('gebruikt uitsluitend geldige goals-kleur-tokens (geen ruwe Tailwind)', () => {
    const allowed = new Set(['teal', 'amber', 'blue', 'purple', 'emerald', 'red'])
    for (const d of STANDAARD_DOELEN) expect(allowed.has(d.color)).toBe(true)
  })
})
