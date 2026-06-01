// lib/cashflow-data-loader.ts
// Server-side data loader voor de cashflow-pagina's onder /overzicht/cashflow.
//
// Factort het transactions/recurrings/baseline/bank-accounts-blok dat voorheen
// inline in app/(app)/overzicht/cashflow/page.tsx stond. Wordt gedeeld door de
// landingspagina (kaart-KPI's), de Transacties-pagina, de Vaste-lasten-pagina
// en de Forecast-pagina. React `cache()` dedupt per request.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import type { TransactionRow } from '@/components/app/transacties-feed'
import type { RecurringTransaction } from '@/lib/recurring-data'

// ── Result type ───────────────────────────────────────────────

export interface CashflowData {
  /** Laatste 3 maanden transacties (voor de Transacties-pagina). */
  transactions: TransactionRow[]
  /** Huidige maand-label, bv. "juni 2026". */
  monthLabel: string | undefined
  /** Profielnaam — gebruikt door VasteLastenLoader. */
  fullName: string | null
  /** Actieve terugkerende transacties (vaste lasten + inkomsten). */
  recurrings: RecurringTransaction[]
  /** 6-maands gemiddeld maand-inkomen (baseline voor forecast). */
  baselineIncome: number
  /** 6-maands gemiddelde maand-uitgaven (baseline voor forecast). */
  baselineExpenses: number
  /** Som van liquide saldi (startpunt cumulatieve forecast). */
  startingBalance: number
  /** Aantal actieve gekoppelde bankrekeningen. */
  accountCount: number
}

const EMPTY: CashflowData = {
  transactions: [],
  monthLabel: undefined,
  fullName: null,
  recurrings: [],
  baselineIncome: 0,
  baselineExpenses: 0,
  startingBalance: 0,
  accountCount: 0,
}

// ── Loader ────────────────────────────────────────────────────

export const loadCashflowData = cache(async (supabase: SupabaseClient): Promise<CashflowData> => {
  const user = await getCachedUser(supabase)
  if (!user) return EMPTY

  const since = new Date()
  since.setMonth(since.getMonth() - 3)
  // Baseline-venster voor forecast: laatste 6 maanden gemiddeld inkomen +
  // uitgaven. Zelfde 6m-periode als de health-score (consistentie).
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const sixMonthsAgoIso = sixMonthsAgo.toISOString().split('T')[0]

  const [txResult, profileResult, recurResult, baselineResult, accountsResult] = await Promise.all([
    supabase
      // De transactions-tabel heeft geen `category`-kolom; categorie komt uit
      // de budget_id-join. Account-naam komt uit de bank_accounts-join.
      .from('transactions')
      .select('id, date, description, amount, bank_accounts(name), budgets(name)')
      .eq('user_id', user.id)
      .gte('date', since.toISOString().split('T')[0])
      .order('date', { ascending: false })
      .limit(500),
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true),
    // 6-maanden transacties voor baseline-aggregaat
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .gte('date', sixMonthsAgoIso),
    // Liquide saldo voor cumulatief-startpunt
    supabase
      .from('bank_accounts')
      .select('id, balance, name')
      .eq('user_id', user.id)
      .eq('is_active', true),
  ])

  const recurrings = (recurResult.data ?? []) as RecurringTransaction[]

  const baselineRows = (baselineResult.data ?? []) as { amount: number }[]
  let totalIncome = 0
  let totalExpenses = 0
  for (const r of baselineRows) {
    const a = Number(r.amount)
    if (a > 0) totalIncome += a
    else totalExpenses += Math.abs(a)
  }
  const baselineIncome = Math.round(totalIncome / 6)
  const baselineExpenses = Math.round(totalExpenses / 6)

  const accountsRows = (accountsResult.data ?? []) as { id: string; balance: number; name: string }[]
  const startingBalance = accountsRows.reduce((s, a) => s + Number(a.balance ?? 0), 0)
  const accountCount = accountsRows.length

  const transactions: TransactionRow[] = (txResult.data ?? []).map((t) => {
    const bankField = (t as { bank_accounts?: { name?: string } | { name?: string }[] | null }).bank_accounts
    const accountName = Array.isArray(bankField) ? bankField[0]?.name : bankField?.name
    const budgetField = (t as { budgets?: { name?: string } | { name?: string }[] | null }).budgets
    const categoryName = Array.isArray(budgetField) ? budgetField[0]?.name : budgetField?.name
    return {
      id: String(t.id),
      date: String(t.date),
      description: String(t.description ?? ''),
      category: categoryName ?? null,
      amount: Number(t.amount),
      account_name: accountName ?? null,
    }
  })

  const fullName = (profileResult.data as { full_name?: string | null } | null)?.full_name ?? null
  const monthLabel = new Intl.DateTimeFormat('nl-NL', {
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return {
    transactions,
    monthLabel,
    fullName,
    recurrings,
    baselineIncome,
    baselineExpenses,
    startingBalance,
    accountCount,
  }
})
