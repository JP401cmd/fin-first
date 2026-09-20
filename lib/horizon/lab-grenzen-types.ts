/**
 * Lab-grenzen — het TYPECONTRACT tussen de rekenlaag (`lib/horizon/lab-grenzen.ts`, draait in
 * de kernel-worker), de host (`horizon-client.tsx`) en de presentational knoppen
 * (`components/app/horizon/lab-knoppen.tsx`). Alleen plain data en constanten: dit bestand
 * reist structured-clone-veilig door de worker-grens en trekt geen React of Supabase mee.
 *
 * ADR 0170 (19 sep 2026) — vijf knoppen met een driekleurige schaal. Per knop twee grenzen in
 * de eigen slider-eenheid:
 *   - `gedekt`: de waarde waarop het plan precies gedekt is (kernel-oordeel, geankerd op de
 *     stop-knop) — de grens rood → oranje;
 *   - `ruim`:   de waarde waarop het plan óók onder de 10%-marge gedekt is — oranje → groen.
 * `null` = niet bepaalbaar (geen grondslag, niet monotoon, kernfout, runbudget op).
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import type { FireEndForm } from '@/lib/fire-strategy'

/** De vijf knoppen, in de vaste schermvolgorde (eigenaarsbesluit B1). */
export const HEFBOOM_KEYS = ['verdienen', 'uitgeven', 'uitgaveNaPensioen', 'nalatenschap', 'stop'] as const
export type HefboomKey = (typeof HEFBOOM_KEYS)[number]

/**
 * Welke kant van de schaal groen is: `stijgend` = een hogere waarde maakt het plan haalbaarder
 * (meer verdienen, minder uitgeven, later stoppen); `dalend` = een lagere waarde doet dat
 * (minder uitgeven na pensioen, minder nalaten).
 */
export type HefboomRichting = 'stijgend' | 'dalend'
export const HEFBOOM_RICHTING: Record<HefboomKey, HefboomRichting> = {
  verdienen: 'stijgend',
  uitgeven: 'stijgend',
  uitgaveNaPensioen: 'dalend',
  nalatenschap: 'dalend',
  stop: 'stijgend',
}

/** Zichtbaar bereik van één knop in de eigen eenheid; `stap` is ook de bisectie-precisie. */
export interface HefboomBereik {
  min: number
  max: number
  stap: number
}

/**
 * De twee grenzen van één knop. `heel` zegt wat de hele band is wanneer de grens buiten het
 * bereik ligt (`gedekt` = alles gedekt, `ongedekt` = niets gedekt); anders `null`.
 */
export interface HefboomGrenzen {
  gedekt: number | null
  ruim: number | null
  heel: 'gedekt' | 'ongedekt' | null
}

/**
 * De huidige stand van de vijf knoppen, in slider-eenheden:
 *   verdienen         €/mnd extra inleg (0 = basis; negatief = minder salaris)
 *   uitgeven          absolute spaarquote in procentpunten (= `savings`-event; de UI toont €)
 *   uitgaveNaPensioen €/jaar; `null` = wat het plan rekent (geen override)
 *   nalatenschap      €;      `null` = wat het plan rekent (geen override)
 *   stop              stopleeftijd in jaren (0,5-grid); onder anker `now` de huidige leeftijd
 */
export interface LabGrenzenWaarden {
  verdienen: number
  uitgeven: number
  uitgaveNaPensioen: number | null
  nalatenschap: number | null
  stop: number
}

export interface LabGrenzenContext {
  /** De profielrij MÉT de ADR 0103-grondslag-injectie (`withResolvedKernelBedragen`). */
  profile: ConvergentieRawProfileRow
  /** Bezittingen, AL met de marktbias-rendementdelta toegepast (`applyReturnDeltasToAssets`). */
  assets: readonly Asset[]
  debts: readonly Debt[]
  /** DB-gebeurtenissen ZONDER slider-events — de engine bouwt die zelf uit `waarden`. */
  lifeEvents: readonly LifeEvent[]
  aowRows?: readonly AowLeeftijdRow[]
  /** Baseline waartegen de slider-events worden gebouwd (`buildSliderEvent`). */
  baseline: WhatIfOverrides
  currentAge: number
  waarden: LabGrenzenWaarden
  /** Het plan heeft een vast stopmoment (aow/age/now). Bepaalt de marge-definitie (B3). */
  planAnkerVast: boolean
  /** Stopleeftijd van het plan-anker (`now` → huidige leeftijd); `null` onder `solved`. */
  planStopAge: number | null
  eindVorm: FireEndForm
  /**
   * Bereik per knop. Een knop die hier ONTBREEKT wordt niet gesolved (verborgen knop: de
   * stop-knop onder anker `now`, nalatenschap onder eind-vorm `perpetual`).
   */
  bereik: Partial<Record<HefboomKey, HefboomBereik>>
  /** Noodrem op het aantal kernel-runs; daarboven blijven de resterende grenzen `null`. */
  maxRuns?: number
}

export interface LabGrenzenResultaat {
  grenzen: Partial<Record<HefboomKey, HefboomGrenzen>>
  /** Oordeel over de HUIDIGE stand (zelfde predicaten); `null` als de basisrun niet lukte. */
  huidig: { gedekt: boolean; ruim: boolean } | null
  /** Aantal kernel-runs dat deze batch kostte (telemetrie/tests). */
  runs: number
}

/** Zone van één stand op de driekleurige schaal. */
export type LabZone = 'rood' | 'oranje' | 'groen'

/** Zone van de huidige stand uit het `huidig`-oordeel; `null` = onbekend (grijs). */
export function zoneVanHuidig(huidig: LabGrenzenResultaat['huidig']): LabZone | null {
  if (huidig == null) return null
  if (!huidig.gedekt) return 'rood'
  return huidig.ruim ? 'groen' : 'oranje'
}

/**
 * Zone van een willekeurige stand `v` op een knop, puur uit de grenzen en de richting. Wordt
 * door de knop gebruikt om de waarde te kleuren; `null` zonder bruikbare grenzen.
 */
export function zoneVanWaarde(v: number, grenzen: HefboomGrenzen | null, richting: HefboomRichting): LabZone | null {
  if (grenzen == null) return null
  if (grenzen.gedekt == null) {
    if (grenzen.heel === 'gedekt') return grenzen.ruim == null ? 'groen' : zoneMetGrenzen(v, grenzen, richting)
    if (grenzen.heel === 'ongedekt') return 'rood'
    return null
  }
  return zoneMetGrenzen(v, grenzen, richting)
}

function zoneMetGrenzen(v: number, grenzen: HefboomGrenzen, richting: HefboomRichting): LabZone {
  const beter = (a: number, b: number) => (richting === 'stijgend' ? a >= b : a <= b)
  if (grenzen.gedekt != null && !beter(v, grenzen.gedekt)) return 'rood'
  if (grenzen.ruim != null && beter(v, grenzen.ruim)) return 'groen'
  return 'oranje'
}
