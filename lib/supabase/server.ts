import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
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

/**
 * De gedecodeerde + geverifieerde JWT-payload zoals `supabase.auth.getClaims()`
 * 'm oplevert (`{ sub, email, role, aal, exp, … }`). Afgeleid van de client zelf
 * zodat we niet koppelen aan een transitief type-pad van `@supabase/auth-js`.
 * `sub` = user-id, `email` = e-mail (indien in de token).
 */
export type AuthClaims = NonNullable<
  Awaited<ReturnType<SupabaseClient['auth']['getClaims']>>['data']
>['claims']

/**
 * Read-auth zonder `getUser()`-roundtrip (RF-008/C2, ADR 0052).
 * Prod tekent asymmetrisch (ES256+kid, geverifieerd 19 jul 2026) — de lokale
 * verificatie is dus echt actief; bij HS*-signing valt getClaims stil terug op
 * getUser (zie ADR 0052, dan is deze helper een no-op qua egress). NB: een
 * JWKS-netwerkfout op een koude lambda kan hier een niet-AuthError-throw geven.
 *
 * `getUser()` doet ALTIJD een netwerk-roundtrip naar `/auth/v1/user` om de JWT
 * bij de auth-server te valideren. `getClaims()` verifieert de token bij de
 * reguliere (asymmetrische-sleutel) opzet LOKAAL tegen de JWKS — geen roundtrip,
 * dus lagere Supabase-egress. Voor pure-read-handlers die alleen `user.id`
 * (→ `claims.sub`) of `user.email` (→ `claims.email`) nodig hebben om een
 * RLS-gescope'te `SELECT` te scopen, is dat identiek qua gedrag.
 *
 * Deze helper is de ÉNE plek waar die getClaims-vorm + JWKS-nuance woont; de
 * read-route-fanout (RF-008/C2, batches A–G) consumeert 'm mechanisch:
 *
 *   const supabase = await createClient()
 *   const claims = await getAuthClaims(supabase)
 *   if (!claims) return unauthorized()
 *   // user.id → claims.sub, user.email → claims.email
 *
 * KEEP `getUser()` (NIET deze helper) voor: alles dat SCHRIJFT (POST/PUT/PATCH/
 * DELETE), service-role / `isSuperAdmin`-paden, en revocatie-gevoelige acties
 * (account-verwijdering, rolwijziging) die een vers geverifieerde identiteit
 * eisen.
 *
 * @returns de JWT-claims (`{ sub, email, … }`) of `null` als er geen geldige
 *          sessie is (ontbrekende/verlopen/ongeldige token).
 */
export async function getAuthClaims(
  supabase: SupabaseClient,
): Promise<AuthClaims | null> {
  const { data } = await supabase.auth.getClaims()
  return data?.claims ?? null
}
