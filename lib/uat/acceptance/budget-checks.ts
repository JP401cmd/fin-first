/**
 * Gedeelde engine-checks voor de UAT-Budget-acceptatiecriteria (`budget.ts`).
 *
 * PURE module — geen vitest/DOM-afhankelijkheden — zodat dezelfde lijst checks
 * kan draaien onder:
 *  1. `budget.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-budget.ts`):
 *     `assertEqual(actual, expected, label)` per check.
 *
 * Elke `run()` roept UITSLUITEND de échte rekenfunctie(s)/constante(n) aan — op
 * persona-brondata (`lib/test-personas.ts`, statische budget-limieten) waar
 * mogelijk, anders een kleine synthetische fixture. Budget-TRANSACTIES (besteed
 * per maand) zijn bewust NIET gebruikt: `generateMonthlyTransactions` gebruikt
 * `Math.random()`-jitter, dus die realisatie is niet hand-narekenbaar (zie
 * budget.ts voor de volledige toelichting) — vandaar de exclusief-synthetische
 * fixtures voor forecast/rollover/plan-diff/share/spaardoel/freedom-time.
 *
 * ÉÉN BEWUSTE UITZONDERING (spiegelt de figures-strip-mirror in
 * `schuld-checks.ts`): WF-BUDGET-18 (spaardoel-voortgang) is een INLINE
 * client-calc in `components/app/budgets-client.tsx` (r3327-3334, géén pure
 * export). De formule wordt hier getrouw GEMIRRORD met bronregel-verwijzing —
 * niet herïmplementeerd met eigen aannames — zodat een wijziging in de client
 * expliciet moet worden meegenomen in deze mirror (of andersom opvalt als de
 * cijfers uit de pas gaan lopen).
 *
 * Alle gebruikte engine-functies zijn client-veilig (geen `server-only` /
 * `@/lib/supabase/server` / `next/headers` in hun import-graaf): `lib/budget-period.ts`,
 * `lib/budget-alerts.ts`, `lib/budget-rollover.ts`, `lib/budget-forecast.ts`,
 * `lib/budget-perspective.ts`, `lib/budget-plan-diff.ts`,
 * `lib/budget-templates/onboarding-presets.ts`, `lib/nibud/reference-data.ts`
 * (alleen de pure functies, niet `getNibudReferences` die Supabase aanroept),
 * `lib/format.ts` zijn pure reken-/constanten-modules.
 */

import { PERSONAS } from '@/lib/test-personas'
import { BUDGET_SLUGS, type Budget, type BudgetWithChildren } from '@/lib/budget-data'
import {
  computeBudgetPlanDiff,
  countDiff,
  resolveActiveAmount,
  buildCreateBudgetDiff,
  type DraftBudget,
  type BudgetAmountLite,
} from '@/lib/budget-plan-diff'
import { computeBudgetPeriod } from '@/lib/budget-period'
import { shouldAlert } from '@/lib/budget-alerts'
import { computeRollover, getEffectiveLimit, getPreviousPeriod, type BudgetRollover } from '@/lib/budget-rollover'
import { computeBudgetForecast } from '@/lib/budget-forecast'
import { buildSpendingSums, combineSpending, shareFractionFor } from '@/lib/budget-perspective'
import { buildTemplateSeed } from '@/lib/budget-templates/onboarding-presets'
import { getNibudHouseholdType, calculateBenchmarks } from '@/lib/nibud/reference-data'
import { dailyExpenseRate, calculateFreedomTime } from '@/lib/format'
import { BUDGET_ACCEPTANCE } from './budget'
import type { AcceptanceCriterion } from './types'

const lisa = PERSONAS.lisa

export interface BudgetEngineCheck {
  /** 'WF-BUDGET-01' */
  workflow: string
  /** 'UAT-BUDGET-01' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in budget.ts — gooit als budget.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = BUDGET_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — budget.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in budget.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function fx(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

/** Volledig getypeerde Budget met sensible defaults — vult alleen aan wat de
 *  aangeroepen rekenfuncties daadwerkelijk lezen. */
function makeBudget(overrides: Partial<Budget> & { id: string }): Budget {
  return {
    user_id: 'test-user',
    parent_id: null,
    name: 'Budget',
    slug: null,
    icon: 'Wallet',
    description: null,
    default_limit: 0,
    budget_type: 'expense',
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: 'soft',
    alert_threshold: 80,
    max_single_transaction_amount: 0,
    is_essential: false,
    priority_score: 3,
    is_inflation_indexed: false,
    sort_order: 0,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ownership: 'personal',
    household_id: null,
    goal_type: null,
    goal_amount: null,
    goal_date: null,
    goal_frequency: null,
    is_favorite: false,
    ...overrides,
  }
}

/** Volledig getypeerde DraftBudget die qua detail-velden standaard MATCHT met
 *  `makeBudget`'s defaults — zodat alleen bewust gewijzigde velden een diff
 *  opleveren (spiegelt `NEW_BUDGET_DETAIL_DEFAULTS`-gedachte, maar voor
 *  bestaande rijen). */
function makeDraft(overrides: Partial<DraftBudget> & { id: string; parentId: string | null }): DraftBudget {
  return {
    name: 'Budget',
    slug: null,
    icon: 'Wallet',
    description: null,
    budgetType: 'expense',
    defaultLimit: 0,
    isEssential: false,
    sortOrder: 0,
    interval: 'monthly',
    rolloverType: 'reset',
    amount: null,
    priorityScore: 3,
    limitType: 'soft',
    alertThreshold: 80,
    isInflationIndexed: false,
    goalType: null,
    goalAmount: null,
    goalDate: null,
    goalFrequency: null,
    ...overrides,
  }
}

/** Mirror van de spaardoel-voortgangsformule in
 *  components/app/budgets-client.tsx (r3327-3334, doeltype 'spaardoel',
 *  GEEN pure export). `nowMs`/`goalDateMs` zijn expliciete parameters i.p.v.
 *  `Date.now()` zodat de check deterministisch is. */
function spaardoelProgress(goalAmount: number, cumulativeCarry: number, nowMs: number, goalDateMs: number) {
  const maandenResterend = Math.max(1, (goalDateMs - nowMs) / (1000 * 60 * 60 * 24 * 30))
  const benodigdPerMaand = Math.max(0, (goalAmount - cumulativeCarry) / maandenResterend)
  const spaarProgress = Math.min(100, (cumulativeCarry / goalAmount) * 100)
  return { maandenResterend, benodigdPerMaand, spaarProgress }
}

/** Invarianten van een `buildTemplateSeed`-resultaat: inkomen-conservatie +
 *  parent = Σchildren voor elk hoofdbudget met children. */
function seedInvariants(templateId: 'minimalistisch' | 'nibud' | 'uitgebreid', netIncome: number) {
  const seed = buildTemplateSeed(templateId, netIncome)
  const inkomenParent = seed.find((p) => p.slug === BUDGET_SLUGS.INKOMEN)!
  const inkomenSom = (inkomenParent.children ?? []).reduce((s, c) => s + c.default_limit, 0)
  const parentSomKlopt = seed.every(
    (p) => !p.children || p.children.length === 0 || p.default_limit === p.children.reduce((s, c) => s + c.default_limit, 0),
  )
  return { inkomenSom, parentSomKlopt, aantalHoofdbudgetten: seed.length }
}

// ── Checks — één per 'exact'-workflow in BUDGET_ACCEPTANCE ─────────────────

export const BUDGET_ENGINE_CHECKS: BudgetEngineCheck[] = [
  {
    workflow: 'WF-BUDGET-01',
    scenarioId: 'UAT-BUDGET-01',
    label: 'Template-seed setup (buildTemplateSeed nibud, inkomen 3400): inkomen-conservatie + parent=Σchildren',
    run: () => {
      criterion('WF-BUDGET-01')
      const r = seedInvariants('nibud', 3400)
      return {
        expected: 'inkomenSom=3400; parentSomKlopt=true; aantalHoofdbudgetten=8',
        actual: `inkomenSom=${r.inkomenSom}; parentSomKlopt=${r.parentSomKlopt}; aantalHoofdbudgetten=${r.aantalHoofdbudgetten}`,
      }
    },
  },
  {
    workflow: 'WF-BUDGET-03',
    scenarioId: 'UAT-BUDGET-03',
    label: 'Periode-modus (computeBudgetPeriod): maand/YTD/12-maanden bereik + maandtelling',
    run: () => {
      criterion('WF-BUDGET-03')
      const now = new Date(2026, 6, 15) // 15 juli 2026
      const monthDate = new Date(2026, 2, 1) // maart 2026
      const maand = computeBudgetPeriod('maand', monthDate, now)
      const ytd = computeBudgetPeriod('ytd', monthDate, now)
      const m12 = computeBudgetPeriod('12m', monthDate, now)
      return {
        expected:
          'maandStart=2026-03-01; maandEnd=2026-04-01; maandCount=1; ytdStart=2026-01-01; ytdEnd=2026-08-01; ytdCount=7; m12Start=2025-08-01; m12End=2026-08-01; m12Count=12',
        actual: `maandStart=${maand.periodStart}; maandEnd=${maand.periodEnd}; maandCount=${maand.periodMonthCount}; ytdStart=${ytd.periodStart}; ytdEnd=${ytd.periodEnd}; ytdCount=${ytd.periodMonthCount}; m12Start=${m12.periodStart}; m12End=${m12.periodEnd}; m12Count=${m12.periodMonthCount}`,
      }
    },
  },
  {
    workflow: 'WF-BUDGET-05',
    scenarioId: 'UAT-BUDGET-05',
    label: 'Dekkingsgraad (persona lisa) + alert-drempels 80%/100% (shouldAlert)',
    run: () => {
      criterion('WF-BUDGET-05')
      const toegewezen = lisa.budgets
        .filter((b) => b.budget_type === 'expense' || b.budget_type === 'savings' || b.budget_type === 'debt')
        .reduce((s, b) => s + Number(b.default_limit), 0)
      const inkomen = lisa.budgets.find((b) => b.budget_type === 'income')!.default_limit
      const dekkingPct = (toegewezen / inkomen) * 100
      const alertExpenseOver = shouldAlert(85, 100, 80, 'expense')
      const alertExpenseUnder = shouldAlert(75, 100, 80, 'expense')
      const alertSavingsUnder = shouldAlert(50, 100, 100, 'savings')
      const alertSavingsOver = shouldAlert(150, 100, 100, 'savings')
      return {
        expected: 'dekkingPct=68.65; alertExpenseOver=true; alertExpenseUnder=false; alertSavingsUnder=true; alertSavingsOver=false',
        actual: `dekkingPct=${fx(dekkingPct, 2)}; alertExpenseOver=${alertExpenseOver}; alertExpenseUnder=${alertExpenseUnder}; alertSavingsUnder=${alertSavingsUnder}; alertSavingsOver=${alertSavingsOver}`,
      }
    },
  },
  {
    workflow: 'WF-BUDGET-06',
    scenarioId: 'UAT-BUDGET-06',
    label: 'Planeditor-diff (computeBudgetPlanDiff/countDiff): hernoemen + limietwijziging + toevoegen + verwijderen',
    run: () => {
      criterion('WF-BUDGET-06')
      const p1 = makeBudget({ id: 'p1', name: 'Vaste lasten', slug: 'vaste-lasten-wonen', default_limit: 950, is_essential: true, priority_score: 5, sort_order: 1 })
      const c1 = makeBudget({ id: 'c1', parent_id: 'p1', name: 'Huur', default_limit: 750 })
      const c2 = makeBudget({ id: 'c2', parent_id: 'p1', name: 'Gas', default_limit: 200 })
      const originalTree: BudgetWithChildren[] = [{ ...p1, children: [c1, c2] }]
      const originalAmounts: BudgetAmountLite[] = [{ budget_id: 'c1', effective_from: '2026-01-01', amount: 750 }]
      const effectiveFrom = '2026-07-01'

      const draftP1 = makeDraft({ id: 'p1', parentId: null, name: 'Vaste lasten wonen (gewijzigd)', slug: 'vaste-lasten-wonen', defaultLimit: 950, isEssential: true, priorityScore: 5, sortOrder: 1 })
      const draftC1 = makeDraft({ id: 'c1', parentId: 'p1', name: 'Huur', defaultLimit: 750, amount: 800 })
      const draftNew = makeDraft({ id: 'tmp-1', parentId: 'p1', name: 'Abonnementen', defaultLimit: 50, amount: 50 })
      // c2 bewust weggelaten uit de draft → to_delete

      const diff = computeBudgetPlanDiff(originalTree, [draftP1, draftC1, draftNew], originalAmounts, effectiveFrom)
      return {
        expected: 'toInsert=1; toUpdate=1; toDelete=1; amounts=2; countDiff=5',
        actual: `toInsert=${diff.to_insert.length}; toUpdate=${diff.to_update.length}; toDelete=${diff.to_delete.length}; amounts=${diff.amounts.length}; countDiff=${countDiff(diff)}`,
      }
    },
  },
  {
    workflow: 'WF-BUDGET-07',
    scenarioId: 'UAT-BUDGET-07',
    label: 'Template-VERVANG (buildTemplateSeed uitgebreid, inkomen 5200): inkomen-conservatie + parent=Σchildren',
    run: () => {
      criterion('WF-BUDGET-07')
      const r = seedInvariants('uitgebreid', 5200)
      return {
        expected: 'inkomenSom=5200; parentSomKlopt=true; aantalHoofdbudgetten=8',
        actual: `inkomenSom=${r.inkomenSom}; parentSomKlopt=${r.parentSomKlopt}; aantalHoofdbudgetten=${r.aantalHoofdbudgetten}`,
      }
    },
  },
  {
    workflow: 'WF-BUDGET-09',
    scenarioId: 'UAT-BUDGET-09',
    label: 'Budgetdetail-donut (%-besteed, resterend) + vrijheidstijd (dailyExpenseRate/calculateFreedomTime)',
    run: () => {
      criterion('WF-BUDGET-09')
      const limiet = 400
      const besteed = 340
      const pctBesteed = Math.min(100, (besteed / limiet) * 100)
      const resterend = limiet - besteed
      const rate = dailyExpenseRate(3000)
      const breakdown = calculateFreedomTime(1000, rate)
      return {
        expected: 'pctBesteed=85; resterend=60; freedomYears=0; freedomMonths=0; freedomDays=10; freedomTotalDays=10.1',
        actual: `pctBesteed=${pctBesteed}; resterend=${resterend}; freedomYears=${breakdown.years}; freedomMonths=${breakdown.months}; freedomDays=${breakdown.days}; freedomTotalDays=${breakdown.totalDays}`,
      }
    },
  },
  {
    workflow: 'WF-BUDGET-10',
    scenarioId: 'UAT-BUDGET-10',
    label: 'Ingangsmaand-tijdlijn (resolveActiveAmount): oude limiet vóór, nieuwe limiet vanaf ingangsmaand',
    run: () => {
      criterion('WF-BUDGET-10')
      const amounts: BudgetAmountLite[] = [
        { budget_id: 'b1', effective_from: '2026-01-01', amount: 100 },
        { budget_id: 'b1', effective_from: '2026-06-01', amount: 150 },
      ]
      const oudeLimiet = resolveActiveAmount('b1', '2026-03-01', amounts)
      const nieuweLimiet = resolveActiveAmount('b1', '2026-07-01', amounts)
      return {
        expected: 'oudeLimiet=100; nieuweLimiet=150',
        actual: `oudeLimiet=${oudeLimiet}; nieuweLimiet=${nieuweLimiet}`,
      }
    },
  },
  {
    workflow: 'WF-BUDGET-14',
    scenarioId: 'UAT-BUDGET-14',
    label: 'Rollover-types (computeRollover) + getEffectiveLimit + getPreviousPeriod (incl. jaargrens)',
    run: () => {
      criterion('WF-BUDGET-14')
      const carryOver = computeRollover(100, 60, 20, 'carry-over')
      const investSweep = computeRollover(100, 60, 20, 'invest-sweep')
      const reset = computeRollover(100, 60, 20, 'reset')
      const rollovers: BudgetRollover[] = [
        { id: 'r1', user_id: 'test-user', budget_id: 'b1', period: '2026-07', carried_amount: 60, rollover_type: 'carry-over', created_at: '2026-07-01' },
      ]
      const effectiveLimit = getEffectiveLimit(100, rollovers, '2026-07')
      const prevPeriod = getPreviousPeriod('2026-07')
      const prevPeriodJan = getPreviousPeriod('2026-01')
      return {
        expected: 'carryOverCarry=60; investSweepSwept=60; resetCarry=0; effectiveLimit=160; prevPeriod=2026-06; prevPeriodJan=2025-12',
        actual: `carryOverCarry=${carryOver.carry}; investSweepSwept=${investSweep.swept}; resetCarry=${reset.carry}; effectiveLimit=${effectiveLimit}; prevPeriod=${prevPeriod}; prevPeriodJan=${prevPeriodJan}`,
      }
    },
  },
  {
    workflow: 'WF-BUDGET-15',
    scenarioId: 'UAT-BUDGET-15',
    label: 'Voorspelling (computeBudgetForecast): gewogen gemiddelde, betrouwbaarheid, overschrijding',
    run: () => {
      criterion('WF-BUDGET-15')
      const f = computeBudgetForecast([380, 400, 420, 410, 430, 440], 400, 'Boodschappen')
      return {
        expected: 'predicted=422; confidence=high; confidencePercent=85; monthsUsed=6; exceedsLimit=true; exceedAmount=22; stdDev=19.72; mean=413.33',
        actual: `predicted=${f.predicted}; confidence=${f.confidence}; confidencePercent=${f.confidencePercent}; monthsUsed=${f.monthsUsed}; exceedsLimit=${f.exceedsLimit}; exceedAmount=${f.exceedAmount}; stdDev=${fx(f.stdDev, 2)}; mean=${fx(f.mean, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-BUDGET-18',
    scenarioId: 'UAT-BUDGET-18',
    label: 'Spaardoel-voortgang (gemirrord van budgets-client.tsx): resterende maanden, benodigd/mnd, voortgang%',
    run: () => {
      criterion('WF-BUDGET-18')
      const nowMs = Date.UTC(2025, 0, 1)
      const goalDateMs = Date.UTC(2025, 9, 28) // exact 300 dagen later
      const r = spaardoelProgress(6000, 2000, nowMs, goalDateMs)
      return {
        expected: 'maandenResterend=10; benodigdPerMaand=400; spaarProgress=33.33',
        actual: `maandenResterend=${r.maandenResterend}; benodigdPerMaand=${r.benodigdPerMaand}; spaarProgress=${fx(r.spaarProgress, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-BUDGET-20',
    scenarioId: 'UAT-BUDGET-20',
    label: 'Gedeeld budgetteren (buildSpendingSums/shareFractionFor/combineSpending): 60/40-split over 3 perspectieven',
    run: () => {
      criterion('WF-BUDGET-20')
      const rows = [
        { budget_id: 'b1', amount: -50, ownership: 'personal' },
        { budget_id: 'b1', amount: -80, ownership: 'shared' },
        { budget_id: 'b2', amount: -30 },
      ]
      const sums = buildSpendingSums(rows)
      const b1 = sums.get('b1')!
      const b2 = sums.get('b2')!
      const sharePersonal = shareFractionFor('personal', 'shared', 60)
      const sharePartner = shareFractionFor('partner', 'shared', 60)
      const shareHousehold = shareFractionFor('household', 'shared', 60)
      const combinedPersonal = combineSpending(b1.personalSum, b1.sharedSum, 'personal', 60)
      const combinedPartner = combineSpending(b1.personalSum, b1.sharedSum, 'partner', 60)
      const combinedHousehold = combineSpending(b1.personalSum, b1.sharedSum, 'household', 60)
      return {
        expected: 'b1Personal=50; b1Shared=80; b2Personal=30; b2Shared=0; sharePersonal=0.6; sharePartner=0.4; shareHousehold=1; combinedPersonal=98; combinedPartner=82; combinedHousehold=130',
        actual: `b1Personal=${b1.personalSum}; b1Shared=${b1.sharedSum}; b2Personal=${b2.personalSum}; b2Shared=${b2.sharedSum}; sharePersonal=${sharePersonal}; sharePartner=${sharePartner}; shareHousehold=${shareHousehold}; combinedPersonal=${combinedPersonal}; combinedPartner=${combinedPartner}; combinedHousehold=${combinedHousehold}`,
      }
    },
  },
  {
    workflow: 'WF-BUDGET-22',
    scenarioId: 'UAT-BUDGET-22',
    label: 'NIBUD-huishoudtype-mapping + benchmark-delta/vrijheidsdagen-potentieel',
    run: () => {
      criterion('WF-BUDGET-22')
      const gezinJong = getNibudHouseholdType({ household_type: 'gezin', number_of_children: 2, children_ages: [8, 10] })
      const alleenstaand = getNibudHouseholdType({ household_type: 'solo' })
      const paar = getNibudHouseholdType({ household_type: 'samen', number_of_children: 0 })
      const gezinTiener = getNibudHouseholdType({ household_type: 'gezin', number_of_children: 1, children_ages: [14] })
      const references = [
        { nibud_category_key: 'voeding', nibud_category_name: 'Voeding', basis_amount: 300, voorbeeld_amount: 350, mapped_budget_slug: 'boodschappen' },
      ]
      const benchmarks = calculateBenchmarks(references, { boodschappen: 500 }, 100)
      const b = benchmarks[0]
      return {
        expected: 'householdTypeGezinJong=gezin_jong; householdTypeAlleenstaand=alleenstaand; householdTypePaar=paar; householdTypeGezinTiener=gezin_tiener; delta=150; freedomDaysPotential=18',
        actual: `householdTypeGezinJong=${gezinJong}; householdTypeAlleenstaand=${alleenstaand}; householdTypePaar=${paar}; householdTypeGezinTiener=${gezinTiener}; delta=${b.delta}; freedomDaysPotential=${b.freedom_days_potential}`,
      }
    },
  },
  {
    workflow: 'WF-BUDGET-25',
    scenarioId: 'UAT-BUDGET-25',
    label: 'Sleepmodus-nieuw-budget-guards (buildCreateBudgetDiff): lege naam/bedrag≤0/archive-type gooien; geldige insert budget_type=expense, is_essential=false',
    run: () => {
      criterion('WF-BUDGET-25')
      const base = {
        clientId: 'tmp-1',
        parentId: null as string | null,
        budgetType: 'expense' as Budget['budget_type'],
        sortOrder: 0,
        monthlyAmount: 50,
        effectiveFrom: '2026-07-01',
      }
      let leegNaamGooit = false
      try {
        buildCreateBudgetDiff({ ...base, name: '   ' })
      } catch {
        leegNaamGooit = true
      }
      let nulBedragGooit = false
      try {
        buildCreateBudgetDiff({ ...base, name: 'Boodschappen', monthlyAmount: 0 })
      } catch {
        nulBedragGooit = true
      }
      let archiveTypeGooit = false
      try {
        buildCreateBudgetDiff({ ...base, name: 'Boodschappen', budgetType: 'archive' })
      } catch {
        archiveTypeGooit = true
      }
      const diff = buildCreateBudgetDiff({ ...base, name: 'Boodschappen' })
      const insert = diff.to_insert[0]
      return {
        expected: 'leegNaamGooit=true; nulBedragGooit=true; archiveTypeGooit=true; validInsertBudgetType=expense; validIsEssential=false',
        actual: `leegNaamGooit=${leegNaamGooit}; nulBedragGooit=${nulBedragGooit}; archiveTypeGooit=${archiveTypeGooit}; validInsertBudgetType=${insert.budget_type}; validIsEssential=${insert.is_essential}`,
      }
    },
  },
]
