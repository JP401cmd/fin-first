import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { parseBody } from '@/lib/api/parse-body'
import { serverError, unauthorized } from '@/lib/api/respond'
import { HOME_SCREEN_VALUES } from '@/lib/home-screen'

/**
 * PUT /api/home-screen
 *
 * Slaat het profiel-brede homescherm ('overzicht' | 'budget') op de EIGEN
 * profielrij op. Body: `{ screen: 'overzicht' | 'budget' }`.
 *
 * Contract: `lib/home-screen.ts` is de single source van de waarden én de
 * bijbehorende routes; `lib/hooks/use-home-screen.tsx` is de enige
 * client-schrijver en leest alleen `res.ok` (optimistisch zetten, terugrollen
 * bij een niet-ok antwoord).
 *
 * Cross-device: de keuze staat op `profiles.home_screen` (scalar) en wordt
 * door de layout-render server-side ingelezen om de provider te seeden (geen
 * flash); de edge-middleware leest 'm om de login-landing en /dashboard naar
 * het gekozen scherm te sturen. Deze route is het enige schrijfpad.
 *
 * SECURITY: own-row update via de anon RLS-client (`.eq('id', user.id)`),
 * NOOIT service-role. Op `profiles` staat RLS aan met één eigen-rij
 * ALL-policy ("Users can manage own profile") die de nieuwe kolom automatisch
 * dekt — zie de migratie 20260901120000_add_profiles_home_screen.sql.
 *
 * CONVENTIE (ADR 0044): zod-validatie via `parseBody` + de respond-helpers,
 * dus één platte `{ error: string }`-envelope en nooit een rauwe
 * `error.message` naar de client. Gespiegeld op app/api/euro-view.
 */

const HomeScreenBodySchema = z.object({
  screen: z.enum(HOME_SCREEN_VALUES),
})

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const parsed = await parseBody(HomeScreenBodySchema, request)
    if (!parsed.ok) return parsed.response
    const { screen } = parsed.data

    // Own-row scalar update — uitsluitend de eigen rij (RLS), geen service-role.
    const { error } = await supabase
      .from('profiles')
      .update({ home_screen: screen })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ ok: true, screen })
  } catch (err) {
    return serverError(err, 'home-screen:PUT')
  }
}
