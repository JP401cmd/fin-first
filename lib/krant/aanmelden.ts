// ── Aanmelden en onboarding voor de Krant (Krant 2C, ADR 0192) ───────────────
//
// De server-kant van de Krant-ingang. Drie beslissingen, elk een pure functie
// met de bèta-stand als ARGUMENT (zodat de tests beide vlagstanden toetsen)
// plus een dunne lezer die de stand uit de constante haalt:
//
//   1. krantPresetToegestaan — mag de auth-callback de Krant-preset zetten?
//      Alleen voor een VERS account (onboarding_completed = false) en alleen
//      binnen de tijdlijn-bèta. Anders gewone onboarding, geen preset.
//   2. krantOnboardingNodig — hoort dit account in /onboarding/krant? Een
//      Krant-account waarvoor /nieuws de tijdlijn is (bepaalKrantBron). Voor
//      iedereen anders is de Krant-onboarding er niet: de gewone route.
//   3. krantOnboardingToegang — de toegang van /onboarding/krant, de
//      profielroute en de klaar-route in één lezing van de eigen rij.
//
// Achter de gesloten vlag: zolang TIJDLIJN_BETA_OPEN false is, geeft (1) en
// (2) alleen voor een superadmin `true`. Er is geen tweede vlag: dit bestand
// leest de bestaande poort (`inTijdlijnBeta`) en staat daarom op de
// importeurs-allowlist in lib/krant/tijdlijn-beta.gate.test.ts.
//
// Geen AI: niets hier roept een model aan of importeert uit lib/ai
// (bron-scan in lib/krant/aanmelden.geen-ai.test.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { PRODUCTS, isNewsOnly, resolveActiveModules, type Product } from '@/lib/modules/resolve'
import { zetProductPreset } from '@/lib/modules/product-preset'
import { SAFE_REDIRECT_FALLBACK } from '@/lib/safe-redirect'
import { GEWONE_ONBOARDING_PAD, KRANT_ONBOARDING_PAD, isKrantOnboardingPad } from './aanmelden-pad'
import { bepaalKrantBron, leestTijdlijn } from './tijdlijn-bron'
import { inTijdlijnBeta } from './tijdlijn-beta'

/** De `product`-parameter, gevalideerd op de enum; alles anders is null. */
export function productUitParam(ruw: string | null | undefined): Product | null {
  return (PRODUCTS as readonly string[]).includes(ruw ?? '') ? (ruw as Product) : null
}

/** (1) De pure beslissing van de callback. */
export function krantPresetToegestaan({ onboardingCompleted, inBeta }: { onboardingCompleted: boolean; inBeta: boolean }): boolean {
  return !onboardingCompleted && inBeta
}

/** (2) De pure beslissing: hoort dit account in de Krant-onboarding? Volgt bepaalKrantBron. */
export function krantOnboardingNodig({ krantAccount, inBeta }: { krantAccount: boolean; inBeta: boolean }): boolean {
  if (!krantAccount) return false
  return leestTijdlijn(bepaalKrantBron({ krantAccount, variant: null, inBeta, aiToegestaan: false }))
}

/** De profielvelden die deze beslissingen lezen — own-row, expliciete kolommen. */
export interface AanmeldProfiel {
  role?: string | null
  active_modules?: unknown
  onboarding_completed?: boolean | null
  /** Beheerblokkade: een geblokkeerd account krijgt nergens toegang (security-run 0.92.28, 🟡-1 — gelijk aan vereisBearer). */
  blocked_at?: string | null
}

/**
 * Is dit account geblokkeerd? Leest de eigen rij met de sessie-client. Een leesfout telt als geblokkeerd
 * (fail-closed): de cookie-routes van de Krant weigeren dan net als `vereisBearer` in de native API.
 */
export async function isGeblokkeerd(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('blocked_at').eq('id', userId).maybeSingle()
  if (error || !data) return true
  return data.blocked_at != null
}

/**
 * Welke onboarding hoort bij dit profiel? Voor de layout-omleidingen (app-shell
 * én /onboarding). Een Krant-account binnen de bèta → /onboarding/krant, al het
 * andere → /onboarding. Bewust dezelfde toets als de toegang van de
 * Krant-onboarding zelf: zo kan een omleiding nooit een lus worden.
 */
export function onboardingPadVoor(profiel: AanmeldProfiel | null | undefined): string {
  // Een geblokkeerd account nooit naar de Krant-onboarding: die weigert hem
  // (`krantOnboardingToegangVoor` → 'geen'), anders ontstaat een lus met de
  // /onboarding-layout (hertoets security 0.92.28). De (app)-layout logt hem uit.
  if (profiel?.blocked_at != null) return GEWONE_ONBOARDING_PAD
  const krantAccount = isNewsOnly(resolveActiveModules(profiel))
  return krantOnboardingNodig({ krantAccount, inBeta: inTijdlijnBeta(profiel?.role ?? null) })
    ? KRANT_ONBOARDING_PAD
    : GEWONE_ONBOARDING_PAD
}

/**
 * Waar de callback na een geslaagde aanmelding heen stuurt. Wees de callback
 * de preset af (bestaand account, buiten de bèta, fout), dan is
 * /onboarding/krant niet de juiste bestemming: dan de gewone home-landing, die
 * de middleware naar het homescherm vertaalt (en de app-layout een niet-
 * afgeronde onboarding naar /onboarding).
 */
export function callbackBestemming(next: string, presetGezet: boolean): string {
  return isKrantOnboardingPad(next) && !presetGezet ? SAFE_REDIRECT_FALLBACK : next
}

/**
 * De callback: zet de Krant-preset op de EIGEN rij als dat mag. De id komt uit
 * de zojuist uitgewisselde sessie; de client is de sessie-client (RLS). Geeft
 * terug of de preset gezet is. Een leesfout = niet zetten (fail-closed: dan
 * gewone onboarding, nooit een Krant-account bij twijfel).
 */
export async function zetKrantPresetBijAanmelden(
  supabase: SupabaseClient,
  userId: string,
  opties: { aangemaaktOp?: string | null; nu?: Date } = {},
): Promise<boolean> {
  // "Vers" = ook echt net aangemaakt, niet alleen een onafgeronde onboarding: een
  // bestaand account dat nooit afrondde wordt zo niet via een Krant-link omgezet
  // (security-run 0.92.28, 🟢-1). De callback geeft de e-mailbevestiging mee
  // (anders het aanmaakmoment): wie de mail later bevestigt, telt dan nog als vers.
  // Zonder moment: niet zetten (fail-closed).
  if (!isNetAangemaakt(opties.aangemaaktOp, opties.nu ?? new Date())) return false
  const { data, error } = await supabase
    .from('profiles')
    .select('role, onboarding_completed')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return false
  const mag = krantPresetToegestaan({
    onboardingCompleted: data.onboarding_completed === true,
    inBeta: inTijdlijnBeta((data.role as string | null) ?? null),
  })
  if (!mag) return false
  const { gezet } = await zetProductPreset(supabase, userId, 'krant', { alleenVersAccount: true })
  return gezet
}

/** Hoe lang na het aanmaken een account nog "vers" is voor de Krant-preset. */
export const VERS_ACCOUNT_MINUTEN = 15

/** Is het account binnen VERS_ACCOUNT_MINUTEN aangemaakt? Onbekend of onleesbaar = nee. */
export function isNetAangemaakt(aangemaaktOp: string | null | undefined, nu: Date): boolean {
  if (!aangemaaktOp) return false
  const t = Date.parse(aangemaaktOp)
  if (!Number.isFinite(t)) return false
  const leeftijd = nu.getTime() - t
  return leeftijd >= -60_000 && leeftijd <= VERS_ACCOUNT_MINUTEN * 60_000
}

/** De stap die de klaar-route toevoegt — de enige. Nooit 'identity' (dat is de onboarding van het Geheel, 2D leest hem). */
export const KRANT_ONBOARDING_STAP = 'krant'

/** Pure samenvoeging: bestaande stappen + 'krant', zonder dubbelen; voegt nooit iets anders toe. */
export function stappenNaKlaar(bestaand: unknown): string[] {
  const lijst = Array.isArray(bestaand) ? bestaand.filter((s): s is string => typeof s === 'string') : []
  return [...new Set([...lijst, KRANT_ONBOARDING_STAP])]
}

export type KrantOnboardingToegang = 'open' | 'afgerond' | 'geen'

/** De pure toegangsbeslissing voor de Krant-onboarding en zijn routes. */
export function krantOnboardingToegangVoor(profiel: AanmeldProfiel | null | undefined, inBeta: boolean): KrantOnboardingToegang {
  if (!profiel || profiel.blocked_at != null) return 'geen'
  const krantAccount = isNewsOnly(resolveActiveModules(profiel))
  if (!krantOnboardingNodig({ krantAccount, inBeta })) return 'geen'
  return profiel.onboarding_completed === true ? 'afgerond' : 'open'
}

/**
 * (3) Leest de eigen rij (sessie-client, own-row-RLS) en beslist:
 *   'open'      Krant-account, tijdlijnlezer, onboarding nog niet af
 *   'afgerond'  Krant-account, tijdlijnlezer, onboarding al af
 *   'geen'      geen Krant-account, buiten de bèta, of de rij is niet leesbaar
 */
export async function krantOnboardingToegang(supabase: SupabaseClient, userId: string): Promise<KrantOnboardingToegang> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, active_modules, onboarding_completed, blocked_at')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return 'geen'
  return krantOnboardingToegangVoor(data as AanmeldProfiel, inTijdlijnBeta((data.role as string | null) ?? null))
}
