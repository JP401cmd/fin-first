/**
 * Rij-register van katern Instellingen (ADR 0179 D4, fase 3) en van het blok
 * Levensstrategieën op katern Plan (eigenaarsbesluit 27 sep 2026).
 *
 * Elke instelling die het plan voedt heeft precies één rij, en elke rij opent een
 * BESTAANDE body (één body, twee hosts — ADR 0142). De deeplink is `?rij=<sleutel>`; de
 * oude sleutels `?regel=` (de vijf regels op de hele tijdas) en `?strategie=` (de vier
 * levensstrategieën) blijven voor altijd aliassen: bladwijzers, verstuurde briefingmails en
 * Fin-antwoorden dragen ze. De aliassen worden in de client opgelost.
 *
 * De vier levensstrategieën (AOW, pensioen, werk, eigen woning) staan sinds 27 sep op
 * katern Plan (`/toekomst?rij=<key>#levensstrategieen`). Oude links naar Instellingen
 * (`/toekomst/instellingen?rij=aow`, `?strategie=pensioen`) stuurt `next.config.ts` op de
 * routing-laag door naar Plan, met dezelfde parameters.
 *
 * Pure module: geen React, geen Supabase.
 */

import type { RegelId } from '@/lib/future/regel-registry'
import type { ManagedStrategy } from '@/lib/strategy-events'
import type { PlanReviewStap } from '@/lib/plan-review/types'
import { strategieHref } from '@/lib/horizon/strategie-route'

/** Katern Instellingen. */
export const INSTELLINGEN_PAGINA = '/toekomst/instellingen'

export type RijSleutel =
  // I · Je plan
  | 'stopmoment'
  | 'eindleeftijd'
  | 'onttrekking'
  | 'uitgave-na-pensioen'
  // II · Hoe je potten meebewegen
  | 'geen-tekort-lening'
  | 'onttrekkingsvolgorde'
  | 'verdeling-toename'
  | 'onttrekking-afname'
  // Levensstrategieën — op katern Plan, bij de levensgebeurtenissen
  | 'aow'
  | 'pensioen'
  | 'werk'
  | 'huis'
  // III · Marktaannames
  | 'inflatie'
  | 'rendement'
  | 'box3'

/**
 * Waar een rij staat. `plan`, `potten` en `markt` zijn de drie secties van katern
 * Instellingen (I · Je plan, II · Hoe je potten meebewegen, III · Marktaannames);
 * `levensstrategieen` is het blok bij de levensgebeurtenissen op katern Plan.
 */
export type RijSectie = 'plan' | 'potten' | 'markt' | 'levensstrategieen'

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
  /**
   * De wizardstap van de plan-review (ADR 0142) die deze instelling bevestigt. Staat die
   * stap nog open (`PlanReviewProgress.stappen`), dan draagt de rij de stille markering
   * "nog niet bevestigd". Zonder = de wizard bevestigt deze rij niet per stap (laag 2).
   * Spiegelt `VeldPlek.wizard` in `lib/plan-review/veld-register.ts`.
   */
  wizardStap?: PlanReviewStap
}

/** Ankers in `EindstrategieBody` (op `StopPlanVragen` en de tekort-lening-schakelaar). */
export const EINDSTRATEGIE_ANKER = {
  stopmoment: 'stop-plan-stopmoment',
  eindleeftijd: 'stop-plan-eindleeftijd',
  geenTekortLening: 'geen-tekort-lening',
} as const

export const RIJ_META: Record<RijSleutel, RijMeta> = {
  stopmoment: {
    sectie: 'plan',
    editor: { soort: 'regel', regel: 'eindstrategie', anker: EINDSTRATEGIE_ANKER.stopmoment },
    wizardStap: 'plan',
  },
  eindleeftijd: {
    sectie: 'plan',
    editor: { soort: 'regel', regel: 'eindstrategie', anker: EINDSTRATEGIE_ANKER.eindleeftijd },
    wizardStap: 'plan',
  },
  onttrekking: { sectie: 'plan', editor: { soort: 'regel', regel: 'onttrekkingsstrategie' }, wizardStap: 'potten' },
  'uitgave-na-pensioen': { sectie: 'plan', editor: { soort: 'uitgaven' }, wizardStap: 'uitgaven' },
  'geen-tekort-lening': {
    sectie: 'potten',
    editor: { soort: 'regel', regel: 'eindstrategie', anker: EINDSTRATEGIE_ANKER.geenTekortLening },
    wizardStap: 'plan',
  },
  onttrekkingsvolgorde: { sectie: 'potten', editor: { soort: 'regel', regel: 'onttrekkingsvolgorde' }, wizardStap: 'potten' },
  'verdeling-toename': { sectie: 'potten', editor: { soort: 'regel', regel: 'verdeling-toename' }, wizardStap: 'potten' },
  'onttrekking-afname': { sectie: 'potten', editor: { soort: 'regel', regel: 'onttrekking-afname' }, wizardStap: 'potten' },
  aow: { sectie: 'levensstrategieen', editor: { soort: 'strategie', strategie: 'aow' }, wizardStap: 'inkomsten' },
  pensioen: { sectie: 'levensstrategieen', editor: { soort: 'strategie', strategie: 'pensioen' }, wizardStap: 'inkomsten' },
  werk: { sectie: 'levensstrategieen', editor: { soort: 'strategie', strategie: 'werk' }, wizardStap: 'inkomsten' },
  huis: { sectie: 'levensstrategieen', editor: { soort: 'strategie', strategie: 'huis' }, wizardStap: 'woning' },
  inflatie: { sectie: 'markt', editor: { soort: 'voorkeur', kolom: 'inflation_rate' } },
  rendement: { sectie: 'markt', editor: { soort: 'voorkeur', kolom: 'expected_return' } },
  box3: { sectie: 'markt', editor: { soort: 'box3' } },
}

export const RIJ_SLEUTELS = Object.keys(RIJ_META) as RijSleutel[]

/** De rijen van het blok Levensstrategieën op Plan, in weergavevolgorde. */
export const LEVENSSTRATEGIE_RIJEN = ['aow', 'pensioen', 'werk', 'huis'] as const satisfies readonly RijSleutel[]
export type LevensstrategieRij = (typeof LEVENSSTRATEGIE_RIJEN)[number]

export function isLevensstrategieRij(rij: RijSleutel): rij is LevensstrategieRij {
  return RIJ_META[rij].sectie === 'levensstrategieen'
}

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

/**
 * Wat de rij-deeplink bij het openen óók opruimt: de param die een redirect uit
 * `next.config.ts` laat meereizen (`/toekomst?uitgaven=open` →
 * `/toekomst/instellingen?rij=uitgave-na-pensioen&uitgaven=open`); op Instellingen leest
 * niets hem.
 */
export const RIJ_OPRUIM_PARAMS = [...RIJ_DEEPLINK_PARAMS, 'uitgaven'] as const

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

/**
 * Deeplink naar één rij. Een levensstrategie-rij woont op katern Plan
 * (`/toekomst?rij=<key>#levensstrategieen`, `strategieHref`); de rest in Instellingen.
 */
export function instellingenRijHref(rij: RijSleutel): string {
  const editor = RIJ_META[rij].editor
  if (editor.soort === 'strategie') return strategieHref(editor.strategie)
  return `${INSTELLINGEN_PAGINA}?rij=${rij}`
}
