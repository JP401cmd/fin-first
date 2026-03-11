// ── Href Validation ─────────────────────────────────────────
// Validates and corrects hrefs in briefing cards to prevent
// hallucinated routes from the AI.

import type { BriefingCardSpec } from './types'

/** All valid app routes that cards may link to */
const VALID_ROUTES = new Set([
  '/core',
  '/core/assets',
  '/core/budgets',
  '/core/cash',
  '/core/debts',
  '/core/belasting',
  '/horizon',
  '/will',
  '/identity',
  '/identity/profiel',
  '/identity/instellingen',
  '/berichten',
  '/rapportages',
])

/** Common AI hallucinations → correct route */
const ROUTE_ALIASES: Record<string, string> = {
  '/core/goals': '/will',
  '/core/goal': '/will',
  '/will/actions': '/will',
  '/will/goals': '/will',
  '/will/acties': '/will',
  '/will/doelen': '/will',
  '/horizon/scenarios': '/horizon',
  '/horizon/fire': '/horizon',
  '/horizon/simulaties': '/horizon',
  '/horizon/simulatie': '/horizon',
  '/horizon/life-events': '/horizon',
  '/horizon/levensgebeurtenissen': '/horizon',
  '/core/transactions': '/core/cash',
  '/core/transacties': '/core/cash',
  '/core/bank': '/core/cash',
  '/core/rekeningen': '/core/cash',
  '/core/schulden': '/core/debts',
  '/core/vermogen': '/core/assets',
  '/core/beleggingen': '/core/assets',
  '/core/tax': '/core/belasting',
  '/identity/settings': '/identity/instellingen',
  '/identity/profile': '/identity/profiel',
  '/settings': '/identity/instellingen',
  '/profiel': '/identity/profiel',
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
 * Validate all hrefs in an array of briefing cards.
 * Invalid hrefs are corrected or removed.
 */
export function validateCardHrefs(cards: BriefingCardSpec[]): BriefingCardSpec[] {
  return cards.map((card) => {
    // Cards that may have href
    if ('href' in card && typeof card.href === 'string') {
      const validated = validateHref(card.href)
      if (validated !== card.href) {
        return { ...card, href: validated } as BriefingCardSpec
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
      return { ...card, items: updatedItems } as BriefingCardSpec
    }

    return card
  })
}
