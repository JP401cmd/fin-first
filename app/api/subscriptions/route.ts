import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { detectRecurringTransactions } from '@/lib/recurring-detection'

/**
 * GET /api/subscriptions
 *
 * Detects subscription patterns from the last 12 months of transaction history.
 * Returns confirmed and auto-detected subscriptions with monthly cost totals.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const startDateStr = startDate.toISOString().split('T')[0]

    const [txResult, recurringResult, budgetResult] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, date, amount, description, counterparty_name, is_income, budget_id')
        .gte('date', startDateStr)
        .order('date', { ascending: true }),
      supabase
        .from('recurring_transactions')
        .select('counterparty_name, amount, name')
        .eq('is_active', true),
      supabase
        .from('budgets')
        .select('id, name, parent_id, budget_type')
        .order('sort_order', { ascending: true }),
    ])

    const transactions = txResult.data ?? []
    const existingRecurrings = recurringResult.data ?? []
    const budgets = budgetResult.data ?? []

    if (transactions.length < 3) {
      return NextResponse.json({
        subscriptions: [],
        totalMonthly: 0,
        count: 0,
      })
    }

    // Run detection algorithm
    const allDetected = detectRecurringTransactions(
      transactions.map(t => ({
        id: t.id,
        date: t.date,
        amount: Number(t.amount),
        description: t.description ?? '',
        counterparty_name: t.counterparty_name ?? null,
        is_income: t.is_income ?? false,
        budget_id: t.budget_id ?? null,
      })),
      existingRecurrings,
      budgets,
    )

    // Filter: only subscriptions with confidence high or medium, expenses only
    const detected = allDetected.filter(
      d =>
        d.suggestedCategory === 'subscription' &&
        !d.isIncome &&
        d.confidence !== 'low',
    )

    // Convert to monthly amount equivalent
    function toMonthly(amount: number, frequency: string): number {
      const abs = Math.abs(amount)
      switch (frequency) {
        case 'weekly': return (abs * 52) / 12
        case 'quarterly': return abs / 3
        case 'yearly': return abs / 12
        default: return abs // monthly
      }
    }

    const subscriptions = detected.map(d => ({
      id: d.key,
      name: d.counterpartyName || d.commonDescription,
      averageAmount: Math.abs(d.averageAmount),
      monthlyAmount: toMonthly(d.averageAmount, d.frequency),
      frequency: d.frequency,
      nextDate: null as string | null,
      confidence: d.confidence,
      isVariableAmount: d.isVariableAmount,
      occurrences: d.occurrences,
      alreadyConfirmed: d.alreadyExists,
    }))

    const totalMonthly = subscriptions.reduce((sum, s) => sum + s.monthlyAmount, 0)

    return NextResponse.json({
      subscriptions,
      totalMonthly: Math.round(totalMonthly * 100) / 100,
      count: subscriptions.length,
    })
  } catch (err) {
    console.error('[/api/subscriptions]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
