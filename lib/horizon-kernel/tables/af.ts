/**
 * Horizon-kernel · tabel **Af** (afname — negatieve gebeurtenissen) — Excel-tab
 * `Af` (A1:G1203).
 *
 * Pure per-maand-functie die de maandelijkse **kost** uit gebeurtenissen bepaalt:
 * de som van alle op maand `m` actieve gebeurtenis-posten met een **negatief**
 * bedrag (kosten in koopkracht-nu), als **positieve** afname geïndexeerd naar
 * nominaal (`× (1+P!B14)^(m/12)`), conform het Excel-oracle (ADR 0032).
 *
 *   `Af!D(m) = −( Σ actieve posten met bedrag<0 ) × (1+inflatie)^(m/12)`
 *
 * De gebeurtenis-posten komen uit de **Geb**-tab (handmatige rijen 4-13 +
 * automatische rijen 14-30), waar de helper-kolommen `W:AE` per post het
 * actief-venster (`sIdx`/`eIdx` = start-/eind-maandindex) en het bedrag (`bn`,
 * koopkracht-nu, + bate / − kost) leveren. Een lege post staat als
 * `sIdx=99999, eIdx=99998, bn=0` — het venster `sIdx ≤ m ≤ eIdx` is dan nooit
 * waar. Af CONSUMEERT die posten (ze worden elders geport/gegenereerd): in de
 * parity-test komen ze teacher-forced uit de fixture-Geb-sheet, zodat `computeAf`
 * geïsoleerd formule-getrouw bewezen wordt.
 *
 * **Horizon-guard-detail:** anders dan Bel/Verdeling heeft kolom **D** GEEN
 * `IF(…>100,"",…)`-guard — het is een pure SUMPRODUCT die voorbij de horizon
 * vanzelf 0 wordt (geen post is dan nog actief). Empirisch (fixtures): op maand
 * 769 (leeftijd 100,08) toont Excel `A` numeriek, `B/C/F/G` als `""`, maar `D`
 * als numerieke `0`. B/C (leeftijd/maand) én de duplicaat-kolommen F/G volgen wél
 * de standaard-scaffold-guard. Kolom **E** is een permanente spacer (altijd leeg).
 *
 * Pure functie: geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelInput, MonthIndex } from '../types'
import { inflationIndex, isBeyondHorizon, leeftijdJaren, maandInJaar } from '../scaffold'

/**
 * Eén gebeurtenis-post uit de Geb-helper-kolommen (`W:AE`). Maand-onafhankelijk:
 * het actief-venster en het koopkracht-nu-bedrag worden één keer per post
 * bepaald (door de Geb-port), en Af leest ze per maand teacher-forced.
 */
export interface AfGebPost {
  /** Geb `sIdx` (W/Z/AC) — start-maandindex; lege post → 99999. */
  readonly startIndex: number
  /** Geb `eIdx` (X/AA/AD) — eind-maandindex (inclusief); lege post → 99998. */
  readonly eindIndex: number
  /** Geb `bn` (Y/AB/AE) — bedrag in koopkracht-nu (+ bate / − kost); lege post → 0. */
  readonly bedrag: number
}

/**
 * Upstream die Af op maand `m` consumeert: de volledige set gebeurtenis-posten
 * (Geb rijen 4-30, 3 posten per rij). De set is statisch over de maanden — de
 * per-maand-selectie (actief-venster) gebeurt in `computeAf`.
 */
export interface AfDep {
  readonly gebPosten: readonly AfGebPost[]
}

/**
 * Af-rij. Kolomletters tussen haakjes. `beyondHorizon` bepaalt of de
 * scaffold-kolommen B/C én de duplicaat-kolommen F/G als `""` getoond worden;
 * kolom **D** (`totaalAfname`) blijft ALTIJD numeriek (geen horizon-guard).
 */
export interface AfRow {
  readonly maand: MonthIndex // A (altijd numeriek)
  readonly beyondHorizon: boolean
  readonly leeftijd: number // B & F ("" bij beyondHorizon)
  readonly maandInJaar: number // C & G ("" bij beyondHorizon)
  readonly totaalAfname: number // D (altijd numeriek)
}

/**
 * Bereken de Af-rij voor maand `m`: de positieve afname uit actieve negatieve
 * gebeurtenis-posten, geïndexeerd naar nominaal. De scaffold-kolommen worden
 * berekend maar door de kolom-getters op `""` gezet voorbij de horizon; D wordt
 * altijd doorgerekend (buiten de horizon vanzelf 0).
 */
export function computeAf(input: KernelInput, dep: AfDep, m: MonthIndex): AfRow {
  // Som van de op maand m actieve posten met een negatief bedrag (kosten).
  let negatieveSom = 0
  for (const post of dep.gebPosten) {
    if (post.bedrag < 0 && post.startIndex <= m && m <= post.eindIndex) {
      negatieveSom += post.bedrag
    }
  }

  // D = −(negatieve som) × index → positieve afname. `negatieveSom === 0` levert
  // een schone 0 (voorkomt −0 en een overbodige index-vermenigvuldiging).
  const totaalAfname =
    negatieveSom === 0 ? 0 : -negatieveSom * inflationIndex(input, m)

  return {
    maand: m,
    beyondHorizon: isBeyondHorizon(input, m),
    leeftijd: leeftijdJaren(input, m),
    maandInJaar: maandInJaar(m),
    totaalAfname,
  }
}
