import { describe, it, expect } from 'vitest'
import {
  sanitizeCashSettingsInput,
  recomputeFireFromSettings,
  parseCashflowBasisPrefs,
  resolveBudgetBasisFromProfile,
  MAX_EXCLUDED_BUDGET_IDS,
} from './cashflow-settings'
import type { FinancialInput } from './core-metrics'

// `budgets.id` is een uuid; de parser weigert sinds de security-review elke
// andere vorm, dus de fixtures gebruiken echte uuid's.
const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const UUID_C = '33333333-3333-4333-8333-333333333333'
import type { BudgetBasisRow } from './budget-basis'

describe('sanitizeCashSettingsInput', () => {
  it('whitelist en clamp: accepteert geldige getallen, negeert rommel', () => {
    const out = sanitizeCashSettingsInput({
      net_monthly_income: '3500',
      estimated_monthly_expenses: 2800,
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: 30000,
      target_savings_rate: 30, // ronde 4, besluit 3: bewust GEDROPT (goals is dé bron)
      hack: 'DROP TABLE', // onbekend veld wordt genegeerd (Record<string, unknown> accepteert het)
    })
    expect(out).toEqual({
      net_monthly_income: 3500,
      estimated_monthly_expenses: 2800,
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: 30000,
      // target_savings_rate valt bewust weg — PUT /api/parameters schrijft de
      // (DEPRECATED) profielkolom niet meer.
    })
  })

  it('weigert ongeldige method en out-of-range waarden', () => {
    const out = sanitizeCashSettingsInput({
      net_monthly_income: -5,
      retirement_expense_method: 'nonsense',
      target_savings_rate: 250,
    })
    expect(out).toEqual({})
  })

  it('negeert target_savings_rate volledig (goals is dé bron — ronde 4, besluit 3)', () => {
    // Zowel een geldige waarde als een null (voorheen "doel wissen") worden nu
    // stilzwijgend genegeerd; de kolom is DEPRECATED en wordt niet meer geschreven.
    expect(sanitizeCashSettingsInput({ target_savings_rate: 30 })).toEqual({})
    expect(sanitizeCashSettingsInput({ target_savings_rate: null })).toEqual({})
  })

  it('accepteert de VOLLEDIGE bron-union van ADR 0103', () => {
    for (const v of ['auto', 'budget', 'transaction', 'manual']) {
      expect(sanitizeCashSettingsInput({ income_source: v, expenses_source: v })).toEqual({
        income_source: v,
        expenses_source: v,
      })
    }
  })

  it('weigert een onbekende bronwaarde (die zou stil in een else-tak belanden)', () => {
    expect(sanitizeCashSettingsInput({ income_source: 'budgetten', expenses_source: 42 })).toEqual({})
  })

  it('bronwaarde én selectie landen in ÉÉN sanitize-uitkomst (dus één PUT)', () => {
    const out = sanitizeCashSettingsInput({
      income_source: 'budget',
      cashflow_basis_prefs: { v: 1, excludedIncomeBudgetIds: [UUID_A], excludedExpenseBudgetIds: [] },
    })
    expect(out).toEqual({
      income_source: 'budget',
      cashflow_basis_prefs: { v: 1, excludedIncomeBudgetIds: [UUID_A], excludedExpenseBudgetIds: [] },
    })
  })

  it('een onbruikbare selectie wordt NIET geschreven (veld valt weg), de bronwaarde wel', () => {
    const out = sanitizeCashSettingsInput({ income_source: 'budget', cashflow_basis_prefs: 'rommel' })
    expect(out).toEqual({ income_source: 'budget' })
  })
})

describe('parseCashflowBasisPrefs — defensieve schrijfpoort', () => {
  it('leest een geldige v1-payload', () => {
    expect(
      parseCashflowBasisPrefs({
        v: 1,
        excludedIncomeBudgetIds: [UUID_A, UUID_B],
        excludedExpenseBudgetIds: [UUID_C],
      }),
    ).toEqual({ v: 1, excludedIncomeBudgetIds: [UUID_A, UUID_B], excludedExpenseBudgetIds: [UUID_C] })
  })

  it('onbekende vorm → null (veld wordt niet geschreven, geen fout)', () => {
    for (const raw of [null, undefined, 'x', 42, [], { v: 2 }, { v: '1' }, {}]) {
      expect(parseCashflowBasisPrefs(raw)).toBeNull()
    }
  })

  it('ontbrekende lijsten worden lege lijsten', () => {
    expect(parseCashflowBasisPrefs({ v: 1 })).toEqual({
      v: 1,
      excludedIncomeBudgetIds: [],
      excludedExpenseBudgetIds: [],
    })
  })

  it('niet-strings eruit, getrimd, ontdubbeld', () => {
    const out = parseCashflowBasisPrefs({
      v: 1,
      excludedIncomeBudgetIds: [UUID_A, UUID_A, ` ${UUID_B} `, '', 3, null, { id: UUID_C }],
      excludedExpenseBudgetIds: 'geen array',
    })
    expect(out).toEqual({ v: 1, excludedIncomeBudgetIds: [UUID_A, UUID_B], excludedExpenseBudgetIds: [] })
  })

  it('niet-uuid-strings vallen weg — budgets.id is een uuid, dus de rest is betekenisloos', () => {
    // Zonder deze vormcontrole begrensde MAX_EXCLUDED_BUDGET_IDS alleen het
    // AANTAL id\'s en niet hun inhoud.
    const out = parseCashflowBasisPrefs({
      v: 1,
      excludedIncomeBudgetIds: ['a', 'DROP TABLE budgets', '../../etc/passwd', 'x'.repeat(5000), UUID_A],
      excludedExpenseBudgetIds: [],
    })
    expect(out).toEqual({ v: 1, excludedIncomeBudgetIds: [UUID_A], excludedExpenseBudgetIds: [] })
  })

  it('accepteert hoofdletter-uuid\'s (Postgres doet dat ook)', () => {
    const out = parseCashflowBasisPrefs({ v: 1, excludedIncomeBudgetIds: [UUID_A.toUpperCase()] })
    expect(out?.excludedIncomeBudgetIds).toEqual([UUID_A.toUpperCase()])
  })

  it('kapt af op een redelijke maximumlengte', () => {
    const many = Array.from({ length: MAX_EXCLUDED_BUDGET_IDS + 50 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    )
    const out = parseCashflowBasisPrefs({ v: 1, excludedIncomeBudgetIds: many })
    expect(out?.excludedIncomeBudgetIds).toHaveLength(MAX_EXCLUDED_BUDGET_IDS)
  })

  it('onbekende/verwijderde budget-id\'s leveren NOOIT een fout op', () => {
    const out = parseCashflowBasisPrefs({
      v: 1,
      excludedIncomeBudgetIds: ['00000000-0000-0000-0000-000000000000'],
      excludedExpenseBudgetIds: [],
    })
    expect(out?.excludedIncomeBudgetIds).toEqual(['00000000-0000-0000-0000-000000000000'])
  })
})

describe('resolveBudgetBasisFromProfile — de gedeelde samenstelling achter R1/R5', () => {
  function row(p: Partial<BudgetBasisRow> & { id: string }): BudgetBasisRow {
    return {
      parent_id: null,
      budget_type: 'expense',
      name: p.id,
      default_limit: 0,
      interval: 'monthly',
      is_archived: false,
      merged_into: null,
      ...p,
    }
  }

  it('R1: gebruiker ZONDER budgetten en zonder prefs → beide kanten EMPTY (monthlyTotal 0)', () => {
    const { income, expenses } = resolveBudgetBasisFromProfile({ id: 'u' }, [])
    expect(income).toEqual({
      annualTotal: 0, monthlyTotal: 0, entries: [], hasBudgets: false, allExcluded: false,
      // Meetvenster-velden van de realisatie-grondslag (correctie 11 aug 2026);
      // zonder realisatie-invoer staan ze op het lege venster.
      realizedWindowMonths: 12, truncationSuspected: false,
    })
    expect(expenses).toEqual(income)
  })

  it('null/undefined profiel gedraagt zich als "geen prefs" — geen crash, alles telt mee', () => {
    const budgets = [row({ id: 'i', budget_type: 'income', default_limit: 3000 })]
    expect(resolveBudgetBasisFromProfile(null, budgets).income.annualTotal).toBe(36000)
    expect(resolveBudgetBasisFromProfile(undefined, budgets).income.annualTotal).toBe(36000)
  })

  it('leest de uitsluitlijst PER KANT uit profiles.cashflow_basis_prefs — inkomen en uitgaven onafhankelijk', () => {
    // Het uitgesloten id MOET uuid-vormig zijn: `parseCashflowBasisPrefs` weigert
    // sinds de security-review elke andere vorm (budgets.id is een uuid, dus een
    // niet-uuid is per definitie een betekenisloze uitsluiting). Assertions en
    // bedragen hieronder zijn ongewijzigd — alleen het id-literal is echt.
    const budgets = [
      row({ id: UUID_A, budget_type: 'income', default_limit: 4000 }),
      row({ id: 'exp', budget_type: 'expense', default_limit: 1500 }),
    ]
    const profile = {
      cashflow_basis_prefs: {
        v: 1,
        excludedIncomeBudgetIds: [UUID_A],
        excludedExpenseBudgetIds: [], // uitgaven blijven aangevinkt
      },
    }
    const { income, expenses } = resolveBudgetBasisFromProfile(profile, budgets)
    expect(income.annualTotal).toBe(0) // uitgesloten
    expect(income.allExcluded).toBe(true)
    expect(expenses.annualTotal).toBe(18000) // ongemoeid
  })

  it('een onbekende/kapotte cashflow_basis_prefs-vorm valt terug op "niets uitgesloten" (defensieve parser)', () => {
    const budgets = [row({ id: 'i', budget_type: 'income', default_limit: 1000 })]
    const profile = { cashflow_basis_prefs: 'rommel' }
    expect(resolveBudgetBasisFromProfile(profile, budgets).income.annualTotal).toBe(12000)
  })

  it('geeft shareFractionById door aan beide kanten (huishoud-gedeeld budget op eigen aandeel)', () => {
    const budgets = [
      row({ id: 'shared-inc', budget_type: 'income', default_limit: 2000 }),
      row({ id: 'shared-exp', budget_type: 'expense', default_limit: 1000 }),
    ]
    const { income, expenses } = resolveBudgetBasisFromProfile({ id: 'u' }, budgets, {
      shareFractionById: { 'shared-inc': 0.5, 'shared-exp': 0.5 },
    })
    expect(income.annualTotal).toBe(2000 * 12 * 0.5)
    expect(expenses.annualTotal).toBe(1000 * 12 * 0.5)
  })
})

describe('recomputeFireFromSettings', () => {
  const base: FinancialInput = {
    totalAssets: 100_000,
    totalDebts: 0,
    monthlyIncome: 3000,
    monthlyExpenses: 2000,
    yearlyMustExpenses: 24_000,
    monthlyContributions: 1000,
    dateOfBirth: '1990-01-01',
  }
  const params = {
    grossReturn: 0.07,
    effectiveSwr: 0.035,
    inflationRate: 0.02,
    retirementMethod: 'essential_budgets' as const,
    retirementCustomAmount: 0,
    budgetingActive: true,
    yearlyMustExpenses: 24_000,
    fireStrategy: { strategy: 'perpetual' as const, endAge: 95 },
  }

  it('hoger inkomen → eerdere of gelijke FIRE-leeftijd', () => {
    const low = recomputeFireFromSettings(base, { monthlyIncome: 3000, monthlyExpenses: 2000 }, params)
    const high = recomputeFireFromSettings(base, { monthlyIncome: 5000, monthlyExpenses: 2000 }, params)
    expect(low.fireAge).not.toBeNull()
    expect(high.fireAge).not.toBeNull()
    expect((high.fireAge as number)).toBeLessThanOrEqual(low.fireAge as number)
  })

  it('zonder budgetteren: uitgaven-schatting voedt het FIRE-doel', () => {
    const noBudget = { ...params, budgetingActive: false }
    const cheap = recomputeFireFromSettings(base, { monthlyIncome: 3000, monthlyExpenses: 1500 }, noBudget)
    const pricey = recomputeFireFromSettings(base, { monthlyIncome: 3000, monthlyExpenses: 3000 }, noBudget)
    expect(pricey.fireTarget).toBeGreaterThan(cheap.fireTarget)
  })
})
