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
  // Alle budget-ids in dit blok zijn UITGAVEN-budgetten — daarop geldt de
  // inkomst-/transfer-uitsluiting. De richting-scoping zelf staat in het
  // aparte blok onderaan.
  const EXPENSE_TYPES = new Map<string, string>([
    ['a', 'expense'],
    ['b', 'expense'],
    ['inventaris', 'expense'],
  ])

  it('splitst per budget naar personal/shared sommen', () => {
    const map = buildSpendingSums(
      [
        { budget_id: 'a', amount: -30, ownership: 'personal' },
        { budget_id: 'a', amount: -20, ownership: 'shared' },
        { budget_id: 'b', amount: -40, ownership: 'shared' },
      ],
      [],
      EXPENSE_TYPES,
    )
    expect(map.get('a')).toEqual({ personalSum: 30, sharedSum: 20 })
    expect(map.get('b')).toEqual({ personalSum: 0, sharedSum: 40 })
  })

  it('somt uitgaven positief en trekt de inkomst eraf', () => {
    // Tekenconventie: amount <= 0 = uitgave, amount > 0 = inkomst. De uitgave
    // telt als +100, de inkomst van +100 gaat eraf: netto 0 (norm 30 aug 2026).
    const map = buildSpendingSums(
      [
        { budget_id: 'a', amount: -100, ownership: 'personal' },
        { budget_id: 'a', amount: 100, ownership: 'personal' },
      ],
      [],
      EXPENSE_TYPES,
    )
    expect(map.get('a')).toEqual({ personalSum: 0, sharedSum: 0 })
  })

  // Given een uitgavenbudget met één uitgave van 1.265 en twee inkomsten van
  // 6.000 en 2.000 (melding 6142d204: partner-overboekingen op "Inventaris &
  // apparaten"), When de bestedingssom wordt gebouwd, Then telt alleen de
  // uitgave mee. De canonieke norm staat al in lib/budget-spending.ts:
  // "inkomsten tellen niet mee als besteding op een uitgaven-budget".
  it('trekt inkomstenrijen af van de besteding op een uitgavenbudget', () => {
    const map = buildSpendingSums(
      [
        { budget_id: 'inventaris', amount: -1265, ownership: 'personal' },
        { budget_id: 'inventaris', amount: 6000, ownership: 'personal' },
        { budget_id: 'inventaris', amount: 2000, ownership: 'personal' },
      ],
      [],
      EXPENSE_TYPES,
    )
    // DE GEMELDE CASE: 1.265 - 6.000 - 2.000 = -6.735, zichtbaar negatief.
    expect(map.get('inventaris')).toEqual({ personalSum: -6735, sharedSum: 0 })
  })

  it('trekt een inkomst ook af als alleen is_income het zegt (negatief teken)', () => {
    // is_income is BOOLEAN DEFAULT false zonder CHECK tegen het teken; beide
    // markers moeten dus meedoen, geen van beide alleen.
    const map = buildSpendingSums(
      [
        { budget_id: 'a', amount: -40, ownership: 'personal' },
        { budget_id: 'a', amount: -3000, ownership: 'personal', is_income: true },
      ],
      [],
      EXPENSE_TYPES,
    )
    expect(map.get('a')).toEqual({ personalSum: 40 - 3000, sharedSum: 0 })
  })

  it('telt transfers niet mee als besteding', () => {
    const map = buildSpendingSums(
      [
        { budget_id: 'a', amount: -40, ownership: 'personal' },
        { budget_id: 'a', amount: -500, ownership: 'personal', transaction_type: 'transfer' },
        { budget_id: 'a', amount: -500, ownership: 'shared', transaction_type: 'joint_transfer' },
      ],
      [],
      EXPENSE_TYPES,
    )
    expect(map.get('a')).toEqual({ personalSum: 40, sharedSum: 0 })
  })

  it('telt ontbrekende ownership als personal', () => {
    const map = buildSpendingSums([{ budget_id: 'a', amount: -25 }], [], EXPENSE_TYPES)
    expect(map.get('a')).toEqual({ personalSum: 25, sharedSum: 0 })
  })

  it('slaat rijen zonder budget_id over', () => {
    const map = buildSpendingSums(
      [
        { budget_id: null, amount: -25, ownership: 'personal' },
        { budget_id: 'a', amount: -10, ownership: 'personal' },
      ],
      [],
      EXPENSE_TYPES,
    )
    expect(map.size).toBe(1)
    expect(map.get('a')).toEqual({ personalSum: 10, sharedSum: 0 })
  })

  // REGRESSIE — de split-valkuil. `transaction_splits.amount` wordt POSITIEF
  // opgeslagen (geverifieerd op productie: 4,50 + 24,74 bij een ouder van
  // −29,24). Een teken-filter over één gedeelde rijen-array zou dus élke
  // split-regel als "inkomst" wegfilteren. Split-regels lopen daarom door de
  // tweede parameter, zonder teken-toets — ze erven de ownership van de ouder.
  it('telt positief opgeslagen split-regels gewoon mee (geen teken-filter)', () => {
    const map = buildSpendingSums(
      [{ budget_id: 'a', amount: -10, ownership: 'shared' }],
      [
        { budget_id: 'a', amount: 4.5, ownership: 'shared' },
        { budget_id: 'b', amount: 24.74, ownership: 'shared' },
      ],
      EXPENSE_TYPES,
    )
    expect(map.get('a')).toEqual({ personalSum: 0, sharedSum: 14.5 })
    expect(map.get('b')).toEqual({ personalSum: 0, sharedSum: 24.74 })
  })

  it('trekt de inkomst af én houdt de split-regels heel in dezelfde ronde', () => {
    // Beide fouten tegelijk uitgesloten: de inkomst van +6.000 gaat eraf, de
    // positieve split-regels tellen gewoon op.
    const map = buildSpendingSums(
      [
        { budget_id: 'a', amount: -1265, ownership: 'personal' },
        { budget_id: 'a', amount: 6000, ownership: 'personal' },
      ],
      [{ budget_id: 'a', amount: 100, ownership: 'personal' }],
      EXPENSE_TYPES,
    )
    expect(map.get('a')).toEqual({ personalSum: 1265 - 6000 + 100, sharedSum: 0 })
  })

  it('slaat de parent-rij van een split over (bedragen leven op de splits)', () => {
    const map = buildSpendingSums(
      [
        { budget_id: 'a', amount: -100, ownership: 'personal', is_split: true },
        { budget_id: 'b', amount: -20, ownership: 'personal' },
      ],
      [{ budget_id: 'a', amount: 60, ownership: 'personal' }],
      EXPENSE_TYPES,
    )
    expect(map.get('a')).toEqual({ personalSum: 60, sharedSum: 0 })
    expect(map.get('b')).toEqual({ personalSum: 20, sharedSum: 0 })
  })

  it('lege input → lege map', () => {
    expect(buildSpendingSums([], [], EXPENSE_TYPES).size).toBe(0)
  })

  it('een budget met alleen inkomsten krijgt een negatieve som', () => {
    const map = buildSpendingSums([{ budget_id: 'a', amount: 6000, ownership: 'personal' }], [], EXPENSE_TYPES)
    expect(map.get('a')).toEqual({ personalSum: -6000, sharedSum: 0 })
  })

  it('een income-budget houdt zijn positieve rij, ook per ownership', () => {
    // REGRESSIE: de inkomst-uitsluiting geldt alleen op een uitgaven-budget.
    const map = buildSpendingSums(
      [
        { budget_id: 'salaris', amount: 4328.81, ownership: 'personal' },
        { budget_id: 'salaris', amount: 73, ownership: 'shared' },
      ],
      [],
      new Map([['salaris', 'income']]),
    )
    expect(map.get('salaris')).toEqual({ personalSum: 4328.81, sharedSum: 73 })
  })

  it('een archive-budget houdt zijn transfers', () => {
    const map = buildSpendingSums(
      [
        { budget_id: 'eigen-rekening', amount: -200, ownership: 'personal', transaction_type: 'transfer' },
        { budget_id: 'eigen-rekening', amount: -77.56, ownership: 'personal', transaction_type: 'joint_transfer' },
      ],
      [],
      new Map([['eigen-rekening', 'archive']]),
    )
    expect(map.get('eigen-rekening')).toEqual({ personalSum: 277.56, sharedSum: 0 })
  })

  it('integreert met combineSpending over alle perspectieven', () => {
    const map = buildSpendingSums(
      [
        { budget_id: 'a', amount: -100, ownership: 'personal' },
        { budget_id: 'a', amount: -200, ownership: 'shared' },
      ],
      [],
      EXPENSE_TYPES,
    )
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
