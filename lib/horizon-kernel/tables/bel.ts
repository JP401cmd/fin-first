/**
 * Horizon-kernel · tabel **Bel** (Box 3-belasting) — Excel-tab `Bel` (A1:P1201).
 *
 * Pure per-maand-functie die de Box 3-heffing berekent, exact zoals het
 * Excel-oracle (ADR 0032). Twee takken + selector:
 *   - **Forfaitair** (kolommen D–K): heffing over de grondslag-stocks
 *     (spaar/overig/schuld) met forfaitaire rendementen; heffingvrij vermogen en
 *     schuldendrempel zijn inflatie-geïndexeerd.
 *   - **Werkelijk** (L/M): tarief over het werkelijke maandrendement van de
 *     Box 3-potten (positieve gate aan beide kanten: bezittings-rendement −
 *     schuld-rente), boven een heffingvrij inkomen; verliesmaand → 0.
 *   - **Canoniek** (N): selector P!B90 → `werkelijk ? M : K`. N(m) voedt later
 *     CF!K(m+1) — dáár zit de één-maand-lag van de heffing, NIET in Bel zelf.
 *
 * **Één-maand-lag — belangrijk detail:** de grondslagen D/E/F zijn de Bez/S-
 * saldi van **dezelfde maand m** (empirisch geverifieerd tegen de fixtures:
 * Bel!D(0)=Bez!AH(0)=40333,33; Bel!D(1)=Bez!AH(1)=40675,94). De structurele lag
 * "belasting over saldi m−1" ontstaat pas doordat CF!K de canonieke heffing van
 * de vorige maand leest (`CF!K(m)=Bel!N(m−1)`). Bel is dus een zuivere functie
 * van maand-m-upstream + parameters — geen m−1-afhankelijkheid binnen de tabel.
 *
 * Teacher-forced parity: de grondslag-totalen en per-pot rendement/rente komen
 * binnen via `BelDep`; in de parity-test komen die uit de fixture (oracle),
 * zodat Bel geïsoleerd formule-getrouw bewezen wordt over alle maanden × alle
 * fixtures. Pure functie, geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelInput, MonthIndex } from '../types'
import { inflationIndex, isBeyondHorizon, leeftijdJaren, maandInJaar } from '../scaffold'

/**
 * Upstream-waarden die Bel op maand m consumeert (alle op maand m; Bel heeft
 * geen m−1-afhankelijkheid). Volgorde van de per-pot-arrays sluit 1-op-1 aan op
 * `input.assetPotten` / `input.schuldPotten`.
 */
export interface BelDep {
  /** Bez!AH(m) — som van bezittingen met box3-type "Box 3 spaar". */
  readonly grondslagSpaar: number
  /** Bez!AI(m) — som van bezittingen met box3-type "Box 3 investering". */
  readonly grondslagInvestering: number
  /** S!AF(m) — som van schulden met een Box 3-type. */
  readonly grondslagSchuld: number
  /** Per bezitting-pot (zelfde volgorde als `input.assetPotten`): rendement(m) uit Bez. */
  readonly assetRendementen: readonly number[]
  /** Per schuld-pot (zelfde volgorde als `input.schuldPotten`): rente(m) uit S. */
  readonly schuldRentes: readonly number[]
}

/** Bel-rij mét berekende kolommen (in-horizon). Kolomletters tussen haakjes. */
export interface BelComputedRow {
  readonly beyondHorizon: false
  readonly maand: MonthIndex // A
  readonly leeftijd: number // B
  readonly maandInJaar: number // C
  readonly grondslagSpaar: number // D
  readonly grondslagInvestering: number // E
  readonly grondslagSchuld: number // F
  readonly schuldNaDrempel: number // G
  readonly rendementsgrondslag: number // H
  readonly fictiefRendement: number // I
  readonly grondslagSparenBeleggen: number // J
  readonly forfaitaireHeffing: number // K
  readonly werkelijkRendement: number // L
  readonly belastingWerkelijk: number // M
  readonly canoniek: number // N
}

/** Bel-rij voorbij de horizon: alleen de maandindex is numeriek, rest is "". */
export interface BelHorizonRow {
  readonly beyondHorizon: true
  readonly maand: MonthIndex // A blijft numeriek; B/C/D..N tonen "" (horizon-guard)
}

export type BelRow = BelComputedRow | BelHorizonRow

/**
 * Bereken de Bel-rij voor maand m uit de statische parameters en de upstream
 * DepView. Voorbij de horizon (leeftijd > 100) levert Excel lege reken-cellen;
 * dat modelleren we als `BelHorizonRow` (de kolom-mapping vertaalt dat naar "").
 */
export function computeBel(input: KernelInput, dep: BelDep, m: MonthIndex): BelRow {
  if (isBeyondHorizon(input, m)) {
    return { beyondHorizon: true, maand: m }
  }

  const { box3 } = input
  const idx = inflationIndex(input, m) // (1+P!B14)^(m/12)

  // ── Forfaitaire tak (D–K) ──────────────────────────────────────────────────
  const D = dep.grondslagSpaar
  const E = dep.grondslagInvestering
  const F = dep.grondslagSchuld

  // G — schuld boven de geïndexeerde schuldendrempel (per persoon × personen).
  const G = Math.max(0, F - box3.schuldendrempelPP * box3.personen * idx)

  // H — rendementsgrondslag.
  const H = D + E - G

  // I — fictief rendement/mnd: forfaits op de drie grondslag-delen, elk /12
  //     (Excel-operatievolgorde per term aangehouden voor bit-getrouwheid).
  const I =
    (D * box3.forfaitSpaar) / 12 +
    (E * box3.forfaitOverig) / 12 -
    (G * box3.forfaitSchuld) / 12

  // J — grondslag boven het geïndexeerde heffingvrije vermogen (× personen).
  const J = Math.max(0, H - box3.heffingvrijVermogenPP * box3.personen * idx)

  // K — forfaitaire heffing = tarief × fictief rendement × belastbaar aandeel
  //     (J/H). H=0 zou in Excel #DIV/0 geven; in-horizon is er altijd grondslag
  //     (H>0), dus deze guard is defensief en wordt door de fixtures niet
  //     uitgeoefend. Operatievolgorde `tarief*I*J/H` = Excel `B20*I*J/H`.
  const K = H === 0 ? 0 : Math.max(0, (box3.tarief * I * J) / H)

  // ── Werkelijke tak (L/M) ───────────────────────────────────────────────────
  // L — werkelijk maandrendement: som rendement van Box 3-bezittingen
  //     (spaar + investering) − som rente van Box 3-schulden. Beide gates
  //     positief; "Geen Box 3", lege of typeloze potten tellen niet mee.
  let assetRendement = 0
  for (let i = 0; i < input.assetPotten.length; i++) {
    const type = input.assetPotten[i].box3Type
    if (type === 'Box 3 spaar' || type === 'Box 3 investering') {
      assetRendement += dep.assetRendementen[i] ?? 0
    }
  }
  let schuldRente = 0
  for (let i = 0; i < input.schuldPotten.length; i++) {
    if (input.schuldPotten[i].box3Type === 'Box 3 schuld') {
      schuldRente += dep.schuldRentes[i] ?? 0
    }
  }
  const L = assetRendement - schuldRente

  // M — belasting werkelijk = tarief × MAX(0, L − heffingvrij inkomen/12).
  //     Verliesmaand → 0 (geen verliesverrekening).
  const M = box3.tarief * Math.max(0, L - box3.heffingvrijInkomenTotaal / 12)

  // N — canonieke heffing (→ CF!K van de volgende maand). Selector P!B90.
  const N = box3.method === 'werkelijk' ? M : K

  return {
    beyondHorizon: false,
    maand: m,
    leeftijd: leeftijdJaren(input, m),
    maandInJaar: maandInJaar(m),
    grondslagSpaar: D,
    grondslagInvestering: E,
    grondslagSchuld: F,
    schuldNaDrempel: G,
    rendementsgrondslag: H,
    fictiefRendement: I,
    grondslagSparenBeleggen: J,
    forfaitaireHeffing: K,
    werkelijkRendement: L,
    belastingWerkelijk: M,
    canoniek: N,
  }
}
