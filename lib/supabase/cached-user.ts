import { cache } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * De identiteit zoals `getCachedUser` die levert: alleen wat het geverifieerde
 * JWT draagt. Bewust GEEN volledige `User` — velden als `created_at`,
 * `last_sign_in_at` of `identities` staan niet in de token, en een smal type
 * maakt dat compile-zichtbaar in plaats van stil `undefined`.
 */
export type CachedUser = Pick<User, 'id' | 'email' | 'app_metadata' | 'user_metadata'>

/**
 * Request-gecachte LEES-identiteit (ADR 0052, Snelheid B2).
 *
 * Verifieert het JWT via `getClaims()` — bij de asymmetrische signing van dit
 * project (ES256 + `kid`) lokaal tegen de module-globaal gecachte JWKS, dus
 * zónder `/auth/v1/user`-roundtrip. Dat is dezelfde check die de proxy al op
 * elk request doet. React `cache()` keyt op de client-instantie, zodat layout,
 * page en loaders binnen één render één verificatie delen.
 *
 * Geaccepteerd revocatievenster (ADR 0052): een server-side ingetrokken sessie
 * blijft hier geldig tot de JWT-expiry. De blast-radius is de eigen data via
 * RLS — precies wat PostgREST met datzelfde token toch al toestaat.
 *
 * Voor MUTATIES, service-role-paden en revocatie-gevoelige acties: gebruik
 * `getVerifiedUser` (server-side check bij de auth-server).
 *
 * @returns de gebruiker uit de claims, of `null` zonder geldige sessie.
 */
export const getCachedUser = cache(
  async (supabase: SupabaseClient): Promise<CachedUser | null> => {
    // Zelfde vorm als `getAuthClaims` (lib/supabase/server.ts), bewust hier
    // inline: server.ts trekt next/headers mee en wordt in tientallen tests als
    // geheel gemockt — een import daaruit zou elke loader in die tests breken.
    const { data } = await supabase.auth.getClaims()
    const claims = data?.claims
    if (!claims?.sub) return null
    return {
      id: claims.sub,
      email: claims.email,
      app_metadata: claims.app_metadata ?? {},
      user_metadata: claims.user_metadata ?? {},
    }
  },
)

/**
 * Request-gecachte, SERVER-SIDE geverifieerde gebruiker via `auth.getUser()`
 * (altijd een `/auth/v1/user`-roundtrip). Vangt een ingetrokken sessie of een
 * verwijderd account direct, niet pas bij JWT-expiry. Verplicht voor
 * schrijfroutes (POST/PUT/PATCH/DELETE), service-role-paden en
 * revocatie-gevoelige flows (ADR 0052). In route handlers is `cache()` een
 * passthrough; de wrapper dedupliceert alleen binnen een RSC-render.
 */
export const getVerifiedUser = cache(
  async (supabase: SupabaseClient): Promise<User | null> => {
    const { data } = await supabase.auth.getUser()
    return data.user
  },
)
