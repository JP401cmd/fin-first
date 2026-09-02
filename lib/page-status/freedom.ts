// lib/page-status/freedom.ts
//
// PURE builder (géén IO): bouwt de informatieve "je bent vrij / met pensioen"-
// duiding voor /overzicht uit de gedeelde, consume-only vrijheidsvlag
// (lib/fire-strategy). Geen rekenmotor, geen DB, geen hardcoded leeftijden —
// alleen reeds-berekende waarden (freedomPct, currentAge, fireAge, strategy)
// koppelen aan gecureerde copy (copy.ts).
//
// Dit is bewust dezelfde banner-keten (PageStatusBanner/PageStatusDot,
// minimaliseerbaar) als de stoplicht-duidingen — géén tweede variant — maar met
// kind 'freedom' (informatief, status semantisch 'neutral', escaleert niet).

import {
  isFinanciallyFree,
  resolveFreedomFraming,
  type FreedomStateInput,
} from '@/lib/fire-strategy'
import { FREEDOM_BANNER_COPY } from '@/lib/page-status/copy'
import type { PageStatusInfo } from '@/lib/page-status/types'

/**
 * Geeft de vrijheids-/pensioenbanner voor /overzicht, of `null` wanneer de
 * gebruiker nog niet financieel vrij is (dan toont /overzicht geen banner).
 *
 * @returns PageStatusInfo met kind 'freedom' (status 'neutral'), of null.
 */
export function resolveFreedomBanner(input: FreedomStateInput): PageStatusInfo | null {
  if (!isFinanciallyFree(input)) return null

  // Vrij → framing is 'free', 'pensioen' of 'nu-stoppen' (nooit 'building' hier).
  // ADR 0127: de 'nu-stoppen'-tak is verplicht — zonder eigen entry viel deze
  // strategie op de 'free'-kopij ("Je bent vrij"), en dat is onder dit anker een
  // uitspraak over de gebruiker in plaats van over zijn geld.
  const framing = resolveFreedomFraming(input)
  const copy =
    framing === 'pensioen'
      ? FREEDOM_BANNER_COPY.pensioen
      : framing === 'nu-stoppen'
        ? FREEDOM_BANNER_COPY['nu-stoppen']
        : FREEDOM_BANNER_COPY.free

  return {
    route: '/overzicht',
    kind: 'freedom',
    // Semantisch neutraal: de freedom-banner is informatief, geen stoplicht. De
    // styling/dot-kleur wordt in de UI op `kind` gekozen (horizon-accent), niet
    // op deze status — zo blijven stoplichtkleuren stoplicht (CLAUDE.md).
    status: 'neutral',
    title: copy.title,
    reason: copy.reason,
    remedy: copy.remedy,
    will: copy.will,
  }
}
