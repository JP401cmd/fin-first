import { NextResponse } from 'next/server'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { checkTierGate } from '@/lib/require-tier'
import { buildLocalTipCandidates } from '@/lib/ai/local/local-tips-context'

/**
 * Hydratie-API voor de KANDIDATEN van het lokale tips-pad (Golden Nuggets).
 *
 * De tips draaien ON-DEVICE (WebGPU/Gemma) in de browser, maar de kandidaten
 * worden DETERMINISTISCH server-side bepaald: `buildLocalTipCandidates`
 * (`lib/ai/local/local-tips-context.ts`) leest de canonieke motoren
 * (`collectAandachtspunten`, `computeJaarruimteFacts`, de NIBUD-benchmarks en de
 * vaste-lasten-detectie) via de Supabase-client. Deze GET-route levert die
 * doorgerekende kansen aan de client, zodat het model er alleen nog taal bij
 * hoeft te verzinnen.
 *
 * Dit is de tips-tegenhanger van `/api/local-chat-overview` en volgt dezelfde
 * toegangs-drieluik:
 *  1. ingelogd — anders 401 'Niet ingelogd' (`unauthorized`);
 *  2. AI-kill-switch (`profiles.ai_enabled`) — staat die uit, dan is de hele
 *     AI-functie geblokkeerd → 403;
 *  3. het 'ai'-abonnement (`checkTierGate` → 403).
 *
 * GEEN PRIVACY-GATE (bewust, gelijk aan /api/local-chat-overview): dit ÍS de
 * lokale databron. De cijfers zijn het eigen financiële beeld van de gebruiker en
 * gaan van de server naar diens éigen browser — precies zoals elke
 * /overzicht-pagina. Er is GEEN egress naar een externe AI-provider en GEEN
 * `getModel`-call, dus deze route valt terecht buiten de privacy-gate-scan
 * (`lib/ai/privacy-gate-scan.ts` verzamelt enkel `getModel`-consumenten) en
 * verschijnt NIET in de KNOWN_GETMODEL_CONSUMERS-pin.
 *
 * GEEN CLOUD-GUARDRAILS: omdat er geen model-call en geen egress is, zijn
 * `sanitizeForAI` / `maskPIIInOutput` / token-logging hier N.V.T. (ADR 0043 §5).
 * Auth + kill-switch + tier BLIJVEN wél de toegangspoort.
 *
 * OPSLAG: `buildLocalTipCandidates(supabase)` leest own-row via de anon-client
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
    const candidates = await buildLocalTipCandidates(supabase)
    return NextResponse.json(candidates, {
      // Bewust GEEN cache: de kandidaten zijn afhankelijk van de aanbevelingen
      // die de gebruiker zojuist heeft laten maken (de dedupe filtert die weg).
      // Een gecachete lijst zou bij een tweede ronde dezelfde kansen opnieuw
      // aanbieden — precies wat de dedupe moet voorkomen.
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    return serverError(err, 'local-tips-candidates:GET')
  }
}
