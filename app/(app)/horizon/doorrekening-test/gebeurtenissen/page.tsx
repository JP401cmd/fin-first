import { createClient } from '@/lib/supabase/server'
import { resolveFireParams } from '@/lib/fire-params'
import { GebeurtenissenClient } from './gebeurtenissen-client'

export default async function GebeurtenissenPage() {
  const supabase = await createClient()

  const [
    { data: lifeEvents },
    { data: assets },
    { data: debts },
    { data: profile },
    { data: budgets },
  ] = await Promise.all([
    supabase
      .from('life_events')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase.from('assets').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('debts').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('profiles').select('*').single(),
    supabase.from('budgets').select('*').eq('is_active', true),
  ])

  const fireParams = resolveFireParams(profile ?? {})

  // Compute current net worth
  const totalAssets = (assets ?? []).reduce(
    (sum: number, a: Record<string, unknown>) => sum + Number(a.current_value ?? 0),
    0,
  )
  const totalDebts = (debts ?? []).reduce(
    (sum: number, d: Record<string, unknown>) => sum + Number(d.current_balance ?? 0),
    0,
  )
  const netWorth = totalAssets - totalDebts

  // Annual savings from profile
  const monthlyIncome = Number(profile?.net_monthly_income ?? 0)
  const savingsRate = Number(profile?.savings_rate ?? 0)
  const annualSavings = monthlyIncome * (savingsRate / 100) * 12

  // Monthly expenses for freedom time calculation
  const monthlyExpenses = Number(profile?.monthly_expenses ?? 0) ||
    (budgets ?? []).reduce(
      (sum: number, b: Record<string, unknown>) => sum + Number(b.amount ?? 0),
      0,
    ) ||
    monthlyIncome * (1 - savingsRate / 100)

  return (
    <GebeurtenissenClient
      lifeEvents={lifeEvents ?? []}
      assets={assets ?? []}
      profile={profile}
      fireParams={fireParams}
      netWorth={netWorth}
      annualSavings={annualSavings}
      monthlyExpenses={monthlyExpenses}
    />
  )
}
