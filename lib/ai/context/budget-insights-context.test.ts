import { describe, it, expect } from 'vitest'
import { buildBudgetAlerts, type BudgetAlertRow } from './budget-insights-context'

/**
 * De OVER-/BIJNA-VOL-regels die in Fins prompt belanden. Sinds de norm van
 * 30 aug 2026 (lib/budget-spending.ts) is "besteed" een GETEKENDE som — en een
 * budget waar netto geld binnenkwam kan dus nooit "over budget" zijn.
 */

const BUDGETS: BudgetAlertRow[] = [
  { id: 'b1', name: 'Boodschappen', default_limit: 400 },
  { id: 'b2', name: 'Uit eten', default_limit: 200 },
  { id: 'b3', name: 'Zonder limiet', default_limit: 0 },
]

describe('buildBudgetAlerts', () => {
  it('meldt een overschrijding mét de staart boven de 100%', () => {
    const { exceeded, nearlyFull } = buildBudgetAlerts(BUDGETS, { b1: 520 })
    expect(exceeded).toEqual(['Boodschappen: €520/€400 (130% — OVER)'])
    expect(nearlyFull).toEqual([])
  })

  it('meldt bijna-vol vanaf 80%', () => {
    const { exceeded, nearlyFull } = buildBudgetAlerts(BUDGETS, { b2: 170 })
    expect(exceeded).toEqual([])
    expect(nearlyFull).toEqual(['Uit eten: €170/€200 (85% — BIJNA VOL)'])
  })

  // Het gemelde scenario: uitgave 1.265, inkomsten 8.000 op hetzelfde
  // uitgaven-budget ⇒ besteed −6.735. Vóór de convergentie werden de inkomsten
  // UITGESLOTEN i.p.v. afgetrokken, waardoor de prompt "Boodschappen: €1.265/€400
  // (316% — OVER)" droeg terwijl het scherm −€6.735 toonde.
  it('een budget met netto inkomsten levert GEEN over-budget-regel op', () => {
    const { exceeded, nearlyFull } = buildBudgetAlerts(BUDGETS, { b1: -6735 })
    expect(exceeded).toEqual([])
    expect(nearlyFull).toEqual([])
  })

  it('een budget zonder besteding levert geen regel op', () => {
    expect(buildBudgetAlerts(BUDGETS, { b1: 0 })).toEqual({ exceeded: [], nearlyFull: [] })
  })

  it('zonder limiet geen alert', () => {
    expect(buildBudgetAlerts(BUDGETS, { b3: 999 })).toEqual({ exceeded: [], nearlyFull: [] })
  })
})
