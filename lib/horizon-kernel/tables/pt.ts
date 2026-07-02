/**
 * Horizon-kernel · tabel **PT** (partner / huishouden) — Excel-tab `PT` (A1:K1201).
 *
 * PT is de **partner-parameterlaag**: geen tweede kolommenset in de hoofd-maandloop,
 * maar één eigen maandtabel `G:K` die de partnerbijdrage aan de cashflow levert.
 * Kolom **K** voedt zowel `CF!D` (inkomen) als `Ont!D` (onttrekkingsbehoefte na FIRE).
 * Pure per-maand-functie, exact zoals het Excel-oracle (ADR 0032). De maandkolommen:
 *   - **G maandindex** — de head-maandindex `m` (0..1199), altijd numeriek (rij-uitlijning).
 *   - **H partner-leeftijd** `= partnerStartLeeftijd + m/12` — de partner-tijdas (fractioneel).
 *   - **I werkinkomen** `= IF(partner ∧ m < AOW-drempel, (B4/12)·idx, 0)` — geïndexeerd
 *     netto partner-maandinkomen, tot de partner AOW-leeftijd bereikt.
 *   - **J AOW + pensioen** `= [m ≥ AOW-drempel]·(B9/12)·idx + [m ≥ pensioen-drempel]·pensioen` —
 *     partner-AOW vanaf de AOW-drempel plus (optioneel geïndexeerd) partnerpensioen
 *     vanaf de pensioen-drempel; nul zolang de partner nog werkt.
 *   - **K totaal** `= I + J` — de partnerbijdrage die CF!D en Ont!D consumeren.
 *
 * **Presentie-gate (PT!B2).** Alleen de geld-kolommen I/J/K worden op nul gezet als
 * er géén partner is (`B2 = 0`); de tijdas-kolommen **G en H blijven altijd numeriek**
 * berekend (empirisch: in de 15 partner-uit-fixtures blijft H de partner-leeftijd en
 * G de maandindex, terwijl I=J=K=0). De head-afgeleide drempelcellen (B10-B12) worden
 * óók onafhankelijk van B2 gevuld — zie `computePartnerHead`.
 *
 * **Geen horizon-guard.** Net als Werk-strategie (en anders dan Bel/CF) leegt PT niets
 * voorbij leeftijd 100: H en de geld-kolommen rekenen door tot m=1199 (empirisch:
 * m=1199 → H≈133,9, J blijft geïndexeerd doorgroeien). Elke van de 1200 maanden levert
 * dus een volledig numerieke rij; er is geen A/B/C-scaffold-guard.
 *
 * **Geen upstream-tabel-afhankelijkheid.** PT is een zuivere parameterlaag: elke cel
 * volgt uit `KernelInput` (partner-blok + `persoon.startjaar` + `inflatie`). De AOW-
 * leeftijd `PT!B5 (=ES!C15)` is in `KernelInput.partner.aowLeeftijd` al als resolved
 * waarde opgenomen, dus er is geen teacher-forced DepView nodig (`PTDep` is leeg). Dat
 * onderscheidt PT van bv. Werk-strategie (solver-FIRE-gate) en CF (Bel!N(m−1) e.a.).
 *
 * **Onbeproefde tak (partnerpensioen).** In alle 16 fixtures is `PT!B6 = 0` (geen
 * partnerpensioen), dus de pensioen-term van J en de indexatie-schakelaar (B8) zijn
 * geïmplementeerd conform structuur.md maar door de fixtures niet uitgeoefend. De
 * AOW-term én de werkinkomen-tak zijn wél bewezen door de `partner-aan`-fixture.
 *
 * Pure functie, geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelInput, MonthIndex } from '../types'
import { inflationIndex } from '../scaffold'

/**
 * Upstream-waarden die PT op maand m consumeert: **geen**. PT is een zuivere
 * parameterlaag zonder afhankelijkheid van een andere maandtabel (alle input komt
 * uit `KernelInput`). De lege DepView houdt de tabel-port-vorm consistent met de
 * teacher-forced parity-harnas (`TableParitySpec`), zonder een echte dependency te
 * suggereren.
 */
export type PTDep = Record<string, never>

/** PT-maandrij (maandtabel G:K). Kolomletters tussen haakjes. */
export interface PTRow {
  readonly maand: MonthIndex // G — head-maandindex (0..1199), geen horizon-guard
  readonly partnerLeeftijd: number // H — partner-tijdas (partnerStartLeeftijd + m/12)
  readonly werkinkomen: number // I — geïndexeerd partner-inkomen tot AOW-drempel
  readonly aowPensioen: number // J — partner-AOW (+ pensioen) vanaf de drempels
  readonly totaal: number // K — I + J → CF!D en Ont!D
}

/**
 * De afgeleide "head-tijdas"-cellen van PT (PT!B10-B12): de partner-DOB-offset en de
 * twee maandindex-drempels (op de head-tijdas) waarop het partner-AOW resp. -pensioen
 * ingaat. Afgeleid uit `KernelInput` (geen static input; daarom hier berekend).
 */
export interface PartnerHead {
  readonly dobVerschilMnd: number // B10 — DOB-verschil in maanden (head − partner)
  readonly aowStartMaand: number // B11 — maandindex waarop de partner AOW-leeftijd bereikt
  readonly pensioenStartMaand: number // B12 — maandindex waarop het partnerpensioen ingaat
}

/**
 * Partner-startleeftijd (partner-leeftijd op maand 0) `= startjaar − geboortejaar
 * partner`. Vormt de basis van de partner-tijdas (kolom H) én de twee drempels
 * (B11/B12); in alle fixtures 34 (2026 − 1992).
 */
function partnerStartLeeftijd(input: KernelInput): number {
  return input.persoon.startjaar - input.partner.geboortejaar
}

/**
 * Bereken de afgeleide head-cellen (B10-B12) uit de partner-parameters. Onafhankelijk
 * van de presentie-vlag (B2): Excel vult deze cellen ook wanneer er geen partner is.
 * De drempels zijn maandindices op de head-tijdas — het aantal maanden tot de partner
 * de betreffende leeftijd bereikt (`ROUND` vangt eventuele fractionele-jaar-restjes;
 * in de fixtures zijn alle jaren geheel → exact −24 / 396 / 408).
 */
export function computePartnerHead(input: KernelInput): PartnerHead {
  const p = input.partner
  const start = partnerStartLeeftijd(input)
  return {
    // B10 — DOB-verschil in maanden: head geboortejaar − partner geboortejaar, ×12.
    dobVerschilMnd: (input.persoon.geboortejaar - p.geboortejaar) * 12,
    // B11 — maanden tot de partner AOW-leeftijd bereikt (op de head-maandindex).
    aowStartMaand: Math.round((p.aowLeeftijd - start) * 12),
    // B12 — maanden tot de partner-pensioen-startleeftijd.
    pensioenStartMaand: Math.round((p.pensioenStartleeftijd - start) * 12),
  }
}

/**
 * Bereken de PT-maandrij (G:K) voor maand m uit de statische partner-parameters.
 * `_dep` is leeg — PT heeft geen upstream-tabel-afhankelijkheid (zie module-doc).
 * Geen horizon-guard: elke maand levert een volledig numerieke rij.
 */
export function computePT(input: KernelInput, _dep: PTDep, m: MonthIndex): PTRow {
  const p = input.partner
  const idx = inflationIndex(input, m) // (1+P!B14)^(m/12)
  const { aowStartMaand, pensioenStartMaand } = computePartnerHead(input)

  // H — partner-tijdas: altijd numeriek, óók voor een afwezige partner en voorbij 100.
  const partnerLeeftijd = partnerStartLeeftijd(input) + m / 12

  // Presentie-gate: zonder partner leveren de geld-kolommen nul (G/H blijven berekend).
  if (!p.aanwezig) {
    return { maand: m, partnerLeeftijd, werkinkomen: 0, aowPensioen: 0, totaal: 0 }
  }

  // I — werkinkomen: geïndexeerd netto-maandinkomen tot (exclusief) de AOW-drempel.
  const werkinkomen = m < aowStartMaand ? (p.nettoJaarinkomen / 12) * idx : 0

  // J — AOW vanaf de AOW-drempel (altijd geïndexeerd) + pensioen vanaf de pensioen-
  //     drempel. Het pensioen is geïndexeerd zodra `pensioenGeindexeerd`; anders
  //     nominaal-constant. (In alle fixtures is het partnerpensioen 0 → onbeproefd.)
  const aow = m >= aowStartMaand ? (p.aowBedragPpPerJaar / 12) * idx : 0
  const pensioenPerMaand = p.pensioenBrutoPerJaar / 12
  const pensioen =
    m >= pensioenStartMaand ? (p.pensioenGeindexeerd ? pensioenPerMaand * idx : pensioenPerMaand) : 0
  const aowPensioen = aow + pensioen

  return { maand: m, partnerLeeftijd, werkinkomen, aowPensioen, totaal: werkinkomen + aowPensioen }
}
