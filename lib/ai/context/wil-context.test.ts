import { describe, it, expect } from 'vitest'
import {
  formatGoalAmount,
  selectOptimizationOpportunities,
  type OptimizationBudgetRow,
} from './wil-context'

// ADR 0145 (context-formattering): doelwaarden gaan in de EENHEID van het doeltype de
// prompt in — een dekkings- of spaarquote-doel niet meer als "€78/€100".
describe('formatGoalAmount', () => {
  it('formatteert per doeltype: %, jaar, EUR/mnd', () => {
    expect(formatGoalAmount(78.4, 'plan_coverage')).toBe('78,4%')
    expect(formatGoalAmount(100, 'plan_coverage')).toBe('100,0%')
    expect(formatGoalAmount(45, 'savings_rate')).toBe('45,0%')
    expect(formatGoalAmount(58.5, 'fire_age')).toBe('58,5 jaar')
    expect(formatGoalAmount(1500, 'passive_income')).toBe('€1.500/mnd')
  })

  it('euro-doelen ongewijzigd; een niet-canoniek of ontbrekend type valt terug op euro', () => {
    expect(formatGoalAmount(25000, 'savings')).toBe('€25.000')
    expect(formatGoalAmount(25000, 'wealth')).toBe('€25.000')
    expect(formatGoalAmount(25000, null)).toBe('€25.000')
    expect(formatGoalAmount(25000, undefined)).toBe('€25.000')
  })
})

/**
 * De optimalisatiekansen die De Wil in zijn prompt krijgt. Sinds de norm van
 * 30 aug 2026 (lib/budget-spending.ts) is "besteed per budget" een GETEKENDE
 * som: op een uitgaven-budget gaat een inkomst er van AF. Daarmee kan een
 * budget netto negatief zijn — en dat is nooit een besparingskans.
 */

const BUDGETS: OptimizationBudgetRow[] = [
  // Niet-essentiële uitgaven-ouder → zijn kinderen zijn kandidaten.
  { id: 'vrij', parent_id: null, name: 'Vrije tijd', budget_type: 'expense', is_essential: false },
  { id: 'horeca', parent_id: 'vrij', name: 'Uit eten', budget_type: 'expense' },
  { id: 'hobby', parent_id: 'vrij', name: 'Hobby', budget_type: 'expense' },
  // Essentiële ouder → nooit een kans.
  { id: 'vast', parent_id: null, name: 'Vaste lasten', budget_type: 'expense', is_essential: true },
  { id: 'energie', parent_id: 'vast', name: 'Energie', budget_type: 'expense' },
  // Inkomen / sparen / schuld → geen besparingskansen.
  { id: 'ink', parent_id: null, name: 'Inkomen', budget_type: 'income', is_essential: false },
  { id: 'salaris', parent_id: 'ink', name: 'Salaris', budget_type: 'income' },
  { id: 'spaar', parent_id: null, name: 'Sparen', budget_type: 'savings', is_essential: false },
  { id: 'buffer', parent_id: 'spaar', name: 'Buffer', budget_type: 'savings' },
  { id: 'schuld', parent_id: null, name: 'Schulden', budget_type: 'debt', is_essential: false },
  { id: 'lening', parent_id: 'schuld', name: 'Lening', budget_type: 'debt' },
]

describe('selectOptimizationOpportunities', () => {
  it('neemt niet-essentiële subbudgetten met uitgaven mee', () => {
    const kansen = selectOptimizationOpportunities(BUDGETS, { horeca: 240, hobby: 60 })
    expect(kansen.map((k) => [k.name, k.spent])).toEqual([
      ['Uit eten', 240],
      ['Hobby', 60],
    ])
  })

  // DE REGEL: netto geld binnen is geen besparingskans. Zou dit filter
  // ontbreken, dan zet de prompt "Uit eten: €-6.735/mnd (= €-80.820/jaar
  // richting FIRE-doel)" — een advies om te besparen op een post die geld
  // ópleverde.
  it('een budget met NEGATIEVE netto-besteding is géén optimalisatiekans', () => {
    const kansen = selectOptimizationOpportunities(BUDGETS, { horeca: -6735, hobby: 60 })
    expect(kansen.map((k) => k.id)).toEqual(['hobby'])
  })

  it('een budget zonder besteding levert geen kans op', () => {
    expect(selectOptimizationOpportunities(BUDGETS, { horeca: 0 })).toEqual([])
  })

  it('essentiële, inkomsten-, spaar- en schuldouders leveren geen kansen op', () => {
    const kansen = selectOptimizationOpportunities(BUDGETS, {
      energie: 180,
      salaris: 3200,
      buffer: 500,
      lening: 400,
    })
    expect(kansen).toEqual([])
  })

  it('hoofdcategorieën zelf zijn geen kans — alleen subbudgetten', () => {
    expect(selectOptimizationOpportunities(BUDGETS, { vrij: 300 })).toEqual([])
  })
})
