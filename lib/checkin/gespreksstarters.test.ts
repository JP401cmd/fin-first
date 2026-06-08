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

import {
  selectStarters,
  type StarterCandidate,
} from './gespreksstarters'

// Een kandidaat-factory met 2 varianten zodat rotatie zichtbaar is.
function cand(
  id: string,
  theme: StarterCandidate['theme'],
  score: number,
  sentiment: StarterCandidate['sentiment'] = 'neutral',
): StarterCandidate {
  return {
    id, theme, sentiment, score,
    variants: [
      () => ({ vraag: `${id}-A`, actie: 'a', context: 'c' }),
      () => ({ vraag: `${id}-B`, actie: 'a', context: 'c' }),
    ],
  }
}

describe('selectStarters', () => {
  const v = buildVoice('household')

  it('sorts by score descending', () => {
    const out = selectStarters(
      [cand('low', 'sparen', 10), cand('high', 'vermogen', 90)],
      v, 0, [],
    )
    expect(out[0].id).toBe('high')
    expect(out[1].id).toBe('low')
  })

  it('caps at most 2 per theme', () => {
    const out = selectStarters(
      [
        cand('s1', 'sparen', 90), cand('s2', 'sparen', 80),
        cand('s3', 'sparen', 70), cand('v1', 'vermogen', 60),
      ],
      v, 0, [],
    )
    const sparen = out.filter(o => o.id.startsWith('s'))
    expect(sparen.length).toBe(2)
    expect(out.map(o => o.id)).toContain('v1')
  })

  it('returns at most 5', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      cand(`x${i}`, (['sparen', 'vermogen', 'uitgaven', 'doelen'] as const)[i % 4], 100 - i),
    )
    expect(selectStarters(many, v, 0, []).length).toBe(5)
  })

  it('fills to minimum 2 from fallback when too few candidates', () => {
    const out = selectStarters(
      [cand('only', 'sparen', 50)],
      v, 0,
      [cand('fb1', 'algemeen', 0), cand('fb2', 'algemeen', 0)],
    )
    expect(out.length).toBe(2)
    expect(out.map(o => o.id)).toContain('fb1')
  })

  it('does not duplicate a candidate already chosen via fallback', () => {
    const shared = cand('dup', 'algemeen', 50)
    const out = selectStarters([shared], v, 0, [shared, cand('fb2', 'algemeen', 0)])
    const dupCount = out.filter(o => o.id === 'dup').length
    expect(dupCount).toBe(1)
  })

  it('rotates variant by monthIndex deterministically', () => {
    const m0 = selectStarters([cand('r', 'sparen', 50)], v, 0, [])
    const m1 = selectStarters([cand('r', 'sparen', 50)], v, 1, [])
    const m2 = selectStarters([cand('r', 'sparen', 50)], v, 2, [])
    expect(m0[0].vraag).toBe('r-A')
    expect(m1[0].vraag).toBe('r-B')
    expect(m2[0].vraag).toBe('r-A') // wraps with 2 variants
    // same input + same monthIndex → identical output
    expect(selectStarters([cand('r', 'sparen', 50)], v, 0, [])[0].vraag).toBe('r-A')
  })
})

import {
  buildGespreksstarters,
  type GespreksstartersInput,
} from './gespreksstarters'

// Basis-input zonder enkele trigger; tests zetten per geval velden aan.
function baseInput(over: Partial<GespreksstartersInput> = {}): GespreksstartersInput {
  return {
    audience: 'household',
    monthIndex: 0,
    netWorth: 100000,
    netWorthTrend: 0,
    prevNetWorth: 100000,
    monthlyIncome: 4000,
    monthlyExpenses: 3000,
    prevMonthIncome: 4000,
    prevMonthExpenses: 3000,
    monthlySavings: 1000,
    prevMonthlySavings: 1000,
    savingsRate6m: 20,
    dailyExpenses: 100,
    goals: [],
    totalDebts: 0,
    debtCount: 0,
    completedActionsThisMonth: 0,
    completedActionsFreedomDays: 0,
    pendingActionsCount: 0,
    fireAge: null,
    prevFireAge: null,
    expensesByCategory: [],
    newRecurring: [],
    topAsset: null,
    ...over,
  }
}

function ids(out: { id: string }[]): string[] {
  return out.map(o => o.id)
}

describe('behouden detectoren', () => {
  it('vermogen-groei fires on positive trend', () => {
    const out = buildGespreksstarters(baseInput({ netWorthTrend: 3000, prevNetWorth: 97000 }))
    expect(ids(out)).toContain('vermogen-groei')
  })
  it('vermogen-daling fires on negative trend with alert sentiment', () => {
    const out = buildGespreksstarters(baseInput({ netWorthTrend: -3000, prevNetWorth: 103000 }))
    const hit = out.find(o => o.id === 'vermogen-daling')
    expect(hit).toBeDefined()
    expect(hit!.sentiment).toBe('alert')
  })
  it('negatief-sparen fires when savings <= 0', () => {
    const out = buildGespreksstarters(baseInput({
      monthlySavings: -200, monthlyIncome: 3000, monthlyExpenses: 3200, prevMonthlySavings: 100,
    }))
    expect(ids(out)).toContain('negatief-sparen')
  })
  it('schulden-vrijheid fires when debts exist', () => {
    const out = buildGespreksstarters(baseInput({ totalDebts: 20000, debtCount: 2 }))
    expect(ids(out)).toContain('schulden-vrijheid')
  })
  it('sparen-vrijheid fires when monthly savings > 100', () => {
    const out = buildGespreksstarters(baseInput({ monthlySavings: 1200 }))
    expect(ids(out)).toContain('sparen-vrijheid')
  })
})
