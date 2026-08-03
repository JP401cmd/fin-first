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
