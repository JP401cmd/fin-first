import { NextResponse } from 'next/server'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { checkTierGate } from '@/lib/require-tier'
import { parseLocalKnowledge } from '@/lib/ai/local/knowledge-context'

/**
 * Lees-API voor de kennisbank van de lokale Will-chat (fase C1b).
 *
 * De lokale chat draait ON-DEVICE (WebGPU/Gemma) en heeft de gecureerde
 * uitleg-items nodig om begrippen (bv. Box 3, jaarruimte) correct te duiden —
 * de C1a-meting toonde dat het 2B-model die NL-begrippen zonder kennisbank
 * onvoldoende beheerst. Deze route levert de client die items zodat de fencing +
 * per-vraag-selectie client-side gebeuren (`buildLocalChatSystemPrompt`).
 *
 * TOEGANG: ingelogd (401 anders) + het 'ai'-abonnement (`checkTierGate`, 403
 * anders) — consistent met de rest van de AI-functies en met de toggle op
 * /mijn/privacy. Er is GEEN superadmin-eis: dit is REDACTIONELE content (uitleg
 * bij begrippen, per harde inhoudsregel géén cijfers/tarieven/persoonsdata), niet
 * gevoelig — vandaar dat een gewone abonnee 'm mag lezen. Beheer/schrijven blijft
 * superadmin op de aparte /api/admin/local-knowledge-route.
 *
 * OPSLAG: `app_settings.local_knowledge` (JSON) via de service-client — die
 * tabel is beheer-eigendom (ADR 0006), dus lezen gaat niet via de anon-client.
 * We geven ALLEEN actieve items terug en enkel de velden die de client nodig
 * heeft (titel/tags/tekst) — geen id/volgorde/tijdstempel.
 *
 * GEEN CLOUD-AI-GUARDRAILS: deze route stuurt niets naar een AI-provider; ze
 * levert alleen redactionele tekst aan de eigen client. sanitize/PII-mask zijn
 * N.V.T. (geen egress, geen persoonsdata in de content).
 */

const SETTINGS_KEY = 'local_knowledge'

/** GET — de actieve kennisitems (titel/tags/tekst) voor de ingelogde AI-abonnee. */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const gate = await checkTierGate(supabase, user.id, 'ai')
  if (gate) return forbidden(gate.error)

  const service = getServiceClient()
  const { data, error } = await service
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  if (error) return serverError(error, 'local-knowledge:GET')

  const items = parseLocalKnowledge(data?.value)
    .filter((item) => item.actief)
    .map((item) => ({ titel: item.titel, tags: item.tags, tekst: item.tekst }))

  return NextResponse.json(
    { items },
    {
      // Korte privé-cache: de kennisbank verandert zelden en is per-gebruiker
      // identiek, maar mag niet in een gedeelde/CDN-cache belanden (tier-gated).
      headers: { 'Cache-Control': 'private, max-age=300' },
    },
  )
}
