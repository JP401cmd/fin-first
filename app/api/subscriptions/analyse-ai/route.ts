import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { checkTierGate } from '@/lib/require-tier'
import { detectRecurringTransactions, CATEGORY_LABELS } from '@/lib/recurring-detection'
import { VASTE_KOSTEN_ANALYSE_PROMPT } from '@/lib/ai/dna/wil'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { unauthorized } from '@/lib/api/respond'

/** Maximum number of candidates to send to the AI model to avoid token waste. */
const MAX_AI_CANDIDATES = 50

/**
 * POST /api/subscriptions/analyse-ai
 *
 * Analyzes all detected recurring expense patterns using AI and classifies each as:
 * - 'subscription' (abonnement): streaming, apps, memberships, donations, phone plans
 * - 'vaste_kosten' (fixed cost): rent, mortgage, energy, insurance, taxes, childcare, loans
 * - 'skip' (not a fixed cost): groceries, fuel, restaurants, variable shopping
 *
 * Returns suggestions for the user to review and confirm.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return unauthorized()
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

    if (transactions.length < 3) {
      return NextResponse.json({
        suggestions: [],
        analysedCount: 0,
        skippedCount: 0,
      })
    }

    // Run detection on ALL categories — pre-filter to expenses only
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

    // Filter: medium+ confidence, not already confirmed, expenses only
    const confirmedKeys = new Set(
      existingRecurrings.flatMap(r => [
        (r.counterparty_name ?? '').toLowerCase().trim(),
        (r.name ?? '').toLowerCase().trim(),
      ].filter(Boolean))
    )
    const candidates = allDetected.filter(
      d =>
        d.confidence !== 'low' &&
        !d.alreadyExists &&
        !confirmedKeys.has((d.counterpartyName ?? '').toLowerCase().trim()),
    )

    if (candidates.length === 0) {
      return NextResponse.json({
        suggestions: [],
        analysedCount: 0,
        skippedCount: 0,
      })
    }

    // Cap candidates to avoid excessive token usage
    const cappedCandidates = candidates.slice(0, MAX_AI_CANDIDATES)

    // Prepare AI model
    let model
    try {
      model = await getModel(supabase, 'abonnementen_analyse')
    } catch (err) {
      if (err instanceof AIConfigError) {
        // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
        return NextResponse.json({ error: err.message }, { status: 422 })
      }
      return NextResponse.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
    }

    // Sanitize counterparty/description names before they reach the AI provider
    // (chat/categorize contract): own name + generic PII stripped, merchant
    // names kept (needed for classification; business identifier, not PII).
    const { data: sanitizeProfile } = await supabase
      .from('profiles')
      .select('full_name, date_of_birth')
      .eq('id', user.id)
      .single()
    const sanitizeOpts: SanitizeOptions = {}
    if (sanitizeProfile?.full_name) sanitizeOpts.names = [sanitizeProfile.full_name]
    if (sanitizeProfile?.date_of_birth) sanitizeOpts.dateOfBirth = sanitizeProfile.date_of_birth

    // Build the pattern list with auto-detected category as context for the AI
    const patternList = cappedCandidates
      .map((d, i) => {
        const name = sanitizeForAI(d.counterpartyName || d.commonDescription, sanitizeOpts)
        const categoryLabel = CATEGORY_LABELS[d.suggestedCategory]
        return `${i}: ${name} | ${d.frequency} | €${Math.abs(d.averageAmount).toFixed(2)}/keer | ${d.occurrences}x gezien | auto-categorie: ${categoryLabel}`
      })
      .join('\n')

    const responseSchema = z.object({
      classifications: z.array(z.object({
        index: z.number().describe('Index uit de lijst'),
        classification: z.enum(['subscription', 'vaste_kosten', 'skip']).describe(
          'subscription = abonnement (streaming, apps, lidmaatschap, donatie, telefoon), vaste_kosten = vaste kosten (huur, hypotheek, energie, verzekering, belasting, kinderopvang, lening), skip = geen vaste kost'
        ),
        reason: z.string().describe('Korte reden voor de classificatie in het Nederlands'),
      })),
    })

    const systemPrompt = VASTE_KOSTEN_ANALYSE_PROMPT

    const { object } = await generateObject({
      model,
      schema: responseSchema,
      system: systemPrompt,
      prompt: `Classificeer elk van deze terugkerende betalingen als subscription, vaste_kosten of skip:\n\n${patternList}`,
      maxRetries: 1,
    })

    // Build a lookup from AI classifications by index
    const classificationMap = new Map<number, { classification: 'subscription' | 'vaste_kosten' | 'skip'; reason: string }>()
    for (const c of object.classifications) {
      if (c.index >= 0 && c.index < cappedCandidates.length) {
        classificationMap.set(c.index, { classification: c.classification, reason: c.reason })
      }
    }

    // Build suggestion list — include all classified items (including skipped, for transparency)
    const suggestions = cappedCandidates.map((d, i) => {
      const ai = classificationMap.get(i)
      return {
        id: d.key,
        name: d.counterpartyName || d.commonDescription,
        monthlyAmount: toMonthly(d.averageAmount, d.frequency),
        frequency: d.frequency,
        occurrences: d.occurrences,
        autoCategory: d.suggestedCategory,
        autoCategoryLabel: CATEGORY_LABELS[d.suggestedCategory],
        aiClassification: ai?.classification ?? 'skip' as const,
        aiReason: ai?.reason ?? 'Geen classificatie ontvangen van AI',
        confidence: d.confidence,
      }
    })

    // Non-skipped items are the actionable suggestions; skipped items are counted separately
    const skippedCount = suggestions.filter(s => s.aiClassification === 'skip').length

    return NextResponse.json({
      suggestions,
      analysedCount: suggestions.length,
      skippedCount,
    })
  } catch (err) {
    console.error('[/api/subscriptions/analyse-ai]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
