import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { SupabaseClient } from '@supabase/supabase-js'

export class AIConfigError extends Error {
  constructor(
    message: string,
    public provider: string,
  ) {
    super(message)
    this.name = 'AIConfigError'
  }
}

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
      if (!apiKey) {
        throw new AIConfigError('OpenAI API key is niet geconfigureerd. Stel deze in via Admin > API Keys of de OPENAI_API_KEY environment variable.', 'openai')
      }
      const model = settings.ai_model_openai || 'gpt-4o'
      const openai = createOpenAI({ apiKey })
      return openai(model)
    }
    case 'anthropic':
    default: {
      const apiKey = settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new AIConfigError('Anthropic API key is niet geconfigureerd. Stel deze in via Admin > API Keys of de ANTHROPIC_API_KEY environment variable.', 'anthropic')
      }
      const model = settings.ai_model_anthropic || 'claude-sonnet-4-5-20250929'
      const anthropic = createAnthropic({ apiKey })
      return anthropic(model)
    }
  }
}
