import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * De enige rolwaarde die beheerrechten geeft. Als constante zodat een oppervlak
 * dat `role` tóch al meeleest (en dus geen tweede query wil doen) dezelfde
 * vergelijking gebruikt in plaats van de literal over te tikken.
 */
export const SUPERADMIN_ROLE = 'superadmin'

export async function isSuperAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return data?.role === SUPERADMIN_ROLE
}
