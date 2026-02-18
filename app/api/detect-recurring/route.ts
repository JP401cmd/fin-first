import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  detectRecurringTransactions,
  type DetectedRecurring,
} from '@/lib/recurring-detection'

/**
 * GET /api/detect-recurring
 *
 * Analyzes transaction history to automatically detect recurring patterns.
 * Returns detected patterns with confidence scores and suggested categories.
 *
 * Query params:
 * - account_id (optional): Filter to specific bank account
 * - months (optional): Number of months to analyze (default: 12)
 * - min_confidence (optional): Minimum confidence level ('high' | 'medium' | 'low', default: 'low')
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const url = new URL(request.url)
    const accountId = url.searchParams.get('account_id')
    const months = Math.min(24, Math.max(3, parseInt(url.searchParams.get('months') || '12')))
    const minConfidence = url.searchParams.get('min_confidence') || 'low'

    // Calculate date range
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1)
    const startDateStr = startDate.toISOString().split('T')[0]

    // Fetch transactions, existing recurrings, and budgets in parallel
    const txQuery = supabase
      .from('transactions')
      .select('id, date, amount, description, counterparty_name, is_income, budget_id')
      .gte('date', startDateStr)
      .order('date', { ascending: true })

    if (accountId) {
      txQuery.eq('account_id', accountId)
    }

    const [txResult, recurringResult, budgetResult] = await Promise.all([
      txQuery,
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
        detected: [],
        hasData: false,
        transactionCount: transactions.length,
        monthsAnalyzed: 0,
        message: 'Onvoldoende transactiedata voor patroonherkenning. Importeer minimaal 3 maanden aan transacties.',
      })
    }

    // Count months of data
    const monthSet = new Set(transactions.map(t => t.date.substring(0, 7)))
    const monthsAnalyzed = monthSet.size

    // Run detection algorithm
    const allDetected = detectRecurringTransactions(
      transactions.map(t => ({
        ...t,
        amount: Number(t.amount),
      })),
      existingRecurrings.map(r => ({
        counterparty_name: r.counterparty_name,
        amount: Number(r.amount),
        name: r.name,
      })),
      budgets,
    )

    // Filter by minimum confidence
    const confidenceOrder = { high: 3, medium: 2, low: 1 }
    const minConfidenceLevel = confidenceOrder[minConfidence as keyof typeof confidenceOrder] || 1
    const filtered = allDetected.filter(
      d => confidenceOrder[d.confidence] >= minConfidenceLevel
    )

    return NextResponse.json({
      detected: filtered,
      hasData: true,
      transactionCount: transactions.length,
      monthsAnalyzed,
      totalDetected: allDetected.length,
      filteredCount: filtered.length,
      existingRecurringsCount: existingRecurrings.length,
      message: filtered.length > 0
        ? `${filtered.length} terugkerende patronen gedetecteerd uit ${monthsAnalyzed} maanden transactiegeschiedenis`
        : 'Geen terugkerende patronen gevonden. Importeer meer transacties voor betere herkenning.',
    })
  } catch (err) {
    console.error('Detect recurring error:', err)
    return NextResponse.json(
      { error: 'Kon terugkerende patronen niet detecteren' },
      { status: 500 },
    )
  }
}
