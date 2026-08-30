import { describe, it, expect } from 'vitest'
import { buildCategorySpending, type SpendingPatternTxRow } from './spending-patterns'

/**
 * `buildCategorySpending` voedt VIER oppervlakken: de cloud
 * spending-patterns-context, de on-device chat, /api/spending-patterns en
 * /api/report. De transfer-uitsluiting en de richting/teken-regel horen daarom
 * IN de functie — bij twee van die vier stond het filter er eerder niet, en dat
 * verschil was op geen enkele manier zichtbaar.
 */

const BUDGETS = [
  { id: 'p1', name: 'Boodschappen', icon: 'cart', parent_id: null, budget_type: 'expense', is_essential: true },
  { id: 'c1', name: 'Supermarkt', icon: 'cart', parent_id: 'p1', budget_type: 'expense', is_essential: true },
  { id: 'p2', name: 'Los', icon: 'circle', parent_id: null, budget_type: 'expense', is_essential: false },
]

const tx = (over: Partial<SpendingPatternTxRow>): SpendingPatternTxRow => ({
  budget_id: 'c1',
  amount: -100,
  date: '2026-03-10',
  ...over,
})

describe('buildCategorySpending', () => {
  it('telt uitgaven per maand op het kind van de expense-ouder', () => {
    const [cat] = buildCategorySpending(
      [tx({ amount: -60 }), tx({ amount: -40 }), tx({ amount: -50, date: '2026-04-02' })],
      BUDGETS,
    )
    expect(cat.budgetName).toBe('Boodschappen')
    expect(cat.monthlyData.map((m) => [m.month, m.total])).toEqual([
      ['2026-03', 100],
      ['2026-04', 50],
    ])
  })

  // Het filter zit in de FUNCTIE: de aanroeper hoeft 'm niet te kennen.
  it('overboekingen tellen niet mee, ook zonder filter bij de aanroeper', () => {
    const [cat] = buildCategorySpending(
      [
        tx({ amount: -60 }),
        tx({ amount: -500, transaction_type: 'transfer' }),
        tx({ amount: -500, transaction_type: 'joint_transfer' }),
      ],
      BUDGETS,
    )
    expect(cat.monthlyData[0].total).toBe(60)
  })

  // NORM 30 aug 2026: op een uitgaven-budget gaat een inkomst ERAF. Vóór de
  // convergentie werd zo'n rij uitgesloten (`if (tx.is_income) continue`) en
  // bleef er 60 staan waar het scherm 20 toont.
  it('een inkomst gaat van de besteding af in plaats van uitgesloten te worden', () => {
    const [cat] = buildCategorySpending(
      [tx({ amount: -60 }), tx({ amount: 40, is_income: true })],
      BUDGETS,
    )
    expect(cat.monthlyData[0].total).toBe(20)
  })

  it('meer inkomsten dan uitgaven levert een negatief maandtotaal op — niet geklemd', () => {
    const [cat] = buildCategorySpending(
      [tx({ amount: -1265 }), tx({ amount: 8000, is_income: true })],
      BUDGETS,
    )
    expect(cat.monthlyData[0].total).toBe(-6735)
  })

  it('een ouder zonder kinderen telt zijn eigen boekingen', () => {
    const cats = buildCategorySpending([tx({ budget_id: 'p2', amount: -25 })], BUDGETS)
    const los = cats.find((c) => c.budgetId === 'p2')!
    expect(los.monthlyData[0].total).toBe(25)
  })
})
