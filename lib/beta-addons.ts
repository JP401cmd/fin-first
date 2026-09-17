import { ADDON_PLANS, formatPlanPrice, type AddonPlan } from '@/lib/subscription-catalog'
import { AI_CONSENT_CLIENT_SOURCES, type AiConsentClientSource } from '@/lib/ai/consent'

/**
 * Beta-keuze voor de add-ons (ADR 0157) — het contract dat de route
 * `POST /api/beta/addon`, de popup en de onboarding delen.
 *
 * Straks zijn AI en de bankkoppeling betaalde add-ons (lib/subscription-catalog.ts).
 * Zolang de beta loopt zet de gebruiker ze zelf aan of uit. De toggle schrijft
 * dezelfde `profiles.active_subscriptions` die elke bestaande gate leest
 * (`checkTierGate`, `hasSubscription`), dus er is geen tweede toegangsbron.
 * Bij AI hoort bij "aan" altijd de toestemming uit ADR 0155: de route legt die
 * eerst vast, pas daarna gaat de add-on aan.
 *
 * Gaat de betaling live, dan zet {@link BETA_SELF_SERVE_ADDONS} de zelfbediening
 * uit: de route weigert en de oppervlakken tonen weer de gewone upsell.
 */

/**
 * Zelfbediening van de add-ons tijdens de beta. Standaard aan; uit met
 * `NEXT_PUBLIC_BETA_SELF_SERVE_ADDONS=false` (vraagt een nieuwe build, want de
 * waarde wordt in de client ingebakken). Voor een noodstop zónder deploy leest
 * de route daarnaast `app_settings.beta_addons_closed` — zie {@link BETA_ADDONS_CLOSED_SETTING}.
 */
export const BETA_SELF_SERVE_ADDONS = !['false', '0', 'off', 'no'].includes(
  (process.env.NEXT_PUBLIC_BETA_SELF_SERVE_ADDONS ?? '').trim().toLowerCase(),
)

/** `app_settings`-sleutel: waarde `'true'` sluit de beta-route direct, zonder deploy. */
export const BETA_ADDONS_CLOSED_SETTING = 'beta_addons_closed'

/** Code van de 403 als de beta-keuze gesloten is (vlag of noodstop). */
export const BETA_CLOSED_CODE = 'beta_closed'

export type BetaAddonTier = AddonPlan['tier']

export const BETA_ADDON_TIERS = ['ai', 'connected'] as const satisfies readonly BetaAddonTier[]

/** Route-pad, zodat aanroepers geen letterlijke string dragen. */
export const BETA_ADDON_ROUTE = '/api/beta/addon'

/** Waar de keuze gemaakt werd; bij AI gaat dit mee als bron van de toestemming. */
export type BetaAddonSource = AiConsentClientSource
export const BETA_ADDON_SOURCES = AI_CONSENT_CLIENT_SOURCES

export interface BetaAddonRequest {
  tier: BetaAddonTier
  active: boolean
  source: BetaAddonSource
}

export interface BetaAddonResponse {
  ok: true
  tier: BetaAddonTier
  active: boolean
  /** De add-ons ná deze keuze. */
  subscriptions: string[]
}

/** Machinecode van de 403 op een koppelpoging zonder Connected (auth-link). */
export const CONNECTED_REQUIRED_CODE = 'connected_required'
export const CONNECTED_REQUIRED_MESSAGE = 'Zet eerst de bankkoppeling aan. In de beta kies je dat zelf.'

/** Generieke fouttekst wanneer de keuze niet opgeslagen kon worden. */
export const BETA_ADDON_SAVE_ERROR = 'Je keuze is niet opgeslagen. Probeer het opnieuw.'

interface BetaAddonCopy {
  /** Titel van de popup en de onboardingstap. */
  titel: string
  /** Label van de schakelaar. */
  schakelaar: string
  /** De primaire knop in de popup. */
  bevestig: string
  /** Aan: keuze · effect · waarom. */
  aan: { effect: string; waarom: string }
  /** Uit: effect · waarom. */
  uit: { effect: string; waarom: string }
}

/**
 * Kopij per add-on. `Record` op de union: een nieuwe add-on compileert pas met
 * eigen tekst.
 */
export const BETA_ADDON_COPY: Record<BetaAddonTier, BetaAddonCopy> = {
  ai: {
    titel: 'Wil je Fin gebruiken?',
    schakelaar: 'Fin gebruiken',
    bevestig: 'AI aanzetten',
    aan: {
      effect:
        'Fin, de briefing, het nieuws en de AI-analyses gaan werken. Je financiële gegevens gaan dan — met persoonsgegevens gemaskeerd waar dat kan — naar een AI-aanbieder.',
      waarom: 'Zo kan Fin je cijfers vertalen naar vrijheidstijd en je vragen erover beantwoorden.',
    },
    uit: {
      effect:
        'Er gaat niets naar een AI-aanbieder. Overzicht, budget, toekomst, belasting en doelen werken volledig.',
      waarom: 'Je kunt AI later altijd nog aanzetten, bijvoorbeeld zodra je Fin iets wilt vragen.',
    },
  },
  connected: {
    titel: 'Wil je je bank koppelen?',
    schakelaar: 'Bankkoppeling gebruiken',
    bevestig: 'Aanzetten en verder',
    aan: {
      effect: 'Je koppelt je bank; je saldo en transacties komen daarna vanzelf binnen.',
      waarom: 'Dan hoef je niets over te typen of een bankbestand te importeren.',
    },
    uit: {
      effect: 'Je vult je uitgaven zelf in of importeert een bankbestand.',
      waarom: 'Je kunt de koppeling later altijd nog aanzetten.',
    },
  },
}

/** "Straks een abonnement, nu een keuze" — met de prijs uit de catalogus. */
export function betaAddonNotice(tier: BetaAddonTier): string {
  const plan = ADDON_PLANS.find((p) => p.tier === tier)
  const naam = tier === 'ai' ? 'AI' : 'de bankkoppeling'
  const prijs = plan ? ` van ${formatPlanPrice(plan.priceEur)} per maand` : ''
  return `Straks wordt ${naam} een abonnement${prijs}. Zolang TriFinity in beta is, kies je zelf of je het aanzet — zonder kosten.`
}

/** Voegt een add-on toe of haalt hem weg; andere entries blijven staan. */
export function nextSubscriptions(current: readonly string[], tier: BetaAddonTier, active: boolean): string[] {
  const zonder = current.filter((s) => s !== tier)
  return active ? [...zonder, tier] : zonder
}

/** `commercial_tier` blijft in sync, zoals de beheerroute doet. */
export function commercialTierFor(subs: readonly string[]): 'ai' | 'connected' | 'gratis' {
  return subs.includes('ai') ? 'ai' : subs.includes('connected') ? 'connected' : 'gratis'
}
