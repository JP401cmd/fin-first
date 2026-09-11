/**
 * B-041 + B-045 — DE HISTORIEBASIS (ADR 0138): afgesloten maanden, één deler.
 *
 * Twee meldingen, één oorzaak:
 *  · B-041 (/overzicht): de spaarquote verschoof gedurende de maand, omdat de
 *    budgetsom de LOPENDE maand meetelde (halfvol, asymmetrisch gevuld).
 *  · B-045 (/overzicht/budget/instellingen): een boeking van €1.200 op het
 *    budget 'dieren' gaf "€300 per maand, berekend over 4 maanden" — de deler
 *    was PER BUDGET de leeftijd van het budget (`budgets.created_at`).
 *
 * Eigenaarsbesluit 11 sep 2026: (1) alleen afgesloten maanden, in de sommen én
 * in de deler; (2) ÉÉN deler per gebruiker = het aantal afgesloten maanden met
 * transactiehistorie in het venster, geklemd op 1..12, voor ALLE budgetten.
 *
 * Deze suite is de acceptatiemeetlat (A1–A4). De klok staat bevroren op
 * 11 sep 2026: de lopende maand is 2026-09, het venster is 2025-09 … 2026-08.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { localMonthStartMonthsAgo } from '@/lib/month-range'
import {
  fetchRealizedBudgetAmounts,
  transactionAnnualIncome,
  type BudgetRealizedWindow,
} from '@/lib/budget-realized'
import { computeBudgetBasis, type BudgetBasisRow } from '@/lib/budget-basis'
import { resolveSavingsSource } from '@/lib/savings-source'
import type { TxMonthAggregateRow } from '@/lib/server-data/tx-aggregates'

const NOW = new Date(2026, 8, 11, 12, 0, 0) // 11 september 2026, lokaal

/** Aggregaat-rij zoals `tx_month_aggregate` 'm teruggeeft. */
function agg(
  month: string,
  budgetId: string | null,
  amount: number,
  transactionType: string | null = amount < 0 ? 'expense' : 'income',
): TxMonthAggregateRow {
  return {
    month,
    budget_id: budgetId,
    transaction_type: transactionType,
    sum_positief: amount > 0 ? amount : 0,
    sum_negatief: amount < 0 ? amount : 0,
    count: 1,
  }
}

/**
 * Een supabase-dubbel dat — net als de echte RPC — alleen de rijen binnen
 * `[p_from, p_to)` teruggeeft. Zo bewijst de suite het VENSTER, niet de reducer.
 */
function makeSupabase(rows: TxMonthAggregateRow[]) {
  const rpcCalls: Array<Record<string, unknown>> = []
  const supabase = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push(args)
      const from = String(args.p_from)
      const to = String(args.p_to)
      const data = rows.filter((r) => `${r.month}-01` >= from && `${r.month}-01` < to)
      return Promise.resolve({ data, error: null })
    },
  } as never
  return { supabase, rpcCalls }
}

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

/** 'YYYY-MM' van n maanden vóór NOW (0 = de lopende maand). */
const maand = (n: number) => localMonthStartMonthsAgo(NOW, n).slice(0, 7)

describe('A1 — Given budgetgrondslag, when er in de lopende maand een uitgave bijkomt, then veranderen effectiveSavingsRatePct en de budget-maandgemiddelden niet', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  const budgets = [
    row({ id: 'salaris', budget_type: 'income' }),
    row({ id: 'dieren', budget_type: 'expense', created_at: '2026-06-15T10:00:00Z' }),
  ]

  async function meet(rows: TxMonthAggregateRow[]) {
    const realized = await fetchRealizedBudgetAmounts(makeSupabase(rows).supabase)
    const income = computeBudgetBasis(budgets, 'income', [], { realized })
    const expenses = computeBudgetBasis(budgets, 'expense', [], { realized })
    const quote = resolveSavingsSource({
      netMonthlyIncome: 0,
      estimatedAnnualIncome: transactionAnnualIncome(realized),
      estimatedMonthlyExpenses: 0,
      savingsRate6m: 0,
      basis: {
        income: 'budget',
        expenses: 'budget',
        annualIncome: income.annualTotal,
        monthlyExpenses: expenses.monthlyTotal,
      },
    })
    return { realized, income, expenses, quote }
  }

  it('een boeking in de lopende maand telt nergens mee — venster, budgetsom, jaarinkomen en spaarquote blijven byte-identiek', async () => {
    // Twaalf afgesloten maanden salaris + één uitgave in augustus (afgesloten).
    const basis: TxMonthAggregateRow[] = []
    for (let n = 12; n >= 1; n--) basis.push(agg(maand(n), 'salaris', 3000))
    basis.push(agg(maand(1), 'dieren', -1200))

    const zonder = await meet(basis)
    const met = await meet([
      ...basis,
      // De lopende maand: een salaris dat al binnen is én een grote uitgave.
      agg(maand(0), 'salaris', 3000),
      agg(maand(0), 'dieren', -900),
    ])

    expect(met.realized).toEqual(zonder.realized)
    expect(met.expenses.monthlyTotal).toBe(zonder.expenses.monthlyTotal)
    expect(met.income.annualTotal).toBe(zonder.income.annualTotal)
    expect(met.quote.effectiveSavingsRatePct).toBe(zonder.quote.effectiveSavingsRatePct)
    expect(transactionAnnualIncome(met.realized)).toBe(transactionAnnualIncome(zonder.realized))
  })

  it('het venster is exact de twaalf AFGESLOTEN maanden: het eindigt op de 1e van de lopende maand', async () => {
    const { supabase, rpcCalls } = makeSupabase([])
    const realized = await fetchRealizedBudgetAmounts(supabase)

    expect(realized.windowEndMonth).toBe(maand(1))
    expect(rpcCalls[0].p_from).toBe(localMonthStartMonthsAgo(NOW, 12))
    expect(rpcCalls[rpcCalls.length - 1].p_to).toBe(localMonthStartMonthsAgo(NOW, 0))
  })
})

describe('A2 — Given een vroegste transactie 11 afgesloten maanden geleden en een budget van 3 maanden oud met één boeking van 1200, then is het maandgemiddelde 1200/11 — en een ouder budget met dezelfde boeking krijgt precies hetzelfde', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('één deler per gebruiker; de leeftijd van het budget (created_at) speelt geen rol meer', async () => {
    const rows = [
      // De vroegste transactie: 11 afgesloten maanden geleden, op een ander budget.
      agg(maand(11), 'boodschappen', -250),
      agg(maand(1), 'dieren', -1200),
      agg(maand(1), 'oud', -1200),
    ]
    const realized = await fetchRealizedBudgetAmounts(makeSupabase(rows).supabase)
    expect(realized.historyMonths).toBe(11)

    const budgets = [
      row({ id: 'boodschappen' }),
      // 'dieren' bestaat pas drie maanden — onder de oude regel deler 4 → €300/mnd.
      row({ id: 'dieren', created_at: '2026-06-15T10:00:00Z' }),
      row({ id: 'oud', created_at: '2020-01-01T00:00:00Z' }),
    ]
    const r = computeBudgetBasis(budgets, 'expense', [], { realized })
    const dieren = r.entries.find((e) => e.id === 'dieren')!
    const oud = r.entries.find((e) => e.id === 'oud')!

    expect(dieren.annualAmount / 12).toBeCloseTo(1200 / 11, 10)
    expect(oud.annualAmount).toBe(dieren.annualAmount)
    expect(dieren.realizedMonths).toBe(11)
    expect(oud.realizedMonths).toBe(11)
    expect(dieren.annualAmount / 12).not.toBeCloseTo(300, 0)
  })
})

describe('A3 — Given meer dan 12 maanden historie, then is de deler 12 voor alle budgetten', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('de oudste maand van het venster is bezet → 12, óók voor een budget van twee maanden oud', async () => {
    const rows = [
      agg(maand(12), 'boodschappen', -250), // oudste afgesloten maand in het venster
      agg(maand(1), 'dieren', -1200),
    ]
    const realized = await fetchRealizedBudgetAmounts(makeSupabase(rows).supabase)
    expect(realized.historyMonths).toBe(12)

    const r = computeBudgetBasis(
      [row({ id: 'boodschappen' }), row({ id: 'dieren', created_at: '2026-07-20T00:00:00Z' })],
      'expense',
      [],
      { realized },
    )
    expect(r.entries.find((e) => e.id === 'dieren')!.annualAmount).toBe(1200)
    expect(r.entries.every((e) => e.realizedMonths === 12)).toBe(true)
  })

  it('een deler > 12 bestaat niet — ook een handmatig venster wordt op 12 geklemd', () => {
    const realized: BudgetRealizedWindow = {
      windowMonths: 12,
      windowEndMonth: '2026-08',
      historyMonths: 40,
      windowIncome: { real: 0, all: 0 },
      byMonth: {},
      truncationSuspected: false,
      byBudgetId: { e: { incoming: 0, outgoing: 1200 } },
    }
    const r = computeBudgetBasis([row({ id: 'e' })], 'expense', [], { realized })
    expect(r.entries[0].annualAmount).toBe(1200)
    expect(r.entries[0].realizedMonths).toBe(12)
  })
})

describe('R1 (review golf 2) — de inkomen-kassabon op de cash-pagina: rijen, subtotaal, deler en totaal uit ÉÉN venster', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('Σ byMonth.income == windowIncome.real, en (subtotaal ÷ historyMonths) × 12 == transactionAnnualIncome — óók met een boeking in de lopende maand', async () => {
    const rows = [
      agg(maand(3), 'salaris', 3000), // vroegste boeking: 3 afgesloten maanden historie
      agg(maand(2), 'salaris', 3000),
      agg(maand(1), 'salaris', 3000),
      agg(maand(1), null, 500), // inkomen zonder budget telt mee in de kassabon
      agg(maand(1), 'eigen', 2000, 'transfer'), // transfer: niet in de kassabon-rijen
      agg(maand(0), 'salaris', 9999), // lopende maand: nergens in
    ]
    const realized = await fetchRealizedBudgetAmounts(makeSupabase(rows).supabase)

    const subtotaal = Object.values(realized.byMonth).reduce((s, m) => s + m.income, 0)
    expect(subtotaal).toBe(9500)
    expect(subtotaal).toBe(realized.windowIncome.real)
    expect(realized.historyMonths).toBe(3)
    // Precies wat `IncomeKassabon` toont: "Gemiddeld per maand × 12" == het totaal eronder.
    expect((subtotaal / realized.historyMonths) * 12).toBeCloseTo(transactionAnnualIncome(realized), 6)
    expect(Object.keys(realized.byMonth).sort()).toEqual([maand(3), maand(2), maand(1)].sort())
    expect(realized.byMonth[maand(1)]).toEqual({ income: 3500, expenses: 0 })
  })
})

describe('A4 — Given alleen boekingen in de lopende maand, then gelden de bestaande terugval en geen NaN/Infinity', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('geen afgesloten maand → elke post op de geplande limiet, het jaarinkomen 0 (→ profiel-terugval), alles eindig', async () => {
    const rows = [agg(maand(0), 'salaris', 3000), agg(maand(0), 'dieren', -1200)]
    const realized = await fetchRealizedBudgetAmounts(makeSupabase(rows).supabase)

    expect(realized.byBudgetId).toEqual({})
    expect(Number.isFinite(realized.historyMonths)).toBe(true)
    expect(realized.historyMonths).toBeGreaterThanOrEqual(1)
    expect(transactionAnnualIncome(realized)).toBe(0)

    const r = computeBudgetBasis(
      [row({ id: 'dieren', default_limit: 100, interval: 'monthly' })],
      'expense',
      [],
      { realized },
    )
    expect(r.entries[0].source).toBe('planned')
    expect(r.entries[0].annualAmount).toBe(1200)
    expect(Number.isFinite(r.monthlyTotal)).toBe(true)
  })
})
