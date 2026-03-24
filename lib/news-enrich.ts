// ── News Enrichment — AI-powered web extraction and article categorization ──
//
// Two capabilities:
// 1. extractNewsFromWebPage — extracts structured articles from raw web page text
// 2. categorizeArticles — adds category + improved summary to RSS articles
//
// Both functions are designed to fail gracefully: on AI error they return
// empty results rather than throwing, so the ingestion pipeline continues.

import { generateObject } from 'ai'
import { z } from 'zod'
import type { SourceArticle } from '@/lib/news-sources'

const NEWS_CATEGORIES = [
  'fiscaal',
  'rente',
  'woningmarkt',
  'beleggingen',
  'pensioen',
  'macro',
] as const

// ── Schema for web page extraction ──────────────────────────────────

const extractedArticleSchema = z.object({
  items: z.array(
    z.object({
      title: z.string().describe('Nieuwswaardige kop in het Nederlands — pakkend en informatief'),
      summary: z.string().describe('Samenvatting in 2-3 zinnen van het nieuwswaardige item'),
      category: z.enum(NEWS_CATEGORIES).describe('Meest passende nieuwscategorie'),
      potentialImpact: z.string().describe('Korte impactbeoordeling met CONCRETE CIJFERS/FEITEN uit het artikel. Neem altijd de specifieke getallen, percentages, bedragen of datums over. Relateer aan app-functies. Voorbeeld: "Toetsrente stijgt van 4,5% naar 5% per Q2 2026 → maximale hypotheek daalt, maandlasten stijgen bij nieuwe hypotheek." NIET: "hogere rente betekent..." maar WEL: "rente naar 5% betekent...". Schrijf "Geen directe impact" als niet relevant.'),
      relativeUrl: z
        .string()
        .optional()
        .describe('Relatieve of absolute URL naar het specifieke item, als beschikbaar op de pagina'),
      date: z
        .string()
        .optional()
        .describe('Publicatiedatum in YYYY-MM-DD formaat, als vermeld'),
    }),
  ),
})

// ── Schema for article categorization ───────────────────────────────

const categorizedArticleSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().describe('Index van het artikel in de input-lijst'),
      category: z.enum(NEWS_CATEGORIES).describe('Meest passende nieuwscategorie'),
      summary: z
        .string()
        .describe(
          'Verbeterde samenvatting in 2-3 zinnen, gericht op relevantie voor Nederlandse consumenten',
        ),
      potentialImpact: z.string().describe('Korte impactbeoordeling met CONCRETE CIJFERS/FEITEN uit het artikel. Neem altijd de specifieke getallen, percentages, bedragen of datums over. Relateer aan app-functies. Voorbeeld: "Inflatie stijgt naar 3,2% in feb 2026 → koopkracht daalt, maanduitgaven +€85 gemiddeld, FIRE-datum schuift op." NIET: "hogere inflatie betekent..." maar WEL: "inflatie naar 3,2% betekent...". Schrijf "Geen directe impact" als niet relevant.'),
    }),
  ),
})

// ── Types ────────────────────────────────────────────────────────────

/** A SourceArticle enriched with an AI-assigned category and impact assessment */
export type EnrichedArticle = SourceArticle & { category: string; potentialImpact: string }

// ── Extract structured news items from a raw web page ───────────────

/**
 * Uses AI to extract newsworthy items from scraped web page text.
 * Returns structured articles with title, summary, category, and resolved URL.
 * Returns an empty array on failure — never throws.
 *
 * @param pageText  Raw plain-text content of the web page
 * @param source    The web source metadata (url + label)
 * @param model     AI model instance from getModel()
 */
export async function extractNewsFromWebPage(
  pageText: string,
  source: { url: string; label: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
): Promise<EnrichedArticle[]> {
  // Skip pages with too little content to be meaningful
  if (pageText.length < 100) return []

  try {
    const { object } = await generateObject({
      model,
      schema: extractedArticleSchema,
      system: `Je bent een nieuwsextractor voor TriFinity, een Nederlandse personal finance app.
Je taak: analyseer de tekst van een webpagina en extraheer ALLE nieuwswaardige items.

TriFinity-functies waarop nieuws impact kan hebben:
- Vermogen & beleggingen (netto vermogen, portefeuille, rendement, rebalancing)
- Sparen & spaarquote (spaarrente, noodfonds)
- FIRE-prognose (vrijheidsdatum, SWR, Monte Carlo, vermogenspad)
- Budget & cashflow (maanduitgaven, vaste lasten, koopkracht)
- Schulden & hypotheek (aflossing, hypotheekrente, hypotheek vs beleggen)
- Belastingen (box 3, fiscale aftrekposten, toeslagen)
- Pensioen & AOW (pensioenwet, AOW-leeftijd, lijfrente)
- Passief inkomen (dividenden, huurinkomsten)

Zoek naar:
- Publicaties, persberichten, beleidswijzigingen
- Updates over regelgeving, belastingen, financiele markten
- Verslagen, rapporten, cijfers
- Aankondigingen die relevant zijn voor Nederlandse consumenten/beleggers

Regels:
- Schrijf titels en samenvattingen in het Nederlands
- Alleen items die daadwerkelijk nieuwswaardig zijn voor persoonlijke financien
- Maximaal 8 items per pagina
- Geef een relativeUrl als je een link naar het specifieke item kunt identificeren in de tekst
- Sla items over die puur administratief of niet-informatief zijn
- potentialImpact: kort en bondig, relateer aan specifieke app-functies. "Geen directe impact" als niet relevant`,
      prompt: `Bron: ${source.label} (${source.url})

Paginatekst:
${pageText.slice(0, 6000)}

Extraheer alle nieuwswaardige items van deze pagina.`,
    })

    return object.items.map((item) => {
      // Resolve relative URLs against the source base URL
      let articleUrl = source.url
      if (item.relativeUrl) {
        try {
          articleUrl = new URL(item.relativeUrl, source.url).toString()
        } catch {
          articleUrl = source.url
        }
      }

      return {
        title: item.title,
        summary: item.summary,
        url: articleUrl,
        date: item.date || new Date().toISOString().split('T')[0],
        sourceName: source.label,
        category: item.category,
        potentialImpact: item.potentialImpact,
      }
    })
  } catch (err) {
    console.error(
      `[news-enrich] Web extraction failed for "${source.label}":`,
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

// ── Categorize and summarize a batch of articles ────────────────────

/**
 * Uses AI to assign a category and improved Dutch summary to each article.
 * Designed for RSS articles that arrive without a category.
 * Processes all articles in a single AI call for efficiency.
 * Returns an empty map on failure — never throws.
 *
 * @param articles  Array of SourceArticle to categorize
 * @param model     AI model instance from getModel()
 */
export async function categorizeArticles(
  articles: SourceArticle[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
): Promise<Map<number, { category: string; summary: string; potentialImpact: string }>> {
  const result = new Map<number, { category: string; summary: string; potentialImpact: string }>()
  if (articles.length === 0) return result

  try {
    const { object } = await generateObject({
      model,
      schema: categorizedArticleSchema,
      system: `Je bent een nieuwscategoriseerder voor TriFinity, een Nederlandse personal finance app.

Categorieen:
- fiscaal: Belastingwijzigingen, box 1/2/3, toeslagen, aftrekposten
- rente: ECB-beslissingen, spaarrente, hypotheekrentes
- woningmarkt: Huizenprijzen, NHG, huurmarkt
- beleggingen: AEX, ETF's, crypto-regulering, dividenden
- pensioen: AOW, pensioenwet, lijfrente
- macro: Inflatie, koopkracht, loongroei, werkloosheid

TriFinity-functies waarop nieuws impact kan hebben:
- Vermogen & beleggingen (netto vermogen, portefeuille, rendement, rebalancing)
- Sparen & spaarquote (spaarrente, noodfonds)
- FIRE-prognose (vrijheidsdatum, SWR, Monte Carlo, vermogenspad)
- Budget & cashflow (maanduitgaven, vaste lasten, koopkracht)
- Schulden & hypotheek (aflossing, hypotheekrente, hypotheek vs beleggen)
- Belastingen (box 3, fiscale aftrekposten, toeslagen)
- Pensioen & AOW (pensioenwet, AOW-leeftijd, lijfrente)
- Passief inkomen (dividenden, huurinkomsten)

Regels:
- Kies de MEEST passende categorie per artikel
- Schrijf een verbeterde samenvatting in 2-3 zinnen, gericht op relevantie voor Nederlandse consumenten
- De samenvatting moet in het Nederlands zijn
- Focus op: wat is het nieuws, en waarom is het relevant voor persoonlijke financien
- potentialImpact: kort en bondig, relateer aan specifieke app-functies. "Geen directe impact" als niet relevant`,
      prompt: `Categoriseer en vat de volgende ${articles.length} nieuwsartikelen samen:

${articles.map((a, i) => `[${i}] Titel: ${a.title}\nBron: ${a.sourceName}\nOriginele samenvatting: ${a.summary || '(geen)'}`).join('\n\n')}`,
    })

    for (const item of object.items) {
      result.set(item.index, { category: item.category, summary: item.summary, potentialImpact: item.potentialImpact })
    }
  } catch (err) {
    console.error(
      '[news-enrich] Categorization failed:',
      err instanceof Error ? err.message : err,
    )
  }

  return result
}
