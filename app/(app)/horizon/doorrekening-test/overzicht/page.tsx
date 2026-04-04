import { createClient } from '@/lib/supabase/server'
import { resolveFireParams } from '@/lib/fire-params'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import type { LifeEvent } from '@/lib/horizon-data'
import { OverzichtClient } from './overzicht-client'

export default async function OverzichtPage() {
  const supabase = await createClient()

  const [
    { data: assets },
    { data: debts },
    { data: profile },
    { data: budgets },
    { data: lifeEvents },
  ] = await Promise.all([
    supabase.from('assets').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('debts').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('profiles').select('*').single(),
    supabase.from('budgets').select('*').eq('is_active', true),
    supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
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

  // Monthly expenses
  const yearlyMustExpenses = (budgets ?? [])
    .filter((b: Record<string, unknown>) => b.budget_type === 'essentieel' || b.budget_type === 'must')
    .reduce((sum: number, b: Record<string, unknown>) => sum + Number(b.amount ?? 0) * 12, 0)

  return (
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
    />
  )
}
