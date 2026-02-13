/**
 * Rule-based transaction categorizer.
 * Matches Dutch transaction descriptions to budget categories using keywords.
 * Uses budget slugs for stable matching (not display names).
 *
 * AI-ready: the function interface allows a future categorizeWithAI() fallback
 * via a Supabase Edge Function.
 */

import type { Budget } from '@/lib/budget-data'
import { BUDGET_SLUGS } from '@/lib/budget-data'

type CategoryRule = {
  keywords: string[]
  budgetSlug: string
  confidence: number
}

const S = BUDGET_SLUGS

const INCOME_SLUGS: Set<string> = new Set([
  S.SALARIS_UITKERING,
  S.TOESLAGEN_KINDERBIJSLAG,
  S.TERUGGAVE_BELASTING,
  S.OVERIGE_INKOMSTEN,
])

const RULES: CategoryRule[] = [
  // Inkomen
  { keywords: ['salaris', 'loon', 'salary', 'netto loon', 'werkgever'], budgetSlug: S.SALARIS_UITKERING, confidence: 1.0 },
  { keywords: ['toeslag', 'kinderbijslag', 'svb', 'huurtoeslag', 'zorgtoeslag'], budgetSlug: S.TOESLAGEN_KINDERBIJSLAG, confidence: 1.0 },
  { keywords: ['belastingdienst teruggave', 'teruggaaf', 'voorlopige teruggave'], budgetSlug: S.TERUGGAVE_BELASTING, confidence: 0.9 },

  // Vaste lasten wonen & energie
  { keywords: ['huur', 'hypotheek', 'woningcorporatie', 'woonlasten'], budgetSlug: S.HUUR_HYPOTHEEK, confidence: 1.0 },
  { keywords: ['eneco', 'vattenfall', 'essent', 'greenchoice', 'budget energie', 'energiedirect', 'vitens', 'waterbedrijf', 'gas water licht'], budgetSlug: S.GAS_WATER_LICHT, confidence: 1.0 },
  { keywords: ['zilveren kruis', 'cz', 'vgz', 'menzis', 'ohra', 'unive', 'centraal beheer', 'interpolis', 'nationale nederlanden', 'nn '], budgetSlug: S.VERZEKERINGEN_WONEN, confidence: 0.9 },
  { keywords: ['gemeente', 'ozb', 'afvalstoffenheffing', 'rioolheffing', 'waterschapsbelasting', 'waterschap'], budgetSlug: S.GEMEENTELIJKE_LASTEN, confidence: 1.0 },

  // Dagelijkse uitgaven
  { keywords: ['albert heijn', 'jumbo', 'lidl', 'aldi', 'plus', 'dirk', 'ah ', 'ah to go', 'coop', 'spar', 'deen', 'hoogvliet', 'vomar', 'nettorama', 'picnic'], budgetSlug: S.BOODSCHAPPEN, confidence: 1.0 },
  { keywords: ['action', 'hema', 'kruidvat', 'etos', 'trekpleister', 'da drogist', 'blokker'], budgetSlug: S.HUISHOUDEN_VERZORGING, confidence: 0.8 },
  { keywords: ['kinderopvang', 'bso', 'school', 'oudervereniging', 'schoolfoto', 'studiekosten'], budgetSlug: S.KINDEREN_SCHOOL, confidence: 0.9 },
  { keywords: ['apotheek', 'huisarts', 'tandarts', 'ziekenhuis', 'fysiotherapie', 'eigen risico', 'medicijnen'], budgetSlug: S.MEDISCHE_KOSTEN, confidence: 0.9 },

  // Vervoer
  { keywords: ['shell', 'bp', 'esso', 'tinq', 'total', 'fastned', 'ionity', 'allego', 'ns.nl', 'ns reizigers', 'ov-chipkaart', 'gvb', 'ret', 'htm', 'connexxion', 'arriva', 'qbuzz', '9292'], budgetSlug: S.BRANDSTOF_OV, confidence: 1.0 },
  { keywords: ['wegenbelasting', 'rdw', 'autoverzekering', 'lease', 'anwb'], budgetSlug: S.AUTO_VASTE_LASTEN, confidence: 0.9 },
  { keywords: ['apk', 'garage', 'kwik-fit', 'euromaster', 'parkeren', 'q-park', 'p1', 'parkmobile', 'yellowbrick'], budgetSlug: S.AUTO_ONDERHOUD, confidence: 0.8 },
  { keywords: ['swapfiets', 'go sharing', 'felyx', 'check', 'tier', 'donkey republic'], budgetSlug: S.FIETS_DEELVERVOER, confidence: 0.8 },

  // Leuke dingen & lifestyle
  { keywords: ['thuisbezorgd', 'uber eats', 'deliveroo', 'dominos', 'pizza', 'mcdonalds', 'burger king', 'kfc', 'subway', 'starbucks', 'restaurant', 'eetcafe', 'cafe', 'bar ', 'bistro'], budgetSlug: S.UIT_ETEN_HORECA, confidence: 0.9 },
  { keywords: ['netflix', 'spotify', 'disney', 'videoland', 'hbo', 'prime video', 'bioscoop', 'pathe', 'vue', 'sportschool', 'basic-fit', 'fit for free', 'anytime fitness', 'zwembad'], budgetSlug: S.VRIJE_TIJD_SPORT, confidence: 0.9 },
  { keywords: ['booking.com', 'airbnb', 'hotel', 'camping', 'vliegticket', 'transavia', 'klm', 'ryanair', 'easyjet', 'corendon', 'tui'], budgetSlug: S.VAKANTIE, confidence: 0.9 },
  { keywords: ['h&m', 'zara', 'primark', 'c&a', 'uniqlo', 'wehkamp', 'zalando', 'bol.com', 'coolblue', 'mediamarkt'], budgetSlug: S.KLEDING_OVERIGE, confidence: 0.7 },

  // Sparen, schulden & buffer
  { keywords: ['spaarrekening', 'deposito', 'noodfonds', 'reserve'], budgetSlug: S.SPAREN_NOODBUFFER, confidence: 0.8 },
  { keywords: ['degiro', 'meesman', 'brand new day', 'binck', 'flatex', 'pensioen', 'indexfonds'], budgetSlug: S.INVESTEREN_FIRE, confidence: 0.9 },
  { keywords: ['aflossing', 'lening', 'krediet', 'schuld', 'financiering'], budgetSlug: S.SCHULDEN_AFLOSSINGEN, confidence: 0.8 },
  { keywords: ['extra aflossing hypotheek', 'hypotheek extra'], budgetSlug: S.EXTRA_AFLOSSING_HYPOTHEEK, confidence: 0.9 },
]

/**
 * A user correction that overrides rule-based categorization.
 * Loaded from the `category_corrections` table during import.
 */
export type CategoryCorrection = {
  match_field: 'counterparty_name' | 'description'
  match_value: string
  budget_id: string
}

/**
 * Categorize a transaction based on its description and counterparty.
 * Checks user corrections first (highest priority), then falls back to rules.
 *
 * @returns budget_id and confidence, or null if no match found.
 */
export function categorizeTransaction(
  description: string,
  counterparty: string | null,
  amount: number,
  budgets: Budget[],
  corrections?: CategoryCorrection[],
): { budget_id: string | null; confidence: number; budgetName: string | null } {
  const searchText = `${description} ${counterparty ?? ''}`.toLowerCase()
  const isIncome = amount > 0

  // Build a slug-to-budget map and id-to-budget map
  const slugMap = new Map<string, Budget>()
  const idMap = new Map<string, Budget>()
  for (const b of budgets) {
    if (b.slug) slugMap.set(b.slug, b)
    if (b.id) idMap.set(b.id, b)
  }

  // Priority 1: Check user corrections (exact match on counterparty or description)
  if (corrections && corrections.length > 0) {
    for (const c of corrections) {
      const needle = c.match_value.toLowerCase()
      if (c.match_field === 'counterparty_name' && counterparty && counterparty.toLowerCase() === needle) {
        const budget = idMap.get(c.budget_id)
        return { budget_id: c.budget_id, confidence: 1.0, budgetName: budget?.name ?? null }
      }
      if (c.match_field === 'description' && description.toLowerCase().includes(needle)) {
        const budget = idMap.get(c.budget_id)
        return { budget_id: c.budget_id, confidence: 0.95, budgetName: budget?.name ?? null }
      }
    }
  }

  // Priority 2: Rule-based matching
  let bestMatch: { budgetSlug: string; confidence: number } | null = null

  for (const rule of RULES) {
    // Skip income rules for expenses and vice versa
    const ruleIsIncome = INCOME_SLUGS.has(rule.budgetSlug)
    if (isIncome && !ruleIsIncome) continue
    if (!isIncome && ruleIsIncome) continue

    for (const keyword of rule.keywords) {
      if (searchText.includes(keyword)) {
        if (!bestMatch || rule.confidence > bestMatch.confidence) {
          bestMatch = { budgetSlug: rule.budgetSlug, confidence: rule.confidence }
        }
        break
      }
    }
  }

  if (!bestMatch) {
    return { budget_id: null, confidence: 0, budgetName: null }
  }

  const budget = slugMap.get(bestMatch.budgetSlug)

  return {
    budget_id: budget?.id ?? null,
    confidence: budget ? bestMatch.confidence : 0,
    budgetName: budget?.name ?? null,
  }
}
