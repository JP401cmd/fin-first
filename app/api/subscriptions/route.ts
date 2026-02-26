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
        .select('id, counterparty_name, amount, name, frequency')
        .eq('is_active', true),
      supabase
        .from('budgets')
        .select('id, name, parent_id, budget_type')
        .order('sort_order', { ascending: true }),
    ])

    const transactions = txResult.data ?? []
    const existingRecurrings = recurringResult.data ?? []
    const budgets = budgetResult.data ?? []

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

    // Build confirmed subscriptions directly from DB (expenses only: amount < 0)
    const confirmedSubscriptions = existingRecurrings.filter(r => Number(r.amount) < 0).map(r => ({
      id: r.id,
      name: r.name || r.counterparty_name || 'Onbekend',
      averageAmount: Math.abs(Number(r.amount)),
      monthlyAmount: toMonthly(Number(r.amount), r.frequency ?? 'monthly'),
      frequency: (r.frequency ?? 'monthly') as 'monthly' | 'weekly' | 'quarterly' | 'yearly',
      nextDate: null as string | null,
      confidence: 'high' as const,
      isVariableAmount: false,
      occurrences: null as number | null,
      alreadyConfirmed: true,
    }))

    if (transactions.length < 3) {
      const totalMonthly = confirmedSubscriptions.reduce((sum, s) => sum + s.monthlyAmount, 0)
      return NextResponse.json({
        subscriptions: confirmedSubscriptions,
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        count: confirmedSubscriptions.length,
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

    const detectedSubscriptions = detected.map(d => ({
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

    // Merge: confirmed first, then new auto-detections that aren't already confirmed
    const newDetections = detectedSubscriptions.filter(s => !s.alreadyConfirmed)
    const merged = [...confirmedSubscriptions, ...newDetections]

    const totalMonthly = merged.reduce((sum, s) => sum + s.monthlyAmount, 0)

    return NextResponse.json({
      subscriptions: merged,
      totalMonthly: Math.round(totalMonthly * 100) / 100,
      count: merged.length,
    })
  } catch (err) {
    console.error('[/api/subscriptions]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
