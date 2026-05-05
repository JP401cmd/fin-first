import { createClient } from '@/lib/supabase/server'
import { resolveFireParams } from '@/lib/fire-params'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import type { LifeEvent } from '@/lib/horizon-data'
import { loadCoreData } from '@/lib/core-data-loader'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { OverzichtClient } from './overzicht-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

export default async function OverzichtPage() {
  const supabase = await createClient()

  const [
    { data: assets },
    { data: debts },
    { data: profile },
    { data: budgets },
    { data: lifeEvents },
    { data: aowRows },
    coreData,
  ] = await Promise.all([
    supabase.from('assets').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('debts').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('profiles').select('*').single(),
    supabase.from('budgets').select('*').eq('is_active', true),
    supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('aow_leeftijden').select('*'),
    loadCoreData(supabase).catch(() => null),
  ])

  const fireParams = resolveFireParams(profile ?? {})
  const cashflows = lifeEventsToCashflows((lifeEvents ?? []) as LifeEvent[])

  // Compute totals
  const totalAssets = (assets ?? []).reduce(
    (sum: number, a: Record<string, unknown>) => sum + Number(a.current_value ?? 0),
    0,
  )
  const totalDebts = (debts ?? []).reduce(
    (sum: number, d: Record<string, unknown>) => sum + Number(d.current_balance ?? 0),
    0,
  )
  const netWorth = totalAssets - totalDebts

  // Weighted gross return from per-asset expected_return, weighted by current_value.
  // Falls back to fireParams.grossReturn if total value is zero or assets missing.
  let weightedGrossReturn = fireParams.grossReturn
  if (assets && assets.length > 0 && totalAssets > 0) {
    let weightedSum = 0
    for (const a of assets as Record<string, unknown>[]) {
      const value = Number(a.current_value ?? 0)
      const expReturn = Number(a.expected_return ?? 0) / 100
      weightedSum += value * expReturn
    }
    weightedGrossReturn = weightedSum / totalAssets
  }

  // Monthly expenses
  const yearlyMustExpenses = (budgets ?? [])
    .filter((b: Record<string, unknown>) => b.budget_type === 'essentieel' || b.budget_type === 'must')
    .reduce((sum: number, b: Record<string, unknown>) => sum + Number(b.amount ?? 0) * 12, 0)

  // Look up AOW age from dedicated table (same source as horizon page / dashboard).
  const dob = typeof profile?.date_of_birth === 'string' ? profile.date_of_birth : null
  const userAowAge = lookupAowAge((aowRows ?? []) as AowLeeftijdRow[], dob).fractional

  // Core-page derived values (feed Uitgangspunten + settings-less overzicht).
  const savingsRate6m = coreData?.savingsRate6m ?? 0
  const estimatedYearlyIncome = coreData?.rawFinancials.extrapolatedIncome ?? 0

  return (
    <>
      <NavStackMeta title="Doorrekening — Overzicht" />
      <OverzichtClient
        assets={assets ?? []}
        debts={debts ?? []}
        profile={profile}
        fireParams={fireParams}
        netWorth={netWorth}
        totalAssets={totalAssets}
        totalDebts={totalDebts}
        yearlyMustExpenses={yearlyMustExpenses}
        lifeEvents={(lifeEvents ?? []) as LifeEvent[]}
        cashflows={cashflows}
        userAowAge={userAowAge}
        weightedGrossReturn={weightedGrossReturn}
        savingsRate6m={savingsRate6m}
        estimatedYearlyIncome={estimatedYearlyIncome}
      />
    </>
  )
}
