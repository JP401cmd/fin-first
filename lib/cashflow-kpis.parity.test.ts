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
 * De nep-database is bewust datum- en cap-getrouw:
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
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DashboardData } from '@/lib/types/dashboard'
import { buildMonthAggregatesFromRows } from '@/lib/server-data/tx-aggregates'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadCashflowKpis, currentMonthKey, type CashflowCardScalars } from '@/lib/cashflow-kpis'

// ── Nep-database ────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
type Filter = { op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'; col: string; val: unknown }

/** De PostgREST-cap uit supabase/config.toml — geldt voor élk tabel-antwoord. */
const MAX_ROWS = 1000

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((r) =>
    filters.every((f) => {
      const v = r[f.col]
      switch (f.op) {
        case 'eq': return v === f.val
        case 'neq': return v !== f.val
        case 'gt': return (v as never) > (f.val as never)
        case 'gte': return (v as never) >= (f.val as never)
        case 'lt': return (v as never) < (f.val as never)
        case 'lte': return (v as never) <= (f.val as never)
        case 'in': return Array.isArray(f.val) && (f.val as unknown[]).includes(v)
      }
    }),
  )
}

interface FakeDb {
  profile: Row
  budgets: Row[]
  transactions: Row[]
}

function makeSupabase(db: FakeDb): { client: SupabaseClient; tableQueries: () => number; rpcCalls: () => string[] } {
  let tableQueries = 0
  const rpcCalls: string[] = []

  const tables: Record<string, Row[]> = {
    profiles: [db.profile],
    budgets: db.budgets,
    transactions: db.transactions,
  }

  function builder(table: string) {
    const rows = tables[table] ?? []
    const filters: Filter[] = []
    let limit = MAX_ROWS
    let offset = 0
    const settle = () => {
      const out = applyFilters(rows, filters).slice(offset)
      // PostgREST kapt af op min(client-limit, max_rows) — een client-`.limit()`
      // bóven max_rows is een no-op, exact zoals in productie.
      return { data: out.slice(0, Math.min(limit, MAX_ROWS)), error: null }
    }
    const q: Record<string, unknown> = {}
    const passthrough = ['select', 'order', 'not', 'or', 'is', 'filter', 'contains', 'overlaps', 'match', 'textSearch']
    for (const m of passthrough) q[m] = () => q
    for (const op of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'] as const) {
      q[op] = (col: string, val: unknown) => { filters.push({ op, col, val }); return q }
    }
    q.limit = (n: number) => { limit = n; return q }
    // `.range(from, to)` is inclusief aan beide kanten — de paginatie in
    // lib/vaste-lasten-summary.ts leunt erop, dus de mock moet 'm echt uitvoeren
    // (anders paginert die lus eeuwig door).
    q.range = (from: number, to: number) => { offset = from; limit = to - from + 1; return q }
    q.single = () => Promise.resolve({ data: settle().data[0] ?? null, error: null })
    q.maybeSingle = () => Promise.resolve({ data: settle().data[0] ?? null, error: null })
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(res, rej)
    return q
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-parity' } }, error: null }) },
    from: (table: string) => { tableQueries++; return builder(table) },
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push(fn)
      if (fn === 'tx_month_aggregate') {
        // Een aggregaat kent de rij-cap NIET: het telt in de database.
        const from = String(args.p_from ?? '')
        const to = String(args.p_to ?? '')
        const inWindow = db.transactions.filter(
          (t) => String(t.date) >= from && String(t.date) < to,
        ) as { amount: number; date: string; budget_id?: string | null; transaction_type?: string | null }[]
        return { data: buildMonthAggregatesFromRows(inWindow), error: null }
      }
      return { data: [], error: null }
    },
  } as unknown as SupabaseClient

  return { client, tableQueries: () => tableQueries, rpcCalls: () => rpcCalls }
}

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
    const { nieuw } = await runBothPaths(buildFixtures()[1].db)
    expect(nieuw.currentMonthIncome).toBe(4200)
    expect(nieuw.currentMonthExpenses).toBe(1300 + 250 + 600 + 77)
    // 'auto' + transacties aanwezig ⇒ effective == de transactiesom van deze maand.
    expect(nieuw.monthlyIncome).toBe(4200)
    expect(nieuw.monthlyExpenses).toBe(1300 + 250 + 600 + 77)
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
