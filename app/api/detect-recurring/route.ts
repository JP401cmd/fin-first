import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  detectRecurringTransactions,
  RECURRING_ANALYSIS_MONTHS,
  type DetectedRecurring,
} from '@/lib/recurring-detection'
import { localMonthStartMonthsAgo } from '@/lib/month-range'
import { fetchAllRecurringTx } from '@/lib/vaste-lasten-summary'
import { serverError } from '@/lib/api/respond'

/**
 * GET /api/detect-recurring
 *
 * Analyzes transaction history to automatically detect recurring patterns.
 * Returns detected patterns with confidence scores and suggested categories.
 *
 * Query params:
 * - account_id (optional): Filter to specific bank account
 * - months (optional): Number of months to analyze (default: RECURRING_ANALYSIS_MONTHS)
 * - min_confidence (optional): Minimum confidence level ('high' | 'medium' | 'low', default: 'low')
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)
    if (!claims) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const url = new URL(request.url)
    const accountId = url.searchParams.get('account_id')
    // Default = het canonieke analysevenster (V-001: 24, was een losse 12), zodat
    // deze route standaard dezelfde verzameling ziet als de vaste-lastenpagina.
    // De bovengrens stond al op 24 en blijft ongewijzigd.
    const months = Math.min(
      24,
      Math.max(3, parseInt(url.searchParams.get('months') || String(RECURRING_ANALYSIS_MONTHS))),
    )
    const minConfidence = url.searchParams.get('min_confidence') || 'low'

    // Calculate date range — lokale maandgrens, geen toISOString() (NL-dag-shift)
    const now = new Date()
    const startDateStr = localMonthStartMonthsAgo(now, months)

    // Fetch transactions, existing recurrings, and budgets in parallel.
    // Transacties via de keyset-ophaal: één kale query kapt af op max_rows (1000)
    // en levert dan alleen de oudste rijen (V-001).
    const [txResult, recurringResult, budgetResult] = await Promise.all([
      fetchAllRecurringTx(supabase, startDateStr, { accountId: accountId ?? undefined }),
      supabase
        .from('recurring_transactions')
        .select('counterparty_name, amount, name')
        .eq('is_active', true),
      supabase
        .from('budgets')
        .select('id, name, parent_id, budget_type')
        .order('sort_order', { ascending: true }),
    ])

    // Een afgekapte ophaal zou stil op alleen de oudste rijen detecteren — liever
    // een eerlijke fout dan een onvolledig antwoord (zelfde discipline als de
    // vaste-lastenpagina).
    if (!txResult.complete) {
      return serverError(new Error('transactions fetch incomplete'), 'detect-recurring:GET')
    }
    const transactions = txResult.rows
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
        id: t.id,
        date: t.date,
        amount: Number(t.amount),
        description: t.description ?? '',
        counterparty_name: t.counterparty_name ?? null,
        is_income: t.is_income ?? false,
        budget_id: t.budget_id ?? null,
        transaction_type: t.transaction_type ?? null,
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
