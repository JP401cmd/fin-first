import { NextResponse } from 'next/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { parseGateConfig, LOCAL_AI_GATE_SETTINGS_KEY } from '@/lib/ai/local/gate-config'
import { LOCAL_MODEL_CATALOG } from '@/lib/ai/local/model-catalog'

/**
 * Leespad voor de sectie "Waar draait de AI?" op /mijn/privacy: welk model wordt
 * aangeboden, mag de gebruiker zelf kiezen, en hoe streng is de uitvoer-toets.
 *
 * WAAROM SERVICE-ROLE VOOR EEN GEWONE GEBRUIKER. `app_settings` is een
 * beheertabel; een ingelogde gebruiker heeft er geen leesrecht op, en dat hoort
 * ook zo te blijven. Deze route leest daarom server-side een VASTE, kleine
 * allowlist van sleutels — de gate-config plus de provider-/modelkeuze — en
 * geeft alleen het geparste resultaat terug: geen andere rijen, geen ruwe
 * waarden, en nadrukkelijk NOOIT de `*_api_key`-sleutels. De inhoud is geen
 * geheim: het is de instelling die de gebruiker meteen daarna in de UI ziet
 * (welk model draait er voor mij, lokaal én in de cloud).
 *
 * Inloggen is wél vereist: dit hoort bij een functie achter het AI-abonnement en
 * er is geen reden om 'm anoniem te serveren.
 */

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  mistral: 'Mistral',
  ollama: 'Ollama',
}

/**
 * Welke cloud-provider + welk model is nu voor iedereen actief? Zelfde
 * resolutie (incl. defaults) als `getModel` in lib/ai/config.ts — alleen de
 * naam, zonder keys of provider-instantie. Wijzigt daar een default, dan hier
 * meebewegen.
 */
function resolveCloudModel(settings: Record<string, string>): {
  provider: string
  label: string
  modelId: string
} {
  const provider = settings.ai_provider || process.env.AI_PROVIDER || 'anthropic'
  let modelId: string
  switch (provider) {
    case 'openai':
      modelId = settings.ai_model_openai || 'gpt-4o'
      break
    case 'mistral':
      modelId = settings.ai_model_mistral || 'mistral-large-latest'
      break
    case 'ollama':
      modelId = settings.ai_model_ollama || 'llama3.2'
      break
    default:
      modelId = settings.ai_model_anthropic || 'claude-sonnet-4-5-20250929'
  }
  return {
    provider,
    label: PROVIDER_LABELS[provider] ?? provider,
    modelId,
  }
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const service = getServiceClient()
  const { data, error } = await service
    .from('app_settings')
    .select('key, value')
    .in('key', [
      LOCAL_AI_GATE_SETTINGS_KEY,
      'ai_provider',
      'ai_model_anthropic',
      'ai_model_openai',
      'ai_model_mistral',
      'ai_model_ollama',
    ])

  // Een leesfout mag de privacy-pagina niet slopen: de strenge standaard is een
  // geldig antwoord (parseGateConfig valt daar zelf op terug).
  if (error) return serverError(error, 'local-ai-gate:GET')

  const settings: Record<string, string> = {}
  for (const row of data ?? []) settings[row.key] = row.value

  return NextResponse.json({
    config: parseGateConfig(settings[LOCAL_AI_GATE_SETTINGS_KEY]),
    cloudModel: resolveCloudModel(settings),
    models: LOCAL_MODEL_CATALOG.map((m) => ({
      id: m.id,
      label: m.label,
      bytes: m.bytes,
      blurb: m.blurb,
    })),
  })
}
