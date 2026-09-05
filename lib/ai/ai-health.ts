// lib/ai/ai-health.ts
//
// Afleiding van "werkt de cloud-AI nog?" uit de twee bestaande bronnen —
// `ai_token_usage` (laatste GESLAAGDE call) en `error_logs` (mislukte calls
// sinds die laatste succes, geregistreerd door `lib/ai/ai-failure-middleware.ts`).
// Geen nieuwe tabel of kolom (UR3-09 / ADR 0132): een storing is zichtbaar
// zodra beide bronnen samen worden gelezen, precies zoals `deriveJobHealth`
// (lib/job-health.ts) dat voor achtergrondtaken doet — puur, getest, geen
// eigen klok.
//
// Drempel (eigenaar-besluit 5 sep 2026): 2 mislukte calls sinds het laatste
// succes, niet 3. Bij weinig verkeer duurt een derde poging te lang — en dat
// was hier precies het probleem: Fin lag er twaalf dagen uit zonder dat
// iemand het zag. Eén losse valse melding die vanzelf wegloopt (het
// eerstvolgende succes wist de teller) is de goedkopere fout.

export type AiHealth = 'ok' | 'idle' | 'attention' | 'hapering' | 'storing' | 'unknown'

/** Eén mislukte call sinds het laatste succes. */
export interface AiFailureSignal {
  /** ISO-timestamp van de mislukking. */
  at: string
  /** Uit `provider-error.ts#classifyProviderError`, teruggelezen uit de loggedmessage. */
  kind: 'refused' | 'transient' | 'unknown'
}

export interface DeriveAiHealthParams {
  /** ISO-timestamp van de laatst geslaagde cloud-AI-call, of `null` (nog nooit). */
  lastSuccessAt: string | null
  /** Mislukte calls NA `lastSuccessAt` (of, zonder succes, alle bekende mislukkingen). */
  failuresSinceSuccess: readonly AiFailureSignal[]
}

export interface AiHealthResult {
  status: Exclude<AiHealth, 'unknown'>
  /** Eerste mislukking sinds het laatste succes — `null` als er geen storing is. */
  sinceAt: string | null
  failureCount: number
  lastSuccessAt: string | null
}

/** Vanaf hoeveel mislukte calls sinds het laatste succes we van een patroon spreken. */
export const AI_HEALTH_FAILURE_THRESHOLD = 2

/**
 * Puur: geen IO, geen klok van zichzelf (`now` wordt meegegeven). De
 * aanroeper (`ai-health-loader.ts`) zet `'unknown'` bij een gefaalde lezing —
 * dat is een eigenschap van de leesactie, niet van de AI zelf (spiegelt
 * `deriveJobHealth`).
 */
export function deriveAiHealth(params: DeriveAiHealthParams): AiHealthResult {
  const { lastSuccessAt, failuresSinceSuccess } = params

  if (failuresSinceSuccess.length === 0) {
    return {
      status: lastSuccessAt ? 'ok' : 'idle',
      sinceAt: null,
      failureCount: 0,
      lastSuccessAt,
    }
  }

  const sorted = [...failuresSinceSuccess].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const sinceAt = sorted[0].at
  const failureCount = sorted.length
  const latestKind = sorted[sorted.length - 1].kind

  let status: AiHealthResult['status']
  if (failureCount < AI_HEALTH_FAILURE_THRESHOLD) {
    status = 'attention'
  } else if (latestKind === 'refused') {
    status = 'storing'
  } else {
    status = 'hapering'
  }

  return { status, sinceAt, failureCount, lastSuccessAt }
}

export const AI_HEALTH_META: Record<AiHealth, { label: string; tone: 'positive' | 'negative' | 'warning' | 'neutral' }> = {
  ok: { label: 'Werkt', tone: 'positive' },
  idle: { label: 'Nog niet gebruikt', tone: 'neutral' },
  attention: { label: 'Eén mislukte aanroep', tone: 'warning' },
  hapering: { label: 'Hapert', tone: 'warning' },
  storing: { label: 'Storing', tone: 'negative' },
  unknown: { label: 'Niet af te lezen', tone: 'warning' },
}
