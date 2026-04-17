import { createClient } from '@/lib/supabase/server'
import { resolveFireParams } from '@/lib/fire-params'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import type { LifeEvent } from '@/lib/horizon-data'
import { loadCoreData } from '@/lib/core-data-loader'
import { OpbouwClient } from './opbouw-client'

export default async function OpbouwPage() {
  const supabase = await createClient()

  // Load assets, debts, profile, life events, and FIRE parameters
  const [
    { data: assets },
    { data: debts },
    { data: profile },
    { data: lifeEvents },
    coreData,
  ] = await Promise.all([
    supabase.from('assets').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('debts').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('profiles').select('*').single(),
    supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    loadCoreData(supabase).catch(() => null),
  ])

  const fireParams = resolveFireParams(profile ?? {})
  const cashflows = lifeEventsToCashflows((lifeEvents ?? []) as LifeEvent[])

  // Extract savings rate and income from core data (same values as kern page header)
  const savingsRate6m = coreData?.savingsRate6m ?? 0
  const estimatedYearlyIncome = coreData?.rawFinancials.extrapolatedIncome ?? 0

  return (
    <OpbouwClient
      assets={assets ?? []}
      debts={debts ?? []}
      profile={profile}
      fireParams={fireParams}
      cashflows={cashflows}
      lifeEvents={(lifeEvents ?? []) as LifeEvent[]}
      savingsRate6m={savingsRate6m}
      estimatedYearlyIncome={estimatedYearlyIncome}
    />
  )
}
