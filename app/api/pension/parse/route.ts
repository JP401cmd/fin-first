import { createClient } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { PENSION_PDF_CONSENT_VERSION } from '@/lib/ai/consent'
import { recordAiUsage } from '@/lib/ai-credits'
import { getModel } from '@/lib/ai/config'
import { assertCloudAllowed } from '@/lib/ai/privacy-gate'
import { generateObject } from 'ai'
import { PENSION_PARSE_PROMPT } from '@/lib/ai/pension-parse-prompt'
import { checkTierGate } from '@/lib/require-tier'
import { aiSubscriptionRequired, aiModelUnavailable, isAIConfigError } from '@/lib/ai/gate-responses'

// ── Rate limiting (in-memory, per user) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// Schema's + type wonen nu in lib/pension/types.ts (import-richting route→lib).
import { PensionParseResultSchema } from '@/lib/pension/types'
export type { PensionParseResult } from '@/lib/pension/types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  // PRIVÉ-MODUS EERST — vóór de tier-gate, de credit-gate en élke dataophaling.
  // Staat 'documenten' op lokaal, dan leest de browser het pensioenoverzicht zelf
  // uit en hoort deze route niets te leveren.
  // Waarom deze volgorde: (1) privé-modus is de meest fundamentele keuze van de
  // gebruiker en gaat vóór commerciële gating — de eerlijke reden is "privé-modus
  // staat aan", niet "je mist een abonnement"; (2) een geblokkeerde call mag geen
  // credits en geen rate-limit-tegoed kosten; (3) er mag geen byte van de PDF
  // richting promptopbouw gaan — een UPO is een binair document dat niet
  // betrouwbaar te ontdoen is van persoonsgegevens (juist de reden dat hieronder
  // expliciete AVG-toestemming wordt gevraagd).
  // Bewust ook vóór die consent-check: zonder cloud-call is er niets om
  // toestemming voor te geven, dus mag een ontbrekende toestemming de echte
  // reden ("privé-modus staat aan") niet maskeren.
  // Nooit een stille terugval naar de cloud: 403 is het eindpunt.
  const privacyGate = await assertCloudAllowed(supabase, user.id, 'documenten')
  if (privacyGate) return privacyGate

  // AI-add-on vereist: pensioen-PDF-extractie draait op het AI-model. Voorheen
  // enkel auth — nu gegate zoals de overige AI-routes (kostenbeheersing).
  const gate = await checkTierGate(supabase, user.id, 'ai')
  if (gate) {
    return aiSubscriptionRequired()
  }

  // Rate limit check
  if (!checkRateLimit(user.id)) {
    return Response.json(
      { error: 'Te veel uploads. Maximaal 5 per uur. Probeer het later opnieuw.' },
      { status: 429 }
    )
  }

  // Parse multipart form data
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return Response.json({ error: 'Ongeldig verzoek. Verwacht multipart/form-data.' }, { status: 400 })
  }

  // Explicit AVG-consent gate (ADR 0035). A pension PDF is a binary document
  // that cannot be reliably PII-stripped, so instead of sending it silently we
  // require the client to record the user's explicit consent for one-time AI
  // processing. Absent consent → reject. The JSON-route is client-side and
  // never reaches this endpoint.
  const consent = formData.get('consent')
  if (consent !== PENSION_PDF_CONSENT_VERSION) {
    return Response.json(
      { error: 'Toestemming voor AI-verwerking van de PDF ontbreekt. Upload opnieuw of gebruik de JSON-export.' },
      { status: 400 },
    )
  }
  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return Response.json({ error: 'Geen bestand gevonden. Upload een PDF.' }, { status: 400 })
  }

  // Validate file type
  if (file.type !== 'application/pdf') {
    return Response.json({ error: 'Alleen PDF-bestanden zijn toegestaan.' }, { status: 400 })
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: 'Bestand is te groot. Maximaal 10 MB.' }, { status: 400 })
  }

  // Het bewijs gaat naar `consent_events` (ADR 0155) — vóór deze ronde was het een
  // `console.log`, dat na de log-retentie verdampte (livegang r.55). Eigen-rij
  // INSERT via de sessie-client; nooit bestandsinhoud. Bewust ná de
  // bestandsvalidatie en direct vóór de modelcall: een event hoort bij een
  // verwerking die ook echt plaatsvindt. Faalt de insert, dan gaat de PDF NIET
  // naar het model: zonder vastgelegde toestemming geen verwerking.
  const evidence = await supabase.from('consent_events').insert({
    user_id: user.id,
    kind: 'pension_pdf',
    decision: 'granted',
    version: PENSION_PDF_CONSENT_VERSION,
    source: 'pension-upload',
  })
  if (evidence.error) {
    return serverError(evidence.error, 'pension/parse:consent')
  }

  try {
    // Read file as base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Get AI model
    const model = await getModel(supabase, 'pensioen_extractie')

    // Parse pension PDF with AI
    const { object: result } = await generateObject({
      model,
      schema: PensionParseResultSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: PENSION_PARSE_PROMPT,
            },
            {
              type: 'file',
              data: base64,
              mediaType: 'application/pdf',
            },
          ],
        },
      ],
    })

    await recordAiUsage(supabase, user.id, 'extraction')
    return Response.json(result)
  } catch (err) {
    // AI-config/kill-switch: neutrale copy + code naar de client; de echte
    // reden (beheerderstaal) staat alleen in het serverlog (V-002).
    if (isAIConfigError(err)) {
      return aiModelUnavailable(err, 'pension/parse')
    }
    console.error('[pension/parse] Error:', err)

    return Response.json(
      { error: 'Fout bij het verwerken van de PDF. Probeer het opnieuw.' },
      { status: 500 }
    )
  }
}
