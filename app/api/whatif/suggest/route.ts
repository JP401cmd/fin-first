import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized, forbidden } from '@/lib/api/respond'
import { generateObject } from 'ai'
import type { z } from 'zod'
import {
  SuggestedEventSchema,
  SuggestionsResponseSchema,
} from '@/lib/ai/schemas/whatif-suggestion-schema'
import { WHATIF_SUGGEST_PROMPT } from '@/lib/ai/whatif-suggest-prompt'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { checkTierGate } from '@/lib/require-tier'
import { assertCloudAllowed } from '@/lib/ai/privacy-gate'

/** Schema-single-source: lib/ai/schemas/whatif-suggestion-schema.ts (ook gebruikt
 *  door het lokale pad als tweede grens). */
export type SuggestedEvent = z.infer<typeof SuggestedEventSchema>

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  // PRIVÉ-MODUS EERST — vóór de tier-gate, de credit-gate en élke dataophaling.
  // Staat 'tips' op lokaal, dan bedenkt de browser de wat-als-voorstellen zelf en
  // hoort deze route niets te leveren.
  // Waarom deze volgorde: (1) privé-modus is de meest fundamentele keuze van de
  // gebruiker en gaat vóór commerciële gating — de eerlijke reden is "privé-modus
  // staat aan", niet "je mist een abonnement"; (2) een geblokkeerde call mag geen
  // credits kosten; (3) de vraag die de gebruiker intypt mag de promptopbouw niet
  // eens bereiken. Nooit een stille terugval naar de cloud: 403 is het eindpunt.
  const privacyGate = await assertCloudAllowed(supabase, user.id, 'tips')
  if (privacyGate) return privacyGate

  // AI-add-on vereist (kostenbeheersing) — gaf voorheen alleen auth-check.
  const gate = await checkTierGate(supabase, user.id, 'ai')
  if (gate) return forbidden(gate.error)

  const body = await request.json().catch(() => null)
  if (!body?.prompt || typeof body.prompt !== 'string') {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  // Route through getModel so the platform AI kill-switch, provider choice and
  // token-logging apply (was a hardcoded anthropic() call that bypassed all
  // three). AIConfigError = provider not configured / AI disabled by beheer.
  let model
  try {
    model = await getModel(supabase, 'whatif_suggesties')
  } catch (err) {
    if (err instanceof AIConfigError) {
      // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    return NextResponse.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }

  // Sanitize the user-supplied prompt before it reaches the AI provider.
  // FAIL-SAFE: a sanitize failure blocks the call (never send raw).
  let safePrompt: string
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, date_of_birth')
      .eq('id', user.id)
      .single()
    const sanitizeOpts: SanitizeOptions = {}
    if (profile?.full_name) sanitizeOpts.names = [profile.full_name]
    if (profile?.date_of_birth) sanitizeOpts.dateOfBirth = profile.date_of_birth
    safePrompt = sanitizeForAI(body.prompt, sanitizeOpts)
  } catch (err) {
    console.error('[whatif/suggest] Sanitization failed — AI call blocked (fail-safe):', err)
    return NextResponse.json({ error: 'Tijdelijk niet beschikbaar door een beveiligingscontrole.' }, { status: 503 })
  }

  try {
    const result = await generateObject({
      model,
      schema: SuggestionsResponseSchema,
      prompt: safePrompt,
      system: WHATIF_SUGGEST_PROMPT,
    })

    return NextResponse.json({ suggestions: result.object.suggestions })
  } catch (err) {
    console.error('AI suggestion error:', err)
    return NextResponse.json({ suggestions: [] })
  }
}
