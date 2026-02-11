import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getModel(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['ai_provider', 'ai_model_anthropic', 'ai_model_openai', 'anthropic_api_key', 'openai_api_key'])

  const settings: Record<string, string> = {}
  for (const row of data ?? []) {
    settings[row.key] = row.value
  }

  const provider = settings.ai_provider || process.env.AI_PROVIDER || 'anthropic'

  switch (provider) {
    case 'openai': {
      const apiKey = settings.openai_api_key || process.env.OPENAI_API_KEY
      const model = settings.ai_model_openai || 'gpt-4o'
      const openai = createOpenAI({ ...(apiKey ? { apiKey } : {}) })
      return openai(model)
    }
    case 'anthropic':
    default: {
      const apiKey = settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY
      const model = settings.ai_model_anthropic || 'claude-sonnet-4-5-20250929'
      const anthropic = createAnthropic({ ...(apiKey ? { apiKey } : {}) })
      return anthropic(model)
    }
  }
}
