/**
 * Horizon-kernel · tabel **Werk-strategie** — Excel-tab `Werk-strategie` (A1:S1201, NIEUW in v5).
 *
 * Pure per-maand-functie die de **inkomenslijn** bouwt: een reële salarisladder →
 * nominale delta t.o.v. het basisinkomen → FIRE-gegate delta die CF!D voedt.
 * Exact zoals het Excel-oracle (ADR 0032). De keten in vier stappen:
 *
 *   1. **Reële salarisladder** (Excel-kolommen K/L, per hele leeftijd): recursief
 *      `L(leeftijd) = MIN(plafond, (L(leeftijd−1) + sprong@leeftijd) · (1 + reëeleGroei))`,
 *      startend op `L(startLeeftijd) = B1` (basis netto/mnd), t/m leeftijd 71
 *      (structuur.md). De groei is *reëel* (bóven inflatie).
 *   2. **Reëel salaris/mnd** (kolom **P**): exact-match jaar-lookup van de ladder op
 *      `INT(leeftijd)`, × een deeltijd-factor (LOOKUP op de fractionele leeftijd).
 *      Buiten het ladderbereik (leeftijd > 71) valt de lookup terug op B1 — het
 *      salaris "reset" dan naar de basis (empirisch: op leeftijd 72 → P = B1).
 *   3. **Reële delta** (kolom **Q**) `= P − B1`, en **nominale delta** (kolom **R**)
 *      `= Q · (1 + inflatie)^(m/12)` (dezelfde indexatie als de rest van de kern).
 *   4. **FIRE-gegate delta** (kolom **S**) `= IF(leeftijd < FIRE-leeftijd, R, 0)` →
 *      voedt CF!D. Ná FIRE lekt er geen salaris de onttrekkingsfase in
 *      (lek-invariant Controle!K11: strategie uit → delta 0).
 *
 * **FIRE-gate via maandindex i.p.v. fractionele leeftijd (bewuste keuze):** de
 * Excel-gate is `O(m) < IF(P!B16="", P!B35, P!B16)` met O = de fractionele leeftijd
 * `startLeeftijd + m/12`. Omdat P!B16 (de solver-FIRE-leeftijd) in de fixtures op
 * 6 decimalen is afgerond, breekt een strikte `<`-vergelijking tegen onze
 * vol-precieze O exact op de grensmaand (waar O == FIRE-leeftijd). De gate is
 * echter equivalent aan de integer-exacte `m < FIRE-maand`, want zowel O als de
 * FIRE-leeftijd zijn `startLeeftijd + maanden/12`. We resolven daarom de gate naar
 * `FIRE-maand = ROUND((FIRE-leeftijd − startLeeftijd) · 12)` en vergelijken `m <
 * FIRE-maand` — euro-exact op de grens (geverifieerd: basis m=194 → S=0;
 * onhaalbaar m=768 → S=0). De ×12 amplificeert de 6-decimalen-afronding tot ±6·10⁻⁶,
 * die `ROUND` wegneemt.
 *
 * **Geen horizon-guard:** anders dan de A/B/C-maandtabellen (Bel e.d.) leegt deze
 * tab niets voorbij leeftijd 100 — de eigen maandkolommen N/O blijven numeriek en
 * P/Q/R/S rekenen door (empirisch: m=769, leeftijd 100,083 → O/P/Q/R/S numeriek).
 * Elke van de 1200 maanden levert dus een volledig numerieke rij.
 *
 * Teacher-forced parity: de enige upstream-waarde is de solver-gebonden
 * FIRE-leeftijd (`WerkStrategieDep.fireGateLeeftijd`); in de parity-test komt die
 * uit de fixture-P-sheet (oracle), zodat de tabel geïsoleerd formule-getrouw
 * bewezen wordt over alle maanden × alle fixtures. De salarisladder zelf is een
 * zuivere functie van `input.werkStrategie` (geen upstream-tabel). Pure functie,
 * geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelInput, MonthIndex, WerkStrategieParams } from '../types'
import { ageAtMonth, inflationIndex } from '../scaffold'

/**
 * Laatste leeftijd in de reële salarisladder (structuur.md: "t/m 71"). Voorbij
 * deze leeftijd vindt de jaar-lookup geen match en valt het reële salaris terug
 * op het basisinkomen B1 (empirisch geverifieerd: leeftijd 72 → P = B1). Alle 16
 * fixtures starten op leeftijd 36; of dit een absolute (71) dan wel start-relatieve
 * grens is, is met die fixtures niet te onderscheiden — 71 volgt de bron letterlijk.
 */
const LADDER_END_AGE = 71

/**
 * Upstream-waarde die Werk-strategie op maand m consumeert. De salarisladder komt
 * volledig uit `input.werkStrategie`; alleen de FIRE-gate is solver-gebonden en
 * dus teacher-forced (P!B16 met P!B35 als fallback).
 */
export interface WerkStrategieDep {
  /**
   * Geresolveerde FIRE-gate-leeftijd: `IF(P!B16="", P!B35, P!B16)`. Solver-gebonden
   * (P!B16 = solver-FIRE-leeftijd, P!B35 = solver-eindleeftijd) en daarom geen
   * static input — in de parity-test uit de fixture-P-sheet gelezen.
   */
  readonly fireGateLeeftijd: number
}

/** Werk-strategie-rij (maandtabel N:S). Kolomletters tussen haakjes. */
export interface WerkStrategieRow {
  readonly maand: MonthIndex // N — maandindex (0..1199)
  readonly leeftijd: number // O — fractionele leeftijd (startLeeftijd + m/12), geen horizon-guard
  readonly reeelSalaris: number // P — reëel salaris/mnd (jaar-lookup × deeltijd)
  readonly reeleDelta: number // Q — reële delta = P − B1
  readonly nominaleDelta: number // R — nominale delta = Q · (1+inflatie)^(m/12)
  readonly gegateDelta: number // S — delta gegate op FIRE → CF!D
}

/**
 * Reëel salaris uit de jaarladder voor een hele leeftijd (Excel-kolom L via de
 * jaar-lookup in P). Recursief `L(leeftijd) = MIN(plafond, (L(leeftijd−1) +
 * sprong@leeftijd) · (1 + reëeleGroei))`, met `L(startLeeftijd) = B1`. De MIN
 * (plafond) wordt per stap toegepast; `plafond = 0` betekent "geen plafond". De
 * groei stopt na `groeiTotLeeftijd` (null = doorlopend). Buiten het ladderbereik
 * levert de exact-match-lookup het basisinkomen B1 (salaris-reset voorbij 71).
 *
 * Let op: sprongen (D3:E8) en `groeiTotLeeftijd` (B3) zijn in alle 16 fixtures
 * leeg; die takken zijn geïmplementeerd conform structuur.md maar onbeproefd.
 */
function reeelSalarisLadder(ws: WerkStrategieParams, startLeeftijd: number, intLeeftijd: number): number {
  // Exact-match jaar-lookup: buiten [startLeeftijd, 71] geen match → basisinkomen.
  if (intLeeftijd < startLeeftijd || intLeeftijd > LADDER_END_AGE) {
    return ws.basisNettoPerMaand
  }
  let waarde = ws.basisNettoPerMaand // L(startLeeftijd) = B1
  for (let leeftijd = startLeeftijd + 1; leeftijd <= intLeeftijd; leeftijd++) {
    let volgende = waarde + sprongDeltaBijLeeftijd(ws, leeftijd)
    // Reële groei bóven inflatie; stopt voorbij groeiTotLeeftijd (null = doorlopend).
    if (ws.groeiTotLeeftijd === null || leeftijd <= ws.groeiTotLeeftijd) {
      volgende *= 1 + ws.reeleGroei
    }
    if (ws.plafondNettoPerMaand > 0) {
      volgende = Math.min(ws.plafondNettoPerMaand, volgende)
    }
    waarde = volgende
  }
  return waarde
}

/** Som van de salarissprongen (D3:E8) die op exact deze hele leeftijd landen. */
function sprongDeltaBijLeeftijd(ws: WerkStrategieParams, leeftijd: number): number {
  let som = 0
  for (const sprong of ws.sprongen) {
    if (sprong.bijLeeftijd === leeftijd) som += sprong.deltaNettoPerMaand
  }
  return som
}

/**
 * Deeltijd-factor (Excel-kolom H via LOOKUP): de pct van de hoogste `vanafLeeftijd`
 * die ≤ de (fractionele) leeftijd is; onder de eerste drempel → 1 (voltijd). In
 * alle 16 fixtures leeg (factor altijd 1) — conform structuur.md geïmplementeerd,
 * onbeproefd.
 */
function deeltijdFactor(ws: WerkStrategieParams, leeftijd: number): number {
  let factor = 1
  let besteVanaf = Number.NEGATIVE_INFINITY
  for (const stap of ws.deeltijd) {
    if (stap.vanafLeeftijd <= leeftijd && stap.vanafLeeftijd > besteVanaf) {
      besteVanaf = stap.vanafLeeftijd
      factor = stap.pct
    }
  }
  return factor
}

/**
 * Bereken de Werk-strategie-rij (maandtabel N:S) voor maand m uit de statische
 * parameters en de teacher-forced FIRE-gate. Geen horizon-guard: elke maand
 * levert een volledig numerieke rij.
 */
export function computeWerkStrategie(
  input: KernelInput,
  dep: WerkStrategieDep,
  m: MonthIndex,
): WerkStrategieRow {
  const ws = input.werkStrategie

  // O — fractionele leeftijd (geen horizon-guard; loopt door voorbij 100).
  const leeftijd = ageAtMonth(input, m)

  // P — reëel salaris/mnd: jaar-lookup op INT(leeftijd) × deeltijd-factor.
  const reeelSalaris = reeelSalarisLadder(ws, input.startLeeftijd, Math.floor(leeftijd)) * deeltijdFactor(ws, leeftijd)

  // Q — reële delta t.o.v. het vlakke basisinkomen (voorkomt dubbeltelling met P!B10).
  const reeleDelta = reeelSalaris - ws.basisNettoPerMaand

  // R — nominale delta: reële delta geïndexeerd naar het prijspeil van maand m.
  const nominaleDelta = reeleDelta * inflationIndex(input, m)

  // S — FIRE-gegate delta. De Excel-gate `leeftijd < FIRE-leeftijd` is integer-exact
  // gelijk aan `m < FIRE-maand` (beide = startLeeftijd + maanden/12); zie module-doc.
  const fireMaand = Math.round((dep.fireGateLeeftijd - input.startLeeftijd) * 12)
  const gegateDelta = m < fireMaand ? nominaleDelta : 0

  return {
    maand: m,
    leeftijd,
    reeelSalaris,
    reeleDelta,
    nominaleDelta,
    gegateDelta,
  }
}
