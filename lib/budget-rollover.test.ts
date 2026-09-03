import { describe, it, expect } from 'vitest'
import { buildAutoRolloverInserts, computeEffectiveLimit, computeRollover, type BudgetRollover, type BudgetAmountOverride } from './budget-rollover'

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

/**
 * Regressie bij WF-BUDGET-14-bug1 (S1, 16 aug 2026).
 *
 * Repro: een budget op "Doorschuiven" met een vorige-maand-overschot vuurde bij
 * het laden van de budgetpagina een POST naar `budget_rollovers` af met body
 * `{budget_id, period, carried_amount, rollover_type}` — ZONDER `user_id`. De
 * INSERT-policy (`with check ((select auth.uid()) = user_id)`) wees die af met
 * 42501/403, de client las het resultaat niet uit, en de sectie "Overgedragen
 * saldo" verscheen daardoor nooit — waarmee ook de handmatige override
 * onbereikbaar bleef.
 *
 * De bestaande cases hierboven dekten alleen de pure `computeRollover`; die
 * logica was en is correct. Wat ontbrak was dekking op de PAYLOAD-vorm die
 * daadwerkelijk de RLS-poort passeert. Vandaar dat deze cases op
 * `buildAutoRolloverInserts` zitten.
 */
describe('buildAutoRolloverInserts — insert-payload voor de auto-berekening', () => {
  const USER = 'user-1'

  function childBudget(over: Partial<{
    id: string
    default_limit: number | string | null
    rollover_type: string | null
    user_id: string | null
  }> = {}) {
    return {
      id: 'b1',
      default_limit: 560,
      rollover_type: 'carry-over',
      user_id: USER,
      ...over,
    }
  }

  it('zet user_id op elke rij — zonder dat weigert de RLS-policy de insert', () => {
    const rows = buildAutoRolloverInserts({
      userId: USER,
      childBudgets: [childBudget()],
      prevSpending: { b1: 512.22 },
      prevRollovers: [],
      prevPeriod: '2026-07',
      currentPeriod: '2026-08',
    })

    expect(rows).toHaveLength(1)
    // Exact de vorm die de live repro als 403 zag terugkomen, nu mét eigenaar.
    expect(rows[0]).toMatchObject({
      user_id: USER,
      budget_id: 'b1',
      period: '2026-08',
      rollover_type: 'carry-over',
    })
    expect(rows[0].carried_amount).toBeCloseTo(47.78, 6)
    // Expliciet, want dit ENE veld was de hele bug.
    expect(rows[0].user_id).toBe(USER)
    expect(Object.keys(rows[0]).sort()).toEqual(
      ['budget_id', 'carried_amount', 'period', 'rollover_type', 'user_id'],
    )
  })

  it('schrijft niets weg zonder ingelogde gebruiker (RLS zou het toch weigeren)', () => {
    for (const userId of [null, undefined, '']) {
      expect(
        buildAutoRolloverInserts({
          userId,
          childBudgets: [childBudget()],
          prevSpending: { b1: 0 },
          prevRollovers: [],
          prevPeriod: '2026-07',
          currentPeriod: '2026-08',
        }),
      ).toEqual([])
    }
  })

  it('slaat reset-budgetten en budgetten van een ander over (creator-gate)', () => {
    const rows = buildAutoRolloverInserts({
      userId: USER,
      childBudgets: [
        childBudget({ id: 'reset', rollover_type: 'reset' }),
        childBudget({ id: 'van-partner', user_id: 'user-2' }),
        childBudget({ id: 'gedeeld-zonder-eigenaar', user_id: null }),
        childBudget({ id: 'mijn' }),
      ],
      prevSpending: {},
      prevRollovers: [],
      prevPeriod: '2026-07',
      currentPeriod: '2026-08',
    })

    expect(rows.map(r => r.budget_id)).toEqual(['gedeeld-zonder-eigenaar', 'mijn'])
    expect(rows.every(r => r.user_id === USER)).toBe(true)
  })

  it('laat een budget zonder overschot weg (carry 0 → geen rij)', () => {
    expect(
      buildAutoRolloverInserts({
        userId: USER,
        childBudgets: [childBudget()],
        prevSpending: { b1: 700 },
        prevRollovers: [],
        prevPeriod: '2026-07',
        currentPeriod: '2026-08',
      }),
    ).toEqual([])
  })

  it('neemt de vorige carry PER BUDGET mee, niet die van een willekeurig ander budget', () => {
    // `prevRollovers` komt ongefilterd uit de DB: alle budgetten van die
    // periode. Zonder indexering pakte de opzoeker de eerste rij die op periode
    // matchte — hier die van 'ander' — en schreef die carry permanent op b1.
    const prevRollovers: BudgetRollover[] = [
      {
        id: 'r-ander', user_id: USER, budget_id: 'ander', period: '2026-07',
        carried_amount: 900, rollover_type: 'carry-over', created_at: '2026-07-01T00:00:00Z',
      },
      {
        id: 'r-b1', user_id: USER, budget_id: 'b1', period: '2026-07',
        carried_amount: 40, rollover_type: 'carry-over', created_at: '2026-07-01T00:00:00Z',
      },
    ]

    const rows = buildAutoRolloverInserts({
      userId: USER,
      childBudgets: [childBudget()],
      prevSpending: { b1: 560 },
      prevRollovers,
      prevPeriod: '2026-07',
      currentPeriod: '2026-08',
    })

    // 560 limiet + 40 eigen carry − 560 besteed = 40. Met de carry van 'ander'
    // zou hier 900 staan.
    expect(rows).toHaveLength(1)
    expect(rows[0].carried_amount).toBe(40)
  })
})
