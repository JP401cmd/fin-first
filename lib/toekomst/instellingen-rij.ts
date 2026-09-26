/**
 * Rij-register van katern Instellingen (ADR 0179 D4, fase 3).
 *
 * Elke instelling die het plan voedt heeft precies één rij op /toekomst/instellingen, en
 * elke rij opent een BESTAANDE body (één body, twee hosts — ADR 0142). De deeplink is
 * `?rij=<sleutel>`; de oude sleutels `?regel=` (de vijf regels op de hele tijdas) en
 * `?strategie=` (de vier levensstrategieën) blijven voor altijd aliassen: bladwijzers,
 * verstuurde briefingmails en Fin-antwoorden dragen ze. De aliassen worden in de client
 * opgelost, niet via een redirect, dus er is geen dubbele hop.
 *
 * Pure module: geen React, geen Supabase.
 */

import type { RegelId } from '@/lib/future/regel-registry'
import type { ManagedStrategy } from '@/lib/strategy-events'
import { STRATEGIE_PAGINA } from '@/lib/horizon/strategie-route'

export type RijSleutel =
  // I · Je plan
  | 'stopmoment'
  | 'eindleeftijd'
  | 'onttrekking'
  | 'uitgave-na-pensioen'
  | 'geen-tekort-lening'
  | 'onttrekkingsvolgorde'
  | 'verdeling-toename'
  | 'onttrekking-afname'
  // II · Levensstrategieën
  | 'aow'
  | 'pensioen'
  | 'werk'
  | 'huis'
  // III · Marktaannames
  | 'inflatie'
  | 'rendement'
  | 'box3'

export type RijSectie = 'plan' | 'levensstrategieen' | 'markt'

/** Welke bestaande body een rij opent. */
export type RijEditor =
  | { soort: 'regel'; regel: RegelId; anker?: string }
  | { soort: 'strategie'; strategie: ManagedStrategy }
  | { soort: 'voorkeur'; kolom: 'inflation_rate' | 'expected_return' }
  | { soort: 'box3' }
  | { soort: 'uitgaven' }

export interface RijMeta {
  sectie: RijSectie
  editor: RijEditor
}

/** Ankers in `EindstrategieBody` (op `StopPlanVragen` en de tekort-lening-schakelaar). */
export const EINDSTRATEGIE_ANKER = {
  stopmoment: 'stop-plan-stopmoment',
  eindleeftijd: 'stop-plan-eindleeftijd',
  geenTekortLening: 'geen-tekort-lening',
} as const

export const RIJ_META: Record<RijSleutel, RijMeta> = {
  stopmoment: { sectie: 'plan', editor: { soort: 'regel', regel: 'eindstrategie', anker: EINDSTRATEGIE_ANKER.stopmoment } },
  eindleeftijd: { sectie: 'plan', editor: { soort: 'regel', regel: 'eindstrategie', anker: EINDSTRATEGIE_ANKER.eindleeftijd } },
  onttrekking: { sectie: 'plan', editor: { soort: 'regel', regel: 'onttrekkingsstrategie' } },
  'uitgave-na-pensioen': { sectie: 'plan', editor: { soort: 'uitgaven' } },
  'geen-tekort-lening': {
    sectie: 'plan',
    editor: { soort: 'regel', regel: 'eindstrategie', anker: EINDSTRATEGIE_ANKER.geenTekortLening },
  },
  onttrekkingsvolgorde: { sectie: 'plan', editor: { soort: 'regel', regel: 'onttrekkingsvolgorde' } },
  'verdeling-toename': { sectie: 'plan', editor: { soort: 'regel', regel: 'verdeling-toename' } },
  'onttrekking-afname': { sectie: 'plan', editor: { soort: 'regel', regel: 'onttrekking-afname' } },
  aow: { sectie: 'levensstrategieen', editor: { soort: 'strategie', strategie: 'aow' } },
  pensioen: { sectie: 'levensstrategieen', editor: { soort: 'strategie', strategie: 'pensioen' } },
  werk: { sectie: 'levensstrategieen', editor: { soort: 'strategie', strategie: 'werk' } },
  huis: { sectie: 'levensstrategieen', editor: { soort: 'strategie', strategie: 'huis' } },
  inflatie: { sectie: 'markt', editor: { soort: 'voorkeur', kolom: 'inflation_rate' } },
  rendement: { sectie: 'markt', editor: { soort: 'voorkeur', kolom: 'expected_return' } },
  box3: { sectie: 'markt', editor: { soort: 'box3' } },
}

export const RIJ_SLEUTELS = Object.keys(RIJ_META) as RijSleutel[]

/** Alias `?regel=` → rij. Eindstrategie landt op het stopmoment (vraag 1 van dezelfde body). */
export const REGEL_NAAR_RIJ: Record<RegelId, RijSleutel> = {
  eindstrategie: 'stopmoment',
  onttrekkingsstrategie: 'onttrekking',
  onttrekkingsvolgorde: 'onttrekkingsvolgorde',
  'verdeling-toename': 'verdeling-toename',
  'onttrekking-afname': 'onttrekking-afname',
}

/** Alias `?strategie=` → rij. */
export const STRATEGIE_NAAR_RIJ: Record<ManagedStrategy, RijSleutel> = {
  aow: 'aow',
  pensioen: 'pensioen',
  werk: 'werk',
  huis: 'huis',
}

/** De query-sleutels die de rij-deeplink leest en opruimt. */
export const RIJ_DEEPLINK_PARAMS = ['rij', 'regel', 'strategie'] as const

export function isRijSleutel(value: unknown): value is RijSleutel {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RIJ_META, value)
}

/**
 * Welke rij opent een URL? Voorrang: `rij` > `regel` > `strategie`. Onbekende waarden
 * (bv. de oude `strategie=open`) geven `null`.
 */
export function resolveRijDeeplink(
  params: { get(key: string): string | null },
): { rij: RijSleutel; via: 'rij' | 'regel' | 'strategie' } | null {
  const rij = params.get('rij')
  if (isRijSleutel(rij)) return { rij, via: 'rij' }
  const regel = params.get('regel')
  if (regel != null && Object.prototype.hasOwnProperty.call(REGEL_NAAR_RIJ, regel)) {
    return { rij: REGEL_NAAR_RIJ[regel as RegelId], via: 'regel' }
  }
  const strategie = params.get('strategie')
  if (strategie != null && Object.prototype.hasOwnProperty.call(STRATEGIE_NAAR_RIJ, strategie)) {
    return { rij: STRATEGIE_NAAR_RIJ[strategie as ManagedStrategy], via: 'strategie' }
  }
  return null
}

/** Deeplink naar één rij in katern Instellingen. */
export function instellingenRijHref(rij: RijSleutel): string {
  return `${STRATEGIE_PAGINA}?rij=${rij}`
}
