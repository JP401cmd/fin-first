/**
 * Horizon-kernel · tabel **Bez** (bezittingen per maand) — Excel-tab `Bez`
 * (A1:BE1203). De grootste tabel van het model: de maandreeks van elke
 * bezitting-pot (10 slots × waarde/rendement/inleg), de groeperingstotalen
 * (Box 3-typen, rendement/inleg, categorieën) én het **woningblok AY:BE**
 * (verkoop-/opeethypotheek-mechaniek). Pure per-maand-functie, exact zoals het
 * Excel-oracle (ADR 0032).
 *
 * ## Per-pot maandreeks (kolommen D…AG, 10 slots à 3 kolommen)
 * Per slot i staan `waarde` (kolom 3+3i), `rendement` (4+3i) en `inleg` (5+3i):
 *   - **rendement(m)** `= waarde(m−1) · eff/12`, met `eff = investering ? bens!C +
 *     P!B43 : bens!C`. De scenarioband-shift (P!B43) en de MC/Hist-overrides raken
 *     alléén investeringspotten; in de deterministische kern van alle 19 fixtures
 *     staan die op 0/uit (`eff = bens!C`). De shift-/ruis-tak wordt inmiddels wél
 *     uitkomst-bewezen via de band-/MC-wrapper-parity (input-transform, Sim/MC-tabs).
 *   - **inleg(m)** `= (toename€[cat] + overloop[cat])/aantal[cat] −
 *     (afname[cat] + onttrekking[cat]) · share`. De **toename** (positief) komt uit
 *     `Toename en afname` (gewicht × budget) en wordt gelijk over de potten van de
 *     categorie verdeeld ("per stuk"); de **afname/onttrekking** komt uit de
 *     capaciteits-begrensde `Verdeling`-eindtoewijzing en wordt per pot verdeeld via
 *     `share = waarde(m−1)/categoriesaldo(m−1)`. (Empirisch: Bez onttrekt naar de
 *     Verdeling-eindtoewijzing, niet naar de ongeknipte `Toename en afname`-behoefte.)
 *     De schuld-aflossings-overloop (`Verdeling!HC:HH`) telt "per stuk" bij de
 *     toename; in alle fixtures is die 0 (structureel aanwezig, onbeproefd).
 *   - **waarde(m)** `= MAX(0, (m=0 ? bens!B : waarde(m−1) + rendement) + inleg)`;
 *     de huis-slot krijgt bovendien de verkoop-guard `IF(AY=1, 0, …)`.
 *
 * ## Woningblok (AY:BE) — verkoop- en opeethypotheek-mechaniek
 * Alle triggers lezen maand m−1 (lag-veilig); `AY` (verkocht 0/1) is monotoon.
 *   - **AY** verkocht: 1 zodra AY(m−1)=1, óf (bij `Verkopen`) leeftijd ≥ verkoop-
 *     leeftijd (vaste leeftijd) / (leeftijd ≥ FIRE ∧ Prognose!J(m−1) < drempel) ∨
 *     leeftijd ≥ fallback-leeftijd (wanneer nodig). Drempel `= B15/12·idx·B60`.
 *   - **AZ** verkoopopbrengst (alléén de verkoopmaand) `= J(m−1)·B61·(1−B62) − S!D(m−1)`.
 *   - **BA** huur/mnd: verkoopmaand `= J(m−1)·B63/12`, daarna `BA(m−1)·(1+B14)^(1/12)`.
 *   - **BB** vervallen hypotheeklast/mnd: bevroren op de verkoopmaand-rente
 *     `= S!D(m−1)·hyp-rente/12`; blijft daarna constant.
 *   - **BC** overwaarde(m−1) `= MAX(0, J(m−1) − S!D(m−1))`.
 *   - **BD** opeet-cap `= BC·B65` vanaf leeftijd B64 (alléén opeethypotheek).
 *   - **BE** opeet-opname/mnd `= MIN(gewenst, MAX(0, BD/(1+B66/12) − S!P(m−1)))`, met
 *     gewenst = B67·idx (indien ingevuld) óf — auto — de overwaarde-cap bij opeet-
 *     start gespreid over `(90 − B64)` jaar (levensverwachting 90; zie constante).
 *
 * ## Horizon-guard (afwijkend, per kolomtype — empirisch geverifieerd)
 * Voorbij leeftijd 100 leegt Excel de **waarde/rendement-kolommen** én B/C/AV/AW én
 * de totalen (→ ""), maar houdt de **inleg-kolommen** en het hele **woningblok
 * (AY:BE)** op numeriek **0**. Kolom A (maandindex) blijft altijd numeriek.
 *
 * Teacher-forced parity: de m−1-waarden (eigen Bez-saldi + categorietotalen,
 * S-saldi, huiswaarde, Prognose!J, en de vorige woningblok-cellen), de per-
 * categorie `Toename en afname`/`Verdeling`-bedragen, de FIRE-leeftijd (P!B16,
 * solver-output) en de overwaarde bij opeet-start komen binnen via `BezDep`; in de
 * parity-test komen die uit de fixture (oracle). Pure functie, geen fs/Supabase/
 * Date.now/Math.random.
 */

import type { AssetCategorie, KernelInput, MonthIndex } from '../types'
import { ageAtMonth, inflationIndex, isBeyondHorizon, leeftijdJaren, maandInJaar } from '../scaffold'

/**
 * Levensverwachting (jaren) waarover de auto-opeethypotheek de overwaarde-cap
 * spreidt: `gewenst = cap-bij-start / ((90 − opeetstartleeftijd)·12)`. Empirisch
 * exact uit de fixture `huis-opeethypotheek` (cap/opname = 276 = (90−67)·12) en
 * consistent met de app-brede constante (`PEER_FIRE_END_AGE`/`REPORT_END_AGE` = 90,
 * `horizon-data`: "levenslang = tot levensverwachting 90"). Geen KernelInput-veld
 * (het model voert 'm niet als parameter) — bewust als kern-constante genoteerd;
 * kandidaat om later te expliciteren in `KernelInput` (zie rapport).
 */
const OPEET_LEVENSVERWACHTING_LEEFTIJD = 90

/** Getal per bezitting-categorie (leeg/afwezig ⇒ 0). */
export type CategorieBedrag = Readonly<Record<AssetCategorie, number>>

/**
 * Upstream-waarden die Bez op maand m consumeert. Alle m−1-waarden komen
 * teacher-forced uit de fixture; de per-slot-arrays sluiten 1-op-1 aan op
 * `input.assetPotten`.
 */
export interface BezDep {
  /** Per pot (volgorde = `input.assetPotten`): eigen waarde(m−1) — Bez-waardekolom vorige rij. */
  readonly slotWaardeVorig: readonly number[]
  /** Per categorie: categoriesaldo(m−1) — Bez!AM…AR vorige rij (noemer van `share`). */
  readonly categoriesaldoVorig: CategorieBedrag
  /** Per categorie: `Toename en afname` toename€ (positief; gewicht × budget). */
  readonly toenameEur: CategorieBedrag
  /** Per categorie: aantal potten (`Toename en afname` "aantal"; noemer per-stuk). */
  readonly aantalPotten: CategorieBedrag
  /** Per categorie: `Verdeling` afname-eindtoewijzing (positief; wordt afgetrokken). */
  readonly verdelingAfname: CategorieBedrag
  /** Per categorie: `Verdeling` onttrekking-eindtoewijzing (positief; wordt afgetrokken). */
  readonly verdelingOnttrekking: CategorieBedrag
  /**
   * Per categorie: `Verdeling.tekortAflossingLiquide` — de extra onttrekking uit
   * liquide bezit om de tekort-lening af te lossen (F6-bugfix, gap V19). Optioneel;
   * afwezig → 0 (byte-identiek aan het Excel v5-oracle). Wordt — net als
   * afname/onttrekking — share-gewogen van de pot afgetrokken.
   */
  readonly verdelingTekortAflossing?: CategorieBedrag
  /** Per categorie: `Verdeling!HC:HH` schuld-aflossings-overloop → toename (per stuk). */
  readonly overloop: CategorieBedrag
  /** Bez!AY(m−1) — vorige verkoop-status (monotone trigger + BA/BB-vertakking). */
  readonly ayVorig: number
  /** Bez!BA(m−1) — vorige huur/mnd (indexatie-recursie na verkoop). */
  readonly baVorig: number
  /** Bez!BB(m−1) — vorige vervallen hypotheeklast/mnd (bevriezing na verkoop). */
  readonly bbVorig: number
  /** Bez!J(m−1) — huiswaarde vorige maand (AZ/BA-basis/BC). */
  readonly huisWaardeVorig: number
  /** S!D(m−1) — hypotheeksaldo vorige maand (AZ/BB-basis/BC). */
  readonly hypotheekSaldoVorig: number
  /** S!P(m−1) — opeethypotheeksaldo vorige maand (BE-cap-restant). */
  readonly opeetSaldoVorig: number
  /** Prognose!J(m−1) — netto-liquide vermogen vorige maand ("wanneer nodig"-trigger). */
  readonly prognoseLiquideVorig: number
  /** P!B16 — FIRE-leeftijd (solver-output; teacher-forced uit de fixture-P-sheet). */
  readonly fireLeeftijd: number
  /** Overwaarde (J − S!D) in de maand vóór opeet-start (bevroren auto-opname-basis). */
  readonly overwaardeBijOpeetStart: number
}

/** Eén per-slot uitkomst (in-horizon). */
export interface BezSlotWaarden {
  readonly waarde: number // 3+3·slot
  readonly rendement: number // 4+3·slot
  readonly inleg: number // 5+3·slot
}

/** Het woningblok (AY:BE) — numeriek, óók voorbij de horizon (dan alle 0). */
export interface BezWoningblok {
  readonly verkocht: number // AY
  readonly verkoopopbrengst: number // AZ
  readonly huurPerMaand: number // BA
  readonly vervallenHypotheeklast: number // BB
  readonly overwaardeVorig: number // BC
  readonly opeetCap: number // BD
  readonly opeetOpname: number // BE
}

/** Bez-rij (in-horizon), kolomletters tussen haakjes. */
export interface BezComputedRow {
  readonly beyondHorizon: false
  readonly maand: MonthIndex // A
  readonly leeftijd: number // B
  readonly maandInJaar: number // C
  /** 10 slots (D…AG); lege slots dragen {0,0,0}. */
  readonly slots: readonly BezSlotWaarden[]
  readonly totaalBox3Spaar: number // AH
  readonly totaalBox3Investering: number // AI
  readonly totaalGeenBox3: number // AJ
  readonly totaalRendement: number // AK
  readonly totaalInleg: number // AL
  readonly totaalSpaargeld: number // AM
  readonly totaalBeleggingen: number // AN
  readonly totaalPensioen: number // AO
  readonly totaalVastgoed: number // AP
  readonly totaalOverig: number // AQ
  readonly totaalEigenHuis: number // AR
  readonly avLeeftijd: number // AV (woningblok-scaffold = B)
  readonly awMaand: number // AW (woningblok-scaffold = C)
  readonly woning: BezWoningblok // AY:BE
}

/**
 * Bez-rij voorbij de horizon (leeftijd > 100): A numeriek; de waarde/rendement-
 * kolommen, B/C/AV/AW en de totalen tonen "" (guard); de inleg-kolommen en het
 * woningblok (AY:BE) blijven numeriek 0.
 */
export interface BezHorizonRow {
  readonly beyondHorizon: true
  readonly maand: MonthIndex // A
}

export type BezRow = BezComputedRow | BezHorizonRow

/** De 10 slot-uitkomsten; buiten de horizon: lege {0,0,0}-plekken. */
const LEEG_SLOT: BezSlotWaarden = { waarde: 0, rendement: 0, inleg: 0 }
const NUL_WONING: BezWoningblok = {
  verkocht: 0,
  verkoopopbrengst: 0,
  huurPerMaand: 0,
  vervallenHypotheeklast: 0,
  overwaardeVorig: 0,
  opeetCap: 0,
  opeetOpname: 0,
}

/** Aantal bezitting-slots (bens rij 4..13). */
const ASSET_SLOTS = 10

/**
 * Bereken de Bez-rij voor maand m uit de statische parameters + upstream DepView.
 * Voorbij de horizon → `BezHorizonRow`; de kolom-mapping vertaalt dat per kolomtype
 * naar "" (waarde/rendement/totalen/B/C/AV/AW) of 0 (inleg/woningblok).
 */
export function computeBez(input: KernelInput, dep: BezDep, m: MonthIndex): BezRow {
  if (isBeyondHorizon(input, m)) {
    return { beyondHorizon: true, maand: m }
  }

  const idx = inflationIndex(input, m) // (1+P!B14)^(m/12)
  const age = ageAtMonth(input, m)
  const shift = input.onzekerheid.shift // P!B43 (0 in alle fixtures)

  // ── Woningblok-trigger eerst: AY guardt de huiswaarde ────────────────────────
  const woning = computeWoningblok(input, dep, m, idx, age)

  // ── Per-slot waarde/rendement/inleg ──────────────────────────────────────────
  const slots: BezSlotWaarden[] = Array.from({ length: ASSET_SLOTS }, () => LEEG_SLOT)
  for (let i = 0; i < input.assetPotten.length; i++) {
    const pot = input.assetPotten[i]
    const waardeVorig = m === 0 ? 0 : (dep.slotWaardeVorig[i] ?? 0)

    // rendement: enkelvoudig maand-rendement over het saldo m−1; investeringspotten
    // schuiven mee met de scenarioband-shift (P!B43). Maand 0 heeft geen m−1 → 0.
    const eff = pot.investering ? pot.rendement + shift : pot.rendement
    const rendement = m === 0 ? 0 : (waardeVorig * eff) / 12

    // inleg: per-stuk toename (+ overloop) − share-gewogen afname/onttrekking.
    const cat = pot.categorie
    const aantal = dep.aantalPotten[cat]
    const toenamePerStuk = aantal > 0 ? (dep.toenameEur[cat] + dep.overloop[cat]) / aantal : 0
    const catSaldoVorig = m === 0 ? 0 : dep.categoriesaldoVorig[cat]
    const share = catSaldoVorig > 0 ? waardeVorig / catSaldoVorig : 0
    // afname + onttrekking + tekort-aflossing-uit-liquide (F6-bugfix, gap V19; laatste
    // is 0/afwezig zonder de vlag → byte-identiek oracle-gedrag).
    const tekortAflos = dep.verdelingTekortAflossing?.[cat] ?? 0
    const onttrokken = (dep.verdelingAfname[cat] + dep.verdelingOnttrekking[cat] + tekortAflos) * share
    const inleg = toenamePerStuk - onttrokken

    // waarde: MAX(0, basis + inleg); huis-slot krijgt de verkoop-guard.
    let waarde = Math.max(0, (m === 0 ? pot.startwaarde : waardeVorig + rendement) + inleg)
    if (pot.rol === 'eigenHuis' && woning.verkocht === 1) waarde = 0

    slots[pot.slot] = { waarde, rendement, inleg }
  }

  // ── Totalen (AH:AR) — som over de 10 slots (lege slots = 0) ──────────────────
  let totaalBox3Spaar = 0
  let totaalBox3Investering = 0
  let totaalGeenBox3 = 0
  let totaalRendement = 0
  let totaalInleg = 0
  const perCategorie: Record<AssetCategorie, number> = {
    Spaargeld: 0,
    Beleggingen: 0,
    Pensioen: 0,
    Vastgoed: 0,
    'Eigen huis': 0,
    Overig: 0,
  }
  for (const pot of input.assetPotten) {
    const { waarde, rendement, inleg } = slots[pot.slot]
    if (pot.box3Type === 'Box 3 spaar') totaalBox3Spaar += waarde
    else if (pot.box3Type === 'Box 3 investering') totaalBox3Investering += waarde
    else totaalGeenBox3 += waarde
    totaalRendement += rendement
    totaalInleg += inleg
    perCategorie[pot.categorie] += waarde
  }

  return {
    beyondHorizon: false,
    maand: m,
    leeftijd: leeftijdJaren(input, m),
    maandInJaar: maandInJaar(m),
    slots,
    totaalBox3Spaar,
    totaalBox3Investering,
    totaalGeenBox3,
    totaalRendement,
    totaalInleg,
    totaalSpaargeld: perCategorie.Spaargeld,
    totaalBeleggingen: perCategorie.Beleggingen,
    totaalPensioen: perCategorie.Pensioen,
    totaalVastgoed: perCategorie.Vastgoed,
    totaalOverig: perCategorie.Overig,
    totaalEigenHuis: perCategorie['Eigen huis'],
    avLeeftijd: leeftijdJaren(input, m),
    awMaand: maandInJaar(m),
    woning,
  }
}

/**
 * Woningblok AY:BE. De verkoop-status (AY) is monotoon en alle triggers lezen
 * maand m−1 (lag-veilig). De opeethypotheek-tak (BD/BE) is alléén actief bij
 * `Opeethypotheek` vanaf leeftijd B64.
 */
function computeWoningblok(
  input: KernelInput,
  dep: BezDep,
  m: MonthIndex,
  idx: number,
  age: number,
): BezWoningblok {
  if (m === 0) return NUL_WONING

  const w = input.woning
  const jVorig = dep.huisWaardeVorig
  const sdVorig = dep.hypotheekSaldoVorig

  // ── AY (verkocht 0/1) ────────────────────────────────────────────────────────
  let verkocht = 0
  if (dep.ayVorig === 1) {
    verkocht = 1 // monotoon: eenmaal verkocht blijft verkocht
  } else if (w.selector === 'Verkopen') {
    if (w.trigger === 'Vaste leeftijd') {
      if (age >= w.verkoopleeftijd) verkocht = 1
    } else {
      // "Wanneer nodig": op behoefte (liquide vermogen onder de maandenuitgave-
      // drempel, ná FIRE) óf op de fallback-leeftijd.
      const drempel = (input.inkomenUitgaven.uitgaveNaPensioenPerJaar / 12) * idx * w.drempelMaandenUitgave
      const opBehoefte = age >= dep.fireLeeftijd && dep.prognoseLiquideVorig < drempel
      if (opBehoefte || age >= w.verkoopleeftijd) verkocht = 1
    }
  }

  // ── AZ verkoopopbrengst (alléén de verkoopmaand: AY 0→1) ─────────────────────
  const verkoopmaand = verkocht === 1 && dep.ayVorig === 0
  const verkoopopbrengst = verkoopmaand
    ? jVorig * w.verkoopprijsPctWoz * (1 - w.verkoopkostenPct) - sdVorig
    : 0

  // ── BA huur/mnd (verkoopmaand op WOZ; daarna geïndexeerd) ────────────────────
  let huurPerMaand = 0
  if (verkocht === 1) {
    huurPerMaand =
      dep.ayVorig === 1
        ? dep.baVorig * Math.pow(1 + input.inflatie, 1 / 12)
        : (jVorig * w.huurNaVerkoopPctWozPerJaar) / 12
  }

  // ── BB vervallen hypotheeklast/mnd (bevroren rente op de verkoopmaand) ────────
  let vervallenHypotheeklast = 0
  if (verkocht === 1) {
    vervallenHypotheeklast =
      dep.ayVorig === 1 ? dep.bbVorig : (sdVorig * hypotheekRente(input)) / 12
  }

  // ── BC overwaarde(m−1) — geklemd op 0 (huis kan onder de hypotheek zakken) ────
  const overwaardeVorig = Math.max(0, jVorig - sdVorig)

  // ── BD/BE opeethypotheek (alléén die modus, vanaf leeftijd B64) ──────────────
  let opeetCap = 0
  let opeetOpname = 0
  if (w.selector === 'Opeethypotheek' && age >= w.opeetStartleeftijdOpname) {
    opeetCap = overwaardeVorig * w.opeetMaxLeningPctOverwaarde
    const gewenst =
      w.opeetMaandopname !== null
        ? w.opeetMaandopname * idx
        : (dep.overwaardeBijOpeetStart * w.opeetMaxLeningPctOverwaarde) /
          ((OPEET_LEVENSVERWACHTING_LEEFTIJD - w.opeetStartleeftijdOpname) * 12)
    // Cap op het eind-saldo: na opname stapelt de rente nog op → opname ≤
    // BD/(1+rente/12) − saldo(m−1). Verliest de cap zijn ruimte, dan valt BE naar 0.
    const capRestant = Math.max(0, opeetCap / (1 + w.opeetRentePerJaar / 12) - dep.opeetSaldoVorig)
    opeetOpname = Math.max(0, Math.min(gewenst, capRestant))
  }

  return {
    verkocht,
    verkoopopbrengst,
    huurPerMaand,
    vervallenHypotheeklast,
    overwaardeVorig,
    opeetCap,
    opeetOpname,
  }
}

/** Nominale jaarrente van de hypotheek-slot (rol 'hypotheek'); afwezig ⇒ 0. */
function hypotheekRente(input: KernelInput): number {
  const hyp = input.schuldPotten.find((p) => p.rol === 'hypotheek')
  return hyp?.rente ?? 0
}
