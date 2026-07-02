/**
 * Horizon-kernel · tabel **Toename en afname** (behoefte → categorie-bedragen) —
 * Excel-tab `Toename en afname` (A1:CM1202).
 *
 * Pure per-maand-functie die de drie maand-budgetten (toename / afname /
 * onttrekking) via **statische categorie-gewichten** verdeelt over de zes
 * bezitting- en vijf schuld-categorieën. Deze tabel voedt de Verdeling-waterval
 * (gewichten + €-budget per categorie), conform het Excel-oracle (ADR 0032).
 *
 * ## Budgetten (D/E/F/G)
 *   - **D** `Totaal extra geld` = CF!I(m) — teacher-forced upstream.
 *   - **E** `Afname` = −Af!D(m) — de afname-kost als negatief bedrag.
 *   - **F** `Onttrekking` = −Ont!D(m) — de onttrekkingsbehoefte als negatief bedrag.
 *   - **G** `Totaal` = D + E + F.
 *
 * ## Categorie-gewichten (de %-kolommen — het gecureerde reken-hart)
 * Per categorie een gewicht `½^(prio−1)`, **genormaliseerd** over de deelnemende
 * categorieën. Een categorie neemt deel als ze **gevuld** is (TS!G), **liquide**
 * (TS!H = "Nee") én een prioriteit **1..4** heeft. Prioriteit **5 = reserve**
 * (krijgt 0% hier; alleen de reserve-pass in Verdeling bedient haar) en prio ≥ 6
 * telt nooit mee (structuur.md, TS!H..L: `prio≥5→0`, `niet-liquide→0`). Drie
 * onafhankelijke gewicht-vectoren:
 *   - **toename**: bezit-`prioToename` én schuld-`prioAflossing` in **één**
 *     genormaliseerde noemer (de aflossing concurreert met de bezitting-toename).
 *   - **afname**: enkel bezit-`prioAfname`.
 *   - **onttrekking**: enkel bezit-`prioOnttrekking`.
 *
 * ## €-kolommen per categorie
 * Bezit (9 kolommen): `toename% · D`, `afname% · E`, `onttr% · F`, `totaal€`
 * (som van de drie), `aantal` (potten in de categorie) en `per stuk€`
 * (`totaal€ / aantal`, 0 bij aantal 0). Schuld (5 kolommen): alleen `toename% · D`,
 * `totaal€` (= toename€), `aantal` en `per stuk€`.
 *
 * ## Horizon-guard
 * Zoals Bel: voorbij leeftijd 100 blijft alléén de maandindex (A) numeriek; alle
 * overige kolommen tonen `""`. Gemodelleerd als een discriminated union.
 *
 * De gewichten en pot-aantallen zijn AFGELEID uit `KernelInput` (TS-prio's +
 * bens-potten); de drie budgetten komen via de `DepView` (teacher-forced uit de
 * fixture-CF/Af/Ont-sheets in de parity-test). Pure functie: geen fs/Supabase/
 * Date.now/Math.random.
 */

import type {
  AssetCategorie,
  DebtCategorie,
  KernelInput,
  MonthIndex,
  TsBezitCategorie,
  TsSchuldCategorie,
} from '../types'
import { isBeyondHorizon, leeftijdJaren, maandInJaar } from '../scaffold'

/**
 * De vijf schuld-categorieën die in deze tabel voorkomen (TS-rij 16-20). De
 * zesde TS-schuld-categorie "Tekort-lening" heeft hier bewust GEEN kolommen —
 * ze is de overloop-sink van de waterval, geen toewijs-doel.
 */
const SCHULD_TA_LABELS = ['Woning', 'Consumptief', 'Studie', 'Zakelijk', 'Overig'] as const

/** Upstream-budgetten die de tabel op maand `m` consumeert (teacher-forced). */
export interface ToenameAfnameDep {
  /** CF!I(m) — totaal extra geld (kolom D). */
  readonly totaalExtraGeld: number
  /** Af!D(m) — afname-kost (positief); kolom E = −afname. */
  readonly afname: number
  /** Ont!D(m) — onttrekkingsbehoefte (positief); kolom F = −onttrekking. */
  readonly onttrekking: number
}

/** De 9 kolommen van één bezitting-categorie (toename%/€, afname%/€, onttr%/€, totaal, aantal, per stuk). */
export interface BezitCategorieBedragen {
  readonly toenamePct: number
  readonly toenameEur: number
  readonly afnamePct: number
  readonly afnameEur: number
  readonly onttrekkingPct: number
  readonly onttrekkingEur: number
  readonly totaalEur: number
  readonly aantal: number
  readonly perStukEur: number
}

/** De 5 kolommen van één schuld-categorie (toename%/€, totaal, aantal, per stuk). */
export interface SchuldCategorieBedragen {
  readonly toenamePct: number
  readonly toenameEur: number
  readonly totaalEur: number
  readonly aantal: number
  readonly perStukEur: number
}

/** In-horizon Toename-en-afname-rij met alle berekende kolommen. */
export interface ToenameAfnameComputedRow {
  readonly beyondHorizon: false
  readonly maand: MonthIndex // A
  readonly leeftijd: number // B & CL
  readonly maandInJaar: number // C & CM
  readonly totaalExtraGeld: number // D
  readonly afname: number // E (= −dep.afname)
  readonly onttrekking: number // F (= −dep.onttrekking)
  readonly totaal: number // G (= D + E + F)
  /** Zes bezitting-categorieën (Spaargeld, Beleggingen, Pensioen, Vastgoed, Eigen huis, Overig). */
  readonly bezit: readonly BezitCategorieBedragen[]
  /** Vijf schuld-categorieën (Woning, Consumptief, Studie, Zakelijk, Overig). */
  readonly schuld: readonly SchuldCategorieBedragen[]
}

/** Toename-en-afname-rij voorbij de horizon: alleen de maandindex is numeriek. */
export interface ToenameAfnameHorizonRow {
  readonly beyondHorizon: true
  readonly maand: MonthIndex // A blijft numeriek; alle overige kolommen tonen ""
}

export type ToenameAfnameRow = ToenameAfnameComputedRow | ToenameAfnameHorizonRow

/**
 * Ruw categorie-gewicht `½^(prio−1)`, of 0 als de categorie niet deelneemt
 * (ongevuld, niet-liquide, geen prio, of prio buiten 1..4 — dus óók reserve
 * prio 5 en prio ≥ 6). Wordt daarna genormaliseerd over de groep.
 */
function ruwGewicht(prio: number | null, gevuld: boolean, nietLiquide: boolean): number {
  if (!gevuld || nietLiquide || prio === null || prio < 1 || prio > 4) return 0
  return Math.pow(0.5, prio - 1)
}

/** Deel elk ruw gewicht door de som (0 als de som 0 is — geen deling door nul). */
function normaliseer(ruw: readonly number[], som: number): number[] {
  return ruw.map((w) => (som > 0 ? w / som : 0))
}

/** Aantal potten in een bezitting-categorie (statische bens-telling uit KernelInput). */
function telBezitPotten(input: KernelInput, categorie: AssetCategorie): number {
  let n = 0
  for (const pot of input.assetPotten) if (pot.categorie === categorie) n++
  return n
}

/** Aantal potten in een schuld-categorie (statische bens-telling; "Tekort" telt hier niet mee). */
function telSchuldPotten(input: KernelInput, categorie: DebtCategorie): number {
  let n = 0
  for (const pot of input.schuldPotten) if (pot.categorie === categorie) n++
  return n
}

/**
 * Bereken de Toename-en-afname-rij voor maand `m`. Gewichten + pot-aantallen uit
 * `input` (TS-prio's + bens); de drie budgetten uit `dep` (teacher-forced).
 */
export function computeToenameAfname(
  input: KernelInput,
  dep: ToenameAfnameDep,
  m: MonthIndex,
): ToenameAfnameRow {
  if (isBeyondHorizon(input, m)) {
    return { beyondHorizon: true, maand: m }
  }

  const bezitCats: readonly TsBezitCategorie[] = input.ts.bezitCategorien
  // De eerste vijf TS-schuld-categorieën (Woning..Overig); "Tekort-lening" valt af.
  const schuldCats: readonly TsSchuldCategorie[] = input.ts.schuldCategorien.filter((c) =>
    (SCHULD_TA_LABELS as readonly string[]).includes(c.categorie),
  )

  // ── Gewicht-vectoren ────────────────────────────────────────────────────────
  // Toename: bezit-prioToename én schuld-prioAflossing delen één noemer.
  const ruwToenameBezit = bezitCats.map((c) =>
    ruwGewicht(c.prioToename, c.gevuld, c.nietLiquide),
  )
  const ruwToenameSchuld = schuldCats.map((c) =>
    ruwGewicht(c.prioAflossing, c.gevuld, c.nietLiquide),
  )
  const somToename =
    ruwToenameBezit.reduce((a, x) => a + x, 0) + ruwToenameSchuld.reduce((a, x) => a + x, 0)
  const wToenameBezit = normaliseer(ruwToenameBezit, somToename)
  const wToenameSchuld = normaliseer(ruwToenameSchuld, somToename)

  // Afname: alleen bezit-prioAfname.
  const ruwAfname = bezitCats.map((c) => ruwGewicht(c.prioAfname, c.gevuld, c.nietLiquide))
  const wAfname = normaliseer(ruwAfname, ruwAfname.reduce((a, x) => a + x, 0))

  // Onttrekking: alleen bezit-prioOnttrekking.
  const ruwOnttr = bezitCats.map((c) => ruwGewicht(c.prioOnttrekking, c.gevuld, c.nietLiquide))
  const wOnttr = normaliseer(ruwOnttr, ruwOnttr.reduce((a, x) => a + x, 0))

  // ── Budgetten (D/E/F/G) ─────────────────────────────────────────────────────
  const D = dep.totaalExtraGeld
  const E = -dep.afname
  const F = -dep.onttrekking
  const G = D + E + F

  // ── Per bezitting-categorie ─────────────────────────────────────────────────
  const bezit: BezitCategorieBedragen[] = bezitCats.map((c, i) => {
    const toenameEur = wToenameBezit[i] * D
    const afnameEur = wAfname[i] * E
    const onttrekkingEur = wOnttr[i] * F
    const totaalEur = toenameEur + afnameEur + onttrekkingEur
    const aantal = telBezitPotten(input, c.categorie)
    return {
      toenamePct: wToenameBezit[i],
      toenameEur,
      afnamePct: wAfname[i],
      afnameEur,
      onttrekkingPct: wOnttr[i],
      onttrekkingEur,
      totaalEur,
      aantal,
      perStukEur: aantal === 0 ? 0 : totaalEur / aantal,
    }
  })

  // ── Per schuld-categorie (alleen toename/aflossing) ─────────────────────────
  const schuld: SchuldCategorieBedragen[] = schuldCats.map((c, j) => {
    const toenameEur = wToenameSchuld[j] * D
    const totaalEur = toenameEur
    // "Tekort-lening" is uitgefilterd; de labels vallen samen met DebtCategorie.
    const aantal = telSchuldPotten(input, c.categorie as DebtCategorie)
    return {
      toenamePct: wToenameSchuld[j],
      toenameEur,
      totaalEur,
      aantal,
      perStukEur: aantal === 0 ? 0 : totaalEur / aantal,
    }
  })

  return {
    beyondHorizon: false,
    maand: m,
    leeftijd: leeftijdJaren(input, m),
    maandInJaar: maandInJaar(m),
    totaalExtraGeld: D,
    afname: E,
    onttrekking: F,
    totaal: G,
    bezit,
    schuld,
  }
}
