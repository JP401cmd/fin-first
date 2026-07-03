import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Request-gecached via React `cache()`: layout, page en loaders die binnen
 * dezelfde RSC-render `createClient()` aanroepen krijgen dezelfde instantie.
 * Dat is de sleutel tot loader-dedup — alle `cache()`-gewrapte loaders
 * (getCachedUser, loadDashboardData, loadHorizonData, …) keyen op de
 * client-instantie, dus alleen met één gedeelde instantie per request delen
 * layout en page hun cache-entries. Buiten een RSC-render (route handlers
 * zonder request-store) gedraagt cache() zich als passthrough — identiek aan
 * het oude gedrag.
 */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have proxy refreshing user sessions.
          }
        },
      },
    }
  )
})
