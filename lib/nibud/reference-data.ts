import type { SupabaseClient } from '@supabase/supabase-js'
import type { NibudHouseholdType, NibudReference, NibudBenchmark } from './types'
import { aggregateBySlug } from './category-mapping'

/**
 * Map a user profile to the best-matching NIBUD household type.
 */
export function getNibudHouseholdType(profile: {
  household_type?: string | null
  number_of_children?: number | null
  children_ages?: number[] | null
}): NibudHouseholdType {
  const ht = profile.household_type ?? 'solo'
  const children = profile.number_of_children ?? 0
  const ages = profile.children_ages ?? []

  if (ht === 'solo' || (ht === 'samen' && children === 0)) {
    return ht === 'solo' ? 'alleenstaand' : 'paar'
  }

  // Has children — determine age bracket
  const hasTeen = ages.some(a => a >= 12)
  const avgAge = ages.length > 0 ? ages.reduce((s, a) => s + a, 0) / ages.length : 0

  if (hasTeen || avgAge >= 12) return 'gezin_tiener'
  return 'gezin_jong'
}

/**
 * Fetch NIBUD reference data from the database.
 */
export async function getNibudReferences(
  supabase: SupabaseClient,
  householdType: NibudHouseholdType,
  year = 2026,
): Promise<NibudReference[]> {
  const { data } = await supabase
    .from('nibud_reference_data')
    .select('nibud_category_key, nibud_category_name, basis_amount, voorbeeld_amount, mapped_budget_slug')
    .eq('household_composition', householdType)
    .eq('year', year)
    .order('nibud_category_key')

  return (data ?? []).map(row => ({
    nibud_category_key: row.nibud_category_key,
    nibud_category_name: row.nibud_category_name,
    basis_amount: Number(row.basis_amount),
    voorbeeld_amount: row.voorbeeld_amount != null ? Number(row.voorbeeld_amount) : null,
    mapped_budget_slug: row.mapped_budget_slug,
  }))
}

/**
 * Calculate benchmarks: compare user spending per budget slug against aggregated NIBUD references.
 *
 * @param references - Raw NIBUD references for the user's household type
 * @param userSpendingBySlug - Map of budget slug -> monthly spending (from transactions)
 * @param dailyExpense - User's daily expense for freedom-day conversion
 */
export function calculateBenchmarks(
  references: NibudReference[],
  userSpendingBySlug: Record<string, number>,
  dailyExpense: number,
  slugToId?: Record<string, string>,
): NibudBenchmark[] {
  const aggregated = aggregateBySlug(references)
  const benchmarks: NibudBenchmark[] = []

  for (const agg of aggregated) {
    const userSpending = userSpendingBySlug[agg.slug] ?? 0
    // Use voorbeeld (average) as primary benchmark, fallback to basis
    const referenceAmount = agg.voorbeeld_total ?? agg.basis_total
    const delta = userSpending - referenceAmount
    const freedomDaysPotential = delta > 0 && dailyExpense > 0
      ? Math.round((delta * 12) / dailyExpense)
      : 0

    benchmarks.push({
      nibud_category_key: agg.slug,
      nibud_category_name: agg.label,
      basis_amount: agg.basis_total,
      voorbeeld_amount: agg.voorbeeld_total,
      mapped_budget_slug: agg.slug,
      mapped_budget_id: slugToId?.[agg.slug] ?? null,
      user_spending: userSpending,
      delta,
      freedom_days_potential: freedomDaysPotential,
    })
  }

  // Sort: biggest potential first (above norm), then below norm
  benchmarks.sort((a, b) => b.freedom_days_potential - a.freedom_days_potential || b.delta - a.delta)

  return benchmarks
}
