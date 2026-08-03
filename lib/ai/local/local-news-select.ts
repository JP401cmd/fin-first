// ── Lokale nieuwseditie: selectie en samenstelling (PUUR) ────────────────────
//
// Bewust los van `local-news-resolver.ts`: die importeert de WebGPU-runtime en
// hoort alleen in de browser thuis, terwijl deze regels aan BEIDE kanten van de
// naad nodig zijn — de client selecteert ermee, de server hervalideert ermee
// (`local-news-reconcile.ts`). Een gedeelde constante die via de runtime-module
// zou moeten reizen, trekt de hele WASM-facade de serverbundel in.
//
// Hier woont ook de kern van de herstructurering: LAAT DE CODE DE SELECTIE
// AFDWINGEN, NIET DE PROMPT. "GEEN IMPACT = GEEN NIEUWS" en "een lege editie is
// een legitiem resultaat" zijn subtiele instructies; een klein model vindt alles
// relevant en zegt overal "ja" tegen. De begrenzing 0-8 komt daarom van een harde
// drempel plus een top-N — niet van een zin in de prompt.

import type { NewsItem } from '@/lib/news-item'
import { guardPersonalImpact } from './local-news-guard'
import type { LocalNewsScore } from './local-news-parse'
import { localNewsItemId, type LocalNewsSource } from './local-news-source'

/**
 * Maximaal aantal berichten in een editie. Gelijk aan de bovengrens die het
 * cloudpad via de prompt vraagt ("0-8 berichten"), maar hier HARD afgedwongen.
 */
export const LOCAL_NEWS_MAX_ITEMS = 8

/**
 * Ondergrens op de pass-A-score. Alles daaronder haalt de editie niet, ook als het
 * model "RELEVANT: ja" zei.
 *
 * Waarom 3 en niet 2: de score loopt van 1 tot 5 en een klein model neigt naar het
 * midden. Op 2 zou vrijwel elk artikel doorgaan en is de drempel geen filter maar
 * decoratie; op 3 moet het model minstens "meer dan achtergrond" hebben gezegd.
 * Een lege editie is daarmee een bereikbare, legitieme uitkomst — precies wat het
 * cloudpad met een instructie probeert te bereiken.
 */
export const LOCAL_NEWS_MIN_SCORE = 3

/** Een bronartikel met het oordeel van pass A erbij. */
export interface ScoredSource {
  source: LocalNewsSource
  score: LocalNewsScore
}

/**
 * Pas de harde begrenzing toe op de pass-A-uitkomsten:
 *  1. weg met alles wat niet relevant is óf onder {@link LOCAL_NEWS_MIN_SCORE} zit;
 *  2. sorteer zoals de editie hoort te staan — direct-impact eerst, daarbinnen de
 *     hoogste score bovenaan;
 *  3. kap af op {@link LOCAL_NEWS_MAX_ITEMS}.
 *
 * Levert een lege lijst wanneer niets de drempel haalt. Dat is een geldige editie
 * ("geen nieuws met impact op jouw situatie"), geen fout.
 */
export function selectWinners(scored: ScoredSource[]): ScoredSource[] {
  return scored
    .filter((s) => s.score.relevant && s.score.impactScore >= LOCAL_NEWS_MIN_SCORE)
    .sort((a, b) => {
      if (a.score.impactType === 'direct' && b.score.impactType !== 'direct') return -1
      if (a.score.impactType !== 'direct' && b.score.impactType === 'direct') return 1
      return b.score.impactScore - a.score.impactScore
    })
    .slice(0, LOCAL_NEWS_MAX_ITEMS)
}

/**
 * Stel één `NewsItem` samen uit de bronrij, het pass-A-oordeel en het pass-B-proza.
 *
 * DE KERN VAN DE HERSTRUCTURERING zit hier: `sourceUrl`, `sourceName`, `category`,
 * `date` en `id` worden uit `source` gekopieerd. Er is geen pad waarlangs modeltekst
 * in die velden kan belanden — het proza-argument draagt ze niet eens.
 *
 * De nummer-guard bepaalt of `personalImpact` overleeft. Valt hij weg terwijl het
 * bericht als 'direct' was geclassificeerd, dan degradeert het naar 'relevant':
 * "direct" belooft een concrete, berekenbare impact, en zonder gefundeerde cijfers
 * is die belofte niet waargemaakt.
 */
export function composeLocalNewsItem(
  source: LocalNewsSource,
  score: LocalNewsScore,
  prose: { headline: string; summary: string; personalImpact: string | null },
  overviewText: string,
): NewsItem {
  const groundedImpact = guardPersonalImpact(prose.personalImpact, [
    source.title,
    source.summary ?? '',
    source.potentialImpact ?? '',
    overviewText,
  ])

  return {
    id: localNewsItemId(source.id),
    headline: prose.headline,
    summary: prose.summary,
    impactType: score.impactType === 'direct' && groundedImpact ? 'direct' : 'relevant',
    // Leeg wanneer de guard 'm afkeurde: liever geen belofte dan een verzonnen bedrag.
    personalImpact: groundedImpact ?? '',
    impactScore: score.impactScore,
    impactDirection: score.impactDirection,
    // ── Uit de bronrij, nooit uit het model ──
    category: source.category,
    date: source.date,
    sourceUrl: source.sourceUrl,
    sourceName: source.sourceName,
  }
}
