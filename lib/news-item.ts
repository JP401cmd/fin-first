// ── Het nieuwsbericht: schema en type — SINGLE SOURCE ────────────────────────
//
// Stond tot nu toe in `app/api/news/route.ts`. Verhuisd omdat er sinds de
// on-device editie DRIE consumenten zijn: het cloudpad (`streamObject` met dit
// schema), het lokale pad (de browser stelt de berichten zélf samen) en de
// persist-route die de door de client aangeleverde editie hervalideert.
//
// Een routebestand is daar de verkeerde plek voor: dat importeert de `ai`-SDK en
// de service-client en is dus server-only, terwijl de client-bundel dit type nodig
// heeft. Deze module is PUUR (alleen zod) en past aan beide kanten.
//
// `app/api/news/route.ts` her-exporteert `NewsItem` zodat bestaande importeurs
// (`components/berichten/*`) ongewijzigd blijven werken.

import { z } from 'zod'

/** De zes nieuwscategorieën. */
export const NEWS_CATEGORIES = [
  'fiscaal',
  'rente',
  'woningmarkt',
  'beleggingen',
  'pensioen',
  'macro',
] as const

export type NewsCategory = (typeof NEWS_CATEGORIES)[number]

export const newsItemSchema = z.object({
  id: z.string().describe('Uniek ID voor het nieuwsitem (bijv. news-2026-03-07-1)'),
  headline: z.string().describe('Korte, pakkende kop in het Nederlands'),
  summary: z.string().describe('Samenvatting van het nieuws in 2-3 zinnen'),
  impactType: z.enum(['direct', 'relevant']).describe('"direct" = concrete, berekenbare impact op de financiele situatie van de gebruiker. "relevant" = financieel relevant nieuws zonder concrete berekenbare impact, maar wel waardevol om te weten.'),
  personalImpact: z.string().describe('Bij impactType "direct": concrete impact met specifieke euro-bedragen of vrijheidstijd gebaseerd op het profiel. Bij impactType "relevant": korte uitleg waarom dit nieuwsitem relevant is voor de financiele situatie van de gebruiker, zonder concrete bedragen.'),
  // NB: geen .int()/.min()/.max() — Anthropic structured output ondersteunt
  // geen minimum/maximum in het JSON-schema, en Zod v4 voegt die bij .int()
  // zelf toe (safe-integer-grenzen) → 400 invalid_request_error. Range en
  // afronding worden afgedwongen via de prompt + server-side clamp.
  impactScore: z.number().describe('Impactscore: geheel getal van 1 t/m 5 — hoe groot is de impact/relevantie voor deze gebruiker? 5 = grote concrete impact, 1 = achtergrond.'),
  impactDirection: z.enum(['positief', 'negatief', 'neutraal']).describe('Richting van de impact voor de gebruiker: "positief" (bespaart geld of versnelt vrijheid), "negatief" (kost geld of vertraagt vrijheid) of "neutraal".'),
  deadline: z.string().optional().describe('Alleen invullen als er een concrete datum (YYYY-MM-DD) is waarvoor de gebruiker iets kan of moet doen.'),
  category: z.enum(NEWS_CATEGORIES).describe('Nieuwscategorie'),
  date: z.string().describe('Datum van het nieuws in YYYY-MM-DD formaat'),
  sourceContext: z.string().optional().describe('Broncontext of toelichting (bijv. "Belastingplan 2026", "ECB persconferentie")'),
  sourceUrl: z.string().optional().describe('Directe URL naar het bronartikel waarop dit nieuwsitem gebaseerd is — LETTERLIJK overgenomen uit de aangeleverde bronnen'),
  sourceName: z.string().optional().describe('Naam van de bron (bijv. "Belastingdienst", "Rijksoverheid", "ECB")'),
})

export type NewsItem = z.infer<typeof newsItemSchema>

/**
 * Klem een impactscore op het 1-5-bereik. Gedeeld door beide paden: het cloudpad
 * past 'm toe op de streamende modeluitvoer, het lokale pad server-side bij het
 * persisteren van de door de client aangeleverde editie.
 */
export function clampNewsImpactScore(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 3
  return Math.min(5, Math.max(1, Math.round(raw)))
}

// ── De gedegradeerde editie: bronkoppen + links ──────────────────────────────

/** Hoogstens zoveel bronkoppen in een gedegradeerde editie — gelijk aan de bovengrens van een gewone editie. */
export const BRONKOPPEN_EDITIE_MAX = 8

/** Wat `bronkoppenEditie` van een bronartikel nodig heeft — structureel, zodat deze module puur blijft. */
export interface Bronartikel {
  id: string
  title: string
  source_url: string
  source_name: string
  category: string | null
  published_at: string | null
}

/** Het id-voorvoegsel van een bronkop-bericht; maakt in de leesstatus herkenbaar dat het een degradatie was. */
export const BRONKOP_ITEM_PREFIX = 'news-bron-'

function isNewsCategory(waarde: string | null): waarde is NewsCategory {
  return waarde !== null && (NEWS_CATEGORIES as readonly string[]).includes(waarde)
}

/**
 * Bouw een editie uit louter BRONKOPPEN: kop + link, zonder samenvatting en
 * zonder impactregel. Volledig deterministisch — er komt geen model aan te pas.
 *
 * AANLEIDING (24-25 sep 2026). Het AI-tegoed liep leeg. `loadNewsSourceArticles`
 * leverde gewoon zijn bronartikelen, maar de generatie viel om, en de lezer
 * kreeg een lege Krant met "Nieuws kon niet worden gegenereerd" — terwijl er
 * 96 bruikbare artikelen in de bak stonden. De bronlaag hield stand; alleen de
 * verrijking ontbrak.
 *
 * DIT IS HET BESTAANDE B26-PATROON, één laag hoger. De duidingspoort kent al de
 * uitkomst "geduid, maar zonder samenvatting": de lezer krijgt dan de bronkop
 * met de link, en dat is een GELDIGE uitkomst, geen storing (ADR 0176, B26/B27).
 * Hier geldt hetzelfde — met dit verschil dat de degradatie niet per artikel
 * maar voor de hele editie geldt.
 *
 * WAT ER BEWUST NIET IN STAAT: geen `summary`, geen `personalImpact`. Beide
 * zouden een bewering zijn die niemand heeft gedaan en die niet op de bron te
 * gronden is. Leeg is hier het eerlijke antwoord; de lezerscomponenten laten
 * een leeg blok weg. Om diezelfde reden `impactType: 'relevant'` en
 * `impactScore: 1`: "direct" claimt berekende impact, en een hogere score
 * claimt een weging die niemand heeft gemaakt.
 *
 * De rubriek komt uit de opgeslagen `category` van de ingest. Staat die er niet
 * (of is het geen bekende rubriek), dan wordt het 'macro' — de minst
 * beweerende bak, en de enige eerlijke keuze zolang het schema een rubriek eist.
 */
export function bronkoppenEditie(
  artikelen: readonly Bronartikel[],
  opties: { max?: number; vandaag?: string } = {},
): NewsItem[] {
  const max = Math.max(0, opties.max ?? BRONKOPPEN_EDITIE_MAX)
  const vandaag = opties.vandaag ?? new Date().toISOString().slice(0, 10)
  return artikelen
    .filter((a) => a.title.trim().length > 0)
    .slice(0, max)
    .map((a) => ({
      id: `${BRONKOP_ITEM_PREFIX}${a.id}`,
      headline: a.title,
      summary: '',
      impactType: 'relevant' as const,
      personalImpact: '',
      impactScore: 1,
      impactDirection: 'neutraal' as const,
      category: isNewsCategory(a.category) ? a.category : 'macro',
      date: a.published_at?.slice(0, 10) || vandaag,
      sourceUrl: a.source_url,
      sourceName: a.source_name,
    }))
}

/**
 * Sorteer een editie zoals de gebruiker 'm hoort te zien: direct-impact eerst,
 * daarbinnen de hoogste impactScore bovenaan. Muteert de invoer niet.
 */
export function sortNewsItems<T extends Pick<NewsItem, 'impactType' | 'impactScore'>>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.impactType === 'direct' && b.impactType !== 'direct') return -1
    if (a.impactType !== 'direct' && b.impactType === 'direct') return 1
    return (b.impactScore ?? 0) - (a.impactScore ?? 0)
  })
}
