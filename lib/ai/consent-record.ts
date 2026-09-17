import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiConsentClientSource, AiConsentDecision } from '@/lib/ai/consent'
import { AI_CONSENT_VERSION } from '@/lib/ai/privacy-facts'

export type RecordAiConsentResult =
  | { ok: true; aiEnabled: boolean; consentAt: string }
  | { ok: false; step: 'event' | 'profile'; error: unknown }

/**
 * Legt één AI-keuze vast (ADR 0155) — gedeeld door `POST /api/consent/ai` en de
 * beta-keuze `POST /api/beta/addon` (ADR 0157), zodat er één schrijfvolgorde is:
 *
 *   1. `consent_events` ← het bewijs (append-only), éérst;
 *   2. `profiles` ← de effectieve stand (`ai_enabled`, `ai_consent_at`,
 *      `ai_consent_version`).
 *
 * Draait op de ingelogde client: eigen-rij RLS is de grens, geen service-role.
 * Gooit niet door bij een DB-fout; de aanroeper maakt er een `serverError` van.
 */
export async function recordAiConsent(
  supabase: SupabaseClient,
  userId: string,
  decision: AiConsentDecision,
  source: AiConsentClientSource,
): Promise<RecordAiConsentResult> {
  const consentAt = new Date().toISOString()
  const aiEnabled = decision === 'granted'

  const event = await supabase.from('consent_events').insert({
    user_id: userId,
    kind: 'ai_cloud',
    decision,
    version: AI_CONSENT_VERSION,
    source,
  })
  if (event.error) return { ok: false, step: 'event', error: event.error }

  const profile = await supabase
    .from('profiles')
    .update({
      ai_enabled: aiEnabled,
      ai_consent_at: consentAt,
      ai_consent_version: AI_CONSENT_VERSION,
      updated_at: consentAt,
    })
    .eq('id', userId)
  if (profile.error) return { ok: false, step: 'profile', error: profile.error }

  return { ok: true, aiEnabled, consentAt }
}
