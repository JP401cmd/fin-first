/**
 * Resterende PENSIOENPOT per projectierij — de tegenhanger van `spendablePortfolio`
 * (`lib/horizon/coverage-strip.ts`), dat de pensioenpot juist bewust OVERSLAAT.
 *
 * PURE afleiding uit het bestaande `UnifiedProjectionRow`-contract: sommeert de
 * `assetBuckets`-slotwaarden waarvan het app-`AssetType` op de KERN-categorie
 * 'Pensioen' mapt. Geen eigen rekenmotor, geen financiële constanten, geen tweede
 * categorie-lijst.
 *
 * ## Waarom de kern-categorie en niet het app-type `retirement`
 * De kernel-adapter mapt TWEE app-typen op één kern-categorie
 * (`adapter/potten.ts#ASSET_TYPE_TO_CATEGORIE`): `retirement` én `levensverzekering`.
 * Die categorie is precies wat de onttrekkings-prio's aansturen — de "pensioen zo
 * laat mogelijk"/"pensioen vroeg"-lever van de fiscale optimizer (katern IV) zet
 * `categorie_prios.onttrekking.Pensioen`, en de kern-waterval trekt beide potten in
 * hetzelfde tempo leeg. De bridge boekt de onttrekking uit béide als
 * `box1Streams.pensioenOnttrekkingBruto` (kern-categorie 'Pensioen', bridge.ts).
 * Een eigen lijstje met alleen `retirement` zou de pot onderschatten met precies het
 * deel dat de lever óók verschuift — en zou stil gaan driften zodra de mapping
 * verandert. Daarom wordt de canonieke map geÏMPORTEERD, nooit nagetypt (zelfde
 * patroon als `lib/horizon/toekomst-scenario.ts` en `toekomst-doel.ts`).
 *
 * ## Disjunct met het belegbaar vermogen (sinds 10 aug 2026)
 * `NON_SPENDABLE_ASSET_TYPES` in `coverage-strip.ts` sloot tot dan alléén
 * `retirement` uit, niet `levensverzekering` — die polis telde daardoor in BEIDE
 * grondslagen: als vrij opneembaar vermogen én als pensioenpot, terwijl de
 * kern-waterval hem als pensioenpot leegtrekt en zijn onttrekking als Box 1-
 * pensioeninkomen boekt. Eigenaarsbesluit (optie A, 9 aug 2026): het ís een
 * pensioenpot. Beide typen staan nu in `NON_SPENDABLE_ASSET_TYPES`, dus
 * `spendablePortfolio` en `pensioenPortfolio` delen geen enkel app-type meer.
 *
 * Disjunct is NIET hetzelfde als optelbaar: belegbaar staat vóór schulden en mist
 * woning/auto/fysiek bezit, de pensioenpot is bruto (Box 1 komt er nog overheen).
 * De som is dus geen bestaande grootheid — het netto vermogen is dat wél, en heeft
 * zijn eigen veld. Zie `EINDVERMOGEN_GRONDSLAGEN` in
 * `lib/tax-lifetime/varianten-sweep.ts` voor de drie grondslagen naast elkaar.
 */

import type { AssetType } from '@/lib/asset-data'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { AssetCategorie } from '@/lib/horizon-kernel/types'
import { ASSET_TYPE_TO_CATEGORIE } from '@/lib/horizon-kernel/adapter/potten'

/** De kern-categorie waarop de pensioen-lever van de optimizer stuurt. */
export const PENSIOEN_CATEGORIE: AssetCategorie = 'Pensioen'

/**
 * Waarde van de pensioenpotten aan het eind van het jaar: de som van de
 * `assetBuckets`-slotwaarden waarvan het app-type op kern-categorie 'Pensioen' mapt.
 * Rijen zonder pensioenbezit leveren 0 (niet `null`) — de afwezigheid van een pot is
 * een echte nulstand, geen ontbrekende meting.
 */
export function pensioenPortfolio(row: UnifiedProjectionRow): number {
  const buckets = row.assetBuckets ?? {}
  let sum = 0
  for (const [type, detail] of Object.entries(buckets)) {
    if ((ASSET_TYPE_TO_CATEGORIE[type as AssetType] ?? 'Overig') !== PENSIOEN_CATEGORIE) continue
    sum += detail?.endValue ?? 0
  }
  return sum
}
