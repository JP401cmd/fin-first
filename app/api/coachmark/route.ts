import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { serverError, unauthorized } from '@/lib/api/respond'

/**
 * /api/coachmark — eenmalige uitleg-hints ("coachmarks") per gebruiker.
 *
 * Een coachmark is een korte uitleg die precies één keer verschijnt, bij de
 * eerste keer dat iemand een besturingselement ziet dat zichzelf niet
 * verklaart. Zodra hij is weggeklikt, hoort hij op géén enkel apparaat meer
 * terug te komen — vandaar server-side en niet in localStorage.
 *
 * OPSLAG — bewust GEEN nieuwe kolom. De bestaande jsonb-map
 * `profiles.module_guide_state` draagt al meerdere losse gidsstaten onder
 * eigen top-level sleutels (`welcome:guide` is het precedent). Coachmarks
 * krijgen daarbinnen het `coachmark:`-voorvoegsel. Dat scheelt een migratie
 * én extra RLS-oppervlak: de kolom staat al onder de own-row-policies van
 * `profiles`.
 *
 * TOEGANG — eigen rij, via de gewone anon-RLS-client (`createClient()`), met
 * een read-modify-write zodat we andere sleutels in dezelfde map niet
 * overschrijven. Nooit service-role; RLS op `profiles` is hier de
 * beveiligingsgrens. Spiegelt `app/api/appearance`.
 */

/** Sleutels die als coachmark mogen worden weggeschreven — dichte allowlist. */
const COACHMARK_IDS = ['euro-view', 'overzicht-rondleiding'] as const
export type CoachmarkId = (typeof COACHMARK_IDS)[number]

/**
 * Hoe een coachmark eindigde. Alleen de rondleiding gebruikt dit vandaag: de
 * gidsweergave in Fin labelt haar knop ernaar ("Rondleiding afmaken" bij
 * `onderbroken`, anders "Rondleiding opnieuw"). Optioneel, zodat een gewone
 * eenmalige hint als `euro-view` geen betekenisloze uitkomst hoeft te verzinnen.
 */
const COACHMARK_OUTCOMES = ['voltooid', 'overgeslagen', 'onderbroken'] as const
export type CoachmarkOutcome = (typeof COACHMARK_OUTCOMES)[number]

/** Top-level sleutel in `module_guide_state` voor één coachmark. */
export function coachmarkStateKey(id: CoachmarkId): string {
  return `coachmark:${id}`
}

const DismissSchema = z.object({
  id: z.enum(COACHMARK_IDS),
  outcome: z.enum(COACHMARK_OUTCOMES).optional(),
})

// ── GET — welke coachmarks zijn al weggeklikt? ────────────────────────────
//
// Retourneert een map id → boolean voor élke bekende coachmark, zodat de
// client geen aannames hoeft te doen over ontbrekende sleutels. Daarnaast een
// map id → uitkomst (`null` als de coachmark niet is weggeklikt of geen
// uitkomst droeg).

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const { data, error } = await supabase
    .from('profiles')
    .select('module_guide_state')
    .eq('id', claims.sub)
    .maybeSingle()

  if (error) return serverError(error, 'coachmark:GET')

  const state = (data?.module_guide_state ?? {}) as Record<string, unknown>
  const dismissed = Object.fromEntries(
    COACHMARK_IDS.map((id) => [id, state[coachmarkStateKey(id)] != null]),
  ) as Record<CoachmarkId, boolean>
  const outcome = Object.fromEntries(
    COACHMARK_IDS.map((id) => [id, readOutcome(state[coachmarkStateKey(id)])]),
  ) as Record<CoachmarkId, CoachmarkOutcome | null>

  return NextResponse.json({ dismissed, outcome })
}

// ── PUT — markeer één coachmark als gezien ────────────────────────────────

export async function PUT(request: Request) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const parsed = await parseBody(DismissSchema, request)
  if (!parsed.ok) return parsed.response

  // Read-modify-write: de map draagt óók de welcome-guide en de
  // module-gidsen. Een blinde overschrijving zou die wissen.
  const { data, error: readError } = await supabase
    .from('profiles')
    .select('module_guide_state')
    .eq('id', claims.sub)
    .maybeSingle()

  if (readError) return serverError(readError, 'coachmark:PUT:read')

  const current = (data?.module_guide_state ?? {}) as Record<string, unknown>
  const entry: { dismissedAt: string; outcome?: CoachmarkOutcome } = {
    dismissedAt: new Date().toISOString(),
  }
  if (parsed.data.outcome) entry.outcome = parsed.data.outcome
  const next = {
    ...current,
    [coachmarkStateKey(parsed.data.id)]: entry,
  }

  const { error: writeError } = await supabase
    .from('profiles')
    .update({ module_guide_state: next })
    .eq('id', claims.sub)

  if (writeError) return serverError(writeError, 'coachmark:PUT:write')

  return NextResponse.json({ ok: true })
}

/**
 * Leest de uitkomst uit één opgeslagen coachmark-waarde. Defensief: oudere
 * rijen dragen alleen `dismissedAt`, en een corrupte jsonb mag de GET niet
 * laten omvallen.
 */
function readOutcome(value: unknown): CoachmarkOutcome | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = (value as { outcome?: unknown }).outcome
  return (COACHMARK_OUTCOMES as readonly string[]).includes(raw as string)
    ? (raw as CoachmarkOutcome)
    : null
}
