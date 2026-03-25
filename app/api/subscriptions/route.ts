import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { detectRecurringTransactions, detectCategory, CATEGORY_LABELS, type RecurringCategory } from '@/lib/recurring-detection'

const SUBSCRIPTION_CATEGORIES: RecurringCategory[] = ['subscription']
const VASTE_KOSTEN_CATEGORIES: RecurringCategory[] = ['rent', 'mortgage', 'utility', 'insurance', 'transport']

/**
 * GET /api/subscriptions
 *
 * Detects recurring expense patterns from the last 12 months of transaction history.
 * Returns subscriptions and fixed costs (vaste kosten) with monthly cost totals.
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
        .select('id, date, amount, description, counterparty_name, is_income, budget_id, transaction_type')
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

    // Build confirmed recurring items from DB (expenses only: amount < 0)
    const confirmedItems = existingRecurrings.filter(r => Number(r.amount) < 0).map(r => {
      const name = r.name || r.counterparty_name || 'Onbekend'
      const category = detectCategory(r.counterparty_name ?? '', name, false)
      return {
        id: r.id,
        name,
        averageAmount: Math.abs(Number(r.amount)),
        monthlyAmount: toMonthly(Number(r.amount), r.frequency ?? 'monthly'),
        frequency: (r.frequency ?? 'monthly') as 'monthly' | 'weekly' | 'quarterly' | 'yearly',
        nextDate: null as string | null,
        confidence: 'high' as const,
        isVariableAmount: false,
        occurrences: null as number | null,
        alreadyConfirmed: true,
        category,
        categoryLabel: CATEGORY_LABELS[category],
      }
    })

    if (transactions.length < 3) {
      const subs = confirmedItems.filter(i => SUBSCRIPTION_CATEGORIES.includes(i.category))
      const vk = confirmedItems.filter(i => VASTE_KOSTEN_CATEGORIES.includes(i.category))
      const totalSubs = subs.reduce((s, i) => s + i.monthlyAmount, 0)
      const totalVK = vk.reduce((s, i) => s + i.monthlyAmount, 0)
      return NextResponse.json({
        subscriptions: subs,
        vasteKosten: vk,
        totalMonthlySubscriptions: Math.round(totalSubs * 100) / 100,
        totalMonthlyVasteKosten: Math.round(totalVK * 100) / 100,
        totalMonthly: Math.round((totalSubs + totalVK) * 100) / 100,
        count: subs.length + vk.length,
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
        transaction_type: t.transaction_type ?? null,
      })),
      existingRecurrings,
      budgets,
    )

    // Filter: expenses with medium/high confidence in subscription or vaste kosten categories
    const relevantCategories = [...SUBSCRIPTION_CATEGORIES, ...VASTE_KOSTEN_CATEGORIES]
    const detected = allDetected.filter(
      d =>
        relevantCategories.includes(d.suggestedCategory) &&
        !d.isIncome &&
        d.confidence !== 'low',
    )

    const detectedItems = detected.map(d => ({
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
      category: d.suggestedCategory,
      categoryLabel: CATEGORY_LABELS[d.suggestedCategory],
    }))

    // Merge: confirmed first, then new auto-detections that aren't already confirmed
    const newDetections = detectedItems.filter(s => !s.alreadyConfirmed)
    const allItems = [...confirmedItems.filter(i => relevantCategories.includes(i.category)), ...newDetections]

    const subscriptions = allItems.filter(i => SUBSCRIPTION_CATEGORIES.includes(i.category))
    const vasteKosten = allItems.filter(i => VASTE_KOSTEN_CATEGORIES.includes(i.category))
    const totalSubs = subscriptions.reduce((s, i) => s + i.monthlyAmount, 0)
    const totalVK = vasteKosten.reduce((s, i) => s + i.monthlyAmount, 0)

    return NextResponse.json({
      subscriptions,
      vasteKosten,
      totalMonthlySubscriptions: Math.round(totalSubs * 100) / 100,
      totalMonthlyVasteKosten: Math.round(totalVK * 100) / 100,
      totalMonthly: Math.round((totalSubs + totalVK) * 100) / 100,
      count: subscriptions.length + vasteKosten.length,
    })
  } catch (err) {
    console.error('[/api/subscriptions]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
