import {
  UNIFIED_FEATURES,
  hasSubscription,
  type CommercialTier,
  type UnifiedFeature,
  type ActiveSubscriptions,
} from '@/lib/feature-registry'

/**
 * Abonnementscatalogus — single source of truth voor de verkoopbare add-ons.
 *
 * Het freemium-model: de basis ('gratis') is voor iedereen gratis; daarnaast
 * zijn er twee onafhankelijke add-ons (NIET hiërarchisch) die je los kunt
 * afnemen. Welke features een add-on ontgrendelt leeft al in de
 * feature-registry (`requiredTier`) — deze catalogus voegt alleen de
 * commerciële laag toe (naam, prijs, beschikbaarheid).
 *
 * UI-first fase: `available` staat op `false` zolang de Polar-checkout nog
 * niet live is. De account-pagina toont dan een "Binnenkort"-toelichting in
 * plaats van een echte afreken-flow. Zodra Polar is aangesloten:
 *   1. zet `available: true` voor de betreffende add-on, en
 *   2. vul `polarSlug` zodat de checkout-redirect de juiste product kiest.
 */

export interface AddonPlan {
  /** Mapt 1-op-1 op de CommercialTier in de feature-registry. */
  tier: Exclude<CommercialTier, 'gratis'>
  /** Korte naam zoals getoond op de kaart. */
  name: string
  /** Eén-regel propositie. */
  tagline: string
  /** Maandprijs in hele euro's. */
  priceEur: number
  /** True zodra de add-on daadwerkelijk afgerekend kan worden (Polar live). */
  available: boolean
  /** Polar product-slug — pas invullen wanneer betaling live gaat. */
  polarSlug?: string
}

export const ADDON_PLANS: AddonPlan[] = [
  {
    tier: 'ai',
    name: 'AI',
    tagline: 'Fin als persoonlijke financiële coach — analyse, aanbevelingen, briefing en nieuws op maat.',
    priceEur: 9, // Conform de landingspagina (Pro = €9/mnd).
    available: false,
  },
  {
    tier: 'connected',
    name: 'Connected',
    tagline: 'Automatische bankkoppeling: transacties stromen binnen, saldo blijft realtime actueel.',
    priceEur: 4, // TODO prijs bevestigen vóór go-live van betaling.
    available: false,
  },
]

/** De features (uit de registry) die een specifieke add-on ontgrendelt. */
export function featuresForTier(tier: CommercialTier): UnifiedFeature[] {
  return UNIFIED_FEATURES.filter((f) => f.requiredTier === tier)
}

/** Is deze add-on actief voor de gegeven set abonnementen? */
export function isAddonActive(active: ActiveSubscriptions, plan: AddonPlan): boolean {
  return hasSubscription(active, plan.tier)
}

/** Prijs als nl-NL valuta-string, bv. "€ 9". */
export function formatPlanPrice(priceEur: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(priceEur)
}
