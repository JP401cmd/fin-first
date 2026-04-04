import { createClient } from '@/lib/supabase/server'
import { resolveFireParams } from '@/lib/fire-params'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import type { LifeEvent } from '@/lib/horizon-data'
import { OpbouwClient } from './opbouw-client'

export default async function OpbouwPage() {
  const supabase = await createClient()

  // Load assets, debts, profile, life events, and FIRE parameters
  const [
    { data: assets },
    { data: debts },
    { data: profile },
    { data: lifeEvents },
  ] = await Promise.all([
    supabase.from('assets').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('debts').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('profiles').select('*').single(),
    supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
  ])

  const fireParams = resolveFireParams(profile ?? {})
  const cashflows = lifeEventsToCashflows((lifeEvents ?? []) as LifeEvent[])

  return (
    <OpbouwClient
      assets={assets ?? []}
      debts={debts ?? []}
      profile={profile}
      fireParams={fireParams}
      cashflows={cashflows}
      lifeEvents={(lifeEvents ?? []) as LifeEvent[]}
    />
  )
}
