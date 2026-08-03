import { NextResponse } from 'next/server'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { checkTierGate } from '@/lib/require-tier'
import { dedupeSimilarTitles } from '@/lib/news-selection'
import {
  currentJaargang,
  getNextEditionNr,
  getRecentHeadlines,
  loadNewsSourceArticles,
} from '@/lib/news-edition-store'
import { toLocalNewsSource } from '@/lib/ai/local/local-news-source'

/**
 * Bronartikelen voor de ON-DEVICE nieuwseditie (groep 'nieuws' op lokaal).
 *
 * Spiegelt `/api/local-chat-overview`: de generatie draait in de browser, maar de
 * bron staat server-side. `news_articles` is een systeemtabel met RLS
 * `service_role + superadmin` — een gewone gebruiker kán die tabel niet lezen, dus
 * zonder deze route zou het lokale pad simpelweg geen nieuws hebben.
 *
 * WAT ER TERUGKOMT IS OPENBAAR NIEUWS. Titels, samenvattingen en links van
 * publieke bronnen; geen enkel gebruikersgegeven. De personalisatie gebeurt pas
 * ín de browser, waar het financiële overzicht (via /api/local-chat-overview) bij
 * de artikelen komt. Er vertrekt dus niets van de gebruiker naar buiten.
 *
 * TOEGANG — hetzelfde drieluik als /api/local-chat-overview:
 *  1. ingelogd — anders 401 'Niet ingelogd';
 *  2. AI-kill-switch (`profiles.ai_enabled`) → 403;
 *  3. het 'ai'-abonnement (`checkTierGate`) → 403.
 *
 * GEEN PRIVACY-GATE (bewust): dit ÍS het lokale pad. Er is GEEN `getModel`-call en
 * GEEN egress naar een AI-leverancier, dus deze route valt buiten de
 * privacy-gate-scan (die verzamelt enkel `getModel`-consumenten) — net als
 * /api/local-chat-overview.
 *
 * GEEN CLOUD-GUARDRAILS: zonder modelcall en zonder egress zijn `sanitizeForAI` /
 * `maskPIIInOutput` / token-logging N.V.T. (ADR 0043 §5). Auth + kill-switch +
 * tier blijven wél de toegangspoort.
 */

/**
 * Aantal artikelen dat de browser krijgt. Het cloudpad propt er 40 in één prompt;
 * lokaal krijgt ELK artikel een eigen scoring-call, dus is dit getal recht
 * evenredig met de wachttijd (~12 calls ≈ 1-2 minuten voor pass A). Twaalf is de
 * balans tussen genoeg keuze en een editie die binnen enkele minuten staat.
 */
const LOCAL_SOURCE_LIMIT = 12

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  // Kill-switch: alleen expliciet `false` blokkeert — ontbrekende kolom/rij = aan.
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
    const [recentHeadlines, editionNr] = await Promise.all([
      getRecentHeadlines(supabase, user.id),
      getNextEditionNr(supabase, user.id),
    ])

    // Ruimer ophalen dan we teruggeven: de dedupe hieronder gooit er nog artikelen
    // uit, en zonder marge zou een editie met veel herhaling te dun worden.
    const candidates = await loadNewsSourceArticles(LOCAL_SOURCE_LIMIT * 2)

    // HERHAAL-PREVENTIE IN CODE, NIET IN DE PROMPT. Het cloudpad plakt 20-100
    // eerdere koppen in de prompt met "vermijd herhaling" erbij — dat kost 350-1.750
    // tokens en een klein model houdt zich er slecht aan. `dedupeSimilarTitles`
    // (Jaccard 0,6) doet hetzelfde werk deterministisch, vóór het model iets ziet.
    const { kept } = dedupeSimilarTitles(candidates, recentHeadlines)

    const today = new Date().toISOString().split('T')[0]
    const sources = kept.slice(0, LOCAL_SOURCE_LIMIT).map((a) => toLocalNewsSource(a, today))

    const sourceNewestAt = sources
      .map((s) => s.date)
      .filter(Boolean)
      .sort()
      .at(-1)

    return NextResponse.json(
      {
        sources,
        sourceCount: sources.length,
        sourceNewestAt,
        editionNr,
        jaargang: currentJaargang(),
      },
      {
        // Korte privé-cache: per-gebruiker verschillend (de dedupe leest diens
        // archief) en tier-gated, dus nooit in een gedeelde/CDN-cache.
        headers: { 'Cache-Control': 'private, max-age=300' },
      },
    )
  } catch (err) {
    return serverError(err, 'local-news-sources:GET')
  }
}
