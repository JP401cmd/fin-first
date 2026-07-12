import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { checkTierGate } from '@/lib/require-tier'
import { detectRecurringTransactions } from '@/lib/recurring-detection'
import { SUBSCRIPTION_DETECT_PROMPT } from '@/lib/ai/subscription-detect-prompt'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'

/**
 * POST /api/subscriptions/detect-ai
 *
 * Uses the existing recurring-detection algorithm to group all recurring patterns,
 * then asks Claude which ones the user would recognise as subscriptions (broader
 * than the algo's own 'subscription' category — streaming, apps, memberships,
 * donations, phone plans, etc.).
 *
 * Returns the same shape as GET /api/subscriptions.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const tierGate = await checkTierGate(supabase, user.id, 'ai')
    if (tierGate) {
      return NextResponse.json({ error: tierGate.error }, { status: 403 })
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

    function toMonthly(amount: number, frequency: string): number {
      const abs = Math.abs(amount)
      switch (frequency) {
        case 'weekly': return (abs * 52) / 12
        case 'quarterly': return abs / 3
        case 'yearly': return abs / 12
        default: return abs
      }
    }

    // Build confirmed subscriptions from DB (expenses only: amount < 0)
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

    // Run detection on ALL categories (not just 'subscription')
    // Pre-filter to expenses only using the explicit is_income flag (more reliable than amount sign)
    const allDetected = detectRecurringTransactions(
      transactions
        .filter(t => !(t.is_income ?? false))
        .map(t => ({
          id: t.id,
          date: t.date,
          amount: Number(t.amount),
          description: t.description ?? '',
          counterparty_name: t.counterparty_name ?? null,
          is_income: false,
          budget_id: t.budget_id ?? null,
          transaction_type: t.transaction_type ?? null,
        })),
      existingRecurrings,
      budgets,
    )

    // Filter: not already in DB, high/medium confidence
    const confirmedKeys = new Set(
      existingRecurrings.map(r => (r.counterparty_name ?? '').toLowerCase().trim())
    )
    const candidates = allDetected.filter(
      d =>
        d.confidence !== 'low' &&
        !d.alreadyExists &&
        !confirmedKeys.has((d.counterpartyName ?? '').toLowerCase().trim()),
    )

    if (candidates.length === 0) {
      const totalMonthly = confirmedSubscriptions.reduce((sum, s) => sum + s.monthlyAmount, 0)
      return NextResponse.json({
        subscriptions: confirmedSubscriptions,
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        count: confirmedSubscriptions.length,
      })
    }

    // Ask Claude which of these patterns are subscriptions
    let model
    try {
      model = await getModel(supabase, 'abonnementen_detectie')
    } catch (err) {
      if (err instanceof AIConfigError) {
        return NextResponse.json({ error: err.message }, { status: 422 })
      }
      return NextResponse.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
    }

    // Sanitize the counterparty/description pattern list before it reaches the
    // AI provider (chat/categorize contract). The user's own name + generic PII
    // (IBAN/e-mail/phone/address) are stripped; merchant names stay (needed to
    // recognise a subscription; a business identifier, not person-PII).
    const { data: sanitizeProfile } = await supabase
      .from('profiles')
      .select('full_name, date_of_birth')
      .eq('id', user.id)
      .single()
    const sanitizeOpts: SanitizeOptions = {}
    if (sanitizeProfile?.full_name) sanitizeOpts.names = [sanitizeProfile.full_name]
    if (sanitizeProfile?.date_of_birth) sanitizeOpts.dateOfBirth = sanitizeProfile.date_of_birth

    const patternList = candidates
      .map((d, i) => `${i}: ${sanitizeForAI(d.counterpartyName || d.commonDescription, sanitizeOpts)} | ${d.frequency} | €${Math.abs(d.averageAmount).toFixed(2)}/keer | ${d.occurrences}x gezien`)
      .join('\n')

    const responseSchema = z.object({
      subscriptionIndices: z.array(z.number()).describe(
        'Indices (uit de gegeven lijst) van patronen die de gebruiker als abonnement zou herkennen'
      ),
    })

    const { object } = await generateObject({
      model,
      schema: responseSchema,
      system: SUBSCRIPTION_DETECT_PROMPT,
      prompt: `Welke van deze terugkerende betalingen zijn abonnementen?\n\n${patternList}`,
      maxRetries: 1,
    })

    const approvedIndices = new Set(object.subscriptionIndices)
    const aiDetected = candidates
      .filter((_, i) => approvedIndices.has(i))
      .map(d => ({
        id: d.key,
        name: d.counterpartyName || d.commonDescription,
        averageAmount: Math.abs(d.averageAmount),
        monthlyAmount: toMonthly(d.averageAmount, d.frequency),
        frequency: d.frequency,
        nextDate: null as string | null,
        confidence: d.confidence,
        isVariableAmount: d.isVariableAmount,
        occurrences: d.occurrences,
        alreadyConfirmed: false,
      }))

    const merged = [...confirmedSubscriptions, ...aiDetected]
    const totalMonthly = merged.reduce((sum, s) => sum + s.monthlyAmount, 0)

    return NextResponse.json({
      subscriptions: merged,
      totalMonthly: Math.round(totalMonthly * 100) / 100,
      count: merged.length,
    })
  } catch (err) {
    console.error('[/api/subscriptions/detect-ai]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
