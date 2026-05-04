import { cache } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'

// Request-scoped cache around `supabase.auth.getUser()`. React `cache()`
// dedupes by argument identity within a single render/request, so passing
// the same supabase client from multiple loaders collapses 15+ JWT-validate
// roundtrips into one. Returns `null` if no user is signed in (mirrors the
// `auth.getUser()` semantics; existing callers already null-check).
export const getCachedUser = cache(async (supabase: SupabaseClient): Promise<User | null> => {
  const { data } = await supabase.auth.getUser()
  return data.user
})
