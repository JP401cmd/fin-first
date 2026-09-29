import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/supabase/cached-user'
import { parseBody } from '@/lib/api/parse-body'
import { serverError, unauthorized } from '@/lib/api/respond'
import { validateModules } from '@/lib/module-registry'
import { PRODUCTS, PRODUCT_PRESETS } from '@/lib/modules/resolve'

/**
 * PUT /api/modules — de productkeuze: Krant ⇄ Geheel.
 *
 * Body: `{ product: 'krant' | 'geheel' }` (strikt: een extra veld is een 400).
 * De client kiest een PRODUCT, nooit een modulelijst (keuze 2A, ADR 0184): de
 * server mapt naar de preset uit `PRODUCT_PRESETS` (lib/modules/resolve.ts) en
 * schrijft beide kolommen in één update:
 *   - krant  → active_modules = ['nieuws'],       home_screen = 'nieuws'
 *   - geheel → active_modules = alle modules,     home_screen = 'overzicht'
 * Daardoor bestaan er precies twee bereikbare modulesets en geen
 * "zes-knoppen-terug"-oppervlak waarmee een client een willekeurige subset zet.
 *
 * Geheel → Krant verwijdert GEEN data: alleen de twee profielkolommen
 * veranderen. Terug naar Geheel toont alles weer zoals het was.
 *
 * Volgorde bij uitrol: migratie 20261006120000 (CHECK met 'nieuws') MOET vóór
 * deze route live staan, anders faalt de krant-update op de oude CHECK (23514
 * → 500 via serverError).
 *
 * SECURITY: own-row update via de sessie-client (anon-sleutel + RLS,
 * `.eq('id', user.id)`), NOOIT service-role. Op `profiles` staat RLS aan met
 * één eigen-rij ALL-policy ("Users can manage own profile", gemeten
 * 28-09-2026). `active_modules` en `home_screen` vallen buiten de guard-trigger
 * `trg_guard_profiles_role` (die bewaakt role/commercial_tier/
 * active_subscriptions) — terecht: modules zijn geen betaalrecht; toegang tot
 * betaalde functies loopt via abonnementen, los van de moduleset.
 *
 * Response: `{ ok: true, modules, homeScreen }`.
 *
 * CONVENTIE (ADR 0044): zod via `parseBody` + de respond-helpers — platte
 * `{ error: string }`-envelope, nooit een rauwe `error.message` naar de client.
 * Gespiegeld op app/api/home-screen.
 */

const ModulesBodySchema = z.strictObject({
  product: z.enum(PRODUCTS),
})

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const user = await getVerifiedUser(supabase)
    if (!user) return unauthorized()

    const parsed = await parseBody(ModulesBodySchema, request)
    if (!parsed.ok) return parsed.response

    const preset = PRODUCT_PRESETS[parsed.data.product]
    const modules = [...preset.modules]

    // Guard: een preset moet zelf een geldige moduleset zijn (afhankelijkheden
    // uit de catalogus). Faalt dit, dan is de preset-definitie kapot — een
    // serverfout, geen invoerfout.
    const check = validateModules(modules)
    if (!check.valid) {
      throw new Error(`Ongeldige preset '${parsed.data.product}': ${check.errors.join(' ')}`)
    }

    // Own-row update — uitsluitend de eigen rij (RLS), geen service-role.
    const { error } = await supabase
      .from('profiles')
      .update({ active_modules: modules, home_screen: preset.homeScreen })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ ok: true, modules, homeScreen: preset.homeScreen })
  } catch (err) {
    return serverError(err, 'modules:PUT')
  }
}
