import { createAnthropic } from '@ai-sdk/anthropic'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/service'
import { wrapModelWithTokenLogging, type WrappableModel } from '@/lib/ai/token-usage'
import { parsePlatformStatus } from '@/lib/platform-status'

export class AIConfigError extends Error {
  constructor(
    message: string,
    public provider: string,
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
  const { data } = await getServiceClient()
    .from('app_settings')
    .select('key, value')
    .in('key', ['ai_provider', 'ai_model_anthropic', 'ai_model_openai', 'anthropic_api_key', 'openai_api_key', 'ai_model_mistral', 'mistral_api_key', 'ollama_base_url', 'ai_model_ollama', 'platform_status'])

  const settings: Record<string, string> = {}
  for (const row of data ?? []) {
    settings[row.key] = row.value
  }

  // Globale AI-kill-switch (beheerd via /beheer/platform). Staat boven de
  // provider-keuze: als AI uit staat, geen enkele AI-call mag door.
  if (!parsePlatformStatus(settings.platform_status).killSwitches.ai) {
    throw new AIConfigError('AI is tijdelijk uitgeschakeld door beheer.', 'platform')
  }

  const provider = settings.ai_provider || process.env.AI_PROVIDER || 'anthropic'

  let modelId: string
  let base: WrappableModel

  switch (provider) {
    case 'openai': {
      const apiKey = settings.openai_api_key || process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new AIConfigError('OpenAI API key is niet geconfigureerd. Stel deze in via Admin > API Keys of de OPENAI_API_KEY environment variable.', 'openai')
      }
      modelId = settings.ai_model_openai || 'gpt-4o'
      base = createOpenAI({ apiKey })(modelId)
      break
    }
    case 'mistral': {
      const apiKey = settings.mistral_api_key || process.env.MISTRAL_API_KEY
      if (!apiKey) {
        throw new AIConfigError('Mistral API key is niet geconfigureerd. Stel deze in via Admin > API Keys of de MISTRAL_API_KEY environment variable.', 'mistral')
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
      const apiKey = settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new AIConfigError('Anthropic API key is niet geconfigureerd. Stel deze in via Admin > API Keys of de ANTHROPIC_API_KEY environment variable.', 'anthropic')
      }
      modelId = settings.ai_model_anthropic || 'claude-sonnet-4-5-20250929'
      base = createAnthropic({ apiKey })(modelId)
      break
    }
  }

  if (!feature) return base
  return wrapModelWithTokenLogging(base, { supabase, feature, provider, modelId })
}
