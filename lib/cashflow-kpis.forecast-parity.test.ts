/**
 * PARITY: `loadDashboardData` (het oude, volledige pad) ↔ `loadForecastSectionData`
 * (de slanke forecast-laag) — ADR 0083, taak T2.5.
 *
 * `CashflowSection` op /overzicht/cashflow/forecast leest VIJF velden uit de
 * bundel: `monthlyIncome`, `monthlyExpenses`, `savingsRate6m`, `savingsHistory` en
 * `expenseHistory`. Van die vijf is `savingsRate6m` het gevaarlijke: het staat óók
 * op /overzicht en in het instellingenblok onderaan /overzicht/cashflow. Wijkt het
 * af, dan toont de app twee verschillende spaarquotes — precies wat de
 * "consume, don't recompute"-regel moet voorkomen.
 *
 * Net als `cashflow-kpis.parity.test.ts` draaien hier BEIDE paden écht,
 * end-to-end, tegen dezelfde nep-database (`test/helpers/fake-supabase.ts`): pad A
 * is de volledige productieloader waar we achteraf de vijf velden uit selecteren,
 * pad B is de nieuwe loader met zijn acht fetches.
 *
 * ── DE VIJF VERPLICHTE VARIANTEN ────────────────────────────────────────────
 *  1. normale transactie-gebaseerde quote (aggregaat-pad);
 *  2. **de net-vermogen-delta-fallback actief** — de variant die ertoe doet;
 *  3. `income_source = 'manual'` (effective grondslag, ADR 0073);
 *  4. maandgrens (localMonthBounds / TZ-lint);
 *  5. een maand zónder data midden in de reeks (histories mogen niet schuiven).
 *
 * Bewust gehele bedragen waar het kan ⇒ float-sommen zijn exact ongeacht de
 * groepering; de vergelijkingen zijn byte-identiek en niet "dicht bij". De
 * delta-fallback rekent per definitie met 30,44 dagen per maand en levert dus een
 * gebroken getal; dat wordt op één decimaal gepind (zoals de app het afrondt).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { DashboardData } from '@/lib/types/dashboard'
import { makeSupabase, type FakeDb, type Row } from '@/test/helpers/fake-supabase'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { buildMonthAggregatesFromRows } from '@/lib/server-data/tx-aggregates'
import {
  loadForecastSectionData,
  deriveSavingsHistory,
  deriveExpenseHistory,
  deriveDataMonths6,
  deriveSavingsRate6mWindow,
  resolveSavingsRate6m,
  toSortedMonthHistory,
  budgetIdsOfType,
  type CashflowSectionScalars,
  type NetWorthSnapshotRow,
} from '@/lib/cashflow-kpis'

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Bevroren klok. Beide paden leiden hun vensters INTERN uit `new Date()` af;
 * zonder bevriezing kan er een maandgrens tussen vallen. 15 juli 2026, 12:00
 * lokaal — midden in de zomertijd (UTC+2 op een NL-machine), zodat een
 * `toISOString()`-terugschuif zichtbaar wordt in fixture 4.
 */
const NOW = new Date(2026, 6, 15, 12, 0, 0)

const B_EXPENSE = 'budget-expense'
const B_EXPENSE_KID = 'budget-expense-kid'
const B_SAVINGS = 'budget-savings'
const B_INCOME = 'budget-income'

type Tx = { amount: number; date: string; budget_id: string | null; transaction_type: string | null }

const tx = (amount: number, date: string, budget_id: string | null = null, transaction_type: string | null = null): Tx =>
  ({ amount, date, budget_id, transaction_type })

const BUDGETS: Row[] = [
  { id: B_EXPENSE, parent_id: null, budget_type: 'expense', default_limit: 4000, interval: 'monthly', name: 'Uitgaven', icon: '', is_favorite: false, is_essential: true, alert_threshold: 80, sort_order: 1 },
  { id: B_EXPENSE_KID, parent_id: B_EXPENSE, budget_type: 'expense', default_limit: 3500, interval: 'monthly', name: 'Boodschappen', icon: '', is_favorite: false, is_essential: false, alert_threshold: 80, sort_order: 2 },
  { id: B_SAVINGS, parent_id: null, budget_type: 'savings', default_limit: 600, interval: 'monthly', name: 'Sparen', icon: '', is_favorite: false, is_essential: false, alert_threshold: 80, sort_order: 3 },
  { id: B_INCOME, parent_id: null, budget_type: 'income', default_limit: 60000, interval: 'yearly', name: 'Inkomen', icon: '', is_favorite: false, is_essential: false, alert_threshold: 80, sort_order: 4 },
]

/**
 * Eén actieve schuld met `include_aflossing_in_savings` en een expliciete
 * aflossing van €200/mnd ⇒ `debtAflossing6m = 1200`. Dat bedrag zit in élke
 * verwachte spaarquote hieronder; verdwijnt de schulden-fetch uit de forecast-
 * laag, dan zakt de quote zichtbaar.
 */
const DEBTS: Row[] = [
  {
    id: 'debt-1', name: 'Hypotheek', debt_type: 'mortgage', is_active: true,
    current_balance: 120000, monthly_payment: 450, interest_rate: 3,
    include_aflossing_in_savings: true, custom_aflossing_amount: 200,
    net_worth_inclusion_pct: 100,
  },
]

/**
 * Eén belegging van €50.000 met 4 % verwacht rendement ⇒ `expectedAnnualAppreciation
 * = 2000`. Dat bedrag wordt ALLEEN in de delta-fallback (fixture 2) van de
 * vermogensgroei afgetrokken; op alle andere fixtures mag het niets doen.
 */
const ASSETS: Row[] = [
  {
    id: 'asset-1', name: 'Beleggingen', asset_type: 'investment', is_active: true,
    current_value: 50000, purchase_value: 40000, expected_return: 4,
    depreciation_rate: null, monthly_contribution: 0, net_worth_inclusion_pct: 100,
  },
]

/**
 * Profiel-basis: géén dob ⇒ de dure horizon-tak (dob && netWorth>0) blijft uit.
 *
 * De grondslag staat BEWUST expliciet op 'transaction' (ADR 0103) en niet meer
 * op 'auto'. Deze suite bewaakt de spaarquote-keten (aggregaat-pad, net-vermogen-
 * delta-fallback, maandgrenzen, gaten in de reeks); met 'auto' én een
 * income-budget van €60.000/jr in de set zou de budgetgrondslag winnen en zouden
 * die assertions een ánder onderwerp meten. Fixture 6 pint het 'auto'-gedrag
 * apart, op beide paden.
 */
const PROFILE_BASE: Row = {
  id: 'user-parity',
  full_name: 'Parity',
  date_of_birth: null,
  budgeting_active: true,
  net_monthly_income: 5000,
  estimated_monthly_expenses: 3000,
  income_source: 'transaction',
  expenses_source: 'transaction',
}

/**
 * Snapshots met een ABSURDE vermogenssprong (10k → 200k in een half jaar). Op elke
 * fixture waar de aggregaat-quote bruikbaar is mogen die rijen de spaarquote NIET
 * raken; zou de `isEstimate`-poort voor de delta-tak wegvallen, dan schiet het
 * getal naar honderden procenten en valt de assertie luid om.
 */
const SNAPSHOTS_NIET_GEBRUIKT: Row[] = [
  { snapshot_date: '2026-01-01', net_worth: 10000, fire_age: null, savings_rate: 11.1 },
  { snapshot_date: '2026-07-01', net_worth: 200000, fire_age: null, savings_rate: 22.2 },
]

/** Zes maanden salaris/uitgaven/spaarstortingen: feb t/m jul 2026. */
function zesMaandenTx(): Row[] {
  const rows: Row[] = [
    // Januari valt BUITEN het 6-maands-venster (dat begint bij '2026-02') maar
    // WEL binnen het 12-maands-aggregaat: hij zet `earliestIncomeDate` op januari
    // en dus `dataMonths6 = 6` (géén extrapolatie). Dat contrast is opzet.
    tx(5000, '2026-01-05', B_INCOME),
  ]
  for (const m of ['02', '03', '04', '05', '06', '07']) {
    rows.push(tx(5000, `2026-${m}-05`, B_INCOME))
    rows.push(tx(-3000, `2026-${m}-12`, B_EXPENSE_KID))
    rows.push(tx(-500, `2026-${m}-20`, B_SAVINGS))
  }
  return rows
}

interface Fixture {
  label: string
  db: FakeDb
}

function buildFixtures(): Fixture[] {
  return [
    {
      // income6m 30000 · expenses6m 21000 · spaarbudget6m 3000 · aflossing6m 1200
      // ⇒ (30000 − (21000 − 3000) + 1200) / 30000 = 44,0 %
      label: '1. normale transactie-gebaseerde quote (aggregaat-pad)',
      db: {
        profile: { ...PROFILE_BASE },
        budgets: BUDGETS,
        transactions: zesMaandenTx(),
        debts: DEBTS,
        assets: ASSETS,
        netWorthSnapshots: SNAPSHOTS_NIET_GEBRUIKT,
      },
    },
    {
      // GEEN positieve transactie ⇒ income6m = 0 ⇒ aggregaat-quote 0 ⇒ isEstimate.
      // De profiel-fallback zou 72 % geven ((5000 − 1400)/5000); de net-vermogen-
      // delta-tak overschrijft dat met 57,2 %.
      label: '2. net-vermogen-delta-fallback actief (geen transactie-inkomen)',
      db: {
        profile: { ...PROFILE_BASE },
        budgets: BUDGETS,
        transactions: [
          tx(-1200, '2026-05-10', B_EXPENSE_KID),
          tx(-1300, '2026-06-10', B_EXPENSE_KID),
          tx(-1400, '2026-07-10', B_EXPENSE_KID),
        ],
        debts: DEBTS,
        assets: ASSETS,
        netWorthSnapshots: [
          { snapshot_date: '2026-01-01', net_worth: 100000, fire_age: null, savings_rate: 12.5 },
          // Middelste rij ZONDER savings_rate: valt uit `savingsHistory` maar
          // verandert de delta niet (die kijkt alleen naar de eerste en de laatste).
          { snapshot_date: '2026-04-01', net_worth: 111111, fire_age: null, savings_rate: null },
          { snapshot_date: '2026-07-01', net_worth: 118000, fire_age: null, savings_rate: 18 },
        ],
      },
    },
    {
      // Zelfde transacties als fixture 1, maar het profiel overrulet inkomen én
      // uitgaven. `monthlyIncome`/`monthlyExpenses` volgen het profiel; de
      // spaarquote blijft de TRANSACTIEquote (44 %) — dat zijn twee grootheden.
      label: "3. income_source='manual' (effective grondslag, ADR 0073)",
      db: {
        profile: {
          ...PROFILE_BASE,
          income_source: 'manual', net_monthly_income: 8000,
          expenses_source: 'manual', estimated_monthly_expenses: 2500,
        },
        budgets: BUDGETS,
        transactions: zesMaandenTx(),
        debts: DEBTS,
        assets: ASSETS,
        netWorthSnapshots: SNAPSHOTS_NIET_GEBRUIKT,
      },
    },
    {
      // 31 jan valt buiten het 6-maands-venster, 1 feb erin; 30 jun valt buiten de
      // huidige maand, 1 jul en 31 jul erin. In UTC+2 zou een `toISOString()`-grens
      // de 30-juni-rijen de julimaand in trekken.
      // income6m 13000 · expenses6m 3500 · aflossing6m 1200 ⇒ 10700/13000 = 82,3 %
      label: '4. maandgrens (localMonthBounds, UTC+2)',
      db: {
        profile: { ...PROFILE_BASE },
        budgets: BUDGETS,
        transactions: [
          tx(9000, '2026-01-31', B_INCOME),
          tx(6000, '2026-02-01', B_INCOME),
          tx(-2000, '2026-02-01', B_EXPENSE_KID),
          tx(4000, '2026-06-30', B_INCOME),
          tx(-1000, '2026-06-30', B_EXPENSE_KID),
          tx(3000, '2026-07-01', B_INCOME),
          tx(-500, '2026-07-31', B_EXPENSE_KID),
        ],
        debts: DEBTS,
        assets: ASSETS,
        netWorthSnapshots: SNAPSHOTS_NIET_GEBRUIKT,
      },
    },
    {
      // April 2026 is helemaal leeg. De reeksen mogen daar een GAT laten, niet
      // opschuiven. Vijf datamaanden (feb t/m jul, min april) ⇒ dataMonths6 = 5 ⇒
      // extrapolatie: extIncome6 24000, extExpenses6 7200 ⇒ 18000/24000 = 75,0 %.
      //
      // De rijen staan hier BEWUST door elkaar. Een database geeft geen
      // volgorde-garantie, en het maandaggregaat erft de volgorde van zijn
      // invoer — met keurig chronologische fixtures zou de sortering in
      // `toSortedMonthHistory` per ongeluk al kloppen en dus niets bewaken.
      label: '5. lege maand midden in de reeks (april 2026), rijen door elkaar',
      db: {
        profile: { ...PROFILE_BASE },
        budgets: BUDGETS,
        transactions: [
          tx(-1300, '2026-06-12', B_EXPENSE_KID),
          tx(4000, '2026-02-05', B_INCOME),
          tx(-1400, '2026-07-12', B_EXPENSE_KID),
          tx(4000, '2026-05-05', B_INCOME),
          tx(-1000, '2026-02-12', B_EXPENSE_KID),
          tx(4000, '2026-07-05', B_INCOME),
          // april: niets
          tx(-1100, '2026-03-12', B_EXPENSE_KID),
          tx(4000, '2026-06-05', B_INCOME),
          tx(-1200, '2026-05-12', B_EXPENSE_KID),
          tx(4000, '2026-03-05', B_INCOME),
        ],
        debts: DEBTS,
        assets: ASSETS,
        netWorthSnapshots: SNAPSHOTS_NIET_GEBRUIKT,
      },
    },
    {
      // ADR 0103: 'auto' = "kies voor mij", en de app kiest budgetten zodra die
      // er zijn. Zelfde transacties als fixture 1, alleen de grondslag verschilt.
      label: "6. auto met budgetten ⇒ budgetgrondslag (ADR 0103)",
      db: {
        profile: { ...PROFILE_BASE, income_source: 'auto', expenses_source: 'auto' },
        budgets: BUDGETS,
        transactions: [
          tx(4000, '2026-07-05', B_INCOME),
          tx(-1200, '2026-07-12', B_EXPENSE_KID),
        ],
        debts: DEBTS,
        assets: ASSETS,
        netWorthSnapshots: SNAPSHOTS_NIET_GEBRUIKT,
      },
    },
  ]
}

// ── De vijf velden uit het OUDE pad ─────────────────────────────────────────

/** Selecteert precies de vijf velden die `CashflowSection` uit de bundel leest. */
function vijfUitBundel(d: DashboardData): CashflowSectionScalars {
  return {
    monthlyIncome: d.monthlyIncome,
    monthlyExpenses: d.monthlyExpenses,
    savingsRate6m: d.savingsRate6m,
    savingsHistory: d.savingsHistory,
    expenseHistory: d.expenseHistory,
  }
}

async function runBothPaths(db: FakeDb) {
  const oud = makeSupabase(db)
  const nieuw = makeSupabase(db)
  const bundle = await loadDashboardData(oud.client)
  const slank = await loadForecastSectionData(nieuw.client)
  return {
    oud: vijfUitBundel(bundle.dashboardData),
    nieuw: slank,
    bundle: bundle.dashboardData,
    oudQueries: oud.tableQueries(),
    nieuwQueries: nieuw.tableQueries(),
  }
}

function bevriesDeKlok() {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('loadForecastSectionData ↔ loadDashboardData — parity op alle vijf velden', () => {
  bevriesDeKlok()

  it.each(buildFixtures())('$label — vijf velden identiek', async ({ db }) => {
    const { oud, nieuw } = await runBothPaths(db)
    expect(nieuw).toEqual(oud)
    // Expliciet per veld, zodat een falende run meteen benoemt wélk veld dreef.
    expect(nieuw.monthlyIncome).toBe(oud.monthlyIncome)
    expect(nieuw.monthlyExpenses).toBe(oud.monthlyExpenses)
    expect(nieuw.savingsRate6m).toBe(oud.savingsRate6m)
    expect(nieuw.savingsHistory).toEqual(oud.savingsHistory)
    expect(nieuw.expenseHistory).toEqual(oud.expenseHistory)
  })

  it('de slanke laag doet aantoonbaar minder tabel-queries', async () => {
    const { oudQueries, nieuwQueries } = await runBothPaths(buildFixtures()[0].db)
    expect(nieuwQueries).toBeLessThan(oudQueries)
    // Acht tabel-fetches (profiel, budgetten, huidige-maand-tx, schulden,
    // bezittingen, vroegste-inkomsten-datum × 2, snapshots) + het maandaggregaat
    // via RPC. Dit getal is een BUDGET, geen momentopname: komt er een fetch bij,
    // verhoog 'm bewust en verantwoord waarom. Nooit versoepelen naar een
    // ongelijkheid — dan verdwijnt precies de bewaking waarvoor deze assertie
    // bestaat.
    //
    // 7 → 8 op 11 aug 2026, BEWUST: `getEarliestIncomeDate` is gesplitst in twee
    // takken (eigen rijen op `user_id`, gedeelde rijen op `ownership='shared'`),
    // omdat de vorige één-query-vorm de planner op de globale datum-index zette
    // en daar 12.202 buffers / ~100 ms mean kostte — op élke route, want de
    // fetcher hangt via de layout in het kritieke pad. Twee index-lookups
    // (0,2 ms + 1,3 ms) die parallel in één `Promise.all` lopen zijn per saldo
    // ordes sneller dan de ene die ze vervingen; de extra fetch is hier dus een
    // verbetering, niet een regressie. Zie de doc bij `getEarliestIncomeDate`
    // in lib/server-data/base.ts voor het scope-bewijs (A ∪ B = de RLS-set).
    expect(nieuwQueries).toBe(8)
  })
})

describe('de vijf velden, met harde waarden op beide paden', () => {
  bevriesDeKlok()

  it('fixture 1: aggregaat-quote 54,0 % — de snapshots blijven ONGEBRUIKT', async () => {
    const { nieuw, oud } = await runBothPaths(buildFixtures()[0].db)
    // VENSTER = zes VOLTOOIDE maanden (jan t/m jun); juli — de lopende maand —
    // valt erbuiten (bevinding C6, `savingsRateWindow`). Januari droeg alleen
    // €5000 inkomen; feb–jun elk +5000/−3000/−500.
    // income6m 30000 · expenses6m 17500 · spaarbudget6m 2500 · aflossing6m 1200
    // ⇒ (30000 − (17500 − 2500) + 1200) / 30000 × 100 = 54
    // (was 44 toen juli meetelde: +5000/−3500 erbij en januari erbuiten.)
    expect(nieuw.savingsRate6m).toBe(54)
    expect(oud.savingsRate6m).toBe(54)
    // De snapshot-sprong 10k → 200k zou via de delta-tak een absurde quote geven;
    // dat de uitkomst 44 blijft, is het bewijs dat de `isEstimate`-poort dicht zit.
    expect(nieuw.savingsHistory).toEqual([
      { month: '2026-01-01', value: 11.1 },
      { month: '2026-07-01', value: 22.2 },
    ])
    // Huidige maand (juli): +5000 salaris, −3000 boodschappen, −500 sparen.
    expect(nieuw.monthlyIncome).toBe(5000)
    expect(nieuw.monthlyExpenses).toBe(3500)
    // Januari droeg alleen INKOMEN: het aggregaat levert daar een groep met
    // sum_negatief 0, dus de maand staat met 0 in de uitgavenreeks (bestaand
    // gedrag van beide paden — een maand zónder enige transactie ontbreekt juist,
    // zie fixture 5).
    expect(nieuw.expenseHistory).toEqual([
      { month: '2026-01', value: 0 },
      { month: '2026-02', value: 3500 },
      { month: '2026-03', value: 3500 },
      { month: '2026-04', value: 3500 },
      { month: '2026-05', value: 3500 },
      { month: '2026-06', value: 3500 },
      { month: '2026-07', value: 3500 },
    ])
    expect(oud.expenseHistory).toEqual(nieuw.expenseHistory)
  })

  it('fixture 2: de NET-VERMOGEN-DELTA-tak wint van de profiel-fallback (57,2 %)', async () => {
    const { nieuw, oud } = await runBothPaths(buildFixtures()[1].db)
    // Geen positieve transactie ⇒ aggregaat-quote 0 ⇒ isEstimate.
    expect(oud.savingsRate6m).toBe(57.2)
    expect(nieuw.savingsRate6m).toBe(57.2)
    // Zowel de aggregaat-uitkomst (0) als de profiel-fallback (72) zijn hiermee
    // aantoonbaar NIET wat er getoond wordt — de delta-tak is echt gelopen.
    expect(nieuw.savingsRate6m).not.toBe(0)
    expect(nieuw.savingsRate6m).not.toBe(72)
    // De bundel markeert dit als schatting; `isEstimate` blijft de uitspraak van
    // de AGGREGAAT-formule, ook nu de delta-tak een getal leverde.
    const { bundle } = await runBothPaths(buildFixtures()[1].db)
    expect(bundle.savingsRateIsEstimate).toBe(true)
    // Effective grondslag: geen transactie-inkomen ⇒ profielinkomen; wél
    // transactie-uitgaven ⇒ die winnen van de profielschatting (3000).
    expect(nieuw.monthlyIncome).toBe(5000)
    expect(nieuw.monthlyExpenses).toBe(1400)
    // De snapshot zónder savings_rate valt uit de reeks — géén 0-fallback.
    expect(nieuw.savingsHistory).toEqual([
      { month: '2026-01-01', value: 12.5 },
      { month: '2026-07-01', value: 18 },
    ])
    expect(nieuw.expenseHistory).toEqual([
      { month: '2026-05', value: 1200 },
      { month: '2026-06', value: 1300 },
      { month: '2026-07', value: 1400 },
    ])
    expect(oud.savingsHistory).toEqual(nieuw.savingsHistory)
    expect(oud.expenseHistory).toEqual(nieuw.expenseHistory)
  })

  it("fixture 6: 'auto' met budgetten ⇒ de BUDGETgrondslag wint, op beide paden gelijk (ADR 0103)", async () => {
    const { nieuw, oud } = await runBothPaths(buildFixtures()[5].db)
    // De budgetgrondslag is sinds de correctie van 11 aug 2026 de REALISATIE op
    // de budgetten. De fixture-budgetten dragen geen `created_at`, dus de deler is
    // het VOLLE venster (12). €4.000 op het inkomstenbudget over het jaar ⇒
    // €4.000/jr ≈ €333,33/mnd. Vóór de correctie stond hier €5.000 (de geplande
    // €60.000/jr).
    expect(nieuw.monthlyIncome).toBeCloseTo(4000 / 12, 6)
    expect(oud.monthlyIncome).toBe(nieuw.monthlyIncome)
    // DRAGENDE INVARIANT: het SPAARbudget telt NIET mee in de uitgavengrondslag
    // — ook niet op realisatie. Alleen de €1.200 op het expense-KIND telt
    // (⇒ €1.200/jr = €100/mnd); anders zou de spaarbudget-correctie in
    // resolveSavingsSource weer nodig zijn.
    expect(nieuw.monthlyExpenses).toBe(100)
    expect(oud.monthlyExpenses).toBe(100)
  })

  it("fixture 3: bij income_source='manual' wint het profiel in monthlyIncome, NIET in savingsRate6m", async () => {
    const { nieuw, oud } = await runBothPaths(buildFixtures()[2].db)
    expect(nieuw.monthlyIncome).toBe(8000)
    expect(nieuw.monthlyExpenses).toBe(2500)
    // Dezelfde transacties als fixture 1 ⇒ dezelfde TRANSACTIEquote (54 %). De
    // handmatige €8000/€2500 zou (8000 − 2500)/8000 = 68,75 % geven; dát is de
    // EFFECTIEVE spaarquote (resolveSavingsSource) en een ander getal dan dit veld.
    expect(nieuw.savingsRate6m).toBe(54)
    expect(oud.savingsRate6m).toBe(54)
    expect(nieuw.savingsRate6m).not.toBe(68.8)
    expect(oud.monthlyIncome).toBe(8000)
    expect(oud.monthlyExpenses).toBe(2500)
  })

  it('fixture 4: de maandgrenzen tellen precies de juiste dagen mee (90,5 %)', async () => {
    const { nieuw, oud } = await runBothPaths(buildFixtures()[3].db)
    // Venster = jan t/m jun (zes VOLTOOIDE maanden). 31 jan (9000/−0) valt er nu
    // WEL in; 1 en 31 juli — de lopende maand — vallen erbuiten. In UTC+2 zou een
    // `toISOString()`-grens 30 juni de julimaand in trekken en dus uit het venster
    // duwen; dat die €4000/−€1000 meetellen is exact de TZ-getuige.
    // income6m 9000+6000+4000 = 19000 · expenses6m 2000+1000 = 3000 · aflossing 1200
    // ⇒ (19000 − 3000 + 1200) / 19000 × 100 = 90,526… → 90,5
    expect(nieuw.savingsRate6m).toBe(90.5)
    expect(oud.savingsRate6m).toBe(90.5)
    // Huidige maand = [1 jul, 1 aug): 30 juni valt erbuiten, 31 juli erin.
    expect(nieuw.monthlyIncome).toBe(3000)
    expect(nieuw.monthlyExpenses).toBe(500)
    expect(nieuw.expenseHistory).toEqual([
      { month: '2026-01', value: 0 },
      { month: '2026-02', value: 2000 },
      { month: '2026-06', value: 1000 },
      { month: '2026-07', value: 500 },
    ])
    expect(oud.expenseHistory).toEqual(nieuw.expenseHistory)
  })

  it('fixture 5: de lege maand laat een GAT, de reeks schuift niet op (77,5 %)', async () => {
    const { nieuw, oud } = await runBothPaths(buildFixtures()[4].db)
    // Vroegste inkomen = februari (de fixture-rijen staan door elkaar; de mock
    // voert `order(date asc).limit(1)` echt uit) ⇒ dataMonths6 = 5 ⇒ extrapolatie
    // naar 6. Venster = jan t/m jun, dus juli (+4000/−1400) valt eruit:
    // income6m 16000 · expenses6m 4600 ⇒ ×6/5 ⇒ extIncome6 19200, extExpenses6 5520,
    // aflossing 1200 ⇒ 14880/19200 = 77,5 %.
    expect(nieuw.savingsRate6m).toBe(77.5)
    expect(oud.savingsRate6m).toBe(77.5)
    // April ONTBREEKT (geen enkele transactie ⇒ geen aggregaat-groep), en de
    // maanden eromheen houden hun eigen waarde: zou de reeks opschuiven, dan zou
    // mei hier 1100 tonen in plaats van 1200. De reeks staat bovendien
    // chronologisch ondanks de door-elkaar-staande invoer.
    expect(nieuw.expenseHistory).toEqual([
      { month: '2026-02', value: 1000 },
      { month: '2026-03', value: 1100 },
      { month: '2026-05', value: 1200 },
      { month: '2026-06', value: 1300 },
      { month: '2026-07', value: 1400 },
    ])
    expect(nieuw.expenseHistory.map(p => p.month)).not.toContain('2026-04')
    expect(oud.expenseHistory).toEqual(nieuw.expenseHistory)
    expect(nieuw.monthlyIncome).toBe(4000)
    expect(nieuw.monthlyExpenses).toBe(1400)
  })
})

// ── WAARDE-GETUIGEN VOOR DE VERPLAATSTE AFLEIDINGEN ─────────────────────────
//
// De parity-tests hierboven bewijzen de BEDRADING: beide loaders leveren
// hetzelfde. Sinds beide dezelfde helper consumeren kan dat per definitie niet
// meer uiteenlopen — en dus vangen ze een wijziging in de helper ZELF niet: die
// verandert beide kanten identiek en de parity blijft groen.
//
// Daarom pinnen de tests hieronder de SEMANTIEK met harde getallen, los van
// beide loaders. Verschuift de verplaatste logica, dan valt hier iets om.

describe('deriveSavingsHistory — waarde-getuige (de verplaatste snapshot-reeks)', () => {
  it('leest savings_rate per snapshot en laat rijen zonder waarde WEG (geen 0-fallback)', () => {
    const rows: NetWorthSnapshotRow[] = [
      { snapshot_date: '2026-01-31', net_worth: 1000, savings_rate: 12.5 },
      { snapshot_date: '2026-02-28', net_worth: 2000, savings_rate: null },
      { snapshot_date: '2026-03-31', net_worth: 3000 }, // kolom ontbreekt
      { snapshot_date: '2026-04-30', net_worth: 4000, savings_rate: 0 }, // een ECHTE 0 blijft
      { snapshot_date: '2026-05-31', net_worth: 5000, savings_rate: -3.5 }, // negatief mag
    ]
    expect(deriveSavingsHistory(rows)).toEqual([
      { month: '2026-01-31', value: 12.5 },
      { month: '2026-04-30', value: 0 },
      { month: '2026-05-31', value: -3.5 },
    ])
  })

  it('de maandsleutel is de VOLLEDIGE snapshot_date, niet een YYYY-MM-aggregaatsleutel', () => {
    // Twee snapshots binnen dezelfde kalendermaand blijven twee punten; zou iemand
    // hier op maand aggregeren "voor consistentie met expenseHistory", dan valt dit om.
    const rows: NetWorthSnapshotRow[] = [
      { snapshot_date: '2026-06-01', net_worth: 1, savings_rate: 10 },
      { snapshot_date: '2026-06-30', net_worth: 2, savings_rate: 20 },
    ]
    expect(deriveSavingsHistory(rows)).toEqual([
      { month: '2026-06-01', value: 10 },
      { month: '2026-06-30', value: 20 },
    ])
  })

  it('leest string-percentages als getal (PostgREST numeric komt als string terug)', () => {
    expect(deriveSavingsHistory([
      { snapshot_date: '2026-01-31', net_worth: 1, savings_rate: '18.4' as unknown as number },
    ])).toEqual([{ month: '2026-01-31', value: 18.4 }])
  })
})

describe('toSortedMonthHistory / deriveExpenseHistory — waarde-getuige', () => {
  it('sorteert lexicografisch op maandsleutel — dus chronologisch, óók over een jaargrens', () => {
    const m = new Map([['2026-01', 10], ['2025-12', 20], ['2026-10', 30], ['2026-02', 40]])
    expect(toSortedMonthHistory(m)).toEqual([
      { month: '2025-12', value: 20 },
      { month: '2026-01', value: 10 },
      { month: '2026-02', value: 40 },
      { month: '2026-10', value: 30 },
    ])
  })

  it('laat een lege maand WEG en vult niet met 0 (het gat blijft een gat)', () => {
    const agg = buildMonthAggregatesFromRows([
      { amount: -100, date: '2026-02-10', budget_id: null, transaction_type: null },
      { amount: -300, date: '2026-04-10', budget_id: null, transaction_type: null },
    ])
    expect(deriveExpenseHistory(agg)).toEqual([
      { month: '2026-02', value: 100 },
      { month: '2026-04', value: 300 },
    ])
  })

  it('telt uitgaven absoluut, laat (joint_)transfers vallen en zet een inkomen-only-maand op 0', () => {
    const agg = buildMonthAggregatesFromRows([
      { amount: 2500, date: '2026-02-01', budget_id: null, transaction_type: null }, // alleen inkomen
      { amount: -100, date: '2026-03-01', budget_id: null, transaction_type: null },
      { amount: -900, date: '2026-03-02', budget_id: null, transaction_type: 'transfer' },
      { amount: -50, date: '2026-03-03', budget_id: null, transaction_type: 'joint_transfer' },
    ])
    expect(deriveExpenseHistory(agg)).toEqual([
      { month: '2026-02', value: 0 },
      { month: '2026-03', value: 100 },
    ])
  })
})

describe('deriveDataMonths6 — waarde-getuige (de extrapolatie-teller)', () => {
  const nu = new Date(2026, 6, 15) // juli 2026

  it('telt KALENDERmaanden, niet dagen', () => {
    // 30 juni → juli is één kalendermaand, ook al is het 15 dagen.
    expect(deriveDataMonths6(nu, '2026-06-30')).toBe(1)
    // 1 juli → juli is nul kalendermaanden, en wordt op 1 geklemd.
    expect(deriveDataMonths6(nu, '2026-07-01')).toBe(1)
  })

  it('klemt op [1, 6] en telt over de jaargrens door', () => {
    expect(deriveDataMonths6(nu, '2026-04-01')).toBe(3)
    expect(deriveDataMonths6(nu, '2026-01-01')).toBe(6)
    expect(deriveDataMonths6(nu, '2024-01-01')).toBe(6) // 30 maanden → geklemd
    expect(deriveDataMonths6(nu, '2026-12-01')).toBe(1) // toekomst → negatief → geklemd
  })

  it('geen inkomsten-datum ⇒ 6 (géén extrapolatie)', () => {
    expect(deriveDataMonths6(nu, null)).toBe(6)
    expect(deriveDataMonths6(nu, undefined)).toBe(6)
    expect(deriveDataMonths6(nu, '')).toBe(6)
  })
})

describe('deriveSavingsRate6mWindow — waarde-getuige (het 6-maands sub-venster)', () => {
  // Juli 2026 ⇒ venster = zes VOLTOOIDE maanden: '2026-01' t/m '2026-06'. Juli
  // zelf loopt nog en valt er per definitie buiten (bevinding C6).
  const nu = new Date(2026, 6, 15)
  const spaar = new Set([B_SAVINGS])

  const agg = buildMonthAggregatesFromRows([
    // December 2025 = de 7e voltooide maand terug: valt er NET buiten.
    { amount: 7777, date: '2025-12-31', budget_id: null, transaction_type: null },
    { amount: -6666, date: '2025-12-31', budget_id: null, transaction_type: null },
    // Januari = de 6e voltooide maand terug: valt er NET binnen.
    { amount: 9999, date: '2026-01-31', budget_id: null, transaction_type: null },
    { amount: -8888, date: '2026-01-31', budget_id: null, transaction_type: null },
    { amount: 4000, date: '2026-02-01', budget_id: null, transaction_type: null },
    { amount: -1000, date: '2026-02-02', budget_id: null, transaction_type: null },
    { amount: -250, date: '2026-02-03', budget_id: B_SAVINGS, transaction_type: null },
    // Juli = de LOPENDE maand: valt er NET buiten — dit is de C6-getuige.
    { amount: 6000, date: '2026-07-01', budget_id: null, transaction_type: null },
    { amount: -2000, date: '2026-07-02', budget_id: null, transaction_type: null },
    // Transfers tellen nergens mee.
    { amount: 50000, date: '2026-07-03', budget_id: null, transaction_type: 'transfer' },
    { amount: -50000, date: '2026-07-04', budget_id: B_SAVINGS, transaction_type: 'joint_transfer' },
  ])

  it('zes VOLTOOIDE kalendermaanden — de lopende maand én de zevende vallen eruit', () => {
    expect(deriveSavingsRate6mWindow(nu, agg, spaar)).toEqual({
      income6m: 13999, // 9999 + 4000; december (7777) en juli (6000) tellen niet mee
      expenses6m: 10138, // 8888 + 1000 + 250; december (6666) en juli (2000) niet
      savingsBudgetSpent6m: 250, // alleen de echte spaarbudget-rij
    })
  })

  it('de lopende maand is de enige reden dat juli wegvalt (bevinding C6)', () => {
    // Zonder de bovengrens zou juli meetellen. Dat de julirijen NIET in de sommen
    // zitten terwijl ze wél in het aggregaat staan, is precies wat de fix bewaakt:
    // een halve maand (uitgaven al geboekt, salaris nog niet) mag het 6-maands
    // gemiddelde niet vervuilen.
    const w = deriveSavingsRate6mWindow(nu, agg, spaar)
    expect(w.income6m).not.toBe(19999) // 13999 + 6000 = het oude, vervuilde venster
    expect(w.expenses6m).not.toBe(12138) // 10138 + 2000
  })

  it('een lege spaarbudget-set levert 0 spaarcorrectie (en laat de rest ongemoeid)', () => {
    const zonder = deriveSavingsRate6mWindow(nu, agg, new Set())
    expect(zonder.savingsBudgetSpent6m).toBe(0)
    expect(zonder.income6m).toBe(13999)
    expect(zonder.expenses6m).toBe(10138)
  })

  it('budgetIdsOfType levert de spaarbudget-set uit de type-map (parent + child)', () => {
    const map = new Map([['p', 'savings'], ['k', 'savings'], ['e', 'expense']])
    expect([...budgetIdsOfType(map, 'savings')].sort()).toEqual(['k', 'p'])
    expect([...budgetIdsOfType(map, 'debt')]).toEqual([])
  })
})

describe('resolveSavingsRate6m — waarde-getuige (de spaarquote-keten incl. fallbacks)', () => {
  const GEEN_SNAPSHOTS: NetWorthSnapshotRow[] = []
  /** Halfjaar 1 jan → 1 jul 2026 = 181 dagen = 181/30,44 = 5,946… maanden. */
  const HALFJAAR: NetWorthSnapshotRow[] = [
    { snapshot_date: '2026-01-01', net_worth: 100000 },
    { snapshot_date: '2026-07-01', net_worth: 118000 },
  ]
  /** €50.000 × 4 % = €2000 verwachte jaarlijkse koerswinst. */
  const BELEGGING = [{
    id: 'a', asset_type: 'investment', current_value: 50000, expected_return: 4,
    depreciation_rate: null, net_worth_inclusion_pct: 100,
  }] as unknown as Parameters<typeof resolveSavingsRate6m>[0]['assets']

  const BASIS = {
    income6m: 30000,
    expenses6m: 21000,
    savingsBudgetSpent6m: 3000,
    debtAflossing6m: 1200,
    dataMonths: 6,
    effectiveMonthlyIncome: 5000,
    effectiveMonthlyExpenses: 3000,
  }

  it('normale tak: (inkomen − (uitgaven − spaarbudget) + aflossing) / inkomen', () => {
    // (30000 − 18000 + 1200) / 30000 × 100 = 44
    const r = resolveSavingsRate6m({ ...BASIS, netWorthSnapshots: GEEN_SNAPSHOTS, assets: [] })
    expect(r.savingsRate6m).toBe(44)
    expect(r.isEstimate).toBe(false)
    expect(r.extIncome6).toBe(30000)
  })

  it('normale tak: de snapshots worden NIET aangeraakt zolang er een transactiequote is', () => {
    // Zelfde invoer, maar mét snapshots én een belegging. De delta-tak zou hier een
    // heel ander getal geven; dat 44 blijft staan, is de poort-getuige.
    const r = resolveSavingsRate6m({ ...BASIS, netWorthSnapshots: HALFJAAR, assets: BELEGGING })
    expect(r.savingsRate6m).toBe(44)
  })

  it('<6 maanden data wordt geëxtrapoleerd naar een 6-maands basis', () => {
    // dataMonths 3 ⇒ ×2 op inkomen/uitgaven/spaarbudget, aflossing blijft 1200:
    // (60000 − (42000 − 6000) + 1200) / 60000 × 100 = 42
    const r = resolveSavingsRate6m({ ...BASIS, dataMonths: 3, netWorthSnapshots: GEEN_SNAPSHOTS, assets: [] })
    expect(r.savingsRate6m).toBe(42)
    expect(r.extIncome6).toBe(60000)
  })

  it('profiel-fallback: geen transactie-inkomen en geen snapshots ⇒ (5000 − 3000)/5000 = 40 %', () => {
    const r = resolveSavingsRate6m({
      ...BASIS, income6m: 0, expenses6m: 0, savingsBudgetSpent6m: 0,
      netWorthSnapshots: GEEN_SNAPSHOTS, assets: [],
    })
    expect(r.savingsRate6m).toBe(40)
    expect(r.isEstimate).toBe(true)
  })

  it('delta-tak ZONDER beleggingen: 18000 / 5,946 mnd / 5000 = 60,5 %', () => {
    const r = resolveSavingsRate6m({
      ...BASIS, income6m: 0, expenses6m: 0, savingsBudgetSpent6m: 0,
      netWorthSnapshots: HALFJAAR, assets: [],
    })
    expect(r.savingsRate6m).toBe(60.5)
    // De profiel-fallback (40) is aantoonbaar overschreven.
    expect(r.savingsRate6m).not.toBe(40)
    // …en `isEstimate` blijft de uitspraak van de AGGREGAAT-formule.
    expect(r.isEstimate).toBe(true)
  })

  it('delta-tak MÉT beleggingen: de verwachte koerswinst gaat eraf ⇒ 57,2 %', () => {
    // appreciation = 2000 × (5,946/12) ≈ 991,13 ⇒ (18000 − 991,13)/5,946/5000 × 100
    const r = resolveSavingsRate6m({
      ...BASIS, income6m: 0, expenses6m: 0, savingsBudgetSpent6m: 0,
      netWorthSnapshots: HALFJAAR, assets: BELEGGING,
    })
    expect(r.savingsRate6m).toBe(57.2)
  })

  it('delta-tak slaat NIET aan bij één snapshot, bij nul inkomen, of bij een te kort venster', () => {
    const zonderTxQuote = {
      ...BASIS, income6m: 0, expenses6m: 0, savingsBudgetSpent6m: 0, assets: [],
    }
    // Eén snapshot ⇒ geen delta ⇒ profiel-fallback (40).
    expect(resolveSavingsRate6m({
      ...zonderTxQuote, netWorthSnapshots: [HALFJAAR[0]],
    }).savingsRate6m).toBe(40)
    // Geen effectief inkomen ⇒ geen delta én geen profiel-fallback ⇒ 0.
    expect(resolveSavingsRate6m({
      ...zonderTxQuote, effectiveMonthlyIncome: 0, netWorthSnapshots: HALFJAAR,
    }).savingsRate6m).toBe(0)
    // Minder dan 28 dagen tussen eerste en laatste snapshot ⇒ geen delta ⇒ 40.
    expect(resolveSavingsRate6m({
      ...zonderTxQuote,
      netWorthSnapshots: [
        { snapshot_date: '2026-06-10', net_worth: 100000 },
        { snapshot_date: '2026-07-01', net_worth: 118000 },
      ],
    }).savingsRate6m).toBe(40)
  })
})
