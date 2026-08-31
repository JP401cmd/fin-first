/**
 * PARITY: `loadDashboardData` (het oude, volledige pad) ↔ `loadCashflowKpis`
 * (de slanke laag) — ADR 0083.
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
import type { SpendingTxRow } from '@/lib/budget-spending'
import { budgetBeschikbaar } from '@/lib/budget-spending'
import { computeEffectiveLimit, type EffectiveLimitContext } from '@/lib/budget-rollover'

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

/**
 * Profiel-basis: géén dob/vermogen ⇒ de dure horizon-tak blijft uit.
 *
 * De grondslag staat BEWUST expliciet op 'transaction' (ADR 0103) en niet meer
 * op 'auto': deze fixtures bewaken de ADR-0073-asymmetrie (currentMonth* =
 * gerealiseerd, monthlyIncome/-Expenses = effective), en die vraag staat los van
 * "welke van de drie grondslagen wint". Met 'auto' én budgetten in de set zou de
 * budgetgrondslag winnen en zouden deze assertions een ánder onderwerp testen.
 * Fixture 6 hieronder pint dat 'auto'-gedrag apart, op beide paden.
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
    // Transfer MÉT budget_id: telt sinds 30 aug 2026 in GEEN van beide mee —
    // `budgetTotals.spent` draait nu op dezelfde canonieke bestedingssom als de
    // budgetten-pagina, en `currentMonthExpenses` had het filter al. De rij
    // blijft staan als getuige dát beide paden hem hetzelfde behandelen.
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
      label: '2. transactioneel (income_source = transaction)',
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
    {
      // ADR 0103: 'auto' = "kies voor mij", en de app kiest budgetten zodra die
      // er zijn. Zelfde transacties als fixture 2, alleen de grondslag verschilt.
      label: "6. auto met budgetten ⇒ budgetgrondslag (ADR 0103)",
      db: {
        profile: { ...PROFILE_BASE, income_source: 'auto', expenses_source: 'auto' },
        budgets: BUDGETS,
        transactions: transactioneel,
      },
    },
    {
      // ── 7. periode-override + rollover-carry ────────────────────────────────
      // Zie `LIMIET_FIXTURE` hieronder voor de opbouw en de verwachte getallen.
      label: '7. periode-override (budget_amounts) + carry (budget_rollovers)',
      db: LIMIET_FIXTURE_DB,
    },
  ]
}

// ── Fixture 7: de LIMIET-kant (periode-override + carry) ────────────────────
//
// Synthetische bedragen, bewust ver van elkaar zodat elk verkeerd pad een ANDER
// getal geeft dan het goede: de kale `default_limit` (2.000), de override zonder
// carry (2.600), de carry zonder override (2.150) en de toekomstige override
// (9.999) zijn alle vier onderscheidbaar van de verwachte 2.750.

/** Kind-budget: `default_limit` 2.000, override 2.600 deze maand, carry 150. */
const KID_DEFAULT_LIMIT = 2000
const KID_OVERRIDE_VORIGE_MAAND = 1800
const KID_OVERRIDE_DEZE_MAAND = 2600
const KID_OVERRIDE_VOLGENDE_MAAND = 9999
const KID_CARRY = 150
/** Wat `computeEffectiveLimit` voor dit kind oplevert: override + carry. */
const KID_EFFECTIEVE_LIMIET = KID_OVERRIDE_DEZE_MAAND + KID_CARRY // 2.750
const KID_BESTEED = 800

/** Spaar-parent ZONDER kinderen: quarterly 1.200, override 1.500 deze maand. */
const SAVINGS_OVERRIDE = 1500

const NEXT_MONTH = '2026-08'

const LIMIET_FIXTURE_DB: FakeDb = {
  profile: { ...PROFILE_BASE },
  budgets: BUDGETS,
  transactions: [
    tx(3000, `${THIS_MONTH}-02`, B_INCOME),
    tx(-KID_BESTEED, `${THIS_MONTH}-08`, B_EXPENSE_KID),
  ],
  budgetAmounts: [
    // Oudere override — moet VERLIEZEN van de recentere (meest recente
    // `effective_from <= displayDate` wint per budget).
    { budget_id: B_EXPENSE_KID, effective_from: `${PREV_MONTH}-01`, amount: KID_OVERRIDE_VORIGE_MAAND },
    { budget_id: B_EXPENSE_KID, effective_from: `${THIS_MONTH}-01`, amount: KID_OVERRIDE_DEZE_MAAND },
    // Toekomstige override — mag NIET meetellen. Getuige voor zowel het
    // `.lte('effective_from', monthStart)`-fetchfilter als de JS-filter in
    // `computeEffectiveLimit`; valt er één van beide weg, dan springt de limiet
    // naar 9.999 + carry.
    { budget_id: B_EXPENSE_KID, effective_from: `${NEXT_MONTH}-01`, amount: KID_OVERRIDE_VOLGENDE_MAAND },
    { budget_id: B_SAVINGS, effective_from: `${THIS_MONTH}-01`, amount: SAVINGS_OVERRIDE },
  ],
  budgetRollovers: [
    { id: 'ro-kid', budget_id: B_EXPENSE_KID, period: THIS_MONTH, carried_amount: KID_CARRY, rollover_type: 'carry-over', created_at: `${THIS_MONTH}-01T00:00:00Z` },
    // Carry in een ANDERE periode — mag niet meetellen (getuige voor het
    // `.eq('period', …)`-filter én voor `getCarriedAmount`).
    { id: 'ro-kid-vorig', budget_id: B_EXPENSE_KID, period: PREV_MONTH, carried_amount: 4444, rollover_type: 'carry-over', created_at: `${PREV_MONTH}-01T00:00:00Z` },
  ],
}

// ── De zeven velden uit het OUDE pad ────────────────────────────────────────

/**
 * Selecteert precies de scalars die de slanke laag moet spiegelen.
 *
 * ACHT, niet zeven: `dailyExpenseRate` is erbij gekomen omdat de Vaste-lasten-
 * pagina hem uit deze laag consumeert i.p.v. zelf `dailyExpenseRate(monthlyExpenses)`
 * te rekenen (vervolg KRUIS-20). Pariteit-bewaking op dít veld is precies de rem
 * die een derde grondslag-familie moet voorkomen: wijkt het rolling tarief van de
 * slanke laag ooit af van de dashboardbundel, dan valt deze suite om.
 */
function sevenFromBundle(d: DashboardData): CashflowCardScalars {
  return {
    budgetTotals: { expense: { limit: d.budgetTotals.expense.limit, spent: d.budgetTotals.expense.spent } },
    monthSummary: { budgetScore: d.monthSummary.budgetScore },
    budgetingActive: d.budgetingActive,
    currentMonthIncome: d.currentMonthIncome,
    currentMonthExpenses: d.currentMonthExpenses,
    monthlyIncome: d.monthlyIncome,
    monthlyExpenses: d.monthlyExpenses,
    dailyExpenseRate: d.dailyExpenseRate,
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

describe('loadCashflowKpis ↔ loadDashboardData — parity op alle acht velden', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(buildFixtures())('$label — acht velden identiek', async ({ db }) => {
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
    // Het canonieke 12-mnd rolling dagtarief MOET identiek zijn: beide paden
    // draaien dezelfde keten (aggToExpenseRows → recentDailyExpenseRateFromRows)
    // op hetzelfde aggregaat. Drift hier = twee dagtarieven in de app.
    expect(nieuw.dailyExpenseRate).toBe(oud.dailyExpenseRate)
  })

  it('de slanke laag doet aantoonbaar minder tabel-queries', async () => {
    const { oudQueries, nieuwQueries } = await runBothPaths(buildFixtures()[1].db)
    expect(nieuwQueries).toBeLessThan(oudQueries)
    // Vijf tabel-fetches: profiel, budgetten, huidige-maand-tx, rollover-carry en
    // periode-overrides (+ het maandaggregaat via RPC, dat geen `from(...)` is).
    //
    // WAS 3 (31 aug 2026 → 5), bewust verhoogd. De twee erbij zijn
    // `budget_rollovers` + `budget_amounts`: zonder die rijen kán deze laag de
    // canonieke `computeEffectiveLimit` niet consumeren en houdt ze een tweede
    // limiet-formule (kale `default_limit`) in leven — precies de drift tussen
    // Budget-kaart en budgetten-pagina die deze module bestaat om te voorkomen.
    // Beide zijn `cache()`-gedeelde fetchers (lib/server-data/base.ts) die
    // `loadDashboardData` óók gebruikt, dus op een request waar die loader mee
    // draait (o.a. /overzicht) kosten ze daar nul extra queries; ze zitten in
    // DEZELFDE Promise.all-golf, dus ook geen extra round-trip.
    //
    // Dit getal blijft een BUDGET, geen momentopname: komt er een fetch bij,
    // verhoog 'm bewust en verantwoord waarom. Nooit versoepelen naar een
    // ongelijkheid — dan verdwijnt precies de bewaking waarvoor deze assertie
    // bestaat.
    expect(nieuwQueries).toBe(5)
  })
})

// ── De LIMIET-kant: dezelfde effectieve limiet als de budgetten-pagina ───────
//
// De `spent`-kant convergeerde op 30 aug 2026; de LIMIET-kant bleef tot 31 aug
// 2026 een kale `default_limit`-som en negeerde daarmee de twee dingen die
// `computeEffectiveLimit` (lib/budget-rollover.ts — "de ENE bron van waarheid
// voor wat is het budget deze periode") wél meeneemt: de periode-override uit
// `budget_amounts` en de rollover-carry uit `budget_rollovers`. Kaart en pagina
// droegen daardoor een andere limiet en dus een ander restant.
describe('budget-limiet == computeEffectiveLimit (override + carry)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('de expense-limiet is de EFFECTIEVE kinderlimiet (override + carry), niet de kale default_limit', async () => {
    const { nieuw, oud } = await runBothPaths(LIMIET_FIXTURE_DB)
    // 2.600 (override deze maand) + 150 (carry) = 2.750. Niet 2.000 (kaal),
    // niet 1.800 (oude override), niet 10.149 (toekomstige override + carry).
    expect(nieuw.budgetTotals.expense.limit).toBe(KID_EFFECTIEVE_LIMIET)
    expect(oud.budgetTotals.expense.limit).toBe(KID_EFFECTIEVE_LIMIET)
    expect(nieuw.budgetTotals.expense.limit).not.toBe(KID_DEFAULT_LIMIT)
    expect(nieuw.budgetTotals.expense.spent).toBe(KID_BESTEED)
  })

  it('een parent ZONDER kinderen krijgt zijn eigen override, daarna interval-genormaliseerd', async () => {
    const { bundle } = await runBothPaths(LIMIET_FIXTURE_DB)
    // Spaar-budget: quarterly, default 1.200, override 1.500 ⇒ 1.500 / 3 = 500.
    // (Zonder de override zou hier 400 staan.)
    expect(bundle.budgetTotals.savings.limit).toBe(SAVINGS_OVERRIDE / 3)
  })

  it('ACCEPTATIE: kaart-restant == pagina-restant op dezelfde effectieve limiet', async () => {
    const { nieuw } = await runBothPaths(LIMIET_FIXTURE_DB)

    // Wat de BUDGETTEN-PAGINA rekent (components/app/budgets-client.tsx →
    // getParentEffectiveLimit/getEffectiveLimit): per KIND de canonieke
    // effectieve limiet, opgeteld. Hier letterlijk nagespeeld op de canonieke
    // functie, niet nagebouwd.
    const paginaLimiet = computeEffectiveLimit({
      defaultLimit: KID_DEFAULT_LIMIT,
      rollovers: [{
        id: 'ro-kid', user_id: 'user-parity', budget_id: B_EXPENSE_KID, period: THIS_MONTH,
        carried_amount: KID_CARRY, rollover_type: 'carry-over', created_at: `${THIS_MONTH}-01T00:00:00Z`,
      }],
      amountOverrides: [
        { budget_id: B_EXPENSE_KID, effective_from: `${PREV_MONTH}-01`, amount: KID_OVERRIDE_VORIGE_MAAND },
        { budget_id: B_EXPENSE_KID, effective_from: `${THIS_MONTH}-01`, amount: KID_OVERRIDE_DEZE_MAAND },
      ],
      period: THIS_MONTH,
      displayDate: `${THIS_MONTH}-01`,
    })
    const paginaRestant = paginaLimiet - KID_BESTEED

    // Wat de KAART toont (lib/cashflow-cards.ts → budgetBeschikbaar).
    const kaartRestant = budgetBeschikbaar(nieuw.budgetTotals.expense.limit, nieuw.budgetTotals.expense.spent)

    expect(kaartRestant).toBe(paginaRestant)
    expect(kaartRestant).toBe(KID_EFFECTIEVE_LIMIET - KID_BESTEED) // 1.950
    // En NIET het restant op de kale limiet — dat is precies het gemelde gat.
    expect(kaartRestant).not.toBe(KID_DEFAULT_LIMIT - KID_BESTEED)
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
    // ── Canonieke spent-pass, end-to-end (30 aug 2026) ──────────────────────
    // De -300-transfer draagt een budget_id maar telt NIET meer mee: op een
    // uitgaven-budget is een transfer geen besteding. `spent` is dus 1750, niet
    // 2050. Deze regel stond hier tot 30 aug 2026 omgekeerd in — zie de
    // docstring van `deriveBudgetTotals` voor waarom dat argument is gedraaid.
    expect(nieuw.budgetTotals.expense.spent).toBe(1750)
    expect(oud.budgetTotals.expense.spent).toBe(1750)
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

  it('fixture 2: op de transactiegrondslag volgt monthlyIncome de transactiesom', async () => {
    const { nieuw, oud } = await runBothPaths(buildFixtures()[1].db)
    expect(nieuw.currentMonthIncome).toBe(4200)
    expect(nieuw.currentMonthExpenses).toBe(1300 + 250 + 600 + 77)
    // grondslag 'transaction' + transacties aanwezig ⇒ effective == de
    // transactiesom van deze maand. De income-budgetten (€36.000/jr) worden hier
    // BEWUST niet gebruikt: wie expliciet op de gemeten werkelijkheid stuurt,
    // mag daar niet stil door zijn budgetten van worden afgeduwd (ADR 0103).
    expect(nieuw.monthlyIncome).toBe(4200)
    expect(nieuw.monthlyExpenses).toBe(1300 + 250 + 600 + 77)
    // ── Kind-oprol, end-to-end ──────────────────────────────────────────────
    // De expense-PARENT heeft default_limit 9999, maar hij heeft een kind van
    // 2000 — de kinderen winnen. Beide paden moeten 2000 tonen, niet 9999.
    expect(nieuw.budgetTotals.expense.limit).toBe(2000)
    expect(oud.budgetTotals.expense.limit).toBe(2000)
    expect(nieuw.budgetTotals.expense.spent).toBe(1300 + 250)
    // Dekkings-score over álle vier de types met limit>0. WAS 70 —
    // (60 + 100 + 50) / 3 — met een savings-besteding van +600 op een limiet van
    // 400 (150% ⇒ 50 punten). Onder de canonieke norm geldt op `savings` de
    // inkomsten-richting, dus die −600-rij levert −600 en er is niets
    // overschreden: (60 + 100 + 100) / 3 = 86,67 ⇒ 87.
    expect(nieuw.monthSummary.budgetScore).toBe(87)
    expect(oud.monthSummary.budgetScore).toBe(87)
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

  it("fixture 6: 'auto' met budgetten ⇒ de BUDGETgrondslag wint, op beide paden gelijk (ADR 0103)", async () => {
    const { oud, nieuw } = await runBothPaths(buildFixtures()[5].db)
    // De budgetgrondslag is sinds de correctie van 11 aug 2026 de REALISATIE op
    // de budgetten, niet hun geplande limiet. Deze fixture-budgetten dragen geen
    // `created_at`, dus de deler is het VOLLE venster (12) — de conservatieve
    // terugval. €4.200 op het inkomstenbudget over het jaar ⇒ €4.200/jr = €350/mnd.
    //
    // NB dit is niet de spanwijdte-deler: die zou €4.200 / 1 × 12 = €50.400/jr
    // ⇒ €4.200/mnd geven. Zie de jaarpost-test in lib/budget-basis.test.ts voor
    // waarom die deler is verworpen. Vóór de hele correctie stond hier €3.000
    // (de geplande €36.000/jr).
    expect(nieuw.currentMonthIncome).toBe(4200)
    expect(nieuw.monthlyIncome).toBe(350)
    expect(oud.monthlyIncome).toBe(350)
    // Uitgaven, per post geannualiseerd op de deler (hier: het volle venster,
    // want de fixture-rijen dragen geen created_at):
    //  • B_EXPENSE_KID: 1.300 (deze maand) + 1.500 (vorige maand) = 2.800/jr
    //    ⇒ 2.800 / 12 × 12 = 2.800/jr ≈ 233,33/mnd.
    //  • B_EXPENSE (de PARENT, die kinderen heeft): 250 rechtstreeks op hem
    //    geboekt ⇒ 250/jr ≈ 20,83/mnd. Hij telt mee als extra post juist omdat er
    //    écht op hem geboekt is; zijn geplande limiet (9.999) telt als 0 zodat
    //    hij niet dubbelt met zijn kind.
    // DRAGENDE INVARIANT, end-to-end: het SPAARbudget telt NIET mee — ook niet
    // nu de grondslag op realisatie draait. De €600 op B_SAVINGS blijft er dus
    // buiten. Zou dat ooit veranderen, dan moet de spaarbudget-correctie in
    // resolveSavingsSource terugkomen (zie ADR 0103).
    expect(nieuw.monthlyExpenses).toBeCloseTo((2800 + 250) / 12, 6)
    expect(oud.monthlyExpenses).toBe(nieuw.monthlyExpenses)
    // De gerealiseerde maand blijft onaangeraakt: één keuze, twee grondslagen.
    // (Die telt de €600 spaarboeking en de €77 zonder budget WEL mee.)
    expect(nieuw.currentMonthExpenses).toBe(1300 + 250 + 600 + 77)
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

/**
 * Limiet-context ZONDER overrides en ZONDER carry: dan is de effectieve limiet
 * per budget gelijk aan `default_limit`, en meten de getuigen hieronder precies
 * wat ze bedoelen te meten (kind-oprol, interval-normalisatie, spent-grondslag).
 * De override/carry-kant heeft haar eigen getuigen — zie de describes hierboven
 * en de MELDING-case onderaan dit blok.
 */
const GEEN_LIMIET_CONTEXT: EffectiveLimitContext = {
  rollovers: [],
  amountOverrides: [],
  period: THIS_MONTH,
  displayDate: `${THIS_MONTH}-01`,
}

describe('deriveBudgetTotals — waarde-getuige (de verplaatste oprol)', () => {
  const budgets = BUDGETS as unknown as BudgetRowForTotals[]

  it('een parent met kinderen krijgt de SOM van de kinderen, niet zijn eigen default_limit', () => {
    // expense-parent: default_limit 9999, kind 2000 ⇒ 2000 wint.
    expect(deriveBudgetTotals(budgets, [], [], GEEN_LIMIET_CONTEXT).expense.limit).toBe(2000)
  })

  it('normaliseert het interval naar één maand (quarterly ÷3, yearly ÷12)', () => {
    const totals = deriveBudgetTotals(budgets, [], [], GEEN_LIMIET_CONTEXT)
    expect(totals.savings.limit).toBe(1200 / 3) // 400 — quarterly
    expect(totals.income.limit).toBe(36000 / 12) // 3000 — yearly
    expect(totals.expense.limit).toBe(2000) // monthly blijft ongewijzigd
    expect(totals.debt.limit).toBe(0) // geen debt-budget
  })

  it('een onbekend interval valt terug op ÷12 (bewust: jaarbedrag als default)', () => {
    const raar: BudgetRowForTotals[] = [
      { id: 'x', parent_id: null, budget_type: 'expense', default_limit: 2400, interval: 'sinterklaas' },
    ]
    expect(deriveBudgetTotals(raar, [], [], GEEN_LIMIET_CONTEXT).expense.limit).toBe(200)
  })

  it('slaat budget-types buiten de vier (bv. archive) over', () => {
    const metArchief: BudgetRowForTotals[] = [
      ...budgets,
      { id: 'arch', parent_id: null, budget_type: 'archive', default_limit: 5000, interval: 'monthly' },
    ]
    const totals = deriveBudgetTotals(metArchief, [], [], GEEN_LIMIET_CONTEXT)
    expect(totals).toEqual(deriveBudgetTotals(budgets, [], [], GEEN_LIMIET_CONTEXT))
  })

  // ── Grondslag omgezet naar de canonieke norm (30 aug 2026) ────────────────
  // De twee tests hieronder pinden tot deze datum het OMGEKEERDE: "een transfer
  // telt WÉL mee" en "spent is absoluut". Dat was geen keuze maar de afwezigheid
  // van een filter; sinds de referentie-schermen op `spendingContribution`
  // draaien is deze KPI de laatste die uit de pas liep.

  it('spent: transfers tellen NIET mee op een uitgaven-budget (canonieke norm)', () => {
    const rows: SpendingTxRow[] = [
      { amount: -100, budget_id: B_EXPENSE_KID, transaction_type: null },
      { amount: -25, budget_id: B_EXPENSE_KID, transaction_type: 'transfer' },
      { amount: -10, budget_id: B_EXPENSE_KID, transaction_type: 'joint_transfer' },
    ]
    // Was 135 (100+25+10) onder de oude abs-grondslag; nu alleen de echte uitgave.
    expect(deriveBudgetTotals(budgets, rows, [], GEEN_LIMIET_CONTEXT).expense.spent).toBe(100)
  })

  it('spent: een inkomst op een uitgaven-budget gaat ERAF (getekend, niet absoluut)', () => {
    const rows: SpendingTxRow[] = [
      { amount: -100, budget_id: B_EXPENSE_KID },
      { amount: 40, budget_id: B_EXPENSE_KID }, // inkomst ⇒ −40
      { amount: -999, budget_id: null }, // geen budget ⇒ genegeerd
      { amount: -888, budget_id: 'onbekend-budget' }, // onbekend ⇒ genegeerd
    ]
    // Was 140 (100+40) onder de oude abs-grondslag.
    expect(deriveBudgetTotals(budgets, rows, [], GEEN_LIMIET_CONTEXT).expense.spent).toBe(60)
  })

  it('spent: de is_income-vlag doet mee náást het teken', () => {
    const rows: SpendingTxRow[] = [
      { amount: -100, budget_id: B_EXPENSE_KID },
      { amount: -30, budget_id: B_EXPENSE_KID, is_income: true }, // vlag wint ⇒ −30
    ]
    expect(deriveBudgetTotals(budgets, rows, [], GEEN_LIMIET_CONTEXT).expense.spent).toBe(70)
  })

  it('spent: split-regels tellen op hun eigen budget, de ouderrij wordt overgeslagen', () => {
    const rows: SpendingTxRow[] = [
      { id: 'ouder', amount: -29.24, budget_id: B_EXPENSE, is_split: true },
    ]
    // transaction_splits staan POSITIEF in de DB; ze tellen altijd +|amount|.
    const splits = [
      { budget_id: B_EXPENSE_KID, amount: 4.5 },
      { budget_id: B_EXPENSE_KID, amount: 24.74 },
    ]
    const totals = deriveBudgetTotals(budgets, rows, splits, GEEN_LIMIET_CONTEXT)
    expect(totals.expense.spent).toBeCloseTo(29.24, 10)
  })

  it('een child erft het type van zijn parent (spent landt op het parent-type)', () => {
    const rows: SpendingTxRow[] = [{ amount: -50, budget_id: B_EXPENSE_KID }]
    const totals = deriveBudgetTotals(budgets, rows, [], GEEN_LIMIET_CONTEXT)
    expect(totals.expense.spent).toBe(50)
    expect(totals.savings.spent).toBe(0)
  })

  it('de volledige fixture-2-uitkomst, alle vier de types', () => {
    const rows: SpendingTxRow[] = [
      { amount: 4200, budget_id: B_INCOME },
      { amount: -1300, budget_id: B_EXPENSE_KID },
      { amount: -250, budget_id: B_EXPENSE },
      { amount: -600, budget_id: B_SAVINGS },
      { amount: -77, budget_id: null },
    ]
    expect(deriveBudgetTotals(budgets, rows, [], GEEN_LIMIET_CONTEXT)).toEqual({
      income: { limit: 3000, spent: 4200 },
      expense: { limit: 2000, spent: 1550 },
      // OMGEKEERD T.O.V. VÓÓR 30 AUG 2026 (was 600). Op een `savings`-budget
      // geldt de INKOMSTEN-richting: de positieve rij is de realisatie, dus een
      // negatieve rij (geld dat de betaalrekening verlaat) telt −600. Dit is de
      // zichtbaarste verschuiving van de omzetting en staat hier expliciet,
      // niet als bijvangst in een totaal.
      savings: { limit: 400, spent: -600 },
      debt: { limit: 0, spent: 0 },
    })
  })

  // ── De gemelde productiecase (eigenaar-account, augustus 2026) ─────────────
  //
  // Budgetpagina (na de hotfix, getekende som): "uitgaven € 2.616 / € 7.701".
  // Budget-kaart op /overzicht/cashflow (oude abs-grondslag): "€ 26 · nog te
  // besteden deze maand" — want ±€2.530 aan ruis-rijen op uitgavenbudgetten
  // telde er twee keer absoluut bij op: 2.616 + 2×2.530 = 7.676 ⇒ restant 25.
  //
  // Acceptatie ná de omzetting: besteed €2.616 en restant €5.085 (7.701 −
  // 2.616), hetzelfde getal als de budgetpagina. De ruis kan op twee manieren
  // in de data staan en beide moeten op 2.616 uitkomen — daarom staan ze er
  // allebei in: als eigen-rekening-TRANSFERS (bijdrage 0) en als een
  // INKOMST/tegenboeking-paar (−2.530 en +2.530, die tegen elkaar wegvallen).
  const LIMIET = 7701
  const ECHTE_UITGAVEN = 2616
  const RUIS = 2530
  const eigenBudget: BudgetRowForTotals[] = [
    { id: 'uitgaven', parent_id: null, budget_type: 'expense', default_limit: LIMIET, interval: 'monthly' },
  ]

  it.each([
    [
      'twee eigen-rekening-transfers',
      [
        { amount: RUIS, budget_id: 'uitgaven', transaction_type: 'transfer' },
        { amount: -RUIS, budget_id: 'uitgaven', transaction_type: 'joint_transfer' },
      ] as SpendingTxRow[],
    ],
    [
      'een inkomst met haar tegenboeking',
      [
        { amount: RUIS, budget_id: 'uitgaven' }, // inkomst ⇒ −2.530
        { amount: -RUIS, budget_id: 'uitgaven' }, // tegenboeking ⇒ +2.530
      ] as SpendingTxRow[],
    ],
  ])('MELDING (%s): Budget-kaart toont €5.085 restant i.p.v. €26', (_naam, ruisRijen) => {
    const rows: SpendingTxRow[] = [
      { amount: -ECHTE_UITGAVEN, budget_id: 'uitgaven' },
      ...ruisRijen,
    ]

    // Wat de kaart TOT NU toonde: de ongefilterde abs-som.
    const oudeAbsSom = rows.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
    expect(oudeAbsSom).toBe(7676) // ≈ de gemelde 7.675
    expect(LIMIET - oudeAbsSom).toBe(25) // ≈ de gemelde "€ 26 · nog te besteden"

    // Wat de kaart NA de omzetting toont: dezelfde grondslag als de budgetpagina.
    const totals = deriveBudgetTotals(eigenBudget, rows, [], GEEN_LIMIET_CONTEXT)
    expect(totals.expense.limit).toBe(LIMIET)
    expect(totals.expense.spent).toBe(ECHTE_UITGAVEN)
    expect(totals.expense.limit - totals.expense.spent).toBe(5085)

    // DE STATUSDOT BEWEEGT HIER NIET, en dat is een bewuste vastlegging.
    // `deriveBudgetScore` straft alleen OVERSCHRIJDING (`spent − limit`), en
    // 7.676 bleef net onder 7.701 — de dot stond dus al op 'good'/"Op schema".
    // Wat de melding zichtbaar maakte is het KPI-BEDRAG (€26 → €5.085), niet de
    // dot. Pas als een type écht over zijn limiet gaat, verschuift ook de score.
    expect(deriveBudgetScore(totals)).toBe(100)
    expect(deriveBudgetScore({ ...totals, expense: { limit: LIMIET, spent: oudeAbsSom } })).toBe(100)

    // ── VERVOLG 31 AUG 2026: dezelfde case MÉT een periode-override + carry ──
    // De case hierboven draait op een budget zónder overrides — daar viel het
    // tweede deel van de melding niet mee te vangen. Met een (synthetische)
    // override en carry erbij moet de kaart de EFFECTIEVE limiet dragen, en dus
    // exact hetzelfde restant als de budgetten-pagina: die rekent per budget
    // `computeEffectiveLimit` en deed dat al vóór deze fix.
    const OVERRIDE = 6000
    const CARRY = 250
    const rollovers = [{
      id: 'ro-melding', user_id: 'user-parity', budget_id: 'uitgaven', period: THIS_MONTH,
      carried_amount: CARRY, rollover_type: 'carry-over', created_at: `${THIS_MONTH}-01T00:00:00Z`,
    }]
    const amountOverrides = [{ budget_id: 'uitgaven', effective_from: `${THIS_MONTH}-01`, amount: OVERRIDE }]
    const metOverride = deriveBudgetTotals(eigenBudget, rows, [], {
      rollovers, amountOverrides, period: THIS_MONTH, displayDate: `${THIS_MONTH}-01`,
    })
    // Wat de budgetten-pagina voor ditzelfde budget rekent — de canonieke functie.
    const paginaLimiet = computeEffectiveLimit({
      defaultLimit: LIMIET, rollovers, amountOverrides, period: THIS_MONTH, displayDate: `${THIS_MONTH}-01`,
    })

    expect(metOverride.expense.limit).toBe(paginaLimiet)
    expect(metOverride.expense.limit).toBe(OVERRIDE + CARRY)
    // De override VERVANGT `default_limit` — hij komt er niet bovenop.
    expect(metOverride.expense.limit).not.toBe(LIMIET)
    expect(metOverride.expense.spent).toBe(ECHTE_UITGAVEN)
    // ACCEPTATIE: kaart-restant == pagina-restant, zelfde limiet én zelfde
    // getekende besteding.
    expect(budgetBeschikbaar(metOverride.expense.limit, metOverride.expense.spent))
      .toBe(paginaLimiet - ECHTE_UITGAVEN)
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
