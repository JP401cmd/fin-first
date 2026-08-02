import { createClient } from '@/lib/supabase/server'
import { unauthorized } from '@/lib/api/respond'
import { checkTierGate } from '@/lib/require-tier'
import { buildCalculator } from '@/lib/ai/build-calculator'
import { StoredCalculatorDefinitionSchema } from '@/lib/calculator/types'
import { checkAndIncrement } from '@/lib/calculator/rate-limit'

const MAX_PROMPT_LENGTH = 500

/**
 * POST /api/ai/build-calculator
 *
 * Genereert een CalculatorDefinition uit een vrije gebruikersvraag via
 * Fin (generateObject). Optioneel `refineFrom` om een bestaande
 * definitie te verfijnen. Tier-gated op 'ai' (zelfde als chat). Bovendien
 * geldt een vlakke weeklimiet van 10 generaties + 5 verfijningen per
 * gebruiker — gehandhaafd door `lib/calculator/rate-limit.ts`.
 *
 * Body: { prompt: string, refineFrom?: CalculatorDefinition }
 * Resp:
 *   200 { ok: true, definition }
 *   400 { ok: false, error }       — vraag leeg/te lang
 *   401 { error: 'Niet ingelogd' } — geen sessie
 *   403 { ok: false, error }       — tier-gate (geen AI-abonnement)
 *   422 { ok: false, error }       — generatie-fout (AI-output ongeldig)
 *   429 { ok: false, error }       — weeklimiet bereikt
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return Response.json({ ok: false, error: tierGate.error }, { status: 403 })
  }

  let body: { prompt?: unknown; refineFrom?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'Ongeldige request-body.' }, { status: 400 })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt : ''
  if (!prompt.trim()) {
    return Response.json({ ok: false, error: 'Geef een vraag op.' }, { status: 400 })
  }
  // Cap prompt-lengte. We meten op de ongetrimde lengte (consistent met
  // wat de UI in een textarea telt).
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return Response.json(
      { ok: false, error: `Vraag is te lang (max ${MAX_PROMPT_LENGTH} tekens).` },
      { status: 400 },
    )
  }

  // Valideer een eventuele refineFrom-definitie zodat we geen rommel
  // doorgeven aan de LLM-prompt. Soepelere caps zodat verfijning van
  // oude calculators (pre-MVP-limieten) niet stilzwijgend wordt geweigerd
  // — de AI-output wordt alsnog gecapd op de strikte limieten.
  let refineFrom = undefined
  if (body.refineFrom != null) {
    const parsed = StoredCalculatorDefinitionSchema.safeParse(body.refineFrom)
    if (parsed.success) refineFrom = parsed.data
  }

  // Weeklimiet vóór de duurste call (LLM-generatie). Een mislukte
  // generatie telt nog steeds als poging — dat is bewust (anders kan een
  // gebruiker met een slechte prompt eindeloos retryen). Refine-pogingen
  // gebruiken een aparte, lagere teller.
  const kind = refineFrom ? 'refinement' : 'generation'
  const rate = await checkAndIncrement(supabase, user.id, kind)
  if (!rate.allowed) {
    const usedLabel = kind === 'refinement' ? 'verfijningen' : 'generaties'
    return Response.json(
      {
        ok: false,
        error: `Je hebt je weeklimiet voor ${usedLabel} bereikt (${rate.limit} van ${rate.limit}). Resets maandag.`,
      },
      { status: 429 },
    )
  }

  const result = await buildCalculator(supabase, prompt, refineFrom)
  return Response.json(result, { status: result.ok ? 200 : 422 })
}
