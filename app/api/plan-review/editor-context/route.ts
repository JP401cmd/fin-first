import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { serverError, unauthorized } from '@/lib/api/respond'
import { computeHorizonFireSim } from '@/lib/fire-target-shared'
import { buildClientRegelSimSnapshot } from '@/lib/future/regel-sim-snapshot'
import type { PlanReviewEditorContext } from '@/lib/plan-review/editor-context'

/**
 * GET /api/plan-review/editor-context — wat de inline editors van de plan-review nodig
 * hebben (TPR-15, ADR 0142).
 *
 * Lui gelezen (ADR 0058: on-demand client-read via een API-route): pas wanneer de gebruiker
 * in de wizard op "Aanpassen" drukt. /toekomst laadt de snapshot bewust niet in zijn eigen
 * render; die zware data leeft op de subpagina's.
 *
 * De snapshot is DEZELFDE die de Voorkeuren-pagina als prop krijgt, via dezelfde bouwer
 * (`buildClientRegelSimSnapshot`): de canonieke Tijdas-run (personal perspectief), zonder
 * partnerblok en zonder `*_encrypted`/`*_hash`. De editor-baseline is zo per constructie de
 * getoonde curve (consume, don't recompute).
 *
 * `snapshot: null` = er is geen run (geen geboortedatum of vermogen) — de editors tonen dan
 * geen live effect, opslaan blijft mogelijk.
 */

export async function GET() {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const shared = await computeHorizonFireSim(supabase)
    const body: PlanReviewEditorContext = {
      snapshot: shared ? buildClientRegelSimSnapshot(shared) : null,
      firePlan: shared?.firePlan ?? null,
    }
    return NextResponse.json(body)
  } catch (err) {
    return serverError(err, 'plan-review:editor-context:GET')
  }
}
