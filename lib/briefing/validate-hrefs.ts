// ── Href Validation ─────────────────────────────────────────
// Validates and corrects hrefs in briefing cards to prevent
// hallucinated routes from the AI.
//
// NB: het AI-DAIshboard-briefingsysteem ("Systeem B") en zijn type-bibliotheek
// (`./types`) zijn verwijderd (zie docs/briefing-analyse.md). Deze href-
// validatie blijft een herbruikbaar nut voor de levende redactie-/briefing-
// laag, dus het minimale card-shape leeft nu lokaal i.p.v. via `./types`.

/** Minimale card-vorm die href-validatie nodig heeft. Bewust losgekoppeld
 *  van het verwijderde BriefingCardSpec-union zodat dit nut zelfstandig blijft. */
interface ChecklistHrefItem {
  label: string
  href?: string
  done: boolean
}

interface HrefValidatableCard {
  type: string
  href?: string
  items?: ChecklistHrefItem[]
}

/** All valid app routes that cards may link to (nieuwe IA: Overzicht/Toekomst/Mijn) */
const VALID_ROUTES = new Set([
  '/overzicht',
  '/overzicht/bezittingen',
  '/overzicht/schulden',
  '/overzicht/budget',
  '/overzicht/budget',
  '/overzicht/budget/transacties',
  '/overzicht/budget/vaste-lasten',
  '/overzicht/budget/forecast',
  '/overzicht/belasting',
  '/overzicht/tips',
  '/toekomst',
  '/toekomst/doelen',
  '/toekomst/gebeurtenissen',
  '/toekomst/voorkeuren',
  '/toekomst/whatif',
  '/mijn',
  '/mijn/profiel',
  '/mijn/koppelingen',
  '/mijn/checkins',
  '/mijn/mijlpalen',
  '/berichten',
  '/rapportages',
])

/** Common AI hallucinations + legacy routes → correct route */
const ROUTE_ALIASES: Record<string, string> = {
  // Legacy module-routes (oude IA) → nieuwe IA
  '/core': '/overzicht',
  '/core/assets': '/overzicht/bezittingen',
  '/core/budgets': '/overzicht/budget',
  '/core/cash': '/overzicht/budget',
  '/core/debts': '/overzicht/schulden',
  '/core/belasting': '/overzicht/belasting',
  '/horizon': '/toekomst',
  '/will': '/overzicht/tips',
  '/identity': '/mijn',
  '/identity/profiel': '/mijn/profiel',
  '/identity/instellingen': '/mijn',
  '/dashboard': '/overzicht',
  // Hallucinaties
  '/core/goals': '/toekomst/doelen',
  '/core/goal': '/toekomst/doelen',
  '/will/actions': '/overzicht/tips',
  '/will/goals': '/toekomst/doelen',
  '/will/acties': '/overzicht/tips',
  '/will/doelen': '/toekomst/doelen',
  '/toekomst/scenarios': '/toekomst',
  '/toekomst/fire': '/toekomst',
  '/toekomst/simulaties': '/toekomst',
  '/horizon/scenarios': '/toekomst',
  '/horizon/fire': '/toekomst',
  '/horizon/simulaties': '/toekomst',
  '/horizon/simulatie': '/toekomst',
  '/horizon/life-events': '/toekomst/gebeurtenissen',
  '/horizon/levensgebeurtenissen': '/toekomst/gebeurtenissen',
  '/core/transactions': '/overzicht/budget/transacties',
  '/core/transacties': '/overzicht/budget/transacties',
  '/core/bank': '/overzicht/budget',
  '/core/rekeningen': '/overzicht/budget',
  '/core/schulden': '/overzicht/schulden',
  '/core/vermogen': '/overzicht/bezittingen',
  '/core/beleggingen': '/overzicht/bezittingen',
  '/core/tax': '/overzicht/belasting',
  '/identity/settings': '/toekomst/voorkeuren',
  '/identity/profile': '/mijn/profiel',
  '/settings': '/mijn',
  '/profiel': '/mijn/profiel',
}

/**
 * Validate a single href string.
 * Returns the validated/corrected href, or undefined if no match found.
 */
export function validateHref(href: string): string | undefined {
  // Normalise: trim, lowercase for comparison
  const trimmed = href.trim()
  if (!trimmed || !trimmed.startsWith('/')) return undefined

  // 1. Exact match
  if (VALID_ROUTES.has(trimmed)) return trimmed

  // 2. Alias match
  const alias = ROUTE_ALIASES[trimmed]
  if (alias) return alias

  // 3. Prefix match — e.g. /core/budgets/123 → /core/budgets
  for (const route of VALID_ROUTES) {
    if (trimmed.startsWith(route + '/')) return route
  }

  // 4. No match — remove the invalid href
  return undefined
}

/**
 * Validate all hrefs in an array of cards.
 * Invalid hrefs are corrected or removed. Generic over the concrete card type
 * zodat callers hun eigen card-vorm kunnen aanleveren zolang die `type`/`href`/
 * `items` exposeert.
 */
export function validateCardHrefs<T extends HrefValidatableCard>(cards: T[]): T[] {
  return cards.map((card) => {
    // Cards that may have href
    if ('href' in card && typeof card.href === 'string') {
      const validated = validateHref(card.href)
      if (validated !== card.href) {
        return { ...card, href: validated }
      }
    }

    // Checklist items have nested hrefs
    if (card.type === 'checklist' && card.items) {
      const updatedItems = card.items.map((item) => {
        if (item.href) {
          const validated = validateHref(item.href)
          if (validated !== item.href) {
            return { ...item, href: validated }
          }
        }
        return item
      })
      return { ...card, items: updatedItems }
    }

    return card
  })
}
