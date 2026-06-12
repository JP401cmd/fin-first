/**
 * Rule-based transaction categorizer.
 * Matches Dutch transaction descriptions to budget categories using keywords.
 * Uses budget slugs for stable matching (not display names).
 *
 * Priority order:
 *   0. Own-account transfer detection
 *   1. User corrections (category_corrections table) — confidence 1.0
 *   2. Frequency-based matching (historical transactions) — confidence 0.6–0.95
 *   3. Keyword rules (static) — confidence 0.7–1.0
 *   4. AI categorization (external)
 *
 * AI-ready: the function interface allows a future categorizeWithAI() fallback
 * via a Supabase Edge Function.
 */

import type { Budget } from '@/lib/budget-data'
import { BUDGET_SLUGS } from '@/lib/budget-data'
import { normalizeCounterparty } from '@/lib/parsers/counterparty-normalize'

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
  match_field: 'counterparty_name' | 'description' | 'counterparty_iban'
  match_value: string
  /** Null wanneer het doelbudget is verwijderd (FK ON DELETE SET NULL) — de regel is dan inert. */
  budget_id: string | null
}

/**
 * A frequency-based match result from historical transaction data.
 * Key is lowercase counterparty_name or counterparty_iban.
 */
export type FrequencyMatch = {
  budget_id: string
  count: number
  total: number
  confidence: number
}

/**
 * Build a frequency map from the user's historical transactions.
 * Groups transactions by counterparty_name and counterparty_iban,
 * finding the most-used budget_id for each counterparty.
 *
 * Returns a Map keyed by lowercase counterparty identifier → FrequencyMatch.
 * Only includes entries with 3+ matches and confidence >= 0.6.
 *
 * @param userId - The authenticated user's ID
 * @param supabase - Supabase client instance (browser or server)
 */
export async function buildFrequencyMap(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Map<string, FrequencyMatch>> {
  const map = new Map<string, FrequencyMatch>()

  // Query all transactions with a budget_id, grouped by counterparty + budget
  // We fetch raw data and aggregate in JS to avoid RPC dependency
  const { data, error } = await supabase
    .from('transactions')
    .select('counterparty_name, counterparty_iban, budget_id')
    .eq('user_id', userId)
    .not('budget_id', 'is', null)
    .not('counterparty_name', 'is', null)

  if (error || !data) return map

  // Aggregate: counterparty → { budget_id → count }
  const byName = new Map<string, Map<string, number>>()
  const byIban = new Map<string, Map<string, number>>()

  for (const row of data as { counterparty_name: string | null; counterparty_iban: string | null; budget_id: string }[]) {
    if (row.counterparty_name) {
      // Genormaliseerd (PSP-/terminal-ruis gestript) zodat varianten van dezelfde
      // tegenpartij ("CCV*BAKKER 12", "Bakker") op één frequentie-key landen.
      const key = normalizeCounterparty(row.counterparty_name)
      if (key && !byName.has(key)) byName.set(key, new Map())
      const counts = byName.get(key)!
      counts.set(row.budget_id, (counts.get(row.budget_id) ?? 0) + 1)
    }
    if (row.counterparty_iban) {
      const key = row.counterparty_iban.replace(/\s/g, '').toUpperCase()
      if (!byIban.has(key)) byIban.set(key, new Map())
      const counts = byIban.get(key)!
      counts.set(row.budget_id, (counts.get(row.budget_id) ?? 0) + 1)
    }
  }

  // For each counterparty, find the budget with the highest count
  function addBestMatch(source: Map<string, Map<string, number>>, prefix: string) {
    for (const [key, counts] of source) {
      let bestBudgetId = ''
      let bestCount = 0
      let total = 0
      for (const [budgetId, count] of counts) {
        total += count
        if (count > bestCount) {
          bestCount = count
          bestBudgetId = budgetId
        }
      }
      // Require at least 3 matches
      if (bestCount < 3) continue
      const confidence = Math.min(0.95, Math.max(0.6, bestCount / total))
      const mapKey = prefix + key
      map.set(mapKey, { budget_id: bestBudgetId, count: bestCount, total, confidence })
    }
  }

  addBestMatch(byName, 'name:')
  addBestMatch(byIban, 'iban:')

  return map
}

/**
 * Look up a single transaction in the pre-built frequency map.
 *
 * IBAN-eerst: een IBAN is een sterker, eenduidiger signaal dan een (mogelijk
 * door ruis vervuilde) naam — net als de correctie-laag (priority 1) die ook
 * IBAN vóór naam probeert. De naam-key wordt op dezelfde manier genormaliseerd
 * als bij het bouwen van de map (PSP-/terminal-ruis gestript).
 */
export function frequencyMatch(
  counterpartyName: string | null,
  counterpartyIban: string | null,
  frequencyMap: Map<string, FrequencyMatch>,
): FrequencyMatch | null {
  if (counterpartyIban) {
    const match = frequencyMap.get('iban:' + counterpartyIban.replace(/\s/g, '').toUpperCase())
    if (match) return match
  }
  if (counterpartyName) {
    const key = normalizeCounterparty(counterpartyName)
    if (key) {
      const match = frequencyMap.get('name:' + key)
      if (match) return match
    }
  }
  return null
}

/**
 * Detect whether a transaction is a transfer between own accounts.
 *
 * Twee signalen:
 *  1. tegenrekening-IBAN staat in de eigen-IBAN-set (bank_accounts + user_own_ibans);
 *  2. tegenpartij-naam bevat een geregistreerd naam-patroon — voor eigen rekeningen
 *     zonder bruikbare IBAN (bv. PayPal, een broker of exchange die op de bankafschrift
 *     met een naam i.p.v. je eigen IBAN verschijnt).
 *
 * @param counterpartyIban - IBAN van de tegenpartij
 * @param ownIbans - Set van alle eigen IBANs (genormaliseerd: geen spaties, uppercase)
 * @param counterpartyName - naam van de tegenpartij (optioneel)
 * @param ownNamePatterns - lowercase naam-patronen die een eigen rekening aanduiden (optioneel)
 */
export function isOwnAccountTransfer(
  counterpartyIban: string | null,
  ownIbans: Set<string>,
  counterpartyName?: string | null,
  ownNamePatterns?: string[],
): boolean {
  if (counterpartyIban && ownIbans.has(counterpartyIban.replace(/\s/g, '').toUpperCase())) {
    return true
  }
  if (counterpartyName && ownNamePatterns && ownNamePatterns.length > 0) {
    const name = counterpartyName.toLowerCase()
    if (ownNamePatterns.some((p) => p && name.includes(p))) return true
  }
  return false
}

/**
 * Detecteer een eigen-rekening-verschuiving op basis van het bron-specifieke
 * transactietype (bv. PayPal-kolom "Type"). Gebruikt voor rekeningen zonder
 * bruikbare IBAN: een opwaardeer/opname-regel is een overboeking naar/van een
 * gekoppelde bankrekening, geen echte uitgave/inkomen.
 */
export function isWalletTransferType(
  sourceType: string | null | undefined,
  transferTypeValues?: string[],
): boolean {
  if (!sourceType || !transferTypeValues || transferTypeValues.length === 0) return false
  const s = sourceType.trim().toLowerCase()
  return transferTypeValues.some((v) => v.trim().toLowerCase() === s)
}

/**
 * Categorize a transaction based on its description and counterparty.
 * Priority 0: own-account transfer detection (when ownIbans + counterpartyIban provided).
 * Priority 1: user corrections (category_corrections) — confidence 1.0
 * Priority 2: frequency-based matching (historical transactions) — confidence 0.6–0.95
 * Priority 3: keyword rules (static) — confidence 0.7–1.0
 *
 * @returns budget_id, confidence, budgetName, category_source, and optional isTransfer flag.
 */
export function categorizeTransaction(
  description: string,
  counterparty: string | null,
  amount: number,
  budgets: Budget[],
  corrections?: CategoryCorrection[],
  ownIbans?: Set<string>,
  counterpartyIban?: string | null,
  freqMap?: Map<string, FrequencyMatch>,
  ownNamePatterns?: string[],
): { budget_id: string | null; confidence: number; budgetName: string | null; isTransfer?: boolean; category_source?: string } {
  // Priority 0: own-account transfer detection (IBAN-set of naam-patroon)
  if (
    (ownIbans || ownNamePatterns) &&
    isOwnAccountTransfer(counterpartyIban ?? null, ownIbans ?? new Set<string>(), counterparty, ownNamePatterns)
  ) {
    return { budget_id: null, confidence: 1.0, budgetName: null, isTransfer: true, category_source: 'transfer' }
  }

  // Tegenpartij genormaliseerd (PSP-/terminal-ruis weg) zodat keyword-regels op
  // de schone merchantnaam matchen; de beschrijving blijft ruw (bevat juist de
  // trefwoord-rijke vrije tekst). Beide lowercase voor de substring-vergelijking.
  const searchText = `${description.toLowerCase()} ${normalizeCounterparty(counterparty)}`
  const isIncome = amount > 0

  // Build a slug-to-budget map and id-to-budget map
  const slugMap = new Map<string, Budget>()
  const idMap = new Map<string, Budget>()
  for (const b of budgets) {
    if (b.slug) slugMap.set(b.slug, b)
    if (b.id) idMap.set(b.id, b)
  }

  // Priority 1: Check user corrections
  // Sub-priority: IBAN (most reliable) → counterparty_name → description
  // Regels zonder doelbudget (budget_id null na budget-verwijdering) zijn inert:
  // overslaan zodat de categorisatie doorvalt naar frequentie/keywords.
  const activeCorrections = (corrections ?? []).filter(
    (c): c is CategoryCorrection & { budget_id: string } => c.budget_id !== null,
  )
  if (activeCorrections.length > 0) {
    // 1a: IBAN corrections first (highest reliability)
    if (counterpartyIban) {
      const normalizedIban = counterpartyIban.replace(/\s/g, '').toUpperCase()
      for (const c of activeCorrections) {
        if (c.match_field === 'counterparty_iban' && c.match_value.replace(/\s/g, '').toUpperCase() === normalizedIban) {
          const budget = idMap.get(c.budget_id)
          return { budget_id: c.budget_id, confidence: 1.0, budgetName: budget?.name ?? null, category_source: 'manual' }
        }
      }
    }
    // 1b: counterparty_name and description corrections
    for (const c of activeCorrections) {
      const needle = c.match_value.toLowerCase()
      if (c.match_field === 'counterparty_name' && counterparty && counterparty.toLowerCase() === needle) {
        const budget = idMap.get(c.budget_id)
        return { budget_id: c.budget_id, confidence: 1.0, budgetName: budget?.name ?? null, category_source: 'manual' }
      }
      if (c.match_field === 'description' && description.toLowerCase().includes(needle)) {
        const budget = idMap.get(c.budget_id)
        return { budget_id: c.budget_id, confidence: 0.95, budgetName: budget?.name ?? null, category_source: 'manual' }
      }
    }
  }

  // Priority 2: Frequency-based matching (learned from historical transactions)
  if (freqMap && freqMap.size > 0) {
    const freqResult = frequencyMatch(counterparty, counterpartyIban ?? null, freqMap)
    if (freqResult) {
      const budget = idMap.get(freqResult.budget_id)
      if (budget) {
        return {
          budget_id: freqResult.budget_id,
          confidence: freqResult.confidence,
          budgetName: budget.name ?? null,
          category_source: 'rule',
        }
      }
      // Stille fallthrough zichtbaar maken: een frequentie-hit waarvan het
      // budget niet in de aangeleverde set zit wijst vrijwel altijd op een
      // caller die een boom i.p.v. een platte lijst doorgaf (deelbudgetten
      // ontbreken dan) — zie de salaris-bug van jun 2026.
      console.warn(
        '[categorize] frequentie-match genegeerd: budget_id niet in aangeleverde budgets-set',
        freqResult.budget_id,
      )
    }
  }

  // Priority 3: Rule-based matching (static keyword rules)
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
  if (!budget) {
    // Zelfde klasse als hierboven: keyword-hit maar de slug ontbreekt in de
    // aangeleverde budgets-set (boom-i.p.v.-flat, of custom slug zonder
    // template-equivalent). Loggen i.p.v. stil degraderen.
    console.warn(
      '[categorize] keyword-match genegeerd: slug niet in aangeleverde budgets-set',
      bestMatch.budgetSlug,
    )
  }

  return {
    budget_id: budget?.id ?? null,
    confidence: budget ? bestMatch.confidence : 0,
    budgetName: budget?.name ?? null,
    category_source: 'rule',
  }
}
