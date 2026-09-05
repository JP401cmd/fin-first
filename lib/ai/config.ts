import { createAnthropic } from '@ai-sdk/anthropic'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/service'
import { tokenLoggingMiddleware, type WrappableModel } from '@/lib/ai/token-usage'
import { aiFailureMiddleware, logAiFailure } from '@/lib/ai/ai-failure-middleware'
import { parsePlatformStatus } from '@/lib/platform-status'
import { decryptField } from '@/lib/crypto/field-encryption'
import { AI_ERROR_CODE } from '@/lib/ai/error-copy'

// AI-provider-keys worden versleuteld opgeslagen in app_settings (zie
// app/api/admin/settings/route.ts). Dual-read: een `v1:`-prefixte waarde wordt
// gedecrypt, een nog-plaintext waarde (backfill nog niet gedaan) gaat
// ongewijzigd door. De prefix-check voorkomt dat decryptField throwt op
// plaintext → AI blijft werken tijdens de overgang. Ontbreekt de env-sleutel
// (ENCRYPTION_KEY_V1) terwijl de waarde wél versleuteld is, dan throwt
// decryptField bewust — dat is een harde config-afhankelijkheid, geen
// stille degradatie naar een kapotte key.
function readSecret(raw: string | undefined): string | undefined {
  if (!raw) return raw
  return raw.startsWith('v1:') ? (decryptField(raw) ?? undefined) : raw
}

/**
 * Machineleesbare reden achter een `AIConfigError` (H27).
 *
 * De `message` blijft bewust beheerderstaal — hij noemt provider, beheerpad en
 * env-variabele — en hoort daarom UITSLUITEND in het serverlog. Wat de route
 * naar de client stuurt is deze `reason` als foutcode; de tekst komt dan uit
 * `lib/ai/error-copy.ts`. Nooit meer `err.message` in een responsbody.
 */
export type AIConfigReason =
  | typeof AI_ERROR_CODE.disabledPlatform
  | typeof AI_ERROR_CODE.unavailable

export class AIConfigError extends Error {
  constructor(
    message: string,
    public provider: string,
    /** Default = `ai_unavailable`: de veilige, neutrale klasse. */
    public reason: AIConfigReason = AI_ERROR_CODE.unavailable,
  ) {
    super(message)
    this.name = 'AIConfigError'
  }
}

// De settings worden via de service-role gelezen: de API-key-sleutels zijn
// sinds de app_settings-verharding niet meer leesbaar voor gewone sessies,
// terwijl AI-calls wél voor elke gebruiker moeten werken (server-only pad).
// De supabase-parameter is de sessie van de aanroeper en wordt alleen
// gebruikt om bij het token-loggen de user te bepalen.
//
// Geef `feature` mee (bv. 'chat', 'briefing') om werkelijk tokenverbruik
// per call vast te leggen in ai_token_usage — zie lib/ai/token-usage.ts en
// /beheer/ai-verbruik. Zonder feature wordt er niets gelogd.
export async function getModel(supabase: SupabaseClient, feature?: string) {
  const { data, error } = await getServiceClient()
    .from('app_settings')
    .select('key, value')
    .in('key', ['ai_provider', 'ai_model_anthropic', 'ai_model_openai', 'anthropic_api_key', 'openai_api_key', 'ai_model_mistral', 'mistral_api_key', 'ollama_base_url', 'ai_model_ollama', 'platform_status'])

  // De leesfout werd hier eerder weggegooid. Gevolg: een mislukte
  // service-lezing (verkeerde service-role-key, RLS, netwerk) leverde een leeg
  // settings-object en dus de conclusie "API key is niet geconfigureerd" —
  // terwijl de sleutel gewoon in app_settings staat. Dat maakte de melding ook
  // voor de BEHEERDER misleidend. We loggen 'm nu expliciet (server-only) en
  // laten het gedrag verder ongewijzigd: de kill-switch/provider-checks
  // hieronder blijven de beslissers.
  if (error) {
    console.error('[ai-config] app_settings-lezing mislukt:', error.message)
  }

  const settings: Record<string, string> = {}
  for (const row of data ?? []) {
    settings[row.key] = row.value
  }

  // Globale AI-kill-switch (beheerd via /beheer/platform). Staat boven de
  // provider-keuze: als AI uit staat, geen enkele AI-call mag door.
  if (!parsePlatformStatus(settings.platform_status).killSwitches.ai) {
    throw new AIConfigError('AI is tijdelijk uitgeschakeld door beheer.', 'platform', AI_ERROR_CODE.disabledPlatform)
  }

  const provider = settings.ai_provider || process.env.AI_PROVIDER || 'anthropic'

  let modelId: string
  let base: WrappableModel

  switch (provider) {
    case 'openai': {
      const apiKey = readSecret(settings.openai_api_key) || process.env.OPENAI_API_KEY
      if (!apiKey) {
        const message = 'OpenAI API key is niet geconfigureerd. Stel deze in via Admin > API Keys of de OPENAI_API_KEY environment variable.'
        await logAiFailure('ai:config', new Error(message), { supabase })
        throw new AIConfigError(message, 'openai')
      }
      modelId = settings.ai_model_openai || 'gpt-4o'
      base = createOpenAI({ apiKey })(modelId)
      break
    }
    case 'mistral': {
      const apiKey = readSecret(settings.mistral_api_key) || process.env.MISTRAL_API_KEY
      if (!apiKey) {
        const message = 'Mistral API key is niet geconfigureerd. Stel deze in via Admin > API Keys of de MISTRAL_API_KEY environment variable.'
        await logAiFailure('ai:config', new Error(message), { supabase })
        throw new AIConfigError(message, 'mistral')
      }
      modelId = settings.ai_model_mistral || 'mistral-large-latest'
      base = createMistral({ apiKey })(modelId)
      break
    }
    case 'ollama': {
      const baseURL = settings.ollama_base_url || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1'
      modelId = settings.ai_model_ollama || 'llama3.2'
      base = createOpenAI({ baseURL, apiKey: 'ollama' })(modelId)
      break
    }
    case 'anthropic':
    default: {
      const apiKey = readSecret(settings.anthropic_api_key) || process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        const message = 'Anthropic API key is niet geconfigureerd. Stel deze in via Admin > API Keys of de ANTHROPIC_API_KEY environment variable.'
        await logAiFailure('ai:config', new Error(message), { supabase })
        throw new AIConfigError(message, 'anthropic')
      }
      modelId = settings.ai_model_anthropic || 'claude-sonnet-4-5-20250929'
      base = createAnthropic({ apiKey })(modelId)
      break
    }
  }

  // Deze middleware legt zich ALTIJD om het model — ook zonder feature-string
  // ('onbekend') — zodat élke mislukte cloud-AI-call een rij in `error_logs`
  // krijgt (UR3-09 / ADR 0132), ongeacht of de aanroeper token-logging
  // aanvraagt. Token-logging (succes-alleen, bestaand gedrag) blijft beperkt
  // tot callsites die wél een feature meegeven.
  const middleware: LanguageModelMiddleware[] = [aiFailureMiddleware({ supabase, feature: feature ?? 'onbekend' })]
  if (feature) {
    middleware.push(tokenLoggingMiddleware({ supabase, feature, provider, modelId }))
  }
  return wrapLanguageModel({ model: base, middleware })
}
