/**
 * Horizon-kernel · tabel **CF** (cashflow) — Excel-tab `CF` (A1:K1201).
 *
 * CF is de spil van het maandmodel: het bundelt de maandelijkse geldstromen
 * (inkomen, uitgaven, sparen, gebeurtenis-baten, Box 3-heffing) tot het "totaal
 * extra geld" (kolom I) dat de Verdeling-waterval verdeelt. Pure per-maand-functie,
 * exact zoals het Excel-oracle (ADR 0032). Kolommen A–K:
 *   - **D inkomen** `= P!B10/12·idx + PT!K + IFERROR('Werk-strategie'!S,0)` —
 *     geïndexeerd netto-inkomen + partnerbijdrage + (FIRE-gegate) werk-delta.
 *   - **E uitgaven** `= P!B11/12·idx + Bez!BA − Bez!BB` — geïndexeerde uitgaven +
 *     huur na woningverkoop − vervallen hypotheeklast.
 *   - **F sparen** `= IF(m ≥ FIRE-maand, 0, D − E)` — vóór FIRE overschot, daarna 0.
 *   - **G rente-vrijval** — per "in sparen na aflossing"-geflagde schuld valt de
 *     geplande maandaflossing vrij zodra het saldo van de vórige maand 0 is.
 *   - **H gebeurtenis-baten** `= Σ(positieve, actieve Geb-posten)·idx`.
 *   - **I totaal extra geld** `= F + G + H + Bez!AZ + Bez!BE − IF(m < FIRE-maand, K, 0)`.
 *   - **J gebeurtenissen netto** `= H − Af!D − Ont!D`.
 *   - **K Box 3 (vorige maand)** `= IF(m=0, 0, Bel!N(m−1))`.
 *
 * **De structurele één-maand-lag** van de heffing zit in kolom K: `CF!K(m) =
 * Bel!N(m−1)`. Bel zelf rekent de heffing over de saldi van maand m; CF consumeert
 * de canonieke heffing van de vórige maand. CF is daarmee de tabel die het
 * m−1-pad van de DepView als eerste materialiseert (naast de S-saldi in kolom G en
 * de latere-tabel-waarden in I/J). CF blijft een zuivere functie van m-upstream +
 * de teacher-forced m−1-waarden — geen eigen state.
 *
 * **Horizon-guard (afwijkend van Bel).** Voorbij leeftijd 100 leegt Excel de
 * "leefbaarheids"-kolommen B/C/D/E/F/G (→ ""), maar de geldstroom-kolommen
 * H/I/J/K blijven **numeriek 0** (zodat downstream-sommen niet breken). Empirisch
 * geverifieerd tegen alle 19 fixtures (o.a. een open-einde pensioenpost met
 * eIdx=1199 die zónder guard baten voorbij de horizon zou geven, maar H=0 toont).
 * Kolom A (maandindex) blijft altijd numeriek.
 *
 * Teacher-forced parity: alle upstream-waarden (partnerbijdrage, werk-delta,
 * Bez-woningstromen, Af/Ont-budget, Bel!N(m−1), S-saldi(m−1), de FIRE-maand en de
 * Geb-posten) komen binnen via `CFDep`; in de parity-test komen die uit de fixture
 * (oracle), zodat CF geïsoleerd formule-getrouw bewezen wordt over alle maanden ×
 * alle fixtures. Pure functie, geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelInput, MonthIndex } from '../types'
import { inflationIndex, isBeyondHorizon, leeftijdJaren, maandInJaar } from '../scaffold'

/**
 * Eén gebeurtenis-post uit de Geb-helperkolommen (`Geb!W:AE`): startmaand-index,
 * eindmaand-index en bedrag in koopkracht-nu. Een post is in maand m actief als
 * `sIdx ≤ m ≤ eIdx`; lege posten dragen het sentinel `sIdx=99999 / eIdx=99998`
 * (nooit actief). CF!H telt alléén de **positieve** actieve posten (baten).
 */
export interface GebPostHelper {
  /** Geb!W/Z/AC — startmaand-index van de post. */
  readonly sIdx: number
  /** Geb!X/AA/AD — eindmaand-index (inclusief). */
  readonly eIdx: number
  /** Geb!Y/AB/AE — bedrag in koopkracht-nu (+ bate / − kost). */
  readonly bedrag: number
}

/**
 * Upstream-waarden die CF op maand m consumeert. Op maand m tenzij anders vermeld;
 * de m−1-waarden (`canoniekeHeffingVorigeMaand`, `schuldSaldiVorigeMaand`) dragen
 * de structurele één-maand-lag. `schuldSaldiVorigeMaand` sluit 1-op-1 aan op
 * `input.schuldPotten`. `fireMonth` en `gebPosten` zijn per-projectie statisch
 * maar solver- resp. Geb-tabel-afgeleid (dus geen `KernelInput`) en komen daarom
 * teacher-forced binnen.
 */
export interface CFDep {
  /** PT!K(m) — partnerbijdrage (werk-/AOW-/pensioeninkomen partner). */
  readonly partnerBijdrage: number
  /** 'Werk-strategie'!S(m) — nominale, FIRE-gegate salaris-delta t.o.v. de basis. */
  readonly werkStrategieDelta: number
  /** Bez!BA(m) — huur per maand na woningverkoop. */
  readonly huurNaVerkoop: number
  /** Bez!BB(m) — vervallen hypotheeklast (rente + evt. aflossing) na verkoop. */
  readonly vervallenHypotheeklast: number
  /** Bez!AZ(m) — eenmalige verkoopopbrengst woning (netto van hypotheekaflossing). */
  readonly verkoopopbrengst: number
  /** Bez!BE(m) — opname uit de opeethypotheek. */
  readonly opeetOpname: number
  /** Af!D(m) — totaal afname (kosten uit negatieve gebeurtenissen), nominaal. */
  readonly afname: number
  /** Ont!D(m) — onttrekkingsbehoefte na FIRE, nominaal. */
  readonly onttrekking: number
  /** Bel!N(m−1) — canonieke Box 3-heffing van de vórige maand (bij m=0 irrelevant). */
  readonly canoniekeHeffingVorigeMaand: number
  /** S-saldo van de vórige maand per schuld-pot (zelfde volgorde als `input.schuldPotten`). */
  readonly schuldSaldiVorigeMaand: readonly number[]
  /** ROUND((P!B16 − P!B7)·12) — de FIRE-maand (solver-output, teacher-forced). */
  readonly fireMonth: number
  /** Geb!W:AE — de gebeurtenis-posten (statisch per projectie). */
  readonly gebPosten: readonly GebPostHelper[]
}

/** CF-rij mét berekende kolommen (in-horizon). Kolomletters tussen haakjes. */
export interface CFComputedRow {
  readonly beyondHorizon: false
  readonly maand: MonthIndex // A
  readonly leeftijd: number // B
  readonly maandInJaar: number // C
  readonly inkomen: number // D
  readonly uitgaven: number // E
  readonly sparen: number // F
  readonly renteVrijval: number // G
  readonly gebeurtenisBaten: number // H
  readonly totaalExtraGeld: number // I
  readonly gebeurtenisNetto: number // J
  readonly box3VorigeMaand: number // K
  /**
   * D-subterm — het geïndexeerde user-basissalaris `(nettoJaarinkomen/12)·idx`,
   * de eerste term van kolom D (vóór partnerbijdrage + werk-strategie-delta).
   * GEEN eigen Excel-kolom (staat niet in de parity-CF_COLUMNS); enige bron voor
   * de post-FIRE-salaris-gate in `bridge.ts` (ADR 0037) zodat die de term niet
   * zelf hoeft te herberekenen. `inkomen = basissalaris + partnerbijdrage +
   * werkStrategieDelta`.
   */
  readonly basissalaris: number
}

/**
 * CF-rij voorbij de horizon (leeftijd > 100). Afwijkend van Bel: alleen A blijft
 * de maandindex; B/C/D/E/F/G tonen "" en H/I/J/K tonen numeriek 0 (de kolom-mapping
 * in de parity-test vertaalt dit onderscheid).
 */
export interface CFHorizonRow {
  readonly beyondHorizon: true
  readonly maand: MonthIndex
}

export type CFRow = CFComputedRow | CFHorizonRow

/** Geplande maandaflossing van een schuld: `IF(D>0, D, C·B)/12` (= S!E-basis). */
function geplandeMaandAflossing(pot: KernelInput['schuldPotten'][number]): number {
  const perJaar = pot.aflossingEur > 0 ? pot.aflossingEur : pot.aflossingPct * pot.startwaarde
  return perJaar / 12
}

/**
 * Bereken de CF-rij voor maand m uit de statische parameters en de upstream
 * DepView. Voorbij de horizon (leeftijd > 100) levert de hybride horizon-rij
 * (A numeriek, B–G "", H–K 0).
 */
export function computeCF(input: KernelInput, dep: CFDep, m: MonthIndex): CFRow {
  if (isBeyondHorizon(input, m)) {
    return { beyondHorizon: true, maand: m }
  }

  const idx = inflationIndex(input, m) // (1+P!B14)^(m/12)
  const { nettoJaarinkomen, nettoJaaruitgaven } = input.inkomenUitgaven
  const voorFire = m < dep.fireMonth

  // K — Box 3-heffing van de vórige maand (structurele één-maand-lag). Maand 0 → 0.
  const K = m === 0 ? 0 : dep.canoniekeHeffingVorigeMaand

  // D — inkomen: geïndexeerd netto-inkomen + partnerbijdrage + werk-strategie-delta.
  // basissalaris = de eerste D-subterm (single-source voor de bridge-salaris-gate);
  // D telt exact zoals voorheen op (float-identiek: zelfde operanden, zelfde volgorde).
  const basissalaris = (nettoJaarinkomen / 12) * idx
  const D = basissalaris + dep.partnerBijdrage + dep.werkStrategieDelta

  // E — uitgaven: geïndexeerde netto-uitgaven + huur na verkoop − vervallen hypotheeklast.
  const E = (nettoJaaruitgaven / 12) * idx + dep.huurNaVerkoop - dep.vervallenHypotheeklast

  // F — sparen: vóór FIRE het overschot D−E, vanaf de FIRE-maand 0.
  const F = voorFire ? D - E : 0

  // G — rente-vrijval: per "in sparen na aflossing"-schuld valt de geplande
  //     maandaflossing vrij zodra saldo(m−1) exact 0 is (Excel `=0`, saldi zijn
  //     door MAX(0,…) exact 0 bij payoff). Maand 0 heeft geen m−1 → G=0.
  let G = 0
  if (m > 0) {
    for (let i = 0; i < input.schuldPotten.length; i++) {
      const pot = input.schuldPotten[i]
      if (pot.inSparenNaAflossing && dep.schuldSaldiVorigeMaand[i] === 0) {
        G += geplandeMaandAflossing(pot)
      }
    }
  }

  // H — gebeurtenis-baten: som van de positieve, in maand m actieve Geb-posten
  //     (koopkracht-nu), nominaal gemaakt met de inflatie-index.
  let baten = 0
  for (const post of dep.gebPosten) {
    if (post.bedrag > 0 && post.sIdx <= m && m <= post.eIdx) baten += post.bedrag
  }
  const H = baten * idx

  // I — totaal extra geld: sparen + rente-vrijval + baten + verkoopopbrengst +
  //     opeet-opname, minus de Box 3-heffing (alleen vóór FIRE — ná FIRE zit Box 3
  //     in de onttrekkingsbehoefte Ont!D).
  const I = F + G + H + dep.verkoopopbrengst + dep.opeetOpname - (voorFire ? K : 0)

  // J — gebeurtenissen netto: baten − afname − onttrekkingsbehoefte.
  const J = H - dep.afname - dep.onttrekking

  return {
    beyondHorizon: false,
    maand: m,
    leeftijd: leeftijdJaren(input, m),
    maandInJaar: maandInJaar(m),
    inkomen: D,
    uitgaven: E,
    sparen: F,
    renteVrijval: G,
    gebeurtenisBaten: H,
    totaalExtraGeld: I,
    gebeurtenisNetto: J,
    box3VorigeMaand: K,
    basissalaris,
  }
}
