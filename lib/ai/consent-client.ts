import {
  AI_CONSENT_ROUTE,
  type AiConsentClientSource,
  type AiConsentDecision,
  type AiConsentRequest,
  type AiConsentResponse,
} from '@/lib/ai/consent'
import { AI_CONSENT_SAVE_ERROR } from '@/lib/ai/privacy-facts'

export type PostAiConsentResult =
  | { ok: true; data: AiConsentResponse }
  | { ok: false; error: string }

/**
 * De ene client-aanroep van `POST /api/consent/ai` (ADR 0155), gedeeld door de
 * onboarding-stap, de keuze-overlay en /mijn/privacy. Gooit nooit: een niet-ok
 * antwoord geeft de `error` uit de envelope (ADR 0044) terug, een netwerkfout of
 * onleesbaar antwoord de generieke tekst.
 */
export async function postAiConsent(
  decision: AiConsentDecision,
  source: AiConsentClientSource,
): Promise<PostAiConsentResult> {
  const body: AiConsentRequest = { decision, source }
  try {
    const res = await fetch(AI_CONSENT_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as
      | (Partial<AiConsentResponse> & { error?: unknown })
      | null
    if (!res.ok || !data || data.ok !== true) {
      const error = typeof data?.error === 'string' && data.error ? data.error : AI_CONSENT_SAVE_ERROR
      return { ok: false, error }
    }
    return { ok: true, data: data as AiConsentResponse }
  } catch {
    return { ok: false, error: AI_CONSENT_SAVE_ERROR }
  }
}
