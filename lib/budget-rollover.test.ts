import { describe, it, expect } from 'vitest'
import { computeEffectiveLimit, computeRollover, type BudgetRollover, type BudgetAmountOverride } from './budget-rollover'

// Regressie: de effectieve-limiet is de ENE bron die zowel de budgetten-pagina
// (budgets-client) als de heatmap-widget (dashboard-data-loader) consumeren.
// Voorheen rekende de widget "beschikbaar" met alléén default_limit — waardoor
// carry-over en periode-overrides op het dashboard ontbraken ("twee schermen,
// twee sommen"). Deze cases borgen dat computeEffectiveLimit beide meeneemt.

const PERIOD = '2026-07'
const DISPLAY = '2026-07-01'

function rollover(carried: number, period = PERIOD): BudgetRollover {
  return {
    id: 'r1',
    user_id: 'u1',
    budget_id: 'b1',
    period,
    carried_amount: carried,
    rollover_type: 'carry-over',
    created_at: '2026-07-01T00:00:00Z',
  }
}

function override(amount: number, effective_from: string): BudgetAmountOverride {
  return { budget_id: 'b1', effective_from, amount }
}

describe('computeEffectiveLimit', () => {
  it('valt terug op default_limit zonder carry of override', () => {
    expect(
      computeEffectiveLimit({
        defaultLimit: 500,
        rollovers: [],
        amountOverrides: [],
        period: PERIOD,
        displayDate: DISPLAY,
      }),
    ).toBe(500)
  })

  it('telt carry-over uit de huidige periode op (dashboard-parity met de pagina)', () => {
    expect(
      computeEffectiveLimit({
        defaultLimit: 500,
        rollovers: [rollover(75)],
        amountOverrides: [],
        period: PERIOD,
        displayDate: DISPLAY,
      }),
    ).toBe(575)
  })

  it('gebruikt de meest recente periode-override i.p.v. default_limit', () => {
    expect(
      computeEffectiveLimit({
        defaultLimit: 500,
        rollovers: [],
        amountOverrides: [override(400, '2026-05-01'), override(650, '2026-07-01')],
        period: PERIOD,
        displayDate: DISPLAY,
      }),
    ).toBe(650)
  })

  it('negeert een override die pas ná displayDate ingaat', () => {
    expect(
      computeEffectiveLimit({
        defaultLimit: 500,
        rollovers: [],
        amountOverrides: [override(900, '2026-08-01')],
        period: PERIOD,
        displayDate: DISPLAY,
      }),
    ).toBe(500)
  })

  it('combineert override-basis + carry in single-month', () => {
    expect(
      computeEffectiveLimit({
        defaultLimit: 500,
        rollovers: [rollover(50)],
        amountOverrides: [override(650, '2026-07-01')],
        period: PERIOD,
        displayDate: DISPLAY,
      }),
    ).toBe(700)
  })

  it('schaalt over meerdere maanden en negeert carry (rollover geldt per maand)', () => {
    expect(
      computeEffectiveLimit({
        defaultLimit: 500,
        rollovers: [rollover(50)],
        amountOverrides: [],
        period: PERIOD,
        displayDate: DISPLAY,
        periodMonthCount: 3,
      }),
    ).toBe(1500)
  })

  it('past het pro-rata huishoud-aandeel toe op (basis + carry)', () => {
    expect(
      computeEffectiveLimit({
        defaultLimit: 500,
        rollovers: [rollover(100)],
        amountOverrides: [],
        period: PERIOD,
        displayDate: DISPLAY,
        shareFraction: 0.5,
      }),
    ).toBe(300)
  })
})

describe('computeRollover — negatieve besteding mag de carry niet opblazen', () => {
  // Sinds de norm van 30 aug 2026 kan de bestedingssom van een uitgaven-budget
  // NEGATIEF zijn (meer inkomsten dan uitgaven). Zonder klem zou
  // `Math.max(0, effectiveLimit - spent)` de carry boven de limiet tillen — en
  // die carry wordt PERMANENT weggeschreven in budget_rollovers (UNIQUE op
  // budget_id+period). De klem zit IN computeRollover, dus deze tests geven de
  // rauwe negatieve som door: haalt iemand de klem weg, dan vallen ze om.

  it('een negatieve maand levert hoogstens de volle limiet', () => {
    const { carry } = computeRollover(1642, -6735, 0, 'carry-over')
    expect(carry).toBe(1642)
    expect(carry).toBeLessThanOrEqual(1642)
  })

  it('een extreem negatieve maand tilt de carry niet verder op', () => {
    expect(computeRollover(1642, -1_000_000, 0, 'carry-over').carry).toBe(1642)
  })

  it('verandert niets aan een gewone positieve maand', () => {
    expect(computeRollover(1642, 1265, 0, 'carry-over').carry).toBe(377)
  })

  it('respecteert de vorige carry en blijft binnen basis + carry', () => {
    expect(computeRollover(1642, -6735, 200, 'carry-over').carry).toBe(1842)
  })

  it('invest-sweep sweept hoogstens de volle limiet', () => {
    const { carry, swept } = computeRollover(1642, -6735, 0, 'invest-sweep')
    expect(carry).toBe(0)
    expect(swept).toBe(1642)
  })

  it('reset blijft 0, ook bij een negatieve maand', () => {
    expect(computeRollover(1642, -6735, 0, 'reset')).toEqual({ carry: 0, swept: 0 })
  })
})
