/**
 * Horizon-kernel · tabel **Prognose** (samenvattend maandvermogen) — Excel-tab
 * `Prognose` (A1:O1201).
 *
 * Pure per-maand-functie die het samenvattende vermogen per maand berekent,
 * exact zoals het Excel-oracle (ADR 0032). De tabel *aggregeert* upstream-totalen
 * (Bez / S / Bel) tot de kern-vermogensmaten die de rest van het model consumeert:
 *
 *   - **D** totaal bezittingen  `=Bez!AH+AI+AJ`  (som van de drie Box 3-type-totalen).
 *   - **E** totaal schulden      `=S!AF+AG`       (Box 3-schuld + geen-Box 3-schuld).
 *   - **F** Box 3 (forfaitair)   `=Bel!K`         (forfaitaire referentie-heffing; info).
 *   - **G** cumulatief Box 3     `=G(m−1)+F`      (lopende som; puur informatief).
 *   - **H** bruto vermogen       `=D−E`.
 *   - **I** netto vermogen       `=H`             (Box 3 loopt via de cashflow, NIET
 *     cumulatief van het vermogen af — F/G zijn slechts referentie).
 *   - **J** netto-liquide        `=I−(L−M)`       (FIRE-grondslag; niet-liquide bezit
 *     eruit, niet-liquide schuld erbij).
 *   - **K** schulden (negatief)  `=−E`.
 *   - **L** niet-liquide bezit   = Σ Bez-categorietotaal waarvan TS!H5:H10 = "Ja".
 *   - **M** niet-liquide leningen= Σ S-categorietotaal waarvan TS!H16:H20 = "Ja".
 *
 * **Niet-liquide (L/M) — TS-vlaggen × categorietotalen.** De niet-liquide-vlaggen
 * (`nietLiquide` per categorie) staan in `KernelInput` (TS!H); de categorietotalen
 * komen upstream uit Bez!AM:AR (6 bezit-categorieën) resp. S!AJ:AN (5 schuld-
 * categorieën, Tekort-lening telt NIET mee). Onder woning-strategie ≠ "Meerekenen"
 * staan Eigen huis + Woning-schuld op "Ja" → huis én woningschuld vallen uit J.
 * De DepView levert de totalen **op TS-categorie-volgorde uitgelijnd** (de test-
 * `buildDep` mapt elke categorie op zijn Bez/S-kolom — de Bez-kolomvolgorde wijkt
 * bewust af van de TS-rijvolgorde: Eigen huis staat als laatste in Bez!AR).
 *
 * **Één-maand-lag — enige intra-tabel-afhankelijkheid:** G is een lopende som en
 * leest zijn eigen vorige waarde `G(m−1)`. Net als andere m−1-ankers (README §3)
 * wordt dat teacher-forced uit de fixture (`cumulatiefBox3Vorige`; 0 bij m=0). Alle
 * overige kolommen zijn zuivere functies van maand-m-upstream + parameters — de
 * structurele lag van de Box 3-heffing zelf zit in CF (`CF!K=Bel!N(m−1)`), niet hier.
 *
 * Teacher-forced parity: de upstream-totalen komen binnen via `PrognoseDep`; in de
 * parity-test komen die uit de fixture (oracle), zodat Prognose geïsoleerd formule-
 * getrouw bewezen wordt over alle maanden × alle fixtures. Pure functie, geen
 * fs/Supabase/Date.now/Math.random.
 */

import type { KernelInput, MonthIndex } from '../types'
import { isBeyondHorizon, leeftijdJaren, maandInJaar } from '../scaffold'

/**
 * Upstream-waarden die Prognose op maand m consumeert. De categorie-totaal-arrays
 * zijn 1-op-1 uitgelijnd op `input.ts.bezitCategorien` resp. `input.ts.schuldCategorien`
 * (dezelfde volgorde), zodat `compute` de niet-liquide-vlag per index kan toepassen.
 */
export interface PrognoseDep {
  /** Bez!AH+AI+AJ(m) — totaal bezittingen (drie Box 3-type-totalen). */
  readonly totaalBezittingen: number
  /** S!AF+AG(m) — totaal schulden (Box 3-schuld + geen-Box 3-schuld). */
  readonly totaalSchulden: number
  /** Bel!K(m) — forfaitaire Box 3-heffing (referentie; voedt F). */
  readonly box3Forfaitair: number
  /** Prognose!G(m−1) — cumulatieve Box 3 t/m vorige maand (intra-tabel m−1-anker; 0 bij m=0). */
  readonly cumulatiefBox3Vorige: number
  /** Per `input.ts.bezitCategorien` (zelfde volgorde): categorie-totaal uit Bez!AM:AR. */
  readonly bezCategorieTotalen: readonly number[]
  /** Per `input.ts.schuldCategorien` (zelfde volgorde): categorie-totaal uit S!AJ:AN (Tekort-lening → 0). */
  readonly schuldCategorieTotalen: readonly number[]
}

/** Prognose-rij mét berekende kolommen (in-horizon). Kolomletters tussen haakjes. */
export interface PrognoseComputedRow {
  readonly beyondHorizon: false
  readonly maand: MonthIndex // A
  readonly leeftijd: number // B
  readonly maandInJaar: number // C
  readonly totaalBezittingen: number // D
  readonly totaalSchulden: number // E
  readonly box3Forfaitair: number // F
  readonly cumulatiefBox3: number // G
  readonly brutoVermogen: number // H
  readonly nettoVermogen: number // I
  readonly nettoLiquide: number // J
  readonly schuldenNegatief: number // K
  readonly nietLiquideBezit: number // L
  readonly nietLiquideLeningen: number // M
}

/** Prognose-rij voorbij de horizon: alleen de maandindex is numeriek, rest is "". */
export interface PrognoseHorizonRow {
  readonly beyondHorizon: true
  readonly maand: MonthIndex // A blijft numeriek; B..M tonen "" (horizon-guard)
}

export type PrognoseRow = PrognoseComputedRow | PrognoseHorizonRow

/**
 * Bereken de Prognose-rij voor maand m uit de statische parameters en de upstream
 * DepView. Voorbij de horizon (leeftijd > 100) levert Excel lege reken-cellen; dat
 * modelleren we als `PrognoseHorizonRow` (de kolom-mapping vertaalt dat naar "").
 */
export function computePrognose(input: KernelInput, dep: PrognoseDep, m: MonthIndex): PrognoseRow {
  if (isBeyondHorizon(input, m)) {
    return { beyondHorizon: true, maand: m }
  }

  // ── Aggregatie-kolommen ──────────────────────────────────────────────────────
  const D = dep.totaalBezittingen
  const E = dep.totaalSchulden
  const F = dep.box3Forfaitair
  const G = dep.cumulatiefBox3Vorige + F // lopende som (info)
  const H = D - E
  const I = H // netto = bruto; Box 3 loopt via cashflow, niet cumulatief van vermogen af

  // ── Niet-liquide (L/M): TS-vlag × categorietotaal, per uitgelijnde index ──────
  let L = 0
  for (let i = 0; i < input.ts.bezitCategorien.length; i++) {
    if (input.ts.bezitCategorien[i].nietLiquide) L += dep.bezCategorieTotalen[i] ?? 0
  }
  let M = 0
  for (let i = 0; i < input.ts.schuldCategorien.length; i++) {
    if (input.ts.schuldCategorien[i].nietLiquide) M += dep.schuldCategorieTotalen[i] ?? 0
  }

  const J = I - (L - M) // netto-liquide (FIRE-grondslag)
  const K = -E

  return {
    beyondHorizon: false,
    maand: m,
    leeftijd: leeftijdJaren(input, m),
    maandInJaar: maandInJaar(m),
    totaalBezittingen: D,
    totaalSchulden: E,
    box3Forfaitair: F,
    cumulatiefBox3: G,
    brutoVermogen: H,
    nettoVermogen: I,
    nettoLiquide: J,
    schuldenNegatief: K,
    nietLiquideBezit: L,
    nietLiquideLeningen: M,
  }
}
