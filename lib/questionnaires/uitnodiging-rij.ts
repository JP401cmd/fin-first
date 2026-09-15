import type { UitnodigingBron, UitnodigingStaat } from './verspreiding'

/**
 * De DB-rij van `questionnaire_invitations` ↔ de pure {@link UitnodigingStaat}
 * uit het verspreidingscontract (ADR 0147).
 *
 * Eén plek voor de kolomlijst en de normalisatie, zodat de drie routes die de
 * tabel lezen (GET /api/questionnaires, PATCH …/uitnodiging, de beheerroute)
 * niet elk hun eigen variant krijgen. Bewust ALLEEN staat-kolommen: `bron_detail`
 * hoort hier niet bij — dat is beheer-/herkomstinformatie, geen staat die de
 * gebruikerskant nodig heeft.
 */

/** Expliciete kolomlijst — nooit `select('*')`, ook niet op een staat-tabel. */
export const UITNODIGING_KOLOMMEN =
  'questionnaire_id, bron, invited_at, shown_at, snoozed_until, dismissed_at, dismiss_count'

/** Ruwe rij zoals supabase-js 'm teruggeeft (alles defensief optioneel). */
export interface UitnodigingRij {
  questionnaire_id?: string | null
  bron?: string | null
  invited_at?: string | null
  shown_at?: string | null
  snoozed_until?: string | null
  dismissed_at?: string | null
  dismiss_count?: number | null
}

/**
 * Normaliseert een rij naar de staat. Een onbekende `bron` valt terug op
 * 'regel': de regel-bron is de enige die de gebruiker zelf mag aanmaken en
 * daarmee de veiligste aanname — hij geeft géén extra zichtbaarheid
 * (`zichtbaarVoor` opent alleen op 'handmatig'/'groep').
 */
export function naarUitnodigingStaat(rij: UitnodigingRij, nu: Date = new Date()): UitnodigingStaat {
  const bron = (rij.bron ?? 'regel') as UitnodigingBron
  return {
    bron: bron === 'handmatig' || bron === 'groep' ? bron : 'regel',
    invited_at: rij.invited_at ?? nu.toISOString(),
    shown_at: rij.shown_at ?? null,
    snoozed_until: rij.snoozed_until ?? null,
    dismissed_at: rij.dismissed_at ?? null,
    dismiss_count: rij.dismiss_count ?? 0,
  }
}
