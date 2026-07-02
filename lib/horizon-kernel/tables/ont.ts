/**
 * Horizon-kernel · tabel **Ont** (onttrekkingsbehoefte na FIRE) — Excel-tab `Ont`
 * (A1:J1203). Pure per-maand-functie die berekent hoeveel er ná FIRE maandelijks
 * onttrokken moet worden, mét het gekozen onttrekkingsprofiel als factor, exact
 * zoals het Excel-oracle (ADR 0032).
 *
 * Kolommen (A/B/C = maand/leeftijd/maand-in-jaar; E = spacer; J = toelichting):
 *   - **D** onttrekkingsbehoefte: `IF(m ≥ FIRE-maand, MAX(0, uitgave-term·I +
 *     Bez!BA − Bez!BB + CF!K − PT!K), 0)`. De uitgave-term is de geïndexeerde
 *     jaaruitgave-na-pensioen (P!B15/12 · (1+inflatie)^(m/12)); **de profielfactor
 *     I grijpt ALLEEN op die uitgave-term** — huur (BA), vervallen hypotheeklast
 *     (BB), Box3 (CF!K) en partnerbijdrage (PT!K) blijven ongefactord (Ont!J1).
 *     Partner-overschot boven de behoefte valt weg door de MAX(0;…).
 *   - **F** fase-factor (go-go/slow-go/no-go): leeftijd ≤ B71 → B72%; ≤ B73 →
 *     B74%; anders B75% (procenten → factor via /100).
 *   - **G** liquide netto vorige maand: passthrough van Prognose!J(m−1)
 *     (m=0 → 0). Puur een venster op de upstream-stock; geen eigen rekenwerk.
 *   - **H** guardrails-factor (toestandloos per maand): ratio = G/P!B82;
 *     ratio > B80 → MIN(B78, 1+B81); ratio < B79 → MAX(B77, 1−B81); anders 1.
 *   - **I** actieve factor: `SWITCH(P!B69, Vast→1, Afnemend→F, Oplopend→F,
 *     Guardrails→H, [default] 1)`.
 *
 * **Één-maand-lag:** G leest Prognose!J(m−1) en P!B82 is het m−1-anker (liquide
 * netto in de maand vóór FIRE); de Box3-term CF!K(m) draagt al de Bel!N(m−1)-lag
 * in zich. Ont zelf heeft dus geen andere m−1-afhankelijkheid dan die upstream-
 * vensters, die teacher-forced via `OntDep` binnenkomen.
 *
 * **Horizon-guard (kolom-specifiek, empirisch geverifieerd tegen de fixtures):**
 * voorbij de horizon (leeftijd > 100) leegt Excel B/C ("") maar zet het de
 * factor-kolommen op hun neutrale waarde en de behoefte op 0: D=0, F=1, H=1, I=1.
 * A blijft numeriek. G volgt puur Prognose!J(m−1): reëel zolang m−1 in-horizon is
 * (óók op de eerste voorbij-horizon-maand), "" zodra m−1 zelf voorbij de horizon
 * ligt. Dat wijkt bewust af van de uniforme "alles leeg"-guard van tabel Bel.
 *
 * **Solver-koppeling:** de FIRE-maand (uit P!B16) en het guardrails-anker P!B82
 * zijn solver-gebonden; ze komen teacher-forced via `OntDep` binnen (niet uit
 * `KernelInput`), zodat de module later aan de echte FIRE-solver te koppelen is.
 *
 * Pure functie, geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelInput, MonthIndex, Onttrekkingsprofiel } from '../types'
import {
  ageAtMonth,
  inflationIndex,
  isBeyondHorizon,
  leeftijdJaren,
  maandInJaar,
} from '../scaffold'

/**
 * Upstream-waarden die Ont op maand m consumeert.
 *
 * De eerste twee velden zijn **solver-gebonden constanten** (per projectie, niet
 * per maand): `fireMaand` volgt uit P!B16, `guardrailsAnker` = P!B82. De overige
 * velden zijn per-maand-vensters op andere tabellen. In de parity-test komen ze
 * uit de fixture (teacher-forcing); in de integrale engine straks uit de echte
 * upstream-tabellen + solver.
 */
export interface OntDep {
  /** FIRE-maand = `ROUND((P!B16 − P!B7)·12, 0)` (solver-uitkomst; D-gate). */
  readonly fireMaand: number
  /** P!B82 — guardrails-referentie: liquide netto in de maand vóór FIRE (m−1-anker). */
  readonly guardrailsAnker: number
  /** Prognose!J(m−1) — liquide netto vorige maand (numeriek; bij m=0 ongebruikt). */
  readonly liquideNettoVorigeMaand: number
  /** Bez!BA(m) — huur/mnd na verkoop van het eigen huis. */
  readonly huurNaVerkoop: number
  /** Bez!BB(m) — vervallen hypotheeklast/mnd na verkoop. */
  readonly vervallenHypotheeklast: number
  /** CF!K(m) — Box3-heffing (draagt de Bel!N(m−1)-lag). */
  readonly box3VorigeMaand: number
  /** PT!K(m) — partner cashflow-bijdrage (inkomen/AOW/pensioen). */
  readonly partnerTotaal: number
}

/**
 * Ont-rij. Alle reken-kolommen zijn altijd aanwezig; B/C en G kunnen `""` zijn
 * (Excel-leegte) conform de kolom-specifieke horizon-guard (zie module-doc).
 * Kolomletters tussen haakjes; E (spacer) en J (toelichting) horen niet in de rij.
 */
export interface OntRow {
  readonly maand: MonthIndex // A (altijd numeriek)
  /** True zodra de leeftijd > 100 (Excel-horizon-guard). */
  readonly beyondHorizon: boolean
  readonly leeftijd: number | '' // B ("" voorbij de horizon)
  readonly maandInJaar: number | '' // C ("" voorbij de horizon)
  readonly onttrekking: number // D (0 vóór FIRE én voorbij de horizon)
  readonly faseFactor: number // F (1 voorbij de horizon)
  /** G — Prognose!J(m−1); "" zodra m−1 zelf voorbij de horizon ligt, 0 bij m=0. */
  readonly liquideNettoVorigeMaand: number | ''
  readonly guardrailsFactor: number // H (1 voorbij de horizon)
  readonly actieveFactor: number // I (1 voorbij de horizon)
}

/**
 * Fase-factor F in-horizon: de gedeelde 3-fasen-curve (go-go / slow-go / no-go).
 * De B72/B74/B75-waarden zijn procenten (100/85/70) → factor via /100. De
 * leeftijd is de fractionele leeftijd `P!B7 + m/12` (Excel vergelijkt "≤").
 */
function faseFactorInHorizon(input: KernelInput, m: MonthIndex): number {
  const p = input.onttrekkingsprofiel
  const leeftijd = ageAtMonth(input, m)
  if (leeftijd <= p.fase1TotLeeftijd) return p.factor1Pct / 100
  if (leeftijd <= p.fase2TotLeeftijd) return p.factor2Pct / 100
  return p.factor3Pct / 100
}

/**
 * Guardrails-factor H in-horizon (toestandloos): stem de onttrekking bij op basis
 * van hoe het liquide vermogen (m−1) zich verhoudt tot het anker P!B82. Boven de
 * bovendrempel → één stap omhoog (geplafonneerd op de ceiling); onder de
 * onderdrempel → één stap omlaag (met de floor als bodem); anders neutraal.
 */
function guardrailsFactorInHorizon(input: KernelInput, dep: OntDep): number {
  const p = input.onttrekkingsprofiel
  // Anker 0 zou #DIV/0 geven; in-horizon is er altijd een positief anker, dus
  // deze guard is defensief en wordt door de fixtures niet uitgeoefend.
  const ratio = dep.guardrailsAnker === 0 ? 0 : dep.liquideNettoVorigeMaand / dep.guardrailsAnker
  if (ratio > p.guardrailBovendrempelRatio) return Math.min(p.guardrailCeiling, 1 + p.guardrailStap)
  if (ratio < p.guardrailOnderdrempelRatio) return Math.max(p.guardrailFloor, 1 - p.guardrailStap)
  return 1
}

/** Actieve factor I: selecteer per profiel welke factor de uitgave-term stuurt. */
function actieveFactor(profiel: Onttrekkingsprofiel, faseFactor: number, guardrailsFactor: number): number {
  switch (profiel) {
    case 'Vast':
      return 1
    case 'Afnemend':
    case 'Oplopend':
      return faseFactor
    case 'Guardrails':
      return guardrailsFactor
    default:
      return 1 // Excel SWITCH-default (onbereikbaar bij een geldig profiel)
  }
}

/**
 * Bereken de Ont-rij voor maand m uit de statische parameters en de upstream
 * DepView. Zie de module-doc voor de kolom-formules en de (kolom-specifieke)
 * horizon-guard.
 */
export function computeOnt(input: KernelInput, dep: OntDep, m: MonthIndex): OntRow {
  const beyond = isBeyondHorizon(input, m)

  // ── A/B/C ──────────────────────────────────────────────────────────────────
  const leeftijd: number | '' = beyond ? '' : leeftijdJaren(input, m)
  const maandInJaarCol: number | '' = beyond ? '' : maandInJaar(m)

  // ── F (fase-factor) — neutraal 1 voorbij de horizon ─────────────────────────
  const faseFactor = beyond ? 1 : faseFactorInHorizon(input, m)

  // ── G (liquide netto m−1) — passthrough Prognose!J(m−1) ─────────────────────
  // m=0 → 0 (geen vorige maand); "" zodra m−1 zelf voorbij de horizon ligt
  // (Prognose leegt zijn eigen kolom dan); anders het reële upstream-getal —
  // óók op de eerste voorbij-horizon-maand, waar m−1 nog in-horizon is.
  const liquideNettoVorigeMaand: number | '' =
    m === 0 ? 0 : isBeyondHorizon(input, m - 1) ? '' : dep.liquideNettoVorigeMaand

  // ── H (guardrails-factor) — neutraal 1 voorbij de horizon ───────────────────
  const guardrailsFactor = beyond ? 1 : guardrailsFactorInHorizon(input, dep)

  // ── I (actieve factor) ──────────────────────────────────────────────────────
  // Voorbij de horizon zijn F én H al op 1 gezet, dus I valt vanzelf op 1 terug.
  const actieveFactorVal = actieveFactor(input.onttrekkingsprofiel.profiel, faseFactor, guardrailsFactor)

  // ── D (onttrekkingsbehoefte) ────────────────────────────────────────────────
  let onttrekking = 0
  if (!beyond && m >= dep.fireMaand) {
    const uitgaveTerm =
      (input.inkomenUitgaven.uitgaveNaPensioenPerJaar / 12) * inflationIndex(input, m) * actieveFactorVal
    onttrekking = Math.max(
      0,
      uitgaveTerm +
        dep.huurNaVerkoop -
        dep.vervallenHypotheeklast +
        dep.box3VorigeMaand -
        dep.partnerTotaal,
    )
  }

  return {
    maand: m,
    beyondHorizon: beyond,
    leeftijd,
    maandInJaar: maandInJaarCol,
    onttrekking,
    faseFactor,
    liquideNettoVorigeMaand,
    guardrailsFactor,
    actieveFactor: actieveFactorVal,
  }
}
