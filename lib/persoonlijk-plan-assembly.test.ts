import { describe, it, expect } from 'vitest'
import {
  buildPersoonlijkPlanSections,
  type PersoonlijkPlanProfileRow,
  type PersoonlijkPlanBudgetRow,
} from './persoonlijk-plan-assembly'

/**
 * Regressieslot — Notion "Persoonlijk plan telt Inkomen + Sparen mee als
 * essentiële uitgave" (P1/S1).
 *
 * `essentialParents` in `buildPersoonlijkPlanSections` filterde alleen op
 * `is_essential === true` zonder `budget_type === 'expense'`. Daardoor telden
 * essentiële Inkomen- en Sparen-parents mee als "must expense": bij persona
 * Willem €127.140/jaar i.p.v. de correcte €13.140/jaar.
 *
 * Deze functie is de ENIGE bron voor de aannames-blokken van BEIDE rapporten
 * (`GET /api/report/persoonlijk-plan` én — via `assembleTotaalplan` —
 * `GET /api/report/totaalplan`), dus één fix dekt beide oppervlakken. De
 * totaalplan-kant wordt apart gepind in `lib/totaalplan-data.test.ts`.
 */

const PROFILE: PersoonlijkPlanProfileRow = {
  full_name: 'Willem',
  date_of_birth: '1979-04-12',
  household_type: 'single',
  number_of_children: 0,
  net_monthly_income: 6500,
  estimated_monthly_expenses: 1095,
  expected_return: 7,
  inflation_rate: 2,
  marginaal_tarief: null,
  fire_end_strategy: 'perpetual',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  retirement_expense_method: 'essential_budgets',
  retirement_expense_custom_amount: null,
  withdrawal_strategy: 'static',
  guardrail_floor: null,
  guardrail_ceiling: null,
  guardrail_cut_step: null,
  guardrail_raise_step: null,
  feature_preferences: null,
}

/**
 * Willem-achtige budgetset: drie echte essentiële uitgave-parents (€13.140/jr)
 * plus een essentieel Inkomen- en Sparen-parent die NIET mogen meetellen.
 */
const BUDGET_ROWS: PersoonlijkPlanBudgetRow[] = [
  { id: 'b-inkomen', parent_id: null, name: 'Inkomen', default_limit: 6500, interval: 'monthly', budget_type: 'income', is_essential: true },
  { id: 'b-wonen', parent_id: null, name: 'Vaste lasten wonen', default_limit: 455, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'b-dagelijks', parent_id: null, name: 'Dagelijkse uitgaven', default_limit: 410, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'b-vervoer', parent_id: null, name: 'Vervoer', default_limit: 230, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'b-sparen', parent_id: null, name: 'Sparen & investeren', default_limit: 3000, interval: 'monthly', budget_type: 'savings', is_essential: true },
  { id: 'b-schuld', parent_id: null, name: 'Schulden & aflossingen', default_limit: 0, interval: 'monthly', budget_type: 'debt', is_essential: true },
  // Niet-essentieel uitgave-budget → telt sowieso niet mee
  { id: 'b-vrijetijd', parent_id: null, name: 'Vrije tijd', default_limit: 300, interval: 'monthly', budget_type: 'expense', is_essential: false },
]

function build(budgetRows: PersoonlijkPlanBudgetRow[]) {
  return buildPersoonlijkPlanSections({
    profile: PROFILE,
    aowRows: [],
    events: [],
    budgetRows,
  })
}

describe('buildPersoonlijkPlanSections — essentiële uitgaven tellen alleen budget_type=expense', () => {
  it('sluit essentiële Inkomen- en Sparen-parents uit (€13.140 i.p.v. €127.140/jaar)', () => {
    const { uitgaven } = build(BUDGET_ROWS)

    // 455 + 410 + 230 = 1.095/mnd × 12 = 13.140
    expect(uitgaven.yearlyEssentialExpenses).toBe(13140)
    // Expliciet: NIET de oude bug-som (incl. Inkomen 78.000 + Sparen 36.000)
    expect(uitgaven.yearlyEssentialExpenses).not.toBe(127140)
  })

  it('laat het weghalen van de Inkomen-/Sparen-rijen het bedrag ONGEWIJZIGD (bewijs dat ze niet meetellen)', () => {
    const metInkomenEnSparen = build(BUDGET_ROWS).uitgaven.yearlyEssentialExpenses
    const zonder = build(
      BUDGET_ROWS.filter(b => !['b-inkomen', 'b-sparen'].includes(b.id)),
    ).uitgaven.yearlyEssentialExpenses

    expect(metInkomenEnSparen).toBe(zonder)
  })

  it('werkt door in de afgeleide velden (pensioenuitgave + %-van-huidig) — geen kunstmatig lage ratio', () => {
    const { uitgaven } = build(BUDGET_ROWS)

    // methode essential_budgets → pensioenuitgave == essentiële jaaruitgaven
    expect(uitgaven.yearlyRetirementExpenses).toBe(13140)
    expect(uitgaven.delta).toBe(0)
    // Vóór de fix was dit ≈10% (13.140/127.140); nu de correcte 100%.
    expect(uitgaven.pctOfCurrent).toBe(100)
  })

  it('sluit ook een essentieel debt-parent uit (zelfde grondslag als alle andere call-sites)', () => {
    const metDebt = build(BUDGET_ROWS).uitgaven.yearlyEssentialExpenses
    const zonderDebt = build(BUDGET_ROWS.filter(b => b.id !== 'b-schuld')).uitgaven.yearlyEssentialExpenses
    expect(metDebt).toBe(zonderDebt)

    // Ook met een debt-parent mét bedrag blijft de uitkomst gelijk
    const metDebtBedrag = build(
      BUDGET_ROWS.map(b => (b.id === 'b-schuld' ? { ...b, default_limit: 900 } : b)),
    ).uitgaven.yearlyEssentialExpenses
    expect(metDebtBedrag).toBe(13140)
  })

  it('telt essentiële CHILDREN van een uitgave-parent nog steeds mee (geen over-filtering)', () => {
    const rows: PersoonlijkPlanBudgetRow[] = [
      { id: 'p-wonen', parent_id: null, name: 'Wonen', default_limit: 1200, interval: 'monthly', budget_type: 'expense', is_essential: true },
      { id: 'c-huur', parent_id: 'p-wonen', name: 'Huur', default_limit: 900, interval: 'monthly', budget_type: 'expense', is_essential: true },
      { id: 'c-energie', parent_id: 'p-wonen', name: 'Energie', default_limit: 150, interval: 'monthly', budget_type: 'expense', is_essential: true },
      { id: 'c-deco', parent_id: 'p-wonen', name: 'Decoratie', default_limit: 50, interval: 'monthly', budget_type: 'expense', is_essential: false },
    ]
    // Alleen de essentiële children: (900 + 150) × 12
    expect(build(rows).uitgaven.yearlyEssentialExpenses).toBe(12600)
  })

  it('geeft 0 essentiële uitgaven bij een budgetset zonder essentiële uitgave-parents', () => {
    const rows = BUDGET_ROWS.filter(b => ['b-inkomen', 'b-sparen'].includes(b.id))
    const { uitgaven } = build(rows)
    expect(uitgaven.yearlyEssentialExpenses).toBe(0)
    // pctOfCurrent is null bij een deler van 0 (geen deling door nul)
    expect(uitgaven.pctOfCurrent).toBeNull()
  })
})
