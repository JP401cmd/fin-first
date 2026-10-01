// ── Welke Krant krijgt deze lezer? (B40, Krant 1C fase 2) ────────────────────
//
// De server kiest de bron van /nieuws; de client krijgt alleen het gekozen
// component mee (ADR 0058: lezen via de server). Eén beslissing, vier uitkomsten:
//
//   'tijdlijn'  de Krant zonder AI (1C) — de standaard voor iedereen (B40), ook
//               voor wie AI aan heeft en een AI-abonnement (K2, 1E)
//   'ai'        SINDS 1E (ADR 0190): dezelfde tijdlijn MET de AI-laag — alleen
//               na een bewuste keuze (krant_variant = 'ai') van een
//               Geheel-account met AI toegestaan, en alleen binnen de bèta
//   'oud'       de oude Krant met AI van vóór 1C (NieuwsOnlyClient + /api/news,
//               uitgefaseerd sinds 1E) — uitsluitend zolang de tijdlijn voor deze
//               lezer dicht is (TIJDLIJN_BETA_OPEN false, geen superadmin). Tot
//               1E heette dit ook 'ai'; die twee betekenissen delen sinds 1E
//               bewust geen waarde meer
//   'wacht'     de tijdlijn is nog dicht voor deze lezer en de oude AI-Krant is
//               geen optie (Krant-account) — een neutrale "komt eraan", NOOIT
//               de AI-upsell (dat was de doodlopende weg uit de 2B-eindreview)
//
// De bèta-vlag (TIJDLIJN_BETA_OPEN) blijft de eerste dagen de tijdelijke
// schakelaar (B40): dicht → alleen de superadmin ziet de tijdlijn (en dus ook
// alleen de superadmin de AI-laag), verder gedraagt /nieuws zich als vóór 1C.
// Open → de tijdlijn voor iedereen.
//
// Een Krant-account (resolveActiveModules = ['nieuws']) krijgt nooit 'ai' of
// 'oud': geen AI in de Krant (B11), en /api/news weigert hem sinds 2B toch.

import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSubscription, type ActiveSubscriptions } from '@/lib/feature-registry'
import { isNewsOnly, resolveActiveModules } from '@/lib/modules/resolve'
import { inTijdlijnBeta } from './tijdlijn-beta'

export type KrantBron = 'tijdlijn' | 'ai' | 'oud' | 'wacht'
export type KrantVariant = 'ai' | 'tijdlijn' | null

/** Leest deze bron de tijdlijn (met of zonder AI-laag)? Eén definitie voor pagina, routes en cron. */
export function leestTijdlijn(bron: KrantBron): bron is 'tijdlijn' | 'ai' {
  return bron === 'tijdlijn' || bron === 'ai'
}

export interface KrantBronInvoer {
  /** Precies de Krant-set (isNewsOnly op de opgeloste modules). */
  krantAccount: boolean
  variant: KrantVariant
  /** inTijdlijnBeta(rol) — de tijdelijke schakelaar. */
  inBeta: boolean
  /**
   * Mag deze lezer nu AI? (kill-switch `ai_enabled` aan én AI-abonnement.)
   * Een 'ai'-variant zonder AI valt terug op de standaard: anders wist de keuze
   * de tijdlijn en eindigt de lezer bij een AI-Krant die hem weigert
   * (eindreview Y2, 29-09).
   */
  aiToegestaan: boolean
}

/** Kill-switch aan (null = geen uitspraak = aan) én het AI-abonnement. */
export function aiKrantToegestaan(row: { ai_enabled?: boolean | null; active_subscriptions?: unknown } | null | undefined): boolean {
  if (!row || row.ai_enabled === false) return false
  const subs = Array.isArray(row.active_subscriptions) ? (row.active_subscriptions as ActiveSubscriptions) : []
  return hasSubscription(subs, 'ai')
}

/** De pure beslissing (élke tak getest in tijdlijn-bron.test.ts). */
export function bepaalKrantBron({ krantAccount, variant, inBeta, aiToegestaan }: KrantBronInvoer): KrantBron {
  if (krantAccount) return inBeta ? 'tijdlijn' : 'wacht'
  // Bij een dichte vlag verandert er voor een gewone lezer niets (de oude Krant).
  if (!inBeta) return 'oud'
  // Binnen de bèta: met AI alleen na een bewuste keuze én met AI toegestaan (K2).
  if (variant === 'ai' && aiToegestaan) return 'ai'
  return 'tijdlijn'
}

export interface KrantBronUitkomst {
  bron: KrantBron
  krantAccount: boolean
  variant: KrantVariant
  /** De tijdelijke schakelaar voor deze lezer — bepaalt o.a. of "terug naar de tijdlijn" zin heeft. */
  inBeta: boolean
  /** Mag de lezer de AI-Krant kiezen (geen Krant-account, AI aan, AI-abonnement)? */
  kanAiKiezen: boolean
}

function leesVariant(v: unknown): KrantVariant {
  return v === 'ai' || v === 'tijdlijn' ? v : null
}

/**
 * Leest rol, modules en variant van de EIGEN rij (sessie-client, own-row-RLS)
 * en beslist. Fail-closed: kan het profiel niet gelezen worden, dan 'wacht'
 * voor een onbekend account — nooit een tijdlijn bij twijfel over de vlag, en
 * geen AI-pad dat een Krant-account zou kunnen raken.
 *
 * Een GEBLOKKEERD account (`profiles.blocked_at`) krijgt ook 'wacht': geen
 * tijdlijn, geen AI-laag, niets te kiezen — gelijk aan `vereisBearer` in de
 * native API. Alle Krant-routes die de bron vragen (lezen, gelezen, variant,
 * en via `verversEigenTijdlijn` het vernieuwen) weigeren hem zo op één plek
 * (security-run 0.92.28, 🟡-1). De bezwaarroute vraagt de bron niet en weigert
 * dus niet op blocked_at: bezwaar is een AVG-recht dat alleen verwerking
 * vermindert. Wie geblokkeerd is, heeft sinds 0.92.029 ook een ban in Supabase
 * Auth en dus geen sessie meer — die maakt bezwaar via het contactkanaal.
 */
export async function krantBronVoor(supabase: SupabaseClient, userId: string): Promise<KrantBronUitkomst> {
  const [profielRes, nieuwsRes] = await Promise.all([
    supabase.from('profiles').select('role, active_modules, active_subscriptions, ai_enabled, blocked_at').eq('id', userId).maybeSingle(),
    supabase.from('nieuwsprofiel').select('krant_variant').eq('user_id', userId).maybeSingle(),
  ])
  if (profielRes.error || !profielRes.data || profielRes.data.blocked_at != null) {
    return { bron: 'wacht', krantAccount: false, variant: null, inBeta: false, kanAiKiezen: false }
  }
  const krantAccount = isNewsOnly(resolveActiveModules(profielRes.data))
  // Een leesfout op nieuwsprofiel = geen keuze bekend = de standaard.
  const variant = nieuwsRes.error ? null : leesVariant(nieuwsRes.data?.krant_variant)
  const inBeta = inTijdlijnBeta(profielRes.data.role as string | null)
  const aiToegestaan = aiKrantToegestaan(profielRes.data)
  return {
    bron: bepaalKrantBron({ krantAccount, variant, inBeta, aiToegestaan }),
    krantAccount,
    variant,
    inBeta,
    kanAiKiezen: !krantAccount && aiToegestaan,
  }
}
