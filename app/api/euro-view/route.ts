import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { parseBody } from '@/lib/api/parse-body'
import { serverError, unauthorized } from '@/lib/api/respond'

/**
 * PUT /api/euro-view
 *
 * Slaat de profiel-brede euro-weergave ('nominal' | 'real') op de EIGEN
 * profielrij op. Body: `{ view: 'nominal' | 'real' }`.
 *
 * Contract: `lib/euro-display.ts#EuroView` is de single source van de waarden;
 * `lib/hooks/use-euro-view.tsx` is de enige client-schrijver en leest alleen
 * `res.ok` (optimistisch zetten, terugrollen bij een niet-ok antwoord). Het veld
 * heet `view` — niet `mode`; dat laatste is display-mode.
 *
 * Cross-device: de keuze staat op `profiles.euro_view` (scalar) en wordt door de
 * layout-render server-side ingelezen om de provider te seeden (geen flash).
 * Deze route is het enige schrijfpad.
 *
 * SECURITY: own-row update via de anon RLS-client (`.eq('id', user.id)`), NOOIT
 * service-role. Op `profiles` staat RLS aan met één eigen-rij ALL-policy
 * ("Users can manage own profile", USING `(select auth.uid()) = id`, geen eigen
 * WITH CHECK → dezelfde expressie geldt als schrijfcheck) — gemeten tegen
 * `pg_policies`/`pg_class` op 08-08-2026. Die policy dekt de nieuwe kolom
 * automatisch; RLS is row-level, niet kolom-level.
 *
 * CONVENTIE (ADR 0044): zod-validatie via `parseBody` + de respond-helpers, dus
 * één platte `{ error: string }`-envelope en nooit een rauwe `error.message`
 * naar de client. Bewust NIET gekopieerd van `app/api/display-mode` — die route
 * dateert van vóór deze conventie en parseert de body nog met de hand.
 */

const EuroViewBodySchema = z.object({
  view: z.enum(['nominal', 'real']),
})

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const parsed = await parseBody(EuroViewBodySchema, request)
    if (!parsed.ok) return parsed.response
    const { view } = parsed.data

    // Own-row scalar update — uitsluitend de eigen rij (RLS), geen service-role.
    const { error } = await supabase
      .from('profiles')
      .update({ euro_view: view })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ ok: true, view })
  } catch (err) {
    return serverError(err, 'euro-view:PUT')
  }
}
