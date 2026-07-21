/**
 * Gedeelde engine-checks voor de UAT-Reken-acceptatiecriteria (`reken.ts`).
 *
 * PURE module — geen vitest/DOM-afhankelijkheden — zodat dezelfde lijst
 * checks kan draaien onder:
 *  1. `reken.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)`.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-reken.ts`).
 *
 * Alle 8 checks roepen ÉCHTE productiefuncties aan — geen mirrors nodig in
 * deze zone (in tegenstelling tot RAPP/NAV, waar server-only routes/pages een
 * mirror afdwongen). De rekenhulp-evaluator, de twee standalone-tool-grafiek-
 * functies, de aspiraties-optelsom en de budget-/schuldrente-helpers zijn
 * allemaal pure, client-bundelbare functies met injecteerbare invoer.
 */

import { evaluateCalculator } from '@/lib/calculator/evaluate'
import { PREFAB_CALCULATORS } from '@/lib/calculator/prefab-definitions'
import { buildLifeEventDraft } from '@/lib/calculator/to-life-event'
import { weightedDebtRate } from '@/lib/horizon/whatif-beslishulp.model'
import type { Debt } from '@/lib/debt-data'
import { computeInflationErosion } from '@/lib/horizon/inflation-erosion'
import { computeCompoundInterest } from '@/lib/horizon/compound-interest'
import { computeYearlyMustExpenses, computeRetirementExpenses, type BudgetRow } from '@/lib/budget-utils'
import { computeAspirationTotal, type AspirationAnswers } from '@/lib/retirement-aspirations'
import { formatMaskedCurrency } from '@/lib/format'
import { REKEN_ACCEPTANCE } from './reken'
import type { AcceptanceCriterion } from './types'

export interface RekenEngineCheck {
  /** 'WF-REKEN-01' */
  workflow: string
  /** 'UAT-REKEN-01' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in reken.ts — gooit als reken.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = REKEN_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — reken.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in reken.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function fx(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

/** Minimale, geldige synthetische Debt-rij — alleen de velden die
 *  `weightedDebtRate` daadwerkelijk leest (`is_active`, `current_balance`,
 *  `interest_rate`) zijn betekenisvol; de rest is neutrale opvulling. */
function makeDebt(overrides: Partial<Debt> & Pick<Debt, 'current_balance' | 'interest_rate'>): Debt {
  return {
    id: 'debt-test',
    user_id: 'user-test',
    name: 'Test-schuld',
    debt_type: 'mortgage',
    original_amount: overrides.current_balance,
    minimum_payment: 0,
    monthly_payment: 0,
    start_date: '2020-01-01',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z',
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: null,
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: false,
    custom_aflossing_amount: null,
    has_hypotheekplanner_tracking: false,
    ...overrides,
  }
}

// ── Checks — één per 'exact'-workflow in REKEN_ACCEPTANCE ──────────────────

export const REKEN_ENGINE_CHECKS: RekenEngineCheck[] = [
  {
    workflow: 'WF-REKEN-01',
    scenarioId: 'UAT-REKEN-01',
    label: 'Rekenhulp "Aflossen vs. beleggen" (échte prefab + evaluateCalculator): maandbedrag=€500',
    run: () => {
      criterion('WF-REKEN-01')
      const prefab = PREFAB_CALCULATORS.find((p) => p.slug === 'aflossen-vs-beleggen')
      if (!prefab) throw new Error('Prefab "aflossen-vs-beleggen" niet gevonden in PREFAB_CALCULATORS')
      const inputValues = { maandbedrag: 500, hypotheekrente: 0.04, jaren: 15, schuld: 200000, maandlasten: 2500 }
      const result = evaluateCalculator(prefab.definition, inputValues, {})
      const aflossen = Math.round(result.values.aflossen.eindwaarde ?? 0)
      const beleggen5 = Math.round(result.values.beleggen_5.eindwaarde ?? 0)
      const beleggen8 = Math.round(result.values.beleggen_8.eindwaarde ?? 0)
      return {
        expected: 'aflossen=123045; beleggen5=133644; beleggen8=173019; winner=beleggen_8',
        actual: `aflossen=${aflossen}; beleggen5=${beleggen5}; beleggen8=${beleggen8}; winner=${result.winner}`,
      }
    },
  },
  {
    workflow: 'WF-REKEN-03',
    scenarioId: 'UAT-REKEN-03',
    label: 'Rekenhulp-uitkomst → levensgebeurtenis (buildLifeEventDraft): winnend bedrag €173.019, leeftijd 42',
    run: () => {
      criterion('WF-REKEN-03')
      const draft = buildLifeEventDraft({
        name: 'Aflossen vs. beleggen',
        targetAge: 42,
        impactKind: 'one_time_cost',
        amount: 173019,
      })
      return {
        expected: 'one_time_cost=173019; target_age=42; monthly_cost_change=0; monthly_income_change=0',
        actual: `one_time_cost=${draft.one_time_cost}; target_age=${draft.target_age}; monthly_cost_change=${draft.monthly_cost_change}; monthly_income_change=${draft.monthly_income_change}`,
      }
    },
  },
  {
    workflow: 'WF-REKEN-16',
    scenarioId: 'UAT-REKEN-16',
    label: 'Saldo-gewogen schuldrente (weightedDebtRate) op een schone synthetische 2-schuldenfixture',
    run: () => {
      criterion('WF-REKEN-16')
      const debts: Debt[] = [
        makeDebt({ id: 'd1', current_balance: 100000, interest_rate: 4 }),
        makeDebt({ id: 'd2', current_balance: 50000, interest_rate: 2 }),
        // Inactieve/lege schuld — moet genegeerd worden.
        makeDebt({ id: 'd3', current_balance: 0, interest_rate: 14 }),
        makeDebt({ id: 'd4', current_balance: 25000, interest_rate: 9, is_active: false }),
      ]
      const rate = weightedDebtRate(debts)
      return {
        expected: 'weightedDebtRate=3.33',
        actual: `weightedDebtRate=${fx((rate ?? 0) * 100, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-REKEN-20',
    scenarioId: 'UAT-REKEN-20',
    label: 'Actie-impact-badge = de sliderdelta zelf (formatMaskedCurrency, geen aparte motor)',
    run: () => {
      criterion('WF-REKEN-20')
      const monthlyDelta = 500
      const impact = `+${formatMaskedCurrency(monthlyDelta, false)}/mnd`
      return {
        // Intl.NumberFormat('nl-NL', {style:'currency'}) plaatst een
        // non-breaking space (U+00A0) tussen het valutasymbool en het bedrag.
        expected: '+€ 500/mnd',
        actual: impact,
      }
    },
  },
  {
    workflow: 'WF-REKEN-21',
    scenarioId: 'UAT-REKEN-21',
    label: 'Inflatie & koopkracht (computeInflationErosion): €20.000 @ 3% over 30 jaar (Marijke, daguitgaven €91,98)',
    run: () => {
      criterion('WF-REKEN-21')
      const dailyExpenses = 2800 / 30.44
      const rows = computeInflationErosion(20000, 0.03, 30, dailyExpenses)
      const y10 = rows[10]
      const y20 = rows[20]
      const y30 = rows[30]
      const y30LossPct = Math.round((1 - y30.realValue / 20000) * 100)
      const y30FreedomMonths = y30.freedomDays / 30.44
      return {
        expected: 'y10=14882; y20=11074; y30=8240; y30LossPct=59; y30FreedomMonths=2.9',
        actual: `y10=${Math.round(y10.realValue)}; y20=${Math.round(y20.realValue)}; y30=${Math.round(y30.realValue)}; y30LossPct=${y30LossPct}; y30FreedomMonths=${fx(y30FreedomMonths, 1)}`,
      }
    },
  },
  {
    workflow: 'WF-REKEN-22',
    scenarioId: 'UAT-REKEN-22',
    label: 'Samengestelde interest (computeCompoundInterest): €600/mnd @ 5% (Marijke)',
    run: () => {
      criterion('WF-REKEN-22')
      const rows20 = computeCompoundInterest(600, 0.05, 20)
      const rows10 = computeCompoundInterest(600, 0.05, 10)
      const rows30 = computeCompoundInterest(600, 0.05, 30)
      const y20 = rows20.find((r) => r.year === 20)!
      const y10 = rows10.find((r) => r.year === 10)!
      const y30 = rows30.find((r) => r.year === 30)!
      return {
        expected: 'y10=93169; y20=246620; y30=499355; y20Deposits=144000; y20Returns=102620',
        actual: `y10=${Math.round(y10.totalValue)}; y20=${Math.round(y20.totalValue)}; y30=${Math.round(y30.totalValue)}; y20Deposits=${y20.totalDeposits}; y20Returns=${Math.round(y20.totalReturns)}`,
      }
    },
  },
  {
    workflow: 'WF-REKEN-23',
    scenarioId: 'UAT-REKEN-23',
    label: 'Uitgave na pensioen — methode-preview (computeYearlyMustExpenses/computeRetirementExpenses, Marijke)',
    run: () => {
      criterion('WF-REKEN-23')
      const essentialParents: BudgetRow[] = [
        { id: 'b1', name: 'Vaste lasten wonen', default_limit: 390, interval: 'monthly', budget_type: 'expense', is_essential: true },
        { id: 'b2', name: 'Dagelijkse uitgaven', default_limit: 430, interval: 'monthly', budget_type: 'expense', is_essential: true },
        { id: 'b3', name: 'Vervoer', default_limit: 130, interval: 'monthly', budget_type: 'expense', is_essential: true },
      ]
      const { yearlyMustExpenses } = computeYearlyMustExpenses(essentialParents, [])
      const behoudVanInkomen = computeRetirementExpenses('current_income', yearlyMustExpenses, 3400 * 12)
      const essentieleBudgetten = computeRetirementExpenses('essential_budgets', yearlyMustExpenses, 3400 * 12)
      const zelfSamenstellen = computeRetirementExpenses('custom_amount', yearlyMustExpenses, 3400 * 12, 2800 * 12)
      return {
        expected: 'behoudVanInkomen=40800; essentieleBudgetten=11400; zelfSamenstellen=33600',
        actual: `behoudVanInkomen=${behoudVanInkomen}; essentieleBudgetten=${essentieleBudgetten}; zelfSamenstellen=${zelfSamenstellen}`,
      }
    },
  },
  {
    workflow: 'WF-REKEN-24',
    scenarioId: 'UAT-REKEN-24',
    label: 'Aspiraties-vragenlijst (computeAspirationTotal, Marijke): reizen/auto/uit eten/hobby\'s/zorg → €22.100/jaar',
    run: () => {
      criterion('WF-REKEN-24')
      const answers: AspirationAnswers = {
        travelersCount: 2,
        travel: 'eu',
        travelCustomWeeks: null,
        car: 'mid',
        diningPerMonth: 4,
        culturePerMonth: 2,
        diningPersons: 2,
        hobbies: [
          { id: 'tuin', yearly: 600 },
          { id: 'sport', yearly: 1500 },
        ],
        customDreams: [],
        care: 'comfort',
        nursingTopUp: false,
        unexpectedBuffer: false,
        lifestyle: 'comfort',
        manualOverride: null,
      }
      const b = computeAspirationTotal(answers)
      return {
        expected: 'travel=2184; transport=7200; dining=7920; hobbies=2100; care=2700; base=22104; total=22100',
        actual: `travel=${b.travel}; transport=${b.transport}; dining=${b.dining}; hobbies=${b.hobbies}; care=${b.care}; base=${b.base}; total=${b.total}`,
      }
    },
  },
]
