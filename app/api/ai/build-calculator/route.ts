import { createClient } from '@/lib/supabase/server'
import { checkTierGate } from '@/lib/require-tier'
import { buildCalculator } from '@/lib/ai/build-calculator'
import { CalculatorDefinitionSchema } from '@/lib/calculator/types'

/**
 * POST /api/ai/build-calculator
 *
 * Genereert een CalculatorDefinition uit een vrije gebruikersvraag via
 * Will (generateObject). Optioneel `refineFrom` om een bestaande
 * definitie te verfijnen. Tier-gated op 'ai' (zelfde als chat).
 *
 * Body: { prompt: string, refineFrom?: CalculatorDefinition }
 * Resp: { ok: true, definition } | { ok: false, error }
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

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

  // Valideer een eventuele refineFrom-definitie zodat we geen rommel
  // doorgeven aan de LLM-prompt.
  let refineFrom = undefined
  if (body.refineFrom != null) {
    const parsed = CalculatorDefinitionSchema.safeParse(body.refineFrom)
    if (parsed.success) refineFrom = parsed.data
  }

  const result = await buildCalculator(supabase, prompt, refineFrom)
  return Response.json(result, { status: result.ok ? 200 : 422 })
}
