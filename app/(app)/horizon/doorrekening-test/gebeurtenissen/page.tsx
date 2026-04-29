import { createClient } from '@/lib/supabase/server'
import { resolveFireParams } from '@/lib/fire-params'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import type { LifeEvent } from '@/lib/horizon-data'
import { loadCoreData } from '@/lib/core-data-loader'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { GebeurtenissenClient } from './gebeurtenissen-client'

export default async function GebeurtenissenPage() {
  const supabase = await createClient()

  const [
    { data: lifeEvents },
    { data: assets },
    { data: debts },
    { data: profile },
    { data: budgets },
    { data: aowRows },
    coreData,
  ] = await Promise.all([
    supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('assets').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('debts').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('profiles').select('*').single(),
    supabase.from('budgets').select('*').eq('is_active', true),
    supabase.from('aow_leeftijden').select('*'),
    loadCoreData(supabase).catch(() => null),
  ])

  const fireParams = resolveFireParams(profile ?? {})
  const cashflows = lifeEventsToCashflows((lifeEvents ?? []) as LifeEvent[])

  const totalAssets = (assets ?? []).reduce(
    (sum: number, a: Record<string, unknown>) => sum + Number(a.current_value ?? 0),
    0,
  )
  const totalDebts = (debts ?? []).reduce(
    (sum: number, d: Record<string, unknown>) => sum + Number(d.current_balance ?? 0),
    0,
  )
  const netWorth = totalAssets - totalDebts

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

  const yearlyMustExpenses = (budgets ?? [])
    .filter((b: Record<string, unknown>) => b.budget_type === 'essentieel' || b.budget_type === 'must')
    .reduce((sum: number, b: Record<string, unknown>) => sum + Number(b.amount ?? 0) * 12, 0)

  const dob = typeof profile?.date_of_birth === 'string' ? profile.date_of_birth : null
  const userAowAge = lookupAowAge((aowRows ?? []) as AowLeeftijdRow[], dob).fractional

  const savingsRate6m = coreData?.savingsRate6m ?? 0
  const estimatedYearlyIncome = coreData?.rawFinancials.extrapolatedIncome ?? 0

  // Afgeleide velden die de bestaande GebeurtenissenClient UI gebruikt.
  const monthlyIncome = estimatedYearlyIncome > 0
    ? estimatedYearlyIncome / 12
    : Number(profile?.net_monthly_income ?? 0)
  const savingsRate = savingsRate6m !== 0 ? savingsRate6m : Number(profile?.savings_rate ?? 0)
  const annualSavings = monthlyIncome * (savingsRate / 100) * 12
  const monthlyExpenses = Number(profile?.monthly_expenses ?? 0) ||
    (budgets ?? []).reduce(
      (sum: number, b: Record<string, unknown>) => sum + Number(b.amount ?? 0),
      0,
    ) ||
    monthlyIncome * (1 - savingsRate / 100)

  return (
    <GebeurtenissenClient
      lifeEvents={(lifeEvents ?? []) as LifeEvent[]}
      assets={assets ?? []}
      profile={profile}
      fireParams={fireParams}
      netWorth={netWorth}
      annualSavings={annualSavings}
      monthlyExpenses={monthlyExpenses}
      cashflows={cashflows}
      userAowAge={userAowAge}
      weightedGrossReturn={weightedGrossReturn}
      savingsRate6m={savingsRate6m}
      estimatedYearlyIncome={estimatedYearlyIncome}
      yearlyMustExpenses={yearlyMustExpenses}
    />
  )
}
