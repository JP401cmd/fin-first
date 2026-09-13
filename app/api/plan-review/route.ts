import { z } from 'zod'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { parseBody } from '@/lib/api/parse-body'
import { badRequest, serverError, unauthorized } from '@/lib/api/respond'
import { PLAN_REVIEW_STAPPEN, isPlanReviewStap, parsePlanReviewState, type PlanReviewState } from '@/lib/plan-review/types'
import { buildPlanReviewFacts, derivePlanReviewProgress } from '@/lib/plan-review/progress'
import { buildPlanReviewStap } from '@/lib/plan-review/overzicht'
import { computeHorizonFireSim } from '@/lib/fire-target-shared'
import { loadHorizonRaw } from '@/lib/horizon/raw-data-loader'
import { runRegelProjection, type RegelSimSnapshot } from '@/lib/future/regel-sim'
import { buildConvergentieAdapterInput } from '@/lib/horizon-kernel/convergentie-router'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'

/**
 * /api/plan-review — de plan-review Toekomst (TPR-01, ADR 0142).
 *
 * GET  ?stap=<stap> — de inhoud van één stap (keuze · effect · waarom) plus de afgeleide
 *      voortgang. On-demand lezing voor de pane (ADR 0058: lazy client-read via een
 *      API-route): per stap, zodat een vergelijking van vier woonstrategieën alleen draait
 *      wanneer de gebruiker die stap opent. Levert UITSLUITEND afgeleide weergavewaarden en
 *      de bevestig-bodies met de eigen keuzes — geen rauwe rijen (geen `*_encrypted`/`*_hash`,
 *      geen partnerrijen).
 *
 * PUT  — zet of wist de bevestigd-markering van één review-stap.
 *      Body: `{ stap, bevestigd: boolean }`. Bewust ALLEEN de markering: de keuze zelf
 *      schrijft de client vóór deze PUT via de bestaande route van dat domein (A5).
 *      Read-modify-write op de jsonb-map in de EIGEN profielrij (`.eq('id', user.id)`,
 *      RLS-scoped, anon-client; nooit service-role). Nooit schrijven op een mislukte
 *      lezing: anders zou een transiënte leesfout de map terugschrijven met uitsluitend de
 *      zojuist gezette stap (spiegel /api/overzicht/page-status PUT).
 */

const BodySchema = z.object({
  stap: z.enum(PLAN_REVIEW_STAPPEN),
  bevestigd: z.boolean(),
})

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const stap = request.nextUrl.searchParams.get('stap')
    if (!isPlanReviewStap(stap)) return badRequest('Onbekende stap')

    const [shared, raw, stateRes] = await Promise.all([
      computeHorizonFireSim(supabase).catch(() => null),
      loadHorizonRaw(supabase),
      supabase.from('profiles').select('plan_review_state').eq('id', user.id).single(),
    ])
    if (stateRes.error) return serverError(stateRes.error, 'plan-review:GET:state')

    // De SELECT-policy op `assets` is huishoud-gedeeld: de review gaat over de EIGEN
    // keuzes, dus alleen de eigen bezittingen tellen (datapad-conventie). Bewuste
    // divergentie, dezelfde als in /api/housing-strategy: de kernel-run (personal) kan
    // een gedeelde partner-woning naar aandeel meetellen terwijl stap 4 dan n.v.t. is.
    // Bekende rest (latent): `raw.events` draagt geen `user_id`/`ownership` in de
    // projectie; een gedeeld partner-AOW-event zou meetellen. Geen schrijver zet
    // `ownership='shared'` op een gebeurtenis — opvolging in de vervolgfase.
    const eigenAssets = (raw.assets ?? []).filter((a) => a.user_id === user.id)
    const profile = (raw.rawProfile ?? null) as Record<string, unknown> | null
    const facts = buildPlanReviewFacts({
      events: raw.events ?? [],
      assets: eigenAssets,
      housingStrategyRaw: profile?.housing_strategy_config,
    })
    const state: PlanReviewState = parsePlanReviewState(stateRes.data?.plan_review_state)

    const snapshot: RegelSimSnapshot | null = shared
      ? {
          rawContext: shared.rawContext,
          fireStrategy: shared.fireStrategy,
          withdrawalStrategy: shared.withdrawalStrategy,
          aowAgeInt: shared.aowAgeInt,
          aowFractional: shared.aowAgeFractional,
        }
      : null

    // De uitgave ná stoppen zoals de kern 'm leest — adapter-invoer, geen solve.
    let uitgaveNaPensioenPerJaar: number | null = null
    if (shared) {
      try {
        uitgaveNaPensioenPerJaar = buildKernelInputFromAppWithNotices(
          buildConvergentieAdapterInput(shared.rawContext),
        ).input.inkomenUitgaven.uitgaveNaPensioenPerJaar
      } catch {
        uitgaveNaPensioenPerJaar = null
      }
    }

    const overzicht = buildPlanReviewStap(stap, {
      sim: shared?.sim ?? null,
      firePlan: shared?.firePlan ?? raw.firePlan,
      aowAge: shared?.aowAgeFractional ?? null,
      profile,
      events: raw.events ?? [],
      assets: eigenAssets,
      uitgaveNaPensioenPerJaar,
      facts,
      run: snapshot ? (override) => runRegelProjection(snapshot, override) : null,
    })

    // `facts` reist mee zodat de pane na een bevestiging dezelfde afleiding herhaalt
    // (derivePlanReviewProgress) — vier booleans, geen rijen.
    return NextResponse.json({
      overzicht,
      progress: derivePlanReviewProgress(state, facts),
      facts,
    })
  } catch (err) {
    return serverError(err, 'plan-review:GET')
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const parsed = await parseBody(BodySchema, request)
    if (!parsed.ok) return parsed.response
    const { stap, bevestigd } = parsed.data

    const { data: current, error: readError } = await supabase
      .from('profiles')
      .select('plan_review_state')
      .eq('id', user.id)
      .single()

    if (readError) {
      return serverError(readError, 'plan-review:PUT:read')
    }

    const next: PlanReviewState = { ...parsePlanReviewState(current?.plan_review_state) }
    if (bevestigd) {
      next[stap] = { bevestigd_op: new Date().toISOString(), bron: 'review' }
    } else {
      delete next[stap]
    }

    const { error } = await supabase
      .from('profiles')
      .update({ plan_review_state: next })
      .eq('id', user.id)

    if (error) return serverError(error, 'plan-review:PUT:write')

    return NextResponse.json({ ok: true, plan_review_state: next })
  } catch (err) {
    return serverError(err, 'plan-review:PUT')
  }
}
