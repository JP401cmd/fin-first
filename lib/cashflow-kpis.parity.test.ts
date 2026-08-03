/**
 * PARITY: `loadDashboardData` (het oude, volledige pad) ↔ `loadCashflowKpis`
 * (de slanke laag) — ADR 0077.
 *
 * Dit is GEEN test van een helper tegen zichzelf. Beide paden draaien hier écht,
 * end-to-end, tegen dezelfde nep-database: pad A is de volledige productieloader
 * (~40 queries, alle afleidingen) waar we achteraf de zeven kaart-scalars uit
 * selecteren; pad B is de nieuwe loader met zijn vier fetches. Als de extractie
 * ook maar één afleiding zou hebben verschoven, wijkt hier een veld af.
 *
 * De nep-database (`test/helpers/fake-supabase.ts`, gedeeld met de forecast-
 * pariteitstest) is bewust datum- en cap-getrouw:
 *   • `.gte/.lt/.eq/...` op transacties worden ECHT toegepast, zodat
 *     maandgrenzen (fixture 4) betekenis hebben;
 *   • elk `from(...)`-antwoord wordt op 1000 rijen afgekapt — precies wat
 *     PostgREST doet (`supabase/config.toml` → `max_rows = 1000`), zodat
 *     fixture 3 de stille afkap reproduceert in plaats van hem te beweren;
 *   • de `tx_month_aggregate`-RPC wordt uit dezelfde rijen opgebouwd met
 *     `buildMonthAggregatesFromRows` (de geteste TS-spiegel van de SQL) en kent
 *     die afkap NIET — precies zoals een SQL-aggregaat.
 *
 * Bewust gehele bedragen ⇒ float-sommen zijn exact ongeacht de groepering; de
 * vergelijkingen zijn dus byte-identiek en niet "dicht bij".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { DashboardData } from '@/lib/types/dashboard'
import { makeSupabase, type FakeDb, type Row } from '@/test/helpers/fake-supabase'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import {
  loadCashflowKpis,
  currentMonthKey,
  deriveBudgetTotals,
  deriveBudgetScore,
  deriveRealMonthTotals,
  resolveBudgetingActive,
  type CashflowCardScalars,
  type BudgetRowForTotals,
  type MonthTxRow,
} from '@/lib/cashflow-kpis'

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Bevroren klok. Beide paden leiden hun maandsleutel INTERN uit `new Date()` af;
 * zonder bevriezing kan er een maandgrens tussen vallen. 15 juli 2026, 12:00
 * lokaal — midden in de zomertijd (UTC+2), zodat een `toISOString()`-terugschuif
 * zichtbaar zou worden.
 */
const NOW = new Date(2026, 6, 15, 12, 0, 0)
const THIS_MONTH = '2026-07'
const PREV_MONTH = '2026-06'

const B_EXPENSE = 'budget-expense'
const B_EXPENSE_KID = 'budget-expense-kid'
const B_SAVINGS = 'budget-savings'
const B_INCOME = 'budget-income'

type Tx = { amount: number; date: string; budget_id: string | null; transaction_type: string | null }

const tx = (amount: number, date: string, budget_id: string | null = null, transaction_type: string | null = null): Tx =>
  ({ amount, date, budget_id, transaction_type })

/** Standaard-budgetset: één expense-parent met kind, één savings, één income. */
const BUDGETS: Row[] = [
  { id: B_EXPENSE, parent_id: null, budget_type: 'expense', default_limit: 9999, interval: 'monthly', name: 'Uitgaven', icon: '', is_favorite: false, is_essential: true, alert_threshold: 80, sort_order: 1 },
  { id: B_EXPENSE_KID, parent_id: B_EXPENSE, budget_type: 'expense', default_limit: 2000, interval: 'monthly', name: 'Boodschappen', icon: '', is_favorite: false, is_essential: false, alert_threshold: 80, sort_order: 2 },
  { id: B_SAVINGS, parent_id: null, budget_type: 'savings', default_limit: 1200, interval: 'quarterly', name: 'Sparen', icon: '', is_favorite: false, is_essential: false, alert_threshold: 80, sort_order: 3 },
  { id: B_INCOME, parent_id: null, budget_type: 'income', default_limit: 36000, interval: 'yearly', name: 'Inkomen', icon: '', is_favorite: false, is_essential: false, alert_threshold: 80, sort_order: 4 },
]

/** Profiel-basis: géén dob/vermogen ⇒ de dure horizon-tak blijft uit. */
const PROFILE_BASE: Row = {
  id: 'user-parity',
  full_name: 'Parity',
  date_of_birth: null,
  budgeting_active: true,
  net_monthly_income: 5000,
  estimated_monthly_expenses: 3000,
  income_source: 'auto',
  expenses_source: 'auto',
}

interface Fixture {
  label: string
  db: FakeDb
}

function buildFixtures(): Fixture[] {
  // ── 1. income_source = 'manual', profielbedrag ≠ transactiesom ────────────
  // Dit is de fixture die de EFFECTIVE grondslag bewaakt (ADR 0073): de kaart
  // moet de gerealiseerde maand tonen, de vaste-lasten-quote het profielbedrag.
  const manual: Row[] = [
    tx(2500, `${THIS_MONTH}-05`),
    tx(-1750, `${THIS_MONTH}-06`, B_EXPENSE_KID),
    tx(-400, `${THIS_MONTH}-07`, B_SAVINGS),
    tx(9000, `${THIS_MONTH}-08`, null, 'transfer'),
    tx(-9000, `${THIS_MONTH}-09`, null, 'joint_transfer'),
    // Transfer MÉT budget_id: telt WÉL mee in budgetTotals.spent (die pass heeft
    // bewust geen transfer-filter) en NIET in currentMonthExpenses (die wél).
    // Dat contrast is de end-to-end getuige van de filterloze spent-pass.
    tx(-300, `${THIS_MONTH}-10`, B_EXPENSE_KID, 'transfer'),
    tx(3100, `${PREV_MONTH}-25`),
  ]

  // ── 2. transactioneel (income_source niet manual) ────────────────────────
  const transactioneel: Row[] = [
    tx(4200, `${THIS_MONTH}-01`, B_INCOME),
    tx(-1300, `${THIS_MONTH}-02`, B_EXPENSE_KID),
    tx(-250, `${THIS_MONTH}-03`, B_EXPENSE),
    tx(-600, `${THIS_MONTH}-11`, B_SAVINGS),
    tx(-77, `${THIS_MONTH}-12`),
    tx(2000, `${PREV_MONTH}-20`),
    tx(-1500, `${PREV_MONTH}-21`, B_EXPENSE_KID),
  ]

  // ── 3. >1000 rijen in het venster (afkap-getuige) ────────────────────────
  const veel: Row[] = []
  for (let i = 0; i < 1200; i++) veel.push(tx(-10, `${THIS_MONTH}-10`, B_EXPENSE_KID))
  veel.push(tx(6000, `${THIS_MONTH}-25`))
  veel.push(tx(-500, `${THIS_MONTH}-26`, B_SAVINGS))

  // ── 4. maandgrens (TZ-lint / localMonthBounds) ───────────────────────────
  // Eén rij op de LAATSTE dag van de vorige maand, één op de EERSTE en één op de
  // laatste dag van deze maand. In UTC+2 zou een `toISOString()`-grens de
  // 30-juni-rij de julimaand in trekken.
  const grens: Row[] = [
    tx(1111, `${PREV_MONTH}-30`),
    tx(-222, `${PREV_MONTH}-30`, B_EXPENSE_KID),
    tx(3333, `${THIS_MONTH}-01`),
    tx(-444, `${THIS_MONTH}-01`, B_EXPENSE_KID),
    tx(-55, `${THIS_MONTH}-31`, B_EXPENSE_KID),
  ]

  return [
    {
      label: "1. income_source='manual' (profielbedrag ≠ transactiesom)",
      db: {
        profile: { ...PROFILE_BASE, income_source: 'manual', expenses_source: 'manual', net_monthly_income: 5000, estimated_monthly_expenses: 3000 },
        budgets: BUDGETS,
        transactions: manual,
      },
    },
    {
      label: '2. transactioneel (income_source = auto)',
      db: { profile: { ...PROFILE_BASE }, budgets: BUDGETS, transactions: transactioneel },
    },
    {
      label: '3. >1000 rijen in het venster (stille max_rows-afkap)',
      db: { profile: { ...PROFILE_BASE }, budgets: BUDGETS, transactions: veel },
    },
    {
      label: '4. maandgrens (localMonthBounds, UTC+2)',
      db: { profile: { ...PROFILE_BASE }, budgets: BUDGETS, transactions: grens },
    },
    {
      label: '5. budgetingActive = false / limit = 0',
      db: {
        profile: { ...PROFILE_BASE, budgeting_active: false },
        budgets: [
          { id: B_EXPENSE, parent_id: null, budget_type: 'expense', default_limit: 0, interval: 'monthly', name: 'Uitgaven', icon: '', is_favorite: false, is_essential: true, alert_threshold: 80, sort_order: 1 },
        ],
        transactions: [tx(1800, `${THIS_MONTH}-04`), tx(-900, `${THIS_MONTH}-05`, B_EXPENSE)],
      },
    },
  ]
}

// ── De zeven velden uit het OUDE pad ────────────────────────────────────────

/** Selecteert precies de zeven scalars die `buildCashflowCards` uit de bundel leest. */
function sevenFromBundle(d: DashboardData): CashflowCardScalars {
  return {
    budgetTotals: { expense: { limit: d.budgetTotals.expense.limit, spent: d.budgetTotals.expense.spent } },
    monthSummary: { budgetScore: d.monthSummary.budgetScore },
    budgetingActive: d.budgetingActive,
    currentMonthIncome: d.currentMonthIncome,
    currentMonthExpenses: d.currentMonthExpenses,
    monthlyIncome: d.monthlyIncome,
    monthlyExpenses: d.monthlyExpenses,
  }
}

async function runBothPaths(db: FakeDb) {
  const oud = makeSupabase(db)
  const nieuw = makeSupabase(db)
  const bundle = await loadDashboardData(oud.client)
  const slank = await loadCashflowKpis(nieuw.client)
  return {
    oud: sevenFromBundle(bundle.dashboardData),
    nieuw: slank,
    bundle: bundle.dashboardData,
    oudQueries: oud.tableQueries(),
    nieuwQueries: nieuw.tableQueries(),
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('loadCashflowKpis ↔ loadDashboardData — parity op alle zeven velden', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(buildFixtures())('$label — zeven velden identiek', async ({ db }) => {
    const { oud, nieuw } = await runBothPaths(db)
    expect(nieuw).toEqual(oud)
    // Expliciet per veld, zodat een falende run meteen benoemt wélk veld dreef.
    expect(nieuw.budgetTotals.expense.limit).toBe(oud.budgetTotals.expense.limit)
    expect(nieuw.budgetTotals.expense.spent).toBe(oud.budgetTotals.expense.spent)
    expect(nieuw.monthSummary.budgetScore).toBe(oud.monthSummary.budgetScore)
    expect(nieuw.budgetingActive).toBe(oud.budgetingActive)
    expect(nieuw.currentMonthIncome).toBe(oud.currentMonthIncome)
    expect(nieuw.currentMonthExpenses).toBe(oud.currentMonthExpenses)
    expect(nieuw.monthlyIncome).toBe(oud.monthlyIncome)
    expect(nieuw.monthlyExpenses).toBe(oud.monthlyExpenses)
  })

  it('de slanke laag doet aantoonbaar minder tabel-queries', async () => {
    const { oudQueries, nieuwQueries } = await runBothPaths(buildFixtures()[1].db)
    expect(nieuwQueries).toBeLessThan(oudQueries)
    // Vier fetches: profiel, budgetten, huidige-maand-tx (+ het aggregaat via RPC).
    // Dit getal is een BUDGET, geen momentopname: komt er een fetch bij, verhoog
    // 'm bewust en verantwoord waarom. Nooit versoepelen naar een ongelijkheid —
    // dan verdwijnt precies de bewaking waarvoor deze assertie bestaat.
    expect(nieuwQueries).toBe(3)
  })
})

describe('de twee grondslagen blijven uit elkaar (ADR 0073)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("fixture 1: bij income_source='manual' wint het profiel in monthlyIncome, NIET in currentMonthIncome", async () => {
    const { nieuw, oud } = await runBothPaths(buildFixtures()[0].db)
    // Gerealiseerd deze maand: 2500 in, 1750 + 400 = 2150 uit (transfers tellen niet mee).
    expect(nieuw.currentMonthIncome).toBe(2500)
    expect(nieuw.currentMonthExpenses).toBe(2150)
    // ── Filterloze spent-pass, end-to-end ───────────────────────────────────
    // De -300-transfer draagt een budget_id en telt dus WÉL mee in `spent`
    // (1750 + 300 = 2050), terwijl hij in `currentMonthExpenses` (2150) juist
    // NIET meetelt. Corrigeert iemand de spent-pass ooit "logisch" naar een
    // transfer-filter, dan valt deze assertie om — op beide paden tegelijk.
    expect(nieuw.budgetTotals.expense.spent).toBe(2050)
    expect(oud.budgetTotals.expense.spent).toBe(2050)
    expect(nieuw.budgetTotals.expense.spent).not.toBe(nieuw.currentMonthExpenses)
    // Effective: de handmatige profielbedragen winnen — een ANDER getal.
    expect(nieuw.monthlyIncome).toBe(5000)
    expect(nieuw.monthlyExpenses).toBe(3000)
    // En het oude pad zegt exact hetzelfde: de asymmetrie is niet weggerefactord.
    expect(oud.currentMonthIncome).toBe(2500)
    expect(oud.monthlyIncome).toBe(5000)
    // Zouden de twee grondslagen ooit worden gelijkgetrokken, dan valt dit om.
    expect(nieuw.monthlyIncome).not.toBe(nieuw.currentMonthIncome)
  })

  it('fixture 2: zonder manual-override volgt monthlyIncome de transactiesom', async () => {
    const { nieuw, oud } = await runBothPaths(buildFixtures()[1].db)
    expect(nieuw.currentMonthIncome).toBe(4200)
    expect(nieuw.currentMonthExpenses).toBe(1300 + 250 + 600 + 77)
    // 'auto' + transacties aanwezig ⇒ effective == de transactiesom van deze maand.
    expect(nieuw.monthlyIncome).toBe(4200)
    expect(nieuw.monthlyExpenses).toBe(1300 + 250 + 600 + 77)
    // ── Kind-oprol, end-to-end ──────────────────────────────────────────────
    // De expense-PARENT heeft default_limit 9999, maar hij heeft een kind van
    // 2000 — de kinderen winnen. Beide paden moeten 2000 tonen, niet 9999.
    expect(nieuw.budgetTotals.expense.limit).toBe(2000)
    expect(oud.budgetTotals.expense.limit).toBe(2000)
    expect(nieuw.budgetTotals.expense.spent).toBe(1300 + 250)
    // Dekkings-score over álle vier de types met limit>0 (zie de waarde-getuige
    // hieronder voor de volledige uitwerking): (60 + 100 + 50) / 3 = 70.
    expect(nieuw.monthSummary.budgetScore).toBe(70)
    expect(oud.monthSummary.budgetScore).toBe(70)
  })

  it('fixture 3: het AGGREGAAT telt door voorbij 1000 rijen, de rauwe pass niet — en beide paden zien hetzelfde', async () => {
    const { oud, nieuw } = await runBothPaths(buildFixtures()[2].db)
    // 1200 × 10 + 500 = 12.500 aan echte uitgaven; het aggregaat kent geen cap.
    expect(nieuw.currentMonthExpenses).toBe(12500)
    expect(nieuw.currentMonthIncome).toBe(6000)
    // De rauwe huidige-maand-fetch wordt WÉL op max_rows afgekapt (1000 rijen ×
    // -10 = 10.000, en het salaris valt buiten de eerste 1000 rijen). Dat is
    // bestaand gedrag van getCurrentMonthTx — óók op /overzicht — en wordt hier
    // bewust niet "gerepareerd": dat zou drift tussen de twee paden maken.
    expect(nieuw.monthlyExpenses).toBe(10000)
    expect(nieuw.monthlyExpenses).not.toBe(nieuw.currentMonthExpenses)
    // Het oude pad kapt precies even hard af ⇒ geen enkel veld drijft.
    expect(oud.monthlyExpenses).toBe(nieuw.monthlyExpenses)
    expect(oud.currentMonthExpenses).toBe(nieuw.currentMonthExpenses)
  })

  it('fixture 4: de maandgrens telt alleen deze maand mee', async () => {
    const { nieuw, oud } = await runBothPaths(buildFixtures()[3].db)
    // 30 juni valt erbuiten (zou er bij een toISOString()-grens in UTC+2 in vallen).
    expect(nieuw.currentMonthIncome).toBe(3333)
    expect(nieuw.currentMonthExpenses).toBe(444 + 55)
    expect(oud.currentMonthIncome).toBe(3333)
    expect(oud.currentMonthExpenses).toBe(444 + 55)
  })

  it('fixture 5: budgetingActive=false en limit=0 komen ongeschonden door beide paden', async () => {
    const { nieuw, oud } = await runBothPaths(buildFixtures()[4].db)
    expect(nieuw.budgetingActive).toBe(false)
    expect(nieuw.budgetTotals.expense.limit).toBe(0)
    expect(nieuw.budgetTotals.expense.spent).toBe(900)
    // Geen enkel budget met limit>0 ⇒ score 100 (niets om te overschrijden).
    expect(nieuw.monthSummary.budgetScore).toBe(100)
    expect(oud).toEqual(nieuw)
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
// beide loaders. Dit is tegelijk de reproduceerbare vervanger van de eenmalige
// vóór/ná-refactor-vergelijking: verschuift de verplaatste logica, dan valt hier
// iets om, ook in CI.

describe('deriveBudgetTotals — waarde-getuige (de verplaatste oprol)', () => {
  const budgets = BUDGETS as unknown as BudgetRowForTotals[]

  it('een parent met kinderen krijgt de SOM van de kinderen, niet zijn eigen default_limit', () => {
    // expense-parent: default_limit 9999, kind 2000 ⇒ 2000 wint.
    expect(deriveBudgetTotals(budgets, []).expense.limit).toBe(2000)
  })

  it('normaliseert het interval naar één maand (quarterly ÷3, yearly ÷12)', () => {
    const totals = deriveBudgetTotals(budgets, [])
    expect(totals.savings.limit).toBe(1200 / 3) // 400 — quarterly
    expect(totals.income.limit).toBe(36000 / 12) // 3000 — yearly
    expect(totals.expense.limit).toBe(2000) // monthly blijft ongewijzigd
    expect(totals.debt.limit).toBe(0) // geen debt-budget
  })

  it('een onbekend interval valt terug op ÷12 (bewust: jaarbedrag als default)', () => {
    const raar: BudgetRowForTotals[] = [
      { id: 'x', parent_id: null, budget_type: 'expense', default_limit: 2400, interval: 'sinterklaas' },
    ]
    expect(deriveBudgetTotals(raar, []).expense.limit).toBe(200)
  })

  it('slaat budget-types buiten de vier (bv. archive) over', () => {
    const metArchief: BudgetRowForTotals[] = [
      ...budgets,
      { id: 'arch', parent_id: null, budget_type: 'archive', default_limit: 5000, interval: 'monthly' },
    ]
    const totals = deriveBudgetTotals(metArchief, [])
    expect(totals).toEqual(deriveBudgetTotals(budgets, []))
  })

  it('spent: een TRANSFER met budget_id telt WÉL mee (de pass heeft geen transfer-filter)', () => {
    const rows: MonthTxRow[] = [
      { amount: -100, budget_id: B_EXPENSE_KID, transaction_type: null },
      { amount: -25, budget_id: B_EXPENSE_KID, transaction_type: 'transfer' },
      { amount: -10, budget_id: B_EXPENSE_KID, transaction_type: 'joint_transfer' },
    ]
    // 100 + 25 + 10 = 135. Zou iemand hier isRealTx toevoegen, dan wordt het 100.
    expect(deriveBudgetTotals(budgets, rows).expense.spent).toBe(135)
  })

  it('spent: absoluut (teken-onafhankelijk) en alleen voor rijen MÉT een bekend budget_id', () => {
    const rows: MonthTxRow[] = [
      { amount: -100, budget_id: B_EXPENSE_KID },
      { amount: 40, budget_id: B_EXPENSE_KID }, // positief telt óók, absoluut
      { amount: -999, budget_id: null }, // geen budget ⇒ genegeerd
      { amount: -888, budget_id: 'onbekend-budget' }, // onbekend ⇒ genegeerd
    ]
    expect(deriveBudgetTotals(budgets, rows).expense.spent).toBe(140)
  })

  it('een child erft het type van zijn parent (spent landt op het parent-type)', () => {
    const rows: MonthTxRow[] = [{ amount: -50, budget_id: B_EXPENSE_KID }]
    const totals = deriveBudgetTotals(budgets, rows)
    expect(totals.expense.spent).toBe(50)
    expect(totals.savings.spent).toBe(0)
  })

  it('de volledige fixture-2-uitkomst, alle vier de types', () => {
    const rows: MonthTxRow[] = [
      { amount: 4200, budget_id: B_INCOME },
      { amount: -1300, budget_id: B_EXPENSE_KID },
      { amount: -250, budget_id: B_EXPENSE },
      { amount: -600, budget_id: B_SAVINGS },
      { amount: -77, budget_id: null },
    ]
    expect(deriveBudgetTotals(budgets, rows)).toEqual({
      income: { limit: 3000, spent: 4200 },
      expense: { limit: 2000, spent: 1550 },
      savings: { limit: 400, spent: 600 },
      debt: { limit: 0, spent: 0 },
    })
  })
})

describe('deriveBudgetScore — waarde-getuige (de verplaatste dekkings-score)', () => {
  it('middelt over álle types met limit>0; binnen budget = 100, overschrijding telt lineair af', () => {
    // income 4200/3000 → (1 − 1200/3000)·100 = 60
    // expense 1550/2000 → binnen budget → 100
    // savings 600/400  → (1 − 200/400)·100  = 50
    // debt limit 0     → telt niet mee
    // gemiddelde = (60 + 100 + 50) / 3 = 70
    expect(deriveBudgetScore({
      income: { limit: 3000, spent: 4200 },
      expense: { limit: 2000, spent: 1550 },
      savings: { limit: 400, spent: 600 },
      debt: { limit: 0, spent: 0 },
    })).toBe(70)
  })

  it('geen enkel budget met een limiet ⇒ 100 (er valt niets te overschrijden)', () => {
    expect(deriveBudgetScore({
      income: { limit: 0, spent: 0 },
      expense: { limit: 0, spent: 900 },
      savings: { limit: 0, spent: 0 },
      debt: { limit: 0, spent: 0 },
    })).toBe(100)
  })

  it('is bovenaan geklemd op 100 maar ONDERAAN bewust niet — een forse overschrijding gaat negatief', () => {
    // expense 10000/2000 → (1 − 8000/2000)·100 = −300; met drie andere types op
    // 100/100/0-limiet ⇒ (−300 + 100 + 100)/3 = −33,33 → −33.
    expect(deriveBudgetScore({
      income: { limit: 3000, spent: 0 },
      expense: { limit: 2000, spent: 10000 },
      savings: { limit: 400, spent: 0 },
      debt: { limit: 0, spent: 0 },
    })).toBe(-33)
    // Ver onder nul blijft het doorlopen — bestaand gedrag, geen ondergrens.
    // limit 100, spent 10100 ⇒ (1 − 10000/100)·100 = −9900, enige type met limiet.
    expect(deriveBudgetScore({
      income: { limit: 0, spent: 0 },
      expense: { limit: 100, spent: 10100 },
      savings: { limit: 0, spent: 0 },
      debt: { limit: 0, spent: 0 },
    })).toBe(-9900)
  })
})

describe('deriveRealMonthTotals — waarde-getuige (de verplaatste rauwe maand-pass)', () => {
  it('splitst op teken, neemt uitgaven absoluut en laat (joint_)transfers vallen', () => {
    const rows: MonthTxRow[] = [
      { amount: 2500 },
      { amount: -1750, budget_id: B_EXPENSE_KID },
      { amount: -400, budget_id: B_SAVINGS },
      { amount: 9000, transaction_type: 'transfer' },
      { amount: -9000, transaction_type: 'joint_transfer' },
      { amount: -300, budget_id: B_EXPENSE_KID, transaction_type: 'transfer' },
      { amount: 0 },
    ]
    expect(deriveRealMonthTotals(rows)).toEqual({ income: 2500, expenses: 2150 })
  })

  it('leest string-bedragen als getal (PostgREST numeric komt als string terug)', () => {
    expect(deriveRealMonthTotals([{ amount: '1200.50' }, { amount: '-200.25' }]))
      .toEqual({ income: 1200.5, expenses: 200.25 })
  })
})

describe('resolveBudgetingActive — waarde-getuige', () => {
  it('alleen een expliciete false zet de gate uit', () => {
    expect(resolveBudgetingActive({ budgeting_active: false })).toBe(false)
    expect(resolveBudgetingActive({ budgeting_active: true })).toBe(true)
    expect(resolveBudgetingActive({ budgeting_active: null })).toBe(true)
    expect(resolveBudgetingActive({})).toBe(true) // kolom ontbreekt
    expect(resolveBudgetingActive(null)).toBe(true) // geen profielrij
  })
})

// ── Anti-drift op de maandsleutel ───────────────────────────────────────────
// `loadDashboardData` leidde de sleutel af als `monthStart.slice(0, 7)`, met
// monthStart = `Date.UTC(jaar, maand, 1).toISOString()`. Die inline-vorm is
// vervangen door de gedeelde `currentMonthKey`; deze getuige pint vast dat de
// twee over jaar-, schrikkel- en DST-grenzen gelijk blijven.

const oudeInlineMonthKey = (now: Date) =>
  new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0].slice(0, 7)

describe('currentMonthKey == de vervangen inline Date.UTC-afleiding', () => {
  const datums: [label: string, date: Date][] = [
    ['jaargrens terug (1 jan)', new Date(2026, 0, 1, 0, 30)],
    ['jaargrens vooruit (31 dec)', new Date(2026, 11, 31, 23, 30)],
    ['schrikkeldag', new Date(2024, 1, 29, 12)],
    ['DST-start NL', new Date(2026, 2, 29, 2, 30)],
    ['DST-eind NL', new Date(2026, 9, 25, 2, 30)],
    ['eerste dag van de maand, na middernacht', new Date(2026, 6, 1, 0, 5)],
    ['laatste dag van de maand, vlak voor middernacht', new Date(2026, 6, 31, 23, 55)],
  ]

  it.each(datums)('%s', (_label, date) => {
    expect(currentMonthKey(date)).toBe(oudeInlineMonthKey(date))
  })
})
