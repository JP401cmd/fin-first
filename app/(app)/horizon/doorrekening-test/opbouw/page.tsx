import { createClient } from '@/lib/supabase/server'
import { resolveFireParams } from '@/lib/fire-params'
import { OpbouwClient } from './opbouw-client'

export default async function OpbouwPage() {
  const supabase = await createClient()

  // Load assets, debts, profile, and FIRE parameters
  const [
    { data: assets },
    { data: debts },
    { data: profile },
  ] = await Promise.all([
    supabase.from('assets').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('debts').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('profiles').select('*').single(),
  ])

  const fireParams = resolveFireParams(profile ?? {})

  return (
    <OpbouwClient
      assets={assets ?? []}
      debts={debts ?? []}
      profile={profile}
      fireParams={fireParams}
    />
  )
}
