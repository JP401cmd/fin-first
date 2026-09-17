import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import {
  AI_CONSENT_CLIENT_SOURCES,
  AI_CONSENT_DECISIONS,
  type AiConsentResponse,
} from '@/lib/ai/consent'
import { AI_CONSENT_VERSION } from '@/lib/ai/privacy-facts'
import { recordAiConsent } from '@/lib/ai/consent-record'

/**
 * POST /api/consent/ai — de ene schrijfroute voor de AI-keuze (ADR 0155).
 *
 * Eén keuze = twee schrijfacties op de eigen rijen, in deze volgorde:
 *
 *   1. `consent_events` ← het bewijs (append-only): wie, wat, welke versie van
 *      de feiten, waar gekozen. Eerst, zodat er nooit een effectieve stand
 *      bestaat zonder bewijs ervan.
 *   2. `profiles` ← de effectieve stand: `ai_enabled` (de kill-switch die
 *      lib/ai/privacy-gate.ts op élke AI-route leest), `ai_consent_at` (NULL =
 *      nog nooit gekozen → de app toont de keuze) en `ai_consent_version`.
 *
 * Faalt stap 2 na een geslaagde stap 1, dan krijgt de client een 500 en kiest
 * opnieuw; het extra event is onschadelijk (append-only, de laatste rij geldt).
 *
 * Geen service-role: de INSERT-policy dwingt `user_id = auth.uid()` af en de
 * profielrij is via eigen-rij RLS beschermd. Lokale JWT-verificatie volstaat
 * (ADR 0052) — RLS is de grens, niet deze route.
 *
 * `source` is beperkt tot de drie client-oppervlakken; `pension-upload` schrijft
 * alleen de server (app/api/pension/parse) en dan met kind `pension_pdf`.
 */

const BodySchema = z
  .object({
    decision: z.enum(AI_CONSENT_DECISIONS),
    source: z.enum(AI_CONSENT_CLIENT_SOURCES),
  })
  .strict()

export async function POST(req: Request) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const parsed = await parseBody(BodySchema, req)
  if (!parsed.ok) return parsed.response
  const { decision, source } = parsed.data

  let result: Awaited<ReturnType<typeof recordAiConsent>>
  try {
    result = await recordAiConsent(supabase, claims.sub, decision, source)
  } catch (err) {
    return serverError(err, 'consent-ai:POST')
  }
  if (!result.ok) return serverError(result.error, `consent-ai:POST:${result.step}`)

  const body: AiConsentResponse = {
    ok: true,
    aiEnabled: result.aiEnabled,
    consentAt: result.consentAt,
    version: AI_CONSENT_VERSION,
  }
  return NextResponse.json(body)
}
