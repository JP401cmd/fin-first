/**
 * Recommendation deep-link helper — plan T-6 (Tier-3 #6):
 * "Acties one-click waar mogelijk: opzeggen-deeplinks, mutaties direct
 * in-app, externe deep-links voor wat niet in-app kan."
 *
 * Voorlopig pure derivatie uit bestaande velden (recommendation_type +
 * related_budget_slug / related_asset_id / related_debt_id) — geen
 * schema-veld nodig. Externe URL's worden later toegevoegd via een
 * action_url-column wanneer recommendations daarmee verrijkt worden.
 *
 * Returns { href, label } of null wanneer er geen contextuele
 * doorklik-locatie is voor deze recommendation.
 */

import type { Recommendation } from './recommendation-data'

export interface RecommendationDeepLink {
  href: string
  /** Korte CTA-tekst (bv. "Pas budget aan"). */
  label: string
  /** Of de URL extern is (toon dan een external-link-icoon). */
  isExternal: boolean
}

export function deepLinkForRecommendation(
  rec: Recommendation,
): RecommendationDeepLink | null {
  // Voorkeur: gerichte related_*-velden — die wijzen naar exact het
  // bezit/budget/de schuld waar de tip over gaat.
  if (rec.related_budget_slug) {
    return {
      href: `/overzicht/cashflow?budget=${encodeURIComponent(rec.related_budget_slug)}`,
      label: 'Open budget',
      isExternal: false,
    }
  }
  if (rec.related_asset_id) {
    return {
      href: `/overzicht/bezittingen#asset-${rec.related_asset_id}`,
      label: 'Open bezitting',
      isExternal: false,
    }
  }
  if (rec.related_debt_id) {
    return {
      href: `/overzicht/schulden#debt-${rec.related_debt_id}`,
      label: 'Open schuld',
      isExternal: false,
    }
  }

  // Fallback: route op recommendation_type naar de relevante hefboom-
  // verdieping. Geeft de gebruiker minimaal een logisch volgend scherm.
  switch (rec.recommendation_type) {
    case 'budget_optimization':
      return {
        href: '/overzicht/cashflow',
        label: 'Open cashflow',
        isExternal: false,
      }
    case 'asset_reallocation':
      return {
        href: '/overzicht/bezittingen',
        label: 'Open bezittingen',
        isExternal: false,
      }
    case 'debt_acceleration':
      return {
        href: '/overzicht/schulden',
        label: 'Open schulden',
        isExternal: false,
      }
    case 'income_increase':
    case 'savings_boost':
      return {
        href: '/overzicht/cashflow',
        label: 'Open cashflow',
        isExternal: false,
      }
    default:
      return null
  }
}
