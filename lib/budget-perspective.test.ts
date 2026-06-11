import { describe, it, expect } from 'vitest'
import {
  shareFractionFor,
  stampBudgetShares,
  combineSpending,
  buildSpendingSums,
  formatShareCaption,
} from './budget-perspective'

describe('shareFractionFor', () => {
  describe('personal perspectief', () => {
    it('gedeeld budget telt op het eigen aandeel', () => {
      expect(shareFractionFor('personal', 'shared', 50)).toBe(0.5)
      expect(shareFractionFor('personal', 'shared', 60)).toBeCloseTo(0.6)
      expect(shareFractionFor('personal', 'shared', 30)).toBeCloseTo(0.3)
    })

    it('persoonlijk budget telt altijd ×1', () => {
      expect(shareFractionFor('personal', 'personal', 50)).toBe(1)
      expect(shareFractionFor('personal', 'personal', 20)).toBe(1)
    })

    it('ontbrekende ownership telt als ×1 (persoonlijk)', () => {
      expect(shareFractionFor('personal', undefined, 50)).toBe(1)
    })
  })

  describe('household perspectief', () => {
    it('alles telt ×1 ongeacht ownership of aandeel', () => {
      expect(shareFractionFor('household', 'shared', 50)).toBe(1)
      expect(shareFractionFor('household', 'shared', 30)).toBe(1)
      expect(shareFractionFor('household', 'personal', 70)).toBe(1)
      expect(shareFractionFor('household', undefined, 10)).toBe(1)
    })
  })

  describe('partner perspectief', () => {
    it('gedeeld budget telt op het complement van het eigen aandeel', () => {
      expect(shareFractionFor('partner', 'shared', 50)).toBe(0.5)
      expect(shareFractionFor('partner', 'shared', 60)).toBeCloseTo(0.4)
      expect(shareFractionFor('partner', 'shared', 30)).toBeCloseTo(0.7)
    })

    it('persoonlijk budget telt ×1', () => {
      expect(shareFractionFor('partner', 'personal', 60)).toBe(1)
    })
  })

  describe('rand-aandelen', () => {
    it('0% aandeel: eigen=0 van gedeeld, partner=1', () => {
      expect(shareFractionFor('personal', 'shared', 0)).toBe(0)
      expect(shareFractionFor('partner', 'shared', 0)).toBe(1)
    })

    it('100% aandeel: eigen=1 van gedeeld, partner=0', () => {
      expect(shareFractionFor('personal', 'shared', 100)).toBe(1)
      expect(shareFractionFor('partner', 'shared', 100)).toBe(0)
    })

    it('klemt buiten-bereik percentages naar [0,100]', () => {
      expect(shareFractionFor('personal', 'shared', 150)).toBe(1)
      expect(shareFractionFor('personal', 'shared', -20)).toBe(0)
    })

    it('valt terug op 50% bij niet-eindige input', () => {
      expect(shareFractionFor('personal', 'shared', NaN)).toBe(0.5)
    })
  })
})

describe('stampBudgetShares', () => {
  const budgets = [
    { id: 'a', ownership: 'personal', default_limit: 100 },
    { id: 'b', ownership: 'shared', default_limit: 200 },
    { id: 'c', default_limit: 50 }, // geen ownership → persoonlijk
  ]

  it('stempelt elk budget met een _shareFraction (personal)', () => {
    const stamped = stampBudgetShares(budgets, 'personal', 40)
    expect(stamped[0]._shareFraction).toBe(1)
    expect(stamped[1]._shareFraction).toBeCloseTo(0.4)
    expect(stamped[2]._shareFraction).toBe(1)
  })

  it('stempelt alles op 1 in household', () => {
    const stamped = stampBudgetShares(budgets, 'household', 40)
    expect(stamped.every((b) => b._shareFraction === 1)).toBe(true)
  })

  it('stempelt gedeeld op partner-aandeel in partner-blik', () => {
    const stamped = stampBudgetShares(budgets, 'partner', 40)
    expect(stamped[1]._shareFraction).toBeCloseTo(0.6)
  })

  it('behoudt bestaande velden en muteert de input niet', () => {
    const stamped = stampBudgetShares(budgets, 'personal', 50)
    expect(stamped[0]).toMatchObject({ id: 'a', ownership: 'personal', default_limit: 100 })
    expect(budgets[1]).not.toHaveProperty('_shareFraction')
  })

  it('levert een lege array voor een lege input', () => {
    expect(stampBudgetShares([], 'personal', 50)).toEqual([])
  })
})

describe('combineSpending', () => {
  it('personal: eigen geld ×1 + gedeeld op aandeel', () => {
    // 100 eigen + 200 gedeeld × 0.5 = 200
    expect(combineSpending(100, 200, 'personal', 50)).toBe(200)
  })

  it('household: beide volledig opgeteld', () => {
    expect(combineSpending(100, 200, 'household', 50)).toBe(300)
  })

  it('partner: eigen geld ×1 + gedeeld op complement', () => {
    // 100 + 200 × (1 - 0.6) = 100 + 80 = 180
    expect(combineSpending(100, 200, 'partner', 60)).toBeCloseTo(180)
  })

  it('eigen geld op een gedeeld budget telt altijd vol mee (personal)', () => {
    // Zelfs bij 0% aandeel telt de eigen som ×1.
    expect(combineSpending(100, 200, 'personal', 0)).toBe(100)
  })

  it('geen uitgaven → 0', () => {
    expect(combineSpending(0, 0, 'personal', 50)).toBe(0)
  })
})

describe('buildSpendingSums', () => {
  it('splitst per budget naar personal/shared sommen', () => {
    const map = buildSpendingSums([
      { budget_id: 'a', amount: -30, ownership: 'personal' },
      { budget_id: 'a', amount: -20, ownership: 'shared' },
      { budget_id: 'b', amount: -40, ownership: 'shared' },
    ])
    expect(map.get('a')).toEqual({ personalSum: 30, sharedSum: 20 })
    expect(map.get('b')).toEqual({ personalSum: 0, sharedSum: 40 })
  })

  it('gebruikt Math.abs op bedragen', () => {
    const map = buildSpendingSums([
      { budget_id: 'a', amount: -100, ownership: 'personal' },
      { budget_id: 'a', amount: 100, ownership: 'personal' },
    ])
    expect(map.get('a')).toEqual({ personalSum: 200, sharedSum: 0 })
  })

  it('telt ontbrekende ownership als personal', () => {
    const map = buildSpendingSums([{ budget_id: 'a', amount: -25 }])
    expect(map.get('a')).toEqual({ personalSum: 25, sharedSum: 0 })
  })

  it('slaat rijen zonder budget_id over', () => {
    const map = buildSpendingSums([
      { budget_id: null, amount: -25, ownership: 'personal' },
      { budget_id: 'a', amount: -10, ownership: 'personal' },
    ])
    expect(map.size).toBe(1)
    expect(map.get('a')).toEqual({ personalSum: 10, sharedSum: 0 })
  })

  it('verwerkt split-achtige rijen (parent-ownership per regel)', () => {
    // Een gesplitste transactie draagt per budget bij met de ownership van de
    // ouder; hier komen twee regels van een gedeelde transactie binnen.
    const map = buildSpendingSums([
      { budget_id: 'a', amount: -15, ownership: 'shared' },
      { budget_id: 'b', amount: -35, ownership: 'shared' },
    ])
    expect(map.get('a')).toEqual({ personalSum: 0, sharedSum: 15 })
    expect(map.get('b')).toEqual({ personalSum: 0, sharedSum: 35 })
  })

  it('lege input → lege map', () => {
    expect(buildSpendingSums([]).size).toBe(0)
  })

  it('integreert met combineSpending over alle perspectieven', () => {
    const map = buildSpendingSums([
      { budget_id: 'a', amount: -100, ownership: 'personal' },
      { budget_id: 'a', amount: -200, ownership: 'shared' },
    ])
    const { personalSum, sharedSum } = map.get('a')!
    expect(combineSpending(personalSum, sharedSum, 'personal', 50)).toBe(200)
    expect(combineSpending(personalSum, sharedSum, 'household', 50)).toBe(300)
    expect(combineSpending(personalSum, sharedSum, 'partner', 50)).toBe(200)
  })
})

describe('formatShareCaption', () => {
  it('formatteert een geheel percentage', () => {
    expect(formatShareCaption(50)).toBe('o.b.v. jouw aandeel (50%)')
    expect(formatShareCaption(100)).toBe('o.b.v. jouw aandeel (100%)')
  })

  it('rondt af naar een geheel percentage', () => {
    expect(formatShareCaption(33.33)).toBe('o.b.v. jouw aandeel (33%)')
    expect(formatShareCaption(66.7)).toBe('o.b.v. jouw aandeel (67%)')
  })

  it('valt terug op 50% bij niet-eindige input', () => {
    expect(formatShareCaption(NaN)).toBe('o.b.v. jouw aandeel (50%)')
  })
})
