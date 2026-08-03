// ── Lokale nieuwseditie: de map-reduce-resolver (on-device) ──────────────────
//
// WAAROM DIT NIET 1-OP-1 HET CLOUDPAD KAN ZIJN
//
// `app/api/news/route.ts` doet ÉÉN `streamObject` met `output:'array'` over het
// hele `newsItemSchema`: per bericht 11 velden, waarvan twee enums, een score, een
// datum en — beslissend — een `sourceUrl`/`sourceName` die LETTERLIJK uit de
// aangeleverde bronnen moet komen. Het model weegt daarbij 40 bronartikelen tegen
// een financieel profiel, selecteert er 0-8, classificeert direct-vs-relevant,
// schrijft een gepersonaliseerde impactzin mét euro's en vrijheidsdagen, én typt
// een URL foutloos over. Dat is ~5.800-7.400 tokens in en ~1.400-1.600 uit: op of
// óver het lokale venster van 8.192 (dat is in+uit sámen). Ter vergelijking: de
// lokale chat draait op ~490 tokens DNA plus een compact overzicht.
//
// DE HERSTRUCTURERING — vier ingrepen, in volgorde van winst:
//
//  1. VELDEN UIT DE MODELCALL. `sourceUrl`, `sourceName`, `category`, `date` en
//     `id` komen hier uit de BRONRIJ (zie local-news-source.ts), nooit uit het
//     model. Daarmee vervalt de hele hallucinatie-URL-klasse bij de bron.
//     `filterGroundedItems` blijft server-side als vangnet — niet meer als eerste
//     verdediging. Het model schrijft alleen proza plus twee labels.
//  2. STRAKKER VOORFILTER. De server levert ~12-15 artikelen in plaats van 40, al
//     deterministisch gescoord (`selectSourceArticles`) en ontdaan van herhaling
//     (`dedupeSimilarTitles` tegen recente koppen — betrouwbaarder dan een
//     prompt-instructie, en het scheelt 350-1.750 tokens aan koppen in de prompt).
//  3. TWEE PASSES, ÉÉN ARTIKEL PER CALL. Pass A scoort (één regel uit), pass B
//     schrijft alleen voor de overlevers (drie regels uit). Elke call blijft
//     ~900-1.100 tokens in / ~200 uit, en een afkapping kost ÉÉN bericht in plaats
//     van de hele editie.
//  4. DE CODE DWINGT DE SELECTIE AF, NIET DE PROMPT — zie `selectWinners` in
//     local-news-select.ts.
//
// NO-EGRESS / GEEN CLOUD-GUARDRAILS: dit draait volledig op het toestel
// (WebGPU/Gemma). `sanitizeForAI` / `maskPIIInOutput` / token-logging zijn N.V.T.
// (ADR 0043 §5) — er is geen externe provider, geen egress en geen kosten. De
// tegenhanger van "geen verzonnen cijfers" is hier de NUMMER-GUARD op
// `personalImpact` (local-news-guard.ts), plus de server-side hercontrole bij het
// persisteren (local-news-reconcile.ts): de client is nu de auteur, dus de server
// blijft de beslissende laag.

import type { NewsItem } from '@/lib/news-item'
import type { LocalChatOverview } from './local-chat-context'
import {
  buildLocalNewsScoringPrompt,
  buildLocalNewsWritingPrompt,
  renderLocalNewsOverview,
} from './local-news-prompt'
import type { LocalNewsSource } from './local-news-source'
import { parseLocalNewsProse, parseLocalNewsScore } from './local-news-parse'
import { composeLocalNewsItem, selectWinners, type ScoredSource } from './local-news-select'
import { disposeSession, loadModelSession } from './litert-runtime'

/** Ruwe token-ruimte per pass. De web-SDK negeert dit (zie litert-runtime), maar
 *  het houdt het contract met de runtime gelijk en documenteert de verwachting. */
const SCORING_MAX_TOKENS = 48
const WRITING_MAX_TOKENS = 320

/**
 * Voortgangssignaal voor de UI. De hele editie kost ~12 scoring-calls plus tot 8
 * generatie-calls: twee tot vier minuten. Een blokkerende spinner is daarbij geen
 * optie — de gebruiker moet per bericht zien dat er iets gebeurt.
 */
export interface LocalNewsProgress {
  phase: 'scoren' | 'schrijven'
  /** Aantal afgeronde calls binnen deze fase. */
  done: number
  /** Totaal aantal calls in deze fase. */
  total: number
}

export interface GenerateLocalNewsArgs {
  sources: LocalNewsSource[]
  overview: LocalChatOverview
  onProgress?: (p: LocalNewsProgress) => void
  /**
   * Aangeroepen na ELK afgerond bericht, met de volledige lijst-tot-nu-toe.
   *
   * Waarom per bericht en niet één keer aan het eind: er is geen server-side
   * hervatting (`LocalChatTransport.reconnectToStream` geeft bewust `null`). Sluit
   * de tab halverwege, dan mag de al gedane generatie niet verdampen. De callback
   * krijgt de hele lijst i.p.v. het losse bericht, zodat de server de editie
   * idempotent kan overschrijven en er geen append-race ontstaat.
   */
  onItem?: (items: NewsItem[]) => Promise<void> | void
  /** Afbreken bij navigatie/sluiten. Wordt tussen calls getoetst. */
  signal?: AbortSignal
}

/**
 * Eén generatie met sessieherstel — hetzelfde patroon als de categorisatie-
 * resolver: bij een runtime-fout (mogelijke WebGPU device-loss / poisoned session)
 * eenmalig dispose + verse sessie, daarna opnieuw. Faalt het weer, dan propageert
 * de fout. NOOIT een stille cloud-fallback: dat zou de privacybelofte breken.
 */
async function generateWithRecovery(
  system: string,
  user: string,
  maxNewTokens: number,
): Promise<string> {
  const run = async () => {
    const session = await loadModelSession()
    return session.generate(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxNewTokens,
    )
  }

  try {
    return await run()
  } catch (err) {
    // ALTIJD loggen: zonder deze kanarie is een lokale-AI-fout voor gebruiker én
    // support onzichtbaar — de UI toont enkel een generieke melding.
    console.error('[lokale-ai] nieuws-call mislukt — sessieherstel + één retry volgt:', err)
    await disposeSession()
    try {
      return await run()
    } catch (err2) {
      console.error('[lokale-ai] nieuws-call mislukt ná sessieherstel:', err2)
      throw err2
    }
  }
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Generatie afgebroken', 'AbortError')
}

/**
 * Stel de persoonlijke nieuwseditie on-device samen.
 *
 * Twee passes over de aangeleverde bronnen; per bericht wordt `onItem` aangeroepen
 * zodat de editie onderweg al bewaard wordt. ~12 scoring-calls plus tot 8
 * generatie-calls, samen twee tot vier minuten — vandaar het voortgangssignaal.
 *
 * Faalt één call definitief (ook na sessieherstel), dan slaan we dat ARTIKEL over
 * in plaats van de hele editie te laten sneuvelen. Dat is de winst van de
 * map-reduce-vorm: schade blijft lokaal.
 */
export async function generateLocalNewsEdition({
  sources,
  overview,
  onProgress,
  onItem,
  signal,
}: GenerateLocalNewsArgs): Promise<NewsItem[]> {
  // Eén keer renderen: dit is zowel de prompt-context als de groundingbron voor de
  // nummer-guard. Dezelfde tekst voor beide, zodat een getal dat het model MOCHT
  // zien per definitie ook goedgekeurd kan worden.
  const overviewText = renderLocalNewsOverview(overview)

  // ── Pass A — scoren, één artikel per call ──────────────────────────────────
  const scored: ScoredSource[] = []
  for (const [index, source] of sources.entries()) {
    assertNotAborted(signal)
    onProgress?.({ phase: 'scoren', done: index, total: sources.length })
    try {
      const { system, user } = buildLocalNewsScoringPrompt({ article: source, overviewText })
      const raw = await generateWithRecovery(system, user, SCORING_MAX_TOKENS)
      const score = parseLocalNewsScore(raw)
      // Onparseerbaar → fail-closed: geen oordeel is geen goedkeuring.
      if (score) scored.push({ source, score })
    } catch (err) {
      console.error(`[lokale-ai] scoring mislukt voor "${source.title}" — overgeslagen:`, err)
    }
  }
  onProgress?.({ phase: 'scoren', done: sources.length, total: sources.length })

  // ── Begrenzing in code (0-8) ───────────────────────────────────────────────
  const winners = selectWinners(scored)

  // ── Pass B — proza, alleen voor de overlevers ──────────────────────────────
  const items: NewsItem[] = []
  for (const [index, winner] of winners.entries()) {
    assertNotAborted(signal)
    onProgress?.({ phase: 'schrijven', done: index, total: winners.length })
    try {
      const { system, user } = buildLocalNewsWritingPrompt({
        article: winner.source,
        overviewText,
        impactType: winner.score.impactType,
      })
      const raw = await generateWithRecovery(system, user, WRITING_MAX_TOKENS)
      const prose = parseLocalNewsProse(raw)
      // Zonder kop/samenvatting valt er niets te tonen — artikel overslaan.
      if (!prose) {
        console.warn(`[lokale-ai] onbruikbaar proza voor "${winner.source.title}" — overgeslagen`)
        continue
      }
      items.push(composeLocalNewsItem(winner.source, winner.score, prose, overviewText))
      // AFGEBROKEN RUN SCHRIJFT NIET MEER. De abort-check bovenaan de lus is niet
      // genoeg: `generateWithRecovery` duurt seconden, en een Ververs of een
      // unmount in dat venster zou hierna alsnog een POST sturen met de lijst van
      // de OUDE run — die overschrijft dan idempotent wat de nieuwe run net
      // wegschreef. De `isCurrent()`-bewaking in de hook beschermt alleen de
      // React-state, niet de netwerkcall.
      if (signal?.aborted) return items
      // Per bericht bewaren: een tab die halverwege sluit mag geen halve editie
      // laten verdampen. Een falende persist stopt de generatie niet.
      try {
        await onItem?.([...items])
      } catch (err) {
        console.error('[lokale-ai] tussentijds bewaren van de editie mislukt:', err)
      }
    } catch (err) {
      console.error(`[lokale-ai] schrijven mislukt voor "${winner.source.title}" — overgeslagen:`, err)
    }
  }
  onProgress?.({ phase: 'schrijven', done: winners.length, total: winners.length })

  return items
}
