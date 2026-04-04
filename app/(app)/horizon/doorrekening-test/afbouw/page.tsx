import { createClient } from '@/lib/supabase/server'
import { resolveFireParams } from '@/lib/fire-params'
import { AfbouwClient } from './afbouw-client'

export default async function AfbouwPage() {
  const supabase = await createClient()

  // Load assets, debts, profile, budgets (for essential expenses)
  const [
    { data: assets },
    { data: debts },
    { data: profile },
    { data: budgets },
  ] = await Promise.all([
    supabase.from('assets').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('debts').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('profiles').select('*').single(),
    supabase.from('budgets').select('*').eq('is_active', true),
  ])

  const fireParams = resolveFireParams(profile ?? {})

  // Compute essential yearly expenses from budgets marked as 'must' (essentieel)
  const yearlyMustExpenses = (budgets ?? [])
    .filter((b: Record<string, unknown>) => b.budget_type === 'essentieel' || b.budget_type === 'must')
    .reduce((sum: number, b: Record<string, unknown>) => sum + Number(b.amount ?? 0) * 12, 0)

  return (
    <AfbouwClient
      assets={assets ?? []}
      debts={debts ?? []}
      profile={profile}
      fireParams={fireParams}
      yearlyMustExpenses={yearlyMustExpenses}
    />
  )
}
