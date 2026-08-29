/**
 * Gedeelde engine-checks voor de UAT-Ovz-acceptatiecriteria (`ovz.ts`).
 *
 * PURE module — geen vitest/DOM-afhankelijkheden — zodat dezelfde lijst checks
 * kan draaien onder:
 *  1. `ovz.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-ovz.ts`):
 *     `assertEqual(actual, expected, label)` per check.
 *
 * De meeste checks roepen ÉCHTE productiefuncties aan (calculateBox3,
 * scoreDSTI/scoreAssetConcentration, pillarStatus, computeGoalProgress,
 * computeFreedomTotal, compareCompound, buildSimNetWorthRows, deflate).
 * Twee mirrors met bronregel-verwijzing (spiegelt de mirrors in
 * start/will/cash-checks.ts):
 *  - `scoreDebtRatio` (lib/financial-health.ts — NIET geëxporteerd)
 *  - de postpone-/uitstel-termijn (POSTPONE_DAYS=14 resp. weken×7, identiek
 *    patroon aan de WILL-mirror)
 *
 * WF-OVZ-22 (euro-weergave, wave 2/3): `buildSimNetWorthRows` (nominaal, D7)
 * levert sinds brok E `inflationFactor` op elke rij zelf (single-source join
 * op leeftijd, al door de aanroeper gedaan); deze check deflateert het
 * resultaat met `deflate()` (lib/euro-display.ts) op die rij-eigen factor —
 * géén losse leeftijd→factor-map nodig.
 */

import { calculateBox3 } from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { scoreDSTI, scoreAssetConcentration } from '@/lib/financial-health'
import { pillarStatus } from '@/lib/leverage-status'
import { computeGoalProgress, type Goal } from '@/lib/goal-data'
import { computeFreedomTotal, computeFreedomDelta } from '@/lib/briefing/overview-briefing'
import { compareCompound } from '@/lib/compound-projection'
import { buildSimNetWorthRows } from '@/lib/horizon/networth-rows'
import { DEFAULT_HOUSING_STRATEGY } from '@/lib/housing-strategy'
import { deflate } from '@/lib/euro-display'
import { buildWealthSelectionWidgetData } from '@/lib/wealth-selection'
import {
  DEFAULT_WELCOME_GUIDE,
  countScreenProgress,
  deriveGuideStates,
  type GuideAccountFacts,
} from '@/lib/welcome-guide'
import { OVZ_ACCEPTANCE } from './ovz'
import type { AcceptanceCriterion } from './types'

export interface OvzEngineCheck {
  /** 'WF-OVZ-01' */
  workflow: string
  /** 'UAT-OVZ-01' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in ovz.ts — gooit als ovz.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = OVZ_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — ovz.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in ovz.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function fx(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Volledig getypeerde Asset met sensible defaults. */
function makeAsset(overrides: Partial<Asset> & { id: string; asset_type: Asset['asset_type']; current_value: number }): Asset {
  return {
    user_id: 'test-user',
    name: 'Asset',
    purchase_value: 0,
    purchase_date: null,
    expected_return: 0,
    monthly_contribution: 0,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid: null,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    has_holdings_tracking: false,
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
    ...overrides,
  }
}

/** Mirror van scoreDebtRatio (lib/financial-health.ts r154-160, NIET geëxporteerd). */
function scoreDebtRatioMirror(totalAssets: number, totalDebts: number): number {
  if (totalAssets <= 0) return totalDebts > 0 ? 0 : 50
  const ratio = totalDebts / totalAssets
  if (ratio <= 0) return 100
  if (ratio >= 1) return 0
  return Math.round((1 - ratio) * 100)
}

/** Mirror van de postpone-termijn (identiek aan de WILL-mirror,
 *  components/overview/tips-lijst.tsx r37/79). */
function postponedUntil(nowMs: number, days = 14): number {
  return nowMs + days * 24 * 60 * 60 * 1000
}

/** Mirror van de uitstel-datum in components/app/action-board.tsx r114-119:
 *  vandaag + gekozen weken × 7 dagen. */
function postponeWeeks(nowMs: number, weeks: number): number {
  return nowMs + weeks * 7 * 24 * 60 * 60 * 1000
}

/** Mirror van de cap-op-5-sortering (priority_score desc, dan sort_order asc). */
function sortActions<T extends { priority_score: number; sort_order: number }>(actions: T[]): T[] {
  return [...actions].sort((a, b) => b.priority_score - a.priority_score || a.sort_order - b.sort_order)
}

// ── Checks — één per 'exact'-workflow in OVZ_ACCEPTANCE ────────────────────

export const OVZ_ENGINE_CHECKS: OvzEngineCheck[] = [
  {
    workflow: 'WF-OVZ-01',
    scenarioId: 'UAT-OVZ-01',
    label: 'Netto vermogen (directe som) + Box 3-belasting (calculateBox3, synthetisch spaargeld-only)',
    run: () => {
      criterion('WF-OVZ-01')
      const nettoVermogen = 1619700 - 0
      const assets: Asset[] = [makeAsset({ id: 'a1', asset_type: 'cash', current_value: 100000 })]
      const result = calculateBox3({ assets, debts: [], hasPartner: false, dailyExpenses: 0, year: 2026 })
      return {
        expected: 'nettoVermogen=1619700; box3Tax=187.28',
        actual: `nettoVermogen=${nettoVermogen}; box3Tax=${fx(result.tax, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-OVZ-02',
    scenarioId: 'UAT-OVZ-02',
    label: 'Schuldratio-pijlerscore (mirror) + statuskleur (pillarStatus): 13.900/9.700',
    run: () => {
      criterion('WF-OVZ-02')
      const score = scoreDebtRatioMirror(9700, 13900)
      const status = pillarStatus(score)
      return {
        expected: 'schuldratioScore=0; status=bad',
        actual: `schuldratioScore=${score}; status=${status}`,
      }
    },
  },
  {
    workflow: 'WF-OVZ-03',
    scenarioId: 'UAT-OVZ-03',
    label: 'Gezondheidspijler-scores (scoreDSTI/scoreAssetConcentration + schuldratio-mirror)',
    run: () => {
      criterion('WF-OVZ-03')
      const schuldratioScore = scoreDebtRatioMirror(1619700, 0)
      const dstiScore = scoreDSTI(0)
      const concentratieScore = scoreAssetConcentration((570000 / (1619700 - 650000)) * 100)
      return {
        expected: 'schuldratioScore=100; dstiScore=100; concentratieScore=62',
        actual: `schuldratioScore=${schuldratioScore}; dstiScore=${dstiScore}; concentratieScore=${concentratieScore}`,
      }
    },
  },
  {
    workflow: 'WF-OVZ-06',
    scenarioId: 'UAT-OVZ-06',
    label: 'Doel-voortgang (computeGoalProgress): 2.350/10.000 + 2.000/5.000',
    run: () => {
      criterion('WF-OVZ-06')
      const makeGoal = (overrides: Partial<Goal> & { id: string; current_value: number; target_value: number }): Goal => ({
        user_id: 'test-user',
        name: 'Doel',
        description: null,
        goal_type: 'savings',
        target_date: null,
        linked_asset_id: null,
        linked_debt_id: null,
        icon: 'Target',
        color: 'teal',
        is_completed: false,
        completed_at: null,
        sort_order: 0,
        ownership: 'personal',
        household_id: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        ...overrides,
      })
      const g1 = computeGoalProgress(makeGoal({ id: 'g1', current_value: 2350, target_value: 10000 }))
      const g2 = computeGoalProgress(makeGoal({ id: 'g2', current_value: 2000, target_value: 5000 }))
      return {
        expected: 'pct1=24; pct2=40',
        actual: `pct1=${g1.pct}; pct2=${g2.pct}`,
      }
    },
  },
  {
    workflow: 'WF-OVZ-09',
    scenarioId: 'UAT-OVZ-09',
    label: 'Vrijheidsdagen-totaal (computeFreedomTotal) + week-delta-plausibiliteitsgrens (computeFreedomDelta)',
    run: () => {
      criterion('WF-OVZ-09')
      const willem = computeFreedomTotal(1619700, 1495)
      const daan = computeFreedomTotal(-4200, 1500)
      // Week-over-week: basis bevroren op half-geïmporteerde data (€200/mnd)
      // vs. de realistische week erna (€3.000/mnd) → ±−17.033 dagen, buiten de
      // plausibele bandbreedte → onderdrukt (bug "−3788 dagen minder").
      const opgeblazenBasis = computeFreedomTotal(120000, 200)
      const realistisch = computeFreedomTotal(120000, 3000)
      const gesprongen = computeFreedomDelta(realistisch, opgeblazenBasis)
      // Normale week: €2.500 gespaard bij €3.000/mnd → +25 dagen, blijft zichtbaar.
      const normaal = computeFreedomDelta(
        computeFreedomTotal(122500, 3000),
        computeFreedomTotal(120000, 3000),
      )
      return {
        expected:
          'willemIsDeficit=false; willemTotalDaysPositief=true; daanIsDeficit=true; opgeblazenDelta=onderdrukt; opgeblazenImplausibel=true; normaleDelta=25',
        actual:
          `willemIsDeficit=${willem.breakdown.isDeficit}; willemTotalDaysPositief=${willem.totalFreedomDays > 0}; daanIsDeficit=${daan.breakdown.isDeficit}` +
          `; opgeblazenDelta=${gesprongen.deltaDays === null ? 'onderdrukt' : gesprongen.deltaDays}` +
          `; opgeblazenImplausibel=${gesprongen.isImplausibleDelta}; normaleDelta=${normaal.deltaDays}`,
      }
    },
  },
  {
    workflow: 'WF-OVZ-10',
    scenarioId: 'UAT-OVZ-10',
    label: 'Briefing-impact-badge (mirror): freedom_days_per_year passthrough + euro_impact_monthly×12',
    run: () => {
      criterion('WF-OVZ-10')
      const freedomDaysPerYear = 45
      const euroImpactMonthly = 340
      const euroImpactYearly = euroImpactMonthly * 12
      return {
        expected: 'freedomDaysPerYear=45; euroImpactYearly=4080',
        actual: `freedomDaysPerYear=${freedomDaysPerYear}; euroImpactYearly=${euroImpactYearly}`,
      }
    },
  },
  {
    workflow: 'WF-OVZ-14',
    scenarioId: 'UAT-OVZ-14',
    label: 'Welkomstgids: afgeleide voortgang op scherm 1 (gevuld 4/4, leeg 0/4, n.v.t. buiten de noemer)',
    run: () => {
      criterion('WF-OVZ-14')
      const screen = DEFAULT_WELCOME_GUIDE.screens[0]
      const leeg: GuideAccountFacts = {
        hasAssets: false,
        hasDebts: false,
        hasBudgets: false,
        hasBankConnection: false,
        hasTransactions: false,
        hasFireParams: false,
        hasHorizonSetup: false,
        hasLifeEvents: false,
        hasRetirementExpenseChoice: false,
        hasGoals: false,
        hasScenarioPrefs: false,
        visitedSlugs: [],
        notApplicableStepIds: [],
      }
      // Persona met een gevuld account: bezittingen, schulden, budget en een
      // gekoppelde rekening — precies de vier stappen van scherm 1.
      const gevuld: GuideAccountFacts = {
        ...leeg,
        hasAssets: true,
        hasDebts: true,
        hasBudgets: true,
        hasBankConnection: true,
      }
      // Alleen huishoud-gedeelde bezittingen van de partner: eigen-account is
      // leeg, dus de gids vinkt niets af (perspectief-lek-regressie).
      const partner = leeg

      const p = (facts: GuideAccountFacts, done: string[] = []) =>
        countScreenProgress(screen, done, deriveGuideStates(DEFAULT_WELCOME_GUIDE, facts))

      const g = p(gevuld)
      const l = p(leeg)
      const n = p({ ...gevuld, notApplicableStepIds: ['s1-schulden'] })
      const pa = p(partner)

      return {
        expected: 'gevuld=4/4; leeg=0/4; nvt=3/3+1; partner=0/4',
        actual: `gevuld=${g.done}/${g.total}; leeg=${l.done}/${l.total}; nvt=${n.done}/${n.total}+${n.notApplicable}; partner=${pa.done}/${pa.total}`,
      }
    },
  },
  {
    workflow: 'WF-OVZ-15',
    scenarioId: 'UAT-OVZ-15',
    label: 'Samengestelde rente (compareCompound): €57.700 principal, 0 en €500/mnd, 30 jaar',
    run: () => {
      criterion('WF-OVZ-15')
      const r0 = compareCompound({ principal: 57700, monthlyContribution: 0, years: 30, conservativeRate: 0.005, ambitiousRate: 0.07 })
      const r500 = compareCompound({ principal: 57700, monthlyContribution: 500, years: 30, conservativeRate: 0.005, ambitiousRate: 0.07 })
      return {
        expected: 'cons0=67013; amb0=439227; hasDramaticDelta=true; cons500=260693; amb500=1005992',
        actual: `cons0=${r0.conservative}; amb0=${r0.ambitious}; hasDramaticDelta=${r0.hasDramaticDelta}; cons500=${r500.conservative}; amb500=${r500.ambitious}`,
      }
    },
  },
  {
    workflow: 'WF-OVZ-19',
    scenarioId: 'UAT-OVZ-19',
    label: 'Tips-sortering (priority_score) + postpone-termijn (14 dagen) + impact-passthrough',
    run: () => {
      criterion('WF-OVZ-19')
      const tips = [
        { id: 'tip2', priority_score: 3, sort_order: 0 },
        { id: 'tip1', priority_score: 5, sort_order: 0 },
      ]
      const sortering = sortActions(tips).map((t) => t.id)
      const now = Date.UTC(2026, 6, 5) // 5 juli 2026
      const postponed = isoDate(postponedUntil(now))
      const actieFreedomDays = 45
      const actieEuroImpact = 340
      return {
        expected: 'sortering=[tip1,tip2]; postponedUntil=2026-07-19; actieFreedomDays=45; actieEuroImpact=340',
        actual: `sortering=[${sortering.join(',')}]; postponedUntil=${postponed}; actieFreedomDays=${actieFreedomDays}; actieEuroImpact=${actieEuroImpact}`,
      }
    },
  },
  {
    workflow: 'WF-OVZ-20',
    scenarioId: 'UAT-OVZ-20',
    label: 'Totaal open vrijheidsdagen (mirror-som): 55 → 75 na +20',
    run: () => {
      criterion('WF-OVZ-20')
      const acties = [{ freedom_days_impact: 45 }, { freedom_days_impact: 10 }]
      const totaalVoor = acties.reduce((s, a) => s + a.freedom_days_impact, 0)
      const nieuweActie = { freedom_days_impact: 20 }
      const totaalNa = [...acties, nieuweActie].reduce((s, a) => s + a.freedom_days_impact, 0)
      return {
        expected: 'totaalVoor=55; totaalNa=75; delta=20',
        actual: `totaalVoor=${totaalVoor}; totaalNa=${totaalNa}; delta=${totaalNa - totaalVoor}`,
      }
    },
  },
  {
    workflow: 'WF-OVZ-21',
    scenarioId: 'UAT-OVZ-21',
    label: 'Uitstel-datum (mirror, 2 weken) + cap-op-5-sortering (priority_score/sort_order) op 7 acties',
    run: () => {
      criterion('WF-OVZ-21')
      const now = Date.UTC(2026, 6, 5) // 5 juli 2026
      const uitgesteldTot = isoDate(postponeWeeks(now, 2))
      const acties = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, priority_score: 7 - i, sort_order: i }))
      const zichtbaar = sortActions(acties).slice(0, 5)
      return {
        expected: 'uitgesteldTot=2026-07-19; zichtbaarAantal=5; totaalN=7',
        actual: `uitgesteldTot=${uitgesteldTot}; zichtbaarAantal=${zichtbaar.length}; totaalN=${acties.length}`,
      }
    },
  },
  {
    workflow: 'WF-OVZ-22',
    scenarioId: 'UAT-OVZ-22',
    label: "Mini-vermogensgrafiek in huidige euro's (buildSimNetWorthRows + deflate): naad zonder knik",
    run: () => {
      criterion('WF-OVZ-22')
      // Synthetische kernelrijen — euro-inflatie heft de portefeuillegroei
      // exact op, zodat het REËLE netto vermogen op elke leeftijd €500.000
      // blijft (identiek aan currentNetWorth, jaar-0-factor 1.0 → geen knik).
      // `inflationFactor` reist mee op de rij zelf (brok E-contract) — de
      // deflatie ná de reconcile-offset gebeurt met de rij-eigen factor via
      // `deflate()`, niet met een los opgebouwde leeftijd-map. Factoren zijn
      // machten van 2 (i.p.v. bv. 1,1/1,21): deling door een macht van 2 is in
      // IEEE-754 altijd exact — geen drijvendekomma-afrondingsruis in de assertie.
      const currentNetWorth = 500000
      const rows = buildSimNetWorthRows({
        // `startPortfolio` = de stand ÓP die leeftijd (wat de weergavereeks toont);
        // `endPortfolio` = de stand een jaar later. De reeks leest de eerste, dus
        // die draagt hier de bedragen die de assertie hieronder verwacht.
        simRows: [
          { age: 60, startPortfolio: 500000, endPortfolio: 1000000, inflationFactor: 1 },
          { age: 61, startPortfolio: 1000000, endPortfolio: 2000000, inflationFactor: 2 },
          { age: 62, startPortfolio: 2000000, endPortfolio: 4000000, inflationFactor: 4 },
        ],
        currentNetWorth,
        housingStrategy: DEFAULT_HOUSING_STRATEGY, // include_full → geen huis-overwaarde-optelling
        assets: [],
        debts: [],
        dateOfBirth: null,
      })
      const deflated = rows.map((r) => deflate(r.netWorth, r.inflationFactor, 'real'))
      return {
        expected: 'real60=500000; real61=500000; real62=500000; jaar0GelijkAanCurrentNetWorth=true',
        actual: `real60=${deflated[0]}; real61=${deflated[1]}; real62=${deflated[2]}; jaar0GelijkAanCurrentNetWorth=${deflated[0] === currentNetWorth}`,
      }
    },
  },
  {
    workflow: 'WF-OVZ-23',
    scenarioId: 'UAT-OVZ-23',
    label: 'Vermogens-widget met eigen selectie (buildWealthSelectionWidgetData): gewogen som, stale-filtering, historie <2 vs. ≥2 punten',
    run: () => {
      criterion('WF-OVZ-23')
      // a1 pct 100 → gewogen 200.000; a2 pct 50 → gewogen 25.000; d1 pct 100 →
      // gewogen 30.000. De selectie draagt ook een verwijderde asset- en
      // debt-id die niet in de rijen voorkomen (stale — moet stil filteren).
      const selection = { assetIds: ['a1', 'a2', 'a-verwijderd'], debtIds: ['d1', 'd-verwijderd'] }
      const assets = [
        { id: 'a1', name: 'DEGIRO', current_value: 200000, net_worth_inclusion_pct: 100 },
        { id: 'a2', name: 'Spaarrekening', current_value: 50000, net_worth_inclusion_pct: 50 },
      ]
      const debts = [
        { id: 'd1', name: 'Hypotheek', current_balance: 30000, net_worth_inclusion_pct: 100 },
      ]
      const monthKeys = Array.from({ length: 12 }, (_, i) => `m${i + 1}`)

      // Kort: a1 heeft maar 1 maandmeting → onder de 2-punten-drempel → lege
      // historie ("Nog geen verloop"), geen verzonnen lijn.
      const kort = buildWealthSelectionWidgetData(selection, assets, debts, {
        monthKeys,
        assetSeries: { a1: [200000] },
        debtSeries: {},
      })

      // Lang: elke entiteit heeft 2 maandmetingen (al gewogen door de
      // aanroeper, zoals loadEntitySparklines levert) → som per maand, rechts
      // uitgelijnd; het laatste punt moet gelijk zijn aan het actuele total.
      const lang = buildWealthSelectionWidgetData(selection, assets, debts, {
        monthKeys,
        assetSeries: { a1: [180000, 200000], a2: [22500, 25000] },
        debtSeries: { d1: [28000, 30000] },
      })

      // De builder geeft null bij een selectie zonder levende rijen (review
      // 🟡3); in dit scenario bestaan alle rijen, dus null zou zelf een
      // faaluitkomst zijn — expliciet zichtbaar gemaakt in `actual`.
      if (!kort || !lang) {
        return {
          expected: 'total=195000; count=2a/1d; kortHistorie=leeg; langHistorieLengte=2; langLaatstePunt=195000',
          actual: `builder gaf null (kort=${kort === null ? 'null' : 'ok'}, lang=${lang === null ? 'null' : 'ok'})`,
        }
      }
      return {
        expected: 'total=195000; count=2a/1d; kortHistorie=leeg; langHistorieLengte=2; langLaatstePunt=195000',
        actual:
          `total=${lang.total}; count=${lang.count.assets}a/${lang.count.debts}d` +
          `; kortHistorie=${kort.history.length === 0 ? 'leeg' : kort.history.length}` +
          `; langHistorieLengte=${lang.history.length}; langLaatstePunt=${lang.history[lang.history.length - 1]?.value}`,
      }
    },
  },
]
