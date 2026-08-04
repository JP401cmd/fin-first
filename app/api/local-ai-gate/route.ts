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
 * ook zo te blijven. Deze route leest daarom server-side precies ÉÉN sleutel
 * (`local_ai_gate`) en geeft alleen het geparste resultaat terug — geen andere
 * rijen, geen ruwe waarde, geen andere sleutels. De inhoud is bovendien geen
 * geheim: het is de instelling die de gebruiker meteen daarna in de UI ziet.
 *
 * Inloggen is wél vereist: dit hoort bij een functie achter het AI-abonnement en
 * er is geen reden om 'm anoniem te serveren.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const service = getServiceClient()
  const { data, error } = await service
    .from('app_settings')
    .select('value')
    .eq('key', LOCAL_AI_GATE_SETTINGS_KEY)
    .maybeSingle()

  // Een leesfout mag de privacy-pagina niet slopen: de strenge standaard is een
  // geldig antwoord (parseGateConfig valt daar zelf op terug).
  if (error) return serverError(error, 'local-ai-gate:GET')

  return NextResponse.json({
    config: parseGateConfig(data?.value),
    models: LOCAL_MODEL_CATALOG.map((m) => ({
      id: m.id,
      label: m.label,
      bytes: m.bytes,
      blurb: m.blurb,
    })),
  })
}
