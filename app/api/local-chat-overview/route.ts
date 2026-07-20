import { NextResponse } from 'next/server'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { checkTierGate } from '@/lib/require-tier'
import { buildLocalChatOverview } from '@/lib/ai/local/local-chat-context'

/**
 * Hydratie-API voor het financiële overzicht van de lokale Will-chat (fase C2a).
 *
 * De lokale chat draait ON-DEVICE (WebGPU/Gemma) in de client-`LocalChatPanel`.
 * Die heeft de compacte `LocalChatOverview` nodig, maar `buildLocalChatOverview`
 * (`lib/ai/local/local-chat-context.ts`) is server-side (leest `loadCoreData` +
 * de canonieke engines via de Supabase-client). Deze GET-route hydrateert dat
 * overzicht zodat de client het kan ophalen zonder een server-page-render.
 *
 * TOEGANG — spiegelt de gate-drieluik van `app/(app)/mijn/lokale-chat/page.tsx`:
 *  1. ingelogd — anders 401 'Niet ingelogd' (`unauthorized`);
 *  2. AI-kill-switch (`profiles.ai_enabled`) — staat die uit, dan is de hele
 *     AI-functie geblokkeerd → 403 (net als de "AI-features uit"-notice op de
 *     pagina, maar dan als API-antwoord);
 *  3. het 'ai'-abonnement (`checkTierGate` → 403) — consistent met de rest van
 *     de AI-functies en met de toggle op /mijn/privacy.
 *
 * GEEN PRIVACY-GATE (bewust, architect-bevestigd): dit ÍS de lokale databron.
 * De cijfers zijn het eigen financiële beeld van de gebruiker en gaan van de
 * server naar diens éigen browser — precies zoals elke /overzicht-pagina. Er is
 * GEEN egress naar een externe AI-provider en GEEN `getModel`-call, dus deze
 * route valt terecht buiten de privacy-gate-scan (`lib/ai/privacy-gate-scan.ts`
 * verzamelt enkel `getModel`-consumenten) en verschijnt NIET in de
 * KNOWN_GETMODEL_CONSUMERS-pin.
 *
 * GEEN CLOUD-GUARDRAILS: omdat er geen model-call en geen egress is, zijn
 * `sanitizeForAI` / `maskPIIInOutput` / token-logging hier N.V.T. (ADR 0043 §5).
 * Auth + kill-switch + tier BLIJVEN wél de toegangspoort.
 *
 * OPSLAG: `buildLocalChatOverview(supabase)` leest own-row via de anon-client
 * (RLS) — GEEN service-role.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  // Kill-switch: profielkolom `ai_enabled` (per-gebruiker AI-toggle, /mijn/privacy).
  // Alleen expliciet `false` blokkeert — ontbrekende kolom/rij = fail-open (aan).
  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_enabled')
    .eq('id', user.id)
    .single()
  if (profile?.ai_enabled === false) {
    return forbidden('AI-features staan uit')
  }

  const gate = await checkTierGate(supabase, user.id, 'ai')
  if (gate) return forbidden(gate.error)

  try {
    const overview = await buildLocalChatOverview(supabase)
    return NextResponse.json(overview, {
      // Korte privé-cache: per-gebruiker verschillend en tier-gated, dus nooit
      // in een gedeelde/CDN-cache. Spiegelt /api/local-knowledge.
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err) {
    return serverError(err, 'local-chat-overview:GET')
  }
}
