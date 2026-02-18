import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/budget-variance — Calculate spending variance per budget category.
 *
 * Returns standard deviation, mean, coefficient of variation, and confidence level
 * for each budget category based on 6–12 months of transaction history.
 *
 * Low variance = high confidence in predictions.
 * High variance = low confidence in predictions.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    // Fetch all budgets for the user
    const { data: budgets, error: budgetError } = await supabase
      .from('budgets')
      .select('id, name, slug, icon, parent_id, budget_type, default_limit, is_essential')
      .eq('user_id', user.id)

    if (budgetError) {
      return NextResponse.json({ error: 'Fout bij laden budgetten', detail: budgetError.message }, { status: 500 })
    }

    if (!budgets || budgets.length === 0) {
      return NextResponse.json({ categories: [], message: 'Geen budgetten gevonden' })
    }

    // Calculate date range: last 12 months
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const startStr = startDate.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]

    // Build months array
    const months: { start: string; end: string; key: string }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const start = d.toISOString().split('T')[0]
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split('T')[0]
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push({ start, end, key })
    }

    // Fetch all transactions in the date range
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('budget_id, amount, date')
      .eq('user_id', user.id)
      .gte('date', startStr)
      .lt('date', endStr)
      .not('budget_id', 'is', null)

    if (txError) {
      return NextResponse.json({ error: 'Fout bij laden transacties', detail: txError.message }, { status: 500 })
    }

    // Fetch budget amount overrides
    const { data: budgetAmounts } = await supabase
      .from('budget_amounts')
      .select('budget_id, effective_from, amount')
      .eq('user_id', user.id)

    // Group budgets: parent -> children
    const parentBudgets = budgets.filter(b => !b.parent_id)
    const childBudgets = budgets.filter(b => b.parent_id)

    const categories = parentBudgets.map(parent => {
      const children = childBudgets.filter(c => c.parent_id === parent.id)
      const budgetIds = children.length > 0 ? children.map(c => c.id) : [parent.id]

      // Calculate monthly spending for this category
      const monthlySpending = months.map(m => {
        const monthTx = (transactions ?? []).filter(t =>
          t.date >= m.start && t.date < m.end && budgetIds.includes(t.budget_id)
        )
        return monthTx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
      })

      // Get effective limit for the most recent month
      let limit = Number(parent.default_limit) || 0
      if (budgetAmounts) {
        const applicable = budgetAmounts
          .filter(a => budgetIds.includes(a.budget_id))
          .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
        if (applicable.length > 0) {
          limit = Number(applicable[0].amount)
        }
      }

      // Non-zero months for calculation
      const nonZeroMonths = monthlySpending.filter(v => v > 0)
      const monthsOfData = nonZeroMonths.length
      const hasSufficientData = monthsOfData >= 3

      if (!hasSufficientData) {
        return {
          budgetId: parent.id,
          budgetName: parent.name,
          budgetSlug: parent.slug,
          budgetIcon: parent.icon,
          budgetType: parent.budget_type,
          isEssential: parent.is_essential,
          limit,
          monthlySpending,
          stdDev: 0,
          mean: 0,
          cv: 1,
          confidence: 'insufficient' as const,
          confidencePercent: 0,
          monthsOfData,
          hasSufficientData: false,
        }
      }

      // Calculate statistics
      const mean = nonZeroMonths.reduce((s, v) => s + v, 0) / nonZeroMonths.length
      const variance = nonZeroMonths.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / nonZeroMonths.length
      const stdDev = Math.sqrt(variance)
      const cv = mean > 0 ? stdDev / mean : 1

      // Confidence mapping (matches budget-forecast.ts logic)
      let confidence: 'high' | 'medium' | 'low'
      let confidencePercent: number
      if (cv < 0.15) {
        confidence = 'high'
        confidencePercent = Math.round(90 - cv * 100)
      } else if (cv < 0.35) {
        confidence = 'medium'
        confidencePercent = Math.round(75 - (cv - 0.15) * 150)
      } else {
        confidence = 'low'
        confidencePercent = Math.round(Math.max(20, 45 - (cv - 0.35) * 100))
      }
      confidencePercent = Math.max(10, Math.min(95, confidencePercent))

      return {
        budgetId: parent.id,
        budgetName: parent.name,
        budgetSlug: parent.slug,
        budgetIcon: parent.icon,
        budgetType: parent.budget_type,
        isEssential: parent.is_essential,
        limit,
        monthlySpending,
        stdDev: Math.round(stdDev * 100) / 100,
        mean: Math.round(mean * 100) / 100,
        cv: Math.round(cv * 1000) / 1000,
        confidence,
        confidencePercent,
        monthsOfData,
        hasSufficientData: true,
      }
    })

    return NextResponse.json({
      categories,
      summary: {
        totalCategories: categories.length,
        withSufficientData: categories.filter(c => c.hasSufficientData).length,
        highConfidence: categories.filter(c => c.confidence === 'high').length,
        mediumConfidence: categories.filter(c => c.confidence === 'medium').length,
        lowConfidence: categories.filter(c => c.confidence === 'low').length,
        insufficientData: categories.filter(c => c.confidence === 'insufficient').length,
      },
    })
  } catch (err) {
    console.error('Budget variance error:', err)
    return NextResponse.json(
      { error: 'Interne fout bij berekenen variantie' },
      { status: 500 }
    )
  }
}
