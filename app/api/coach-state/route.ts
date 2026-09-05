import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { serverError, unauthorized } from '@/lib/api/respond'
import { COACH_STATE_KEY, appendDismissed, parseCoachState, type CoachState } from '@/lib/coach-state'

/**
 * PUT /api/coach-state — de staat van Fins proactieve meldingen (ADR 0130).
 *
 * Spiegel van `app/api/coachmark/route.ts`: dezelfde jsonb-map
 * `profiles.module_guide_state`, dezelfde own-row read-modify-write via de
 * anon-RLS-client (`createClient()`, nooit service-role), dezelfde
 * error-envelope uit `lib/api/respond.ts`. Alleen de sleutel verschilt:
 * `coach:state` (zie `lib/coach-state.ts` voor het waarom van de opslagplek).
 *
 * ALLEEN PUT. Lezen gebeurt niet via deze route maar gratis uit de al geladen
 * profielrij in `app/(app)/layout.tsx` — een GET zou een extra round-trip per
 * shell-render toevoegen voor gegevens die er al zijn.
 *
 * TIJDSTEMPELS ZET DE SERVER. De client stuurt alleen een actie (en bij
 * `dismiss` een sleutel); `lastDismissedAt` en `guideLastShownAt` komen van
 * `new Date()` hier. Anders bepaalt een verkeerd gezette systeemklok — of een
 * geknutselde request — hoe lang de rustpauze en de dagregel duren.
 */

/**
 * Meldingsleutels zijn app-eigen strings (`gap_bank`, `path_core`,
 * `guide_<stap-id>`). Geen enum-allowlist: de lijst leeft in
 * `lib/coach-suggestions.ts` én groeit met de gidsstappen uit de
 * `app_settings`-config, dus een dichte lijst hier zou stil achterlopen. Wél
 * een strak formaat + lengtegrens, zodat de jsonb geen dumpplaats wordt.
 */
const SuggestionKeySchema = z
  .string()
  .regex(/^[a-z0-9_:-]{1,64}$/, 'Ongeldige meldingsleutel')

const ActionSchema = z.discriminatedUnion('action', [
  /** Eén melding weggeklikt (kruisje, CTA of auto-dismiss). */
  z.object({ action: z.literal('dismiss'), key: SuggestionKeySchema }),
  /** De gids-bubbel is vandaag getoond — zet alleen de dagstempel (fase 2). */
  z.object({ action: z.literal('guideShown') }),
  /** Eenmalige overname van de oude localStorage-lijst. */
  z.object({ action: z.literal('importLegacy'), keys: z.array(SuggestionKeySchema).max(200) }),
])

export async function PUT(request: Request) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const parsed = await parseBody(ActionSchema, request)
  if (!parsed.ok) return parsed.response

  // Read-modify-write: de map draagt óók `welcome:guide`, de module-gidsen en
  // de coachmarks. Een blinde overschrijving zou die wissen.
  const { data, error: readError } = await supabase
    .from('profiles')
    .select('module_guide_state')
    .eq('id', claims.sub)
    .maybeSingle()

  if (readError) return serverError(readError, 'coach-state:PUT:read')

  const currentMap = (data?.module_guide_state ?? {}) as Record<string, unknown>
  const current = parseCoachState(currentMap[COACH_STATE_KEY])
  const nowIso = new Date().toISOString()

  let next: CoachState
  switch (parsed.data.action) {
    case 'dismiss':
      // Een weggeklikte melding telt óók als "laatst gesloten" — dat voedt de
      // rustpauze op route-tips (PATH_SUGGESTION_COOLDOWN_MS).
      next = {
        ...current,
        dismissed: appendDismissed(current.dismissed, [parsed.data.key]),
        lastDismissedAt: nowIso,
      }
      break
    case 'guideShown':
      next = { ...current, guideLastShownAt: nowIso }
      break
    case 'importLegacy':
      // Bewust GEEN `lastDismissedAt`: het echte sluitmoment van die oude
      // dismisses kennen we niet, en 'nu' zou de rustpauze onterecht starten.
      next = { ...current, dismissed: appendDismissed(current.dismissed, parsed.data.keys) }
      break
  }

  const { error: writeError } = await supabase
    .from('profiles')
    .update({ module_guide_state: { ...currentMap, [COACH_STATE_KEY]: next } })
    .eq('id', claims.sub)

  if (writeError) return serverError(writeError, 'coach-state:PUT:write')

  return NextResponse.json({ ok: true, state: next })
}
