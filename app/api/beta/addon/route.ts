import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { errorResponse, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { recordAiConsent } from '@/lib/ai/consent-record'
import {
  BETA_ADDON_SOURCES,
  BETA_ADDON_TIERS,
  BETA_ADDONS_CLOSED_SETTING,
  BETA_CLOSED_CODE,
  BETA_SELF_SERVE_ADDONS,
  type BetaAddonResponse,
} from '@/lib/beta-addons'

/**
 * POST /api/beta/addon — de beta-keuze voor een add-on (ADR 0157).
 *
 * Straks zijn AI en de bankkoppeling abonnementen; in de beta zet de gebruiker ze
 * zelf aan of uit. Deze route schrijft daarvoor `profiles.active_subscriptions`,
 * dezelfde kolom die élke gate leest (`checkTierGate`, `hasSubscription`).
 *
 * **Waarom service-role, en waarom dat hier begrensd is.** De trigger
 * `guard_profiles_role` weigert elke wijziging van `active_subscriptions` door
 * `authenticated` — terecht, anders zet iedereen zichzelf een abonnement. Deze
 * route is de ene uitzondering en houdt die smal:
 *   - alleen zolang `BETA_SELF_SERVE_ADDONS` aan staat (daarna 403);
 *   - alleen de eigen rij (`claims.sub`, nooit een id uit de body);
 *   - alleen de twee add-ons; andere entries blijven onaangeroerd;
 *   - elke wijziging krijgt een regel in `tier_assignments_log` met de
 *     gebruiker zelf als `assigned_by`, zodat beta-keuzes later terug te vinden zijn;
 *   - de wijziging + logregel lopen atomair via de RPC `beta_set_addon`
 *     (EXECUTE alleen voor service_role).
 *
 * **AI aan = eerst toestemming.** Bij `tier: 'ai', active: true` legt de route
 * éérst de toestemming vast (ADR 0155, `recordAiConsent` op de ingelogde client)
 * en zet pas daarna de add-on aan: AI zonder bewijs van toestemming bestaat dus
 * niet. AI uit trekt de add-on in én legt `withdrawn` vast.
 */

/** Maximaal aantal beta-wijzigingen per gebruiker per venster. */
const BETA_RATE_LIMIT = 20
const BETA_RATE_WINDOW_MS = 60 * 60 * 1000

function betaClosed() {
  return errorResponse(
    'Deze keuze loopt niet meer via de beta. Bekijk je abonnementen op Mijn → Account.',
    403,
    BETA_CLOSED_CODE,
  )
}

const BodySchema = z
  .object({
    tier: z.enum(BETA_ADDON_TIERS),
    active: z.boolean(),
    source: z.enum(BETA_ADDON_SOURCES),
  })
  .strict()

/**
 * Eén atomaire stap in de database (migratie 20260917160000_beta_set_addon_rpc):
 * rijlock op het profiel, `active_subscriptions` via array_remove/array_append,
 * `commercial_tier` in sync en — alleen bij een echte wijziging — de logregel in
 * dezelfde transactie. De SQL spiegelt `nextSubscriptions`/`commercialTierFor`.
 */
async function writeSubscriptions(userId: string, tier: 'ai' | 'connected', active: boolean) {
  const service = getServiceClient()
  const { data, error } = await service.rpc('beta_set_addon', {
    p_user_id: userId,
    p_tier: tier,
    p_active: active,
  })
  if (error) return { ok: false as const, error, step: 'rpc' }

  const result = data as { subscriptions?: string[] | null; changed?: boolean } | null
  if (!result || !Array.isArray(result.subscriptions)) {
    return { ok: false as const, error: new Error('onverwacht antwoord van beta_set_addon'), step: 'rpc' }
  }
  return { ok: true as const, subscriptions: result.subscriptions }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  if (!BETA_SELF_SERVE_ADDONS) return betaClosed()

  const parsed = await parseBody(BodySchema, req)
  if (!parsed.ok) return parsed.response
  const { tier, active, source } = parsed.data

  try {
    const service = getServiceClient()

    // Noodstop zonder deploy: `app_settings.beta_addons_closed = 'true'`.
    // Faalt die lezing, dan behandelen we de route als gesloten (fail-closed).
    const { data: closedRow, error: closedError } = await service
      .from('app_settings')
      .select('value')
      .eq('key', BETA_ADDONS_CLOSED_SETTING)
      .maybeSingle()
    if (closedError) {
      console.error(`[beta-addon:POST:noodstop] ${closedError.message}`)
      return betaClosed()
    }
    if (closedRow?.value === 'true' || closedRow?.value === true) return betaClosed()

    // Rate-limit per gebruiker, geteld uit het logboek zelf (geen extra tabel):
    // een script dat duizenden keren toggelt spamt anders `tier_assignments_log`
    // en duwt echte beheertoekenningen uit de beheerweergave. Faalt de telling,
    // dan weigeren we (fail-closed): dit pad geeft toegang.
    const sinds = new Date(Date.now() - BETA_RATE_WINDOW_MS).toISOString()
    const { count, error: countError } = await service
      .from('tier_assignments_log')
      .select('id', { count: 'exact', head: true })
      .eq('target_user', claims.sub)
      .like('new_tier', '%(beta-keuze)')
      .gte('created_at', sinds)
    if (countError) return serverError(countError, 'beta-addon:POST:rate')
    if ((count ?? 0) >= BETA_RATE_LIMIT) {
      return errorResponse('Je hebt dit vaak achter elkaar gewijzigd. Probeer het over een uur opnieuw.', 429, 'rate_limited')
    }

    if (tier === 'ai' && active) {
      const consent = await recordAiConsent(supabase, claims.sub, 'granted', source)
      if (!consent.ok) return serverError(consent.error, `beta-addon:POST:consent-${consent.step}`)
    }

    const subs = await writeSubscriptions(claims.sub, tier, active)
    if (!subs.ok) return serverError(subs.error, `beta-addon:POST:subs-${subs.step}`)

    if (tier === 'ai' && !active) {
      const consent = await recordAiConsent(supabase, claims.sub, 'withdrawn', source)
      if (!consent.ok) return serverError(consent.error, `beta-addon:POST:consent-${consent.step}`)
    }

    const body: BetaAddonResponse = { ok: true, tier, active, subscriptions: subs.subscriptions }
    return NextResponse.json(body)
  } catch (err) {
    return serverError(err, 'beta-addon:POST')
  }
}
