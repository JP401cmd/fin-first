/**
 * Horizon-kernel · **integrale forward-recursie-engine** — koppelt de geporte
 * maandtabellen tot één projectie, exact zoals het Excel-oracle (ADR 0032).
 *
 * ## Wat dit is
 * De tabel-modules (`tables/*`) zijn elk een pure `compute<Tabel>(input, dep, m)`
 * die geïsoleerd — teacher-forced — tegen de fixture bewezen is (19 fixtures × 1200
 * maanden, €0,01). In die parity-tests kwamen de `dep`-waarden uit de fixture. Deze
 * engine voedt ze uit **eigen berekende toestand** (maand m en m−1) en reproduceert
 * zo de volledige forward-recursie. De table-modules blijven ongewijzigd; de engine
 * adapteert zich aan hun Dep-interfaces via dunne interne shims.
 *
 * ## FIRE-leeftijd is een PARAMETER
 * De maandtabellen gaten op de FIRE-maand (`ROUND((P!B16 − P!B7)·12)`). P!B16 is een
 * solver-output; deze engine neemt de FIRE-leeftijd als `opts.fireAge` en zoekt 'm
 * NIET zelf (dat is een latere solver-stap). Het guardrails-anker P!B82 =
 * Prognose!J(fireMaand−1) wordt standaard tijdens de loop zelf vastgelegd (self-
 * capture), en is voor tests overridebaar via `opts.guardrailsAnker`. Bij FIRE-maand
 * 0 (stop-nu-run, ADR 0126 — buiten oracle-domein) bestaat maand −1 niet en
 * initialiseert de engine het anker op de T0-liquide-stand (`startNettoLiquide`).
 *
 * ## Intra-maand-volgorde (afgeleid uit `docs/horizon-oracle/rekenflow.md` + de
 * per-tabel Dep-interfaces; verifieerbaar tegen de fixtures)
 * Per maand m, met de volledige m−1-toestand (Bez/S/Prognose/Bel) beschikbaar:
 *   1. **Bez-woningblok AY:BE** — hangt uitsluitend aan m−1-toestand; wordt vroeg
 *      berekend (via `computeBez` met genulde m-deps → alleen `.woning` gebruikt),
 *      zodat Ont/CF/S het kunnen consumeren vóór de Bez-waardekolommen bestaan.
 *   2. **PT(m)** en **Werk-strategie(m)**.
 *   3. **Ont(m)** (guardrails-anker; CF!K=Bel!N(m−1); Bez!BA/BB(m); PT!K(m)).
 *   4. **Af(m)** (statische Geb-projecties — hier per maand herberekend, zuiver op m).
 *   5. **CF(m)** (PT!K, Werk!S, Bez woningstromen, Af!D, Ont!D, Bel!N(m−1), S-saldi m−1).
 *   6. **Toename en afname(m)** (CF!I, Af!D, Ont!D + statische gewichten).
 *   7. **Verdeling(m)** (Af!D, Ont!D, aflos-budget uit Toename, caps = Bez/S-saldi m−1).
 *   8. **Bez-waardekolommen(m)** (rendement over m−1, inleg uit Verdeling/Toename m).
 *   9. **S(m)** (AY/BD/BE uit Bez(m); tekort uit Verdeling(m); saldi m−1).
 *  10. **Bel(m)** (grondslagen = Bez/S-saldi van maand m zelf).
 *  11. **Prognose(m)** (Bez/S-totalen m, Bel!K(m), eigen G(m−1)).
 * ES en de Geb/Auto-projecties zijn statisch (één keer vooraf).
 *
 * ### Waar dit afweek van de opgegeven schets
 * - **Ont!D box3-term = CF!K(m) = Bel!N(m−1)** (niet de m-CF), dus gevoed uit de
 *   m−1-Bel; dat maakt Ont onafhankelijk van CF(m) en laat Ont vóór CF draaien
 *   (schets-volgorde blijft correct).
 * - **Guardrails-anker**: het anker beïnvloedt vóór FIRE alléén de weergave-kolommen
 *   Ont!H/I (Ont!D=0 vóór FIRE, dus geen terugkoppeling in het model). Het wordt
 *   tijdens de loop op maand fireMaand−1 vastgelegd; ná de loop worden de Ont-rijen
 *   met het definitieve anker herrekend voor uitvoer-correctheid (post-FIRE identiek).
 *   Uitzondering FIRE-maand 0: dan is er geen "vóór FIRE", het anker staat vanaf de
 *   start op de T0-liquide-stand en Ont!D rekent vanaf maand 0 (zie de anker-init).
 *
 * Pure module: geen fs/Supabase/Date.now/Math.random.
 */

import type { AssetCategorie, KernelInput, MonthIndex } from './types'
import { HORIZON_MONTHS } from './types'
import { isBeyondHorizon } from './scaffold'

import { computeBel, type BelDep, type BelRow } from './tables/bel'
import { computeCF, type CFDep, type CFRow, type GebPostHelper } from './tables/cf'
import { computeOnt, type OntDep, type OntRow } from './tables/ont'
import { computeAf, type AfDep, type AfRow } from './tables/af'
import {
  computeToenameAfname,
  type ToenameAfnameDep,
  type ToenameAfnameRow,
} from './tables/toename-afname'
import {
  computeVerdeling,
  computeVerdelingWeights,
  type VerdelingDep,
  type VerdelingRow,
} from './tables/verdeling'
import {
  computeBez,
  computeBezWoning,
  type BezDep,
  type BezRow,
  type BezWoningblok,
  type CategorieBedrag,
} from './tables/bez'
import { computeS, S_EXTRA_CATEGORIEEN, debtSlotCount, type SDep, type SRow } from './tables/s'
import { computePrognose, type PrognoseDep, type PrognoseRow } from './tables/prognose'
// Alleen `startNettoLiquide` (T0-stand voor het guardrails-anker bij FIRE-maand 0);
// jaarrand.ts importeert van deze module uitsluitend typen, dus geen runtime-cycle.
import { startNettoLiquide } from './jaarrand'
import { computeWerkStrategie, type WerkStrategieRow } from './tables/werk-strategie'
import { computePT, type PTRow, computePartnerHead, type PartnerHead } from './tables/pt'
import { computeEs, type EsRow } from './tables/es'
import {
  computeAutoGebeurtenissen,
  type AutoGebeurtenissenResult,
} from './tables/auto-gebeurtenissen'
import { computeGebAutoRows, type GebAutoRow } from './tables/geb'

// ── Vaste bezitting-categorie-volgorde (TS-rijvolgorde = categorie-identiteit) ──
// Identiek aan `input.ts.bezitCategorien`, de Verdeling-BEZIT-volgorde en de
// Toename-bezit-volgorde — waardoor per-index de arrays van die tabellen uitlijnen.
const ASSET_ORDER: readonly AssetCategorie[] = [
  'Spaargeld',
  'Beleggingen',
  'Pensioen',
  'Vastgoed',
  'Eigen huis',
  'Overig',
]

// Gereserveerde schuld-slots (contract, `input-from-fixture`): hypotheek=0, opeet=3, tekort=6.
// De tekort-lening wordt sinds snede 2b via de getypte rol 'tekortLening' gelokaliseerd
// (dynamische slots); `TEKORT_SLOT` blijft enkel als fallback wanneer die rol ontbreekt.
const HYPOTHEEK_SLOT = 0
const OPEET_SLOT = 3
const TEKORT_SLOT = 6

/** Nul-woningblok (voorbij de horizon; `computeBez` geeft daar geen `.woning`). */
const ZERO_WONING: BezWoningblok = {
  verkocht: 0,
  verkoopopbrengst: 0,
  huurPerMaand: 0,
  vervallenHypotheeklast: 0,
  overwaardeVorig: 0,
  opeetCap: 0,
  opeetOpname: 0,
}

/** Nul-categorie-bedrag (genulde m-deps voor de vroege woningblok-berekening). */
const ZERO_CAT: CategorieBedrag = Object.freeze({
  Spaargeld: 0,
  Beleggingen: 0,
  Pensioen: 0,
  Vastgoed: 0,
  'Eigen huis': 0,
  Overig: 0,
})

/** Opties voor `runKernelProjection`. */
export interface KernelProjectionOptions {
  /** FIRE-leeftijd (P!B16-equivalent). PARAMETER — de solver die 'm zoekt is een latere stap. */
  readonly fireAge: number
  /**
   * Guardrails-anker P!B82. Standaard (`undefined`) legt de engine het zelf vast als
   * de eigen Prognose!J(fireMaand−1) tijdens de loop — of, bij FIRE-maand 0 (maand −1
   * bestaat niet), op de T0-liquide-stand `max(0, startNettoLiquide(input))`.
   * Overridebaar voor tests.
   */
  readonly guardrailsAnker?: number
  /**
   * Sla de post-loop Ont-uitvoer-herberekening met het definitieve anker over (F7).
   * Uitsluitend veilig op projecties die worden WEGGEGOOID — de bisectie-INTERNE
   * solver-probes: het anker beïnvloedt vóór FIRE alléén de weergave-kolommen Ont!H/I
   * (Ont!D=0, géén model-terugkoppeling), en gap/status/tekort lezen `proj.prognose`/
   * `proj.s` — nóóit `proj.ont`. Default (`false`) = volle recompute = byte-identiek
   * oracle-pad; met de vlag wijkt UITSLUITEND `ont` af (provisioneel anker vóór FIRE),
   * alle andere arrays zijn identiek. NOOIT zetten op een projectie die geretourneerd
   * wordt (horizon-check-run, finale run, evaluateFireAt).
   */
  readonly skipOntPostRecompute?: boolean
}

/**
 * Compacte samenvatting voor de latere solver/wrappers. Bewust klein — geen
 * speculatie; alleen eindwaarden, de tekort-lening-piek en FIRE-maand-cellen.
 */
export interface KernelRunSummary {
  /** ROUND((fireAge − P!B7)·12) — de FIRE-maand-gate. */
  readonly fireMonth: MonthIndex
  /** Gebruikte FIRE-leeftijd (= `opts.fireAge`). */
  readonly fireAge: number
  /** Guardrails-anker P!B82 = Prognose!J(fireMaand−1) (zelf vastgelegd of override). */
  readonly guardrailsAnker: number
  /** Laatste in-horizon-maand (leeftijd ≤ 100). */
  readonly lastInHorizonMonth: MonthIndex
  /** Prognose!I op de laatste in-horizon-maand (netto vermogen einde). */
  readonly eindNettoVermogen: number
  /** Prognose!J op de laatste in-horizon-maand (netto-liquide einde). */
  readonly eindNettoLiquide: number
  /** Prognose!I op de FIRE-maand (netto vermogen bij FIRE); `null` als buiten horizon. */
  readonly nettoVermogenBijFire: number | null
  /** Prognose!J op de FIRE-maand (netto-liquide bij FIRE); `null` als buiten horizon. */
  readonly nettoLiquideBijFire: number | null
  /** Piek van het tekort-lening-saldo (S-slot 6) over alle maanden. */
  readonly tekortLeningPiek: number
}

/** De volledige projectie: elke geporte maandtabel als array + de statische blokken. */
export interface KernelProjection {
  readonly cf: readonly CFRow[]
  readonly bel: readonly BelRow[]
  readonly ont: readonly OntRow[]
  readonly af: readonly AfRow[]
  readonly toenameAfname: readonly ToenameAfnameRow[]
  readonly verdeling: readonly VerdelingRow[]
  readonly bez: readonly BezRow[]
  readonly s: readonly SRow[]
  readonly prognose: readonly PrognoseRow[]
  readonly werkStrategie: readonly WerkStrategieRow[]
  readonly pt: readonly PTRow[]
  /** ES-blok (eindstrategie-spiegel, statisch). */
  readonly es: EsRow
  /** Auto-gebeurtenissen (afgeleide cellen, statisch). */
  readonly autoGebeurtenissen: AutoGebeurtenissenResult
  /** Geb auto-rijen 14-30 (statisch). */
  readonly gebAutoRows: readonly GebAutoRow[]
  /** PT head-cellen B10-B12 (statisch). */
  readonly partnerHead: PartnerHead
  /** Compacte samenvatting voor solver/wrappers. */
  readonly summary: KernelRunSummary
}

// ── m−1-toestand-accessors (undefined/voorbij-horizon → 0) ───────────────────

/** Coerce een S-cel (getal of "") naar een getal (leeg → 0). */
function numCell(v: number | ''): number {
  return typeof v === 'number' ? v : 0
}

/** Bez-slotwaarde(m−1) van een fysiek slot; ontbrekend/voorbij-horizon → 0. */
function bezSlotWaarde(prev: BezRow | undefined, slot: number): number {
  if (prev === undefined || prev.beyondHorizon) return 0
  return prev.slots[slot]?.waarde ?? 0
}

/** Bez-slotrendement(m) van een fysiek slot; voorbij-horizon → 0. */
function bezSlotRendement(row: BezRow, slot: number): number {
  if (row.beyondHorizon) return 0
  return row.slots[slot]?.rendement ?? 0
}

/** Bez categorie-totalen in ASSET_ORDER-volgorde; ontbrekend/voorbij-horizon → 0-array. */
function bezCatTotals(row: BezRow | undefined): number[] {
  if (row === undefined || row.beyondHorizon) return [0, 0, 0, 0, 0, 0]
  return [
    row.totaalSpaargeld,
    row.totaalBeleggingen,
    row.totaalPensioen,
    row.totaalVastgoed,
    row.totaalEigenHuis,
    row.totaalOverig,
  ]
}

/** Bez Box 3-type-totalen (AH+AI+AJ) op maand m; voorbij-horizon → 0. */
function bezTotaalBezittingen(row: BezRow): number {
  if (row.beyondHorizon) return 0
  return row.totaalBox3Spaar + row.totaalBox3Investering + row.totaalGeenBox3
}

/** Bez-woningblok van de rij (voorbij-horizon → nul-blok). */
function bezWoning(row: BezRow): BezWoningblok {
  return row.beyondHorizon ? ZERO_WONING : row.woning
}

/** Bez-woningblok van de m−1-rij (ontbrekend/voorbij-horizon → nul-blok). */
function prevWoning(prev: BezRow | undefined): BezWoningblok {
  return prev === undefined || prev.beyondHorizon ? ZERO_WONING : prev.woning
}

/** S-slotsaldo(m−1) van een fysiek slot; ontbrekend → 0, "" → 0. */
function sSlotSaldo(prev: SRow | undefined, slot: number): number {
  if (prev === undefined) return 0
  return numCell(prev.slots[slot]?.saldo ?? 0)
}

/** S-slotrente(m) van een fysiek slot; "" → 0. */
function sSlotRente(row: SRow, slot: number): number {
  return numCell(row.slots[slot]?.rente ?? 0)
}

/** S schuld-categorie-totalen [Woning, Consumptief, Studie, Zakelijk, Overig]; ontbrekend/"" → 0. */
function sCatTotals(row: SRow | undefined): number[] {
  if (row === undefined) return [0, 0, 0, 0, 0]
  return [
    numCell(row.totaalWoning),
    numCell(row.totaalConsumptief),
    numCell(row.totaalStudie),
    numCell(row.totaalZakelijk),
    numCell(row.totaalOverig),
  ]
}

/** Prognose!J (netto-liquide) van een rij; voorbij-horizon → 0. */
function prognoseJ(row: PrognoseRow | undefined): number {
  if (row === undefined || row.beyondHorizon) return 0
  return row.nettoLiquide
}

/** Prognose!G (cumulatief Box 3) van een rij; voorbij-horizon → 0. */
function prognoseCumBox3(row: PrognoseRow | undefined): number {
  if (row === undefined || row.beyondHorizon) return 0
  return row.cumulatiefBox3
}

/** Bel!N (canonieke heffing) van een rij; voorbij-horizon → 0. */
function belCanoniek(row: BelRow | undefined): number {
  if (row === undefined || row.beyondHorizon) return 0
  return row.canoniek
}

/** Bel!K (forfaitaire heffing) van een rij; voorbij-horizon → 0. */
function belForfait(row: BelRow): number {
  return row.beyondHorizon ? 0 : row.forfaitaireHeffing
}

/** CF!I (totaal extra geld) van een rij; voorbij-horizon → 0. */
function cfTotaalExtraGeld(row: CFRow): number {
  return row.beyondHorizon ? 0 : row.totaalExtraGeld
}

/**
 * Vul een `CategorieBedrag`-doelobject `out` uit een array in ASSET_ORDER-volgorde
 * en geef het terug. `out` is een herbruikbare scratch-buffer (F2): alle 6 sleutels
 * worden elke aanroep volledig overschreven, dus een over maanden hergebruikte buffer
 * draagt geen stale waarden. De consumenten (computeBez) lezen het element-wise en
 * bewaren geen referentie → byte-identiek aan de vroegere verse `{ ...ZERO_CAT }`-alloc.
 */
function catMap(values: readonly number[], out: Record<AssetCategorie, number>): CategorieBedrag {
  for (let i = 0; i < ASSET_ORDER.length; i++) out[ASSET_ORDER[i]] = values[i] ?? 0
  return out
}

/** Verse mutable CategorieBedrag-scratch-buffer (alle categorieën 0). */
function newCatBuf(): Record<AssetCategorie, number> {
  return { ...ZERO_CAT } as Record<AssetCategorie, number>
}

/** Tel twee categorie-bedragen op (voor het injecteren van liquidatie-opbrengst als toename). */
function addCat(a: CategorieBedrag, b: CategorieBedrag): CategorieBedrag {
  const out = { ...a } as Record<AssetCategorie, number>
  for (const c of ASSET_ORDER) out[c] += b[c]
  return out
}

/**
 * Uitkomst van de buiten-oracle pot-aanpassingen op maand m (snede 2b).
 * `slotWaardeVorig`/`categoriesaldoVorig` zijn de (mogelijk aangepaste) m−1-waarden
 * die Bez consumeert; `liquidatieToename` is de netto-verkoopopbrengst per categorie
 * die als inleg (ná rendement) in de volle Bez-call wordt geïnjecteerd (`null` = geen).
 */
interface PotAanpassing {
  readonly slotWaardeVorig: number[]
  readonly categoriesaldoVorig: Record<AssetCategorie, number>
  readonly liquidatieToename: Record<AssetCategorie, number> | null
}

/**
 * **Buiten oracle-domein (snede 2b, ADR 0032 §4).** Pas de generieke pot-mutaties
 * (V9 market_shock) en pot-liquidaties toe op de m−1-toestand die Bez op maand m
 * consumeert. Puur additief en **inert-by-default**: deze functie wordt alléén
 * aangeroepen wanneer `input.potMutaties`/`potLiquidaties` niet-leeg zijn, en werkt
 * op KLONEN van de base-arrays via delta's — het reguliere pad (geen invoer) raakt
 * `slotWaardeVorig`/`categoriesaldoVorig` nooit aan en blijft byte-identiek.
 *
 * Volgorde per maand: eerst de schok (schaalt saldo m−1 vóór rendement), dan de
 * liquidatie (leest de eventueel geschokte waarde, zet de bronpot op 0, routeert
 * de netto-opbrengst naar de liquide bestemming). Meerdere mutaties dezelfde maand
 * compounden (elke leest de tot dan geschaalde waarde).
 */
function applyPotAanpassingen(
  input: KernelInput,
  m: MonthIndex,
  baseSlotWaardeVorig: readonly number[],
  baseCategoriesaldoVorig: CategorieBedrag,
): PotAanpassing {
  const slotWaardeVorig = baseSlotWaardeVorig.slice()
  const categoriesaldoVorig = { ...baseCategoriesaldoVorig } as Record<AssetCategorie, number>
  let liquidatieToename: Record<AssetCategorie, number> | null = null

  // (1) market_shock — schaal het saldo m−1 vóór rendement/inleg.
  for (const mut of input.potMutaties ?? []) {
    if (mut.maand !== m) continue
    const f = 1 + mut.pct
    for (let i = 0; i < input.assetPotten.length; i++) {
      const p = input.assetPotten[i]
      // Investeringen (Beleggingen/Vastgoed), of — bij een brede schok — alles
      // behalve de eigen woning (die volgt het aparte woningblok, geen marktschok).
      const affected = mut.alleenInvestering ? p.investering : p.rol !== 'eigenHuis'
      if (!affected) continue
      const v = slotWaardeVorig[i]
      slotWaardeVorig[i] = v * f
      categoriesaldoVorig[p.categorie] += v * (f - 1)
    }
  }

  // (2) generieke liquidaties — bronpot → 0, netto-opbrengst → liquide bestemming.
  for (const liq of input.potLiquidaties ?? []) {
    if (liq.maand !== m) continue
    for (let i = 0; i < input.assetPotten.length; i++) {
      const p = input.assetPotten[i]
      if (p.slot !== liq.slot) continue
      if (p.rol === 'eigenHuis') continue // huis heeft z'n eigen verkoop-flow (woningblok)
      const v = slotWaardeVorig[i] // effectieve waarde m−1 (ná een eventuele schok)
      slotWaardeVorig[i] = 0
      categoriesaldoVorig[p.categorie] -= v
      const doel: AssetCategorie = liq.doelCategorie ?? 'Spaargeld'
      if (liquidatieToename === null) liquidatieToename = { ...ZERO_CAT } as Record<AssetCategorie, number>
      liquidatieToename[doel] += v * (1 - liq.kostenPct)
    }
  }

  return { slotWaardeVorig, categoriesaldoVorig, liquidatieToename }
}

// ── Geb-helperposten (rij 4-30) — voeden CF!H (baten) en Af!D (kosten) ──────────

/** Eén machine-leesbare gebeurtenis-post (Geb W:AE): start-/eind-maandindex + koopkracht-nu bedrag. */
interface GebHelperPost {
  readonly sIdx: number
  readonly eIdx: number
  readonly bedrag: number
}

/**
 * Bouw alle Geb-helperposten (rij 4-30): de **handmatige** rijen 4-13 uit
 * `input.gebeurtenissen` (zelfde domein-formule als `tables/geb.ts`) + de
 * **automatische** rijen 14-30 uit `computeGebAutoRows`. Lege/inactieve posten
 * (sentinel sIdx>eIdx) vuren nooit; ze zijn hier weggelaten resp. onschadelijk.
 *
 * Manueel: `sIdx = (startLt−P!B7)·12 + (startMnd−1)`; `eIdx =` eind-anker als
 * eindLt/eindMnd ingevuld; anders — bij een **Periodiek**-post zónder eind —
 * loopt de post door tot de horizon (`eIdx = 1199`), en bij een **Eenmalig**-post
 * vuurt hij één maand (`eIdx = sIdx`). `bedrag` = koopkracht-nu (CF!H/Af!D
 * indexeren centraal). Empirisch geverifieerd tegen de fixture-Geb!W:AE (o.a. de
 * "Pensionering"-post3 Periodiek-zonder-eind: sIdx=348, eIdx=1199, bn=100).
 */
function buildGebPosten(input: KernelInput): GebHelperPost[] {
  const posten: GebHelperPost[] = []

  // Handmatige gebeurtenissen (Geb rij 4-13).
  for (const rij of input.gebeurtenissen) {
    for (const post of rij.posten) {
      const sIdx = (post.startLeeftijd - input.startLeeftijd) * 12 + (post.startMaand - 1)
      const eIdx =
        post.eindLeeftijd !== null && post.eindMaand !== null
          ? (post.eindLeeftijd - input.startLeeftijd) * 12 + (post.eindMaand - 1)
          : post.type === 'Periodiek'
            ? HORIZON_MONTHS - 1 // doorlopend → tot de laatste maandindex (1199)
            : sIdx // Eenmalig → vuurt één maand
      posten.push({ sIdx, eIdx, bedrag: post.bedrag })
    }
  }

  // Automatische gebeurtenissen (Geb rij 14-30) — helper-drieluik per rij.
  for (const row of computeGebAutoRows(input)) {
    for (const h of row.helpers) {
      posten.push({ sIdx: h.sIdx, eIdx: h.eIdx, bedrag: h.bn })
    }
  }

  return posten
}

// ── De engine ────────────────────────────────────────────────────────────────

/**
 * Draai de integrale forward-recursie-projectie. FIRE-leeftijd is een parameter
 * (`opts.fireAge`); het guardrails-anker wordt zelf vastgelegd tenzij overridden.
 */
export function runKernelProjection(
  input: KernelInput,
  opts: KernelProjectionOptions,
): KernelProjection {
  const { fireAge } = opts
  const fireMonth = Math.round((fireAge - input.startLeeftijd) * 12)

  // Getypte tekort-lokalisatie + dynamisch schuld-slot-aantal (snede 2b). Voor de
  // fixtures: tekort-rol op slot 6, `nDebtSlots` = 7 → byte-identiek aan het oude pad.
  const tekortSlot = input.schuldPotten.find((p) => p.rol === 'tekortLening')?.slot ?? TEKORT_SLOT
  const nDebtSlots = debtSlotCount(input.schuldPotten)
  // Zijn er buiten-oracle pot-aanpassingen (V9-schok / generieke liquidatie)?
  const heeftPotAanpassingen =
    (input.potMutaties?.length ?? 0) > 0 || (input.potLiquidaties?.length ?? 0) > 0

  // Input-constante Verdeling-gewicht-/reserve-bundel — één keer vóór de maandloop
  // (F4-hoisting; werd anders per maand 2× herrekend). Byte-identiek: `computeVerdeling`
  // gebruikt exact deze bundel i.p.v. 'm zelf te herleiden.
  const verdelingWeights = computeVerdelingWeights(input)

  // Statische blokken (één keer).
  const es = computeEs(input)
  const autoGebeurtenissen = computeAutoGebeurtenissen(input)
  const gebAutoRows = computeGebAutoRows(input)
  const partnerHead = computePartnerHead(input)
  const gebPosten: readonly GebPostHelper[] = buildGebPosten(input) // {sIdx,eIdx,bedrag}
  const afGebPosten: AfDep = {
    gebPosten: gebPosten.map((p) => ({
      startIndex: p.sIdx,
      eindIndex: p.eIdx,
      bedrag: p.bedrag,
    })),
  }

  // Opeethypotheek: overwaarde (J − S!D) in de maand vóór opeet-start (auto-opname-basis).
  // Wordt tijdens de loop vastgelegd op maand mStart−1; vóór opeet-start ongebruikt.
  const opeetStartMonth = Math.round(
    (input.woning.opeetStartleeftijdOpname - input.startLeeftijd) * 12,
  )
  let overwaardeBijOpeetStart = 0

  // Guardrails-anker: override of self-capture op maand fireMaand−1.
  //
  // FIRE-MAAND 0 (ADR 0126; buiten oracle-domein — geen fixture forceert FIRE op de
  // startleeftijd, dus parity blijft byte-identiek): maand −1 bestaat niet, de
  // self-capture in de maandloop vuurt nooit en het anker zou 0 blijven voor álle
  // 1200 maanden. `guardrailsFactorInHorizon` (tables/ont.ts) maakt van anker 0 een
  // ratio 0, en 0 < onderdrempel ⇒ MAX(floor, 1 − stap): een PERMANENTE cut op de
  // uitgave-term voor elk 'Guardrails'-profiel — een stop-nu-run (runway, status,
  // Monte-Carlo, rendement-marge: dezelfde projectie) rekent dan systematisch te
  // rooskleurig. Daarom initialiseert de engine het anker hier zélf op de
  // T0-liquide-stand — dezelfde afleiding (`startNettoLiquide`, jaarrand.ts) die de
  // bridge voor rij 0 hanteert. T0-stand ≤ 0 ⇒ anker 0: er is geen positieve
  // referentie en zo'n run is een deficit. BEWUSTE GRENS: Ont!G(0) is de oracle-cel
  // "" → 0 (m−1-lag), dus maand 0 zélf houdt één maand de floor-factor — één van
  // 1200 maanden (aandachtspunt horizon-kernel-bekende-afwijkingen).
  // Regressieslot: guardrails-anker-fire-maand-0.test.ts.
  const selfCaptureAnker = opts.guardrailsAnker === undefined
  let anker =
    opts.guardrailsAnker ?? (fireMonth < 1 ? Math.max(0, startNettoLiquide(input)) : 0)

  // Uitvoer-arrays.
  const cf: CFRow[] = []
  const bel: BelRow[] = []
  const ont: OntRow[] = []
  const af: AfRow[] = []
  const toenameAfname: ToenameAfnameRow[] = []
  const verdeling: VerdelingRow[] = []
  const bez: BezRow[] = []
  const s: SRow[] = []
  const prognose: PrognoseRow[] = []
  const werkStrategie: WerkStrategieRow[] = []
  const pt: PTRow[] = []

  // Voortschrijdende m−1-toestand.
  let prevBez: BezRow | undefined
  let prevS: SRow | undefined
  let prevProg: PrognoseRow | undefined
  let prevBel: BelRow | undefined

  // ── F2 — herbruikbare scratch-buffers (in-place gevuld per maand i.p.v. een verse
  // allocatie per maand). Elke buffer is TOEGEWIJD aan één grootheid en wordt elke
  // maand volledig overschreven; de tabellen lezen alle dep-arrays/-objecten
  // element-wise en bewaren geen referentie (geverifieerd) → hergebruik over maanden
  // is byte-identiek. Alleen het reguliere (oracle-)pad gebruikt de buffers direct;
  // de inert-by-default pot-aanpassingen-tak kloont ze eerst (slice/spread), dus die
  // blijft óók byte-identiek.
  const nAssets = input.assetPotten.length
  const nSchuld = input.schuldPotten.length
  const nBezCat = input.ts.bezitCategorien.length
  const nExtra = S_EXTRA_CATEGORIEEN.length
  const slotWaardeVorigBuf = new Array<number>(nAssets).fill(0)
  const schuldSaldiVorigBuf = new Array<number>(nSchuld).fill(0)
  const saldoVorigeBuf = new Array<number>(nDebtSlots).fill(0)
  const extraAflossingBuf = new Array<number>(nExtra).fill(0)
  const categorieCapBuf = new Array<number>(nExtra).fill(0)
  const assetRendementenBuf = new Array<number>(nAssets).fill(0)
  const schuldRentesBuf = new Array<number>(nSchuld).fill(0)
  const bezCatTotBuf = new Array<number>(nBezCat).fill(0)
  const schuldCatTotBuf = new Array<number>(input.ts.schuldCategorien.length).fill(0)
  const catBufCategoriesaldo = newCatBuf()
  const catBufToename = newCatBuf()
  const catBufAantal = newCatBuf()
  const catBufVerdAfname = newCatBuf()
  const catBufVerdOnttrekking = newCatBuf()
  const catBufVerdTekort = newCatBuf()
  const catBufOverloop = newCatBuf()

  for (let m: MonthIndex = 0; m < HORIZON_MONTHS; m++) {
    // ── m−1-afhankelijke Bez-deps (gedeeld door de vroege woning- en de volle Bez-call) ──
    const prevWon = prevWoning(prevBez)
    // Base m−1-waarden (ongewijzigd pad = byte-identiek). Alleen wanneer er
    // buiten-oracle pot-aanpassingen zijn (V9-schok / liquidatie) worden ze op een
    // KLOON via delta's aangepast (snede 2b, ADR 0032 §4 — inert-by-default).
    for (let i = 0; i < nAssets; i++) {
      slotWaardeVorigBuf[i] = bezSlotWaarde(prevBez, input.assetPotten[i].slot)
    }
    let slotWaardeVorig: readonly number[] = slotWaardeVorigBuf
    let categoriesaldoVorig: CategorieBedrag = catMap(bezCatTotals(prevBez), catBufCategoriesaldo)
    let liquidatieToename: Record<AssetCategorie, number> | null = null
    if (heeftPotAanpassingen) {
      const adj = applyPotAanpassingen(input, m, slotWaardeVorig, categoriesaldoVorig)
      slotWaardeVorig = adj.slotWaardeVorig
      categoriesaldoVorig = adj.categoriesaldoVorig
      liquidatieToename = adj.liquidatieToename
    }
    const bezM1 = {
      slotWaardeVorig,
      categoriesaldoVorig,
      ayVorig: prevWon.verkocht,
      baVorig: prevWon.huurPerMaand,
      bbVorig: prevWon.vervallenHypotheeklast,
      huisWaardeVorig: bezSlotWaarde(prevBez, houseSlot(input)),
      hypotheekSaldoVorig: sSlotSaldo(prevS, HYPOTHEEK_SLOT),
      opeetSaldoVorig: sSlotSaldo(prevS, OPEET_SLOT),
      prognoseLiquideVorig: prognoseJ(prevProg),
      fireLeeftijd: fireAge,
      overwaardeBijOpeetStart,
    }

    // (1) Woningblok AY:BE — hangt uitsluitend aan de m−1-toestand (bezM1), niet aan
    // Toename/Verdeling. Lichte call (F3): berekent alléén het woningblok, niet de volle
    // 10-slot-loop + totalen + rij-constructie die de vroegere `computeBez(earlyDep)` voor
    // niets draaide (er werd alleen `.woning` van gelezen). Byte-identiek — zie computeBezWoning.
    const woning = computeBezWoning(input, bezM1, m)

    // (2) PT(m) en Werk-strategie(m).
    const ptRow = computePT(input, {}, m)
    const werkRow = computeWerkStrategie(input, { fireGateLeeftijd: fireAge }, m)

    // (4) Af(m) — zuiver op m + statische Geb-posten.
    const afRow = computeAf(input, afGebPosten, m)

    // (3) Ont(m) — box3-term = CF!K(m) = Bel!N(m−1).
    const ontDep: OntDep = {
      fireMaand: fireMonth,
      guardrailsAnker: anker,
      liquideNettoVorigeMaand: prognoseJ(prevProg),
      huurNaVerkoop: woning.huurPerMaand,
      vervallenHypotheeklast: woning.vervallenHypotheeklast,
      box3VorigeMaand: m === 0 ? 0 : belCanoniek(prevBel),
      partnerTotaal: ptRow.totaal,
    }
    const ontRow = computeOnt(input, ontDep, m)

    // (5) CF(m).
    for (let i = 0; i < nSchuld; i++) {
      schuldSaldiVorigBuf[i] = sSlotSaldo(prevS, input.schuldPotten[i].slot)
    }
    const cfDep: CFDep = {
      partnerBijdrage: ptRow.totaal,
      werkStrategieDelta: werkRow.gegateDelta,
      huurNaVerkoop: woning.huurPerMaand,
      vervallenHypotheeklast: woning.vervallenHypotheeklast,
      verkoopopbrengst: woning.verkoopopbrengst,
      opeetOpname: woning.opeetOpname,
      afname: afRow.totaalAfname,
      onttrekking: ontRow.onttrekking,
      canoniekeHeffingVorigeMaand: m === 0 ? 0 : belCanoniek(prevBel),
      schuldSaldiVorigeMaand: schuldSaldiVorigBuf,
      fireMonth,
      gebPosten,
    }
    const cfRow = computeCF(input, cfDep, m)

    // (6) Toename en afname(m).
    const taDep: ToenameAfnameDep = {
      totaalExtraGeld: cfTotaalExtraGeld(cfRow),
      afname: afRow.totaalAfname,
      onttrekking: ontRow.onttrekking,
    }
    const taRow = computeToenameAfname(input, taDep, m)

    // (7) Verdeling(m) — aflos-budget = Σ 'Toename en afname' schuld-toename€.
    const aflossingBudget = taRow.beyondHorizon
      ? 0
      : taRow.schuld.reduce((sum, c) => sum + c.toenameEur, 0)
    const verdelingDep: VerdelingDep = {
      afnameBudget: afRow.totaalAfname,
      onttrekkingBudget: ontRow.onttrekking,
      aflossingBudget,
      bezSaldiPrev: bezCatTotals(prevBez),
      schuldSaldiPrev: sCatTotals(prevS),
      // S!AB(m−1): het tekort-lening-saldo, buiten sCatTotals (= S!AJ:AN). Via de
      // getypte rol gelokaliseerd (snede 2b); voor de fixtures = slot 6 → byte-identiek.
      tekortSaldoPrev: sSlotSaldo(prevS, tekortSlot),
      weights: verdelingWeights, // F4-hoisting (input-constant, één keer berekend)
    }
    const verdelingRow = computeVerdeling(input, verdelingDep, m)

    // (8) Bez-waardekolommen(m) — volle Bez-call met de echte m-deps.
    // Liquidatie-opbrengst (snede 2b) telt hier — ná rendement — als inleg in de
    // doelcategorie mee (spiegel woningverkoop → nieuw liquide geld). `null` bij
    // geen liquidatie deze maand, dus het reguliere pad blijft byte-identiek.
    const toenameEurBase = catMap(taBezitField(taRow, (c) => c.toenameEur), catBufToename)
    const bezDep: BezDep = {
      ...bezM1,
      toenameEur: liquidatieToename === null ? toenameEurBase : addCat(toenameEurBase, liquidatieToename),
      aantalPotten: catMap(taBezitField(taRow, (c) => c.aantal), catBufAantal),
      verdelingAfname: catMap(verdelingRow.afname.eind, catBufVerdAfname),
      verdelingOnttrekking: catMap(verdelingRow.onttrekking.eind, catBufVerdOnttrekking),
      // F6-bugfix (gap V19): extra onttrekking uit liquide om de tekort-lening af te
      // lossen. Nul-array zonder de vlag → byte-identiek aan het oracle-pad.
      verdelingTekortAflossing: catMap(verdelingRow.tekortAflossingLiquide, catBufVerdTekort),
      overloop: catMap(verdelingRow.overflow, catBufOverloop),
    }
    const bezRow = computeBez(input, bezDep, m)
    const bezWoningRow = bezWoning(bezRow)

    // (9) S(m).
    for (let slot = 0; slot < nDebtSlots; slot++) saldoVorigeBuf[slot] = sSlotSaldo(prevS, slot)
    for (let c = 0; c < nExtra; c++) {
      extraAflossingBuf[c] = verdelingRow.aflossing.eind[c] ?? 0
      categorieCapBuf[c] = verdelingRow.aflossing.caps[c] ?? 0
    }
    const sDep: SDep = {
      saldoVorige: saldoVorigeBuf,
      verkocht: bezWoningRow.verkocht,
      opeetCap: bezWoningRow.opeetCap,
      opeetOpname: bezWoningRow.opeetOpname,
      tekortBudget: verdelingRow.afname.onbenut + verdelingRow.onttrekking.onbenut,
      extraAflossingBudget: extraAflossingBuf,
      categorieCap: categorieCapBuf,
      // S!AC: de prio-1-tekort-aflossing die Verdeling(m) al berekende (EQ = ruwBudget − AC).
      tekortAflossing: verdelingRow.tekortAflossing,
    }
    const sRow = computeS(input, sDep, m)

    // (10) Bel(m) — grondslagen = Bez/S-saldi van maand m zelf.
    for (let i = 0; i < nAssets; i++) {
      assetRendementenBuf[i] = bezSlotRendement(bezRow, input.assetPotten[i].slot)
    }
    for (let i = 0; i < nSchuld; i++) {
      schuldRentesBuf[i] = sSlotRente(sRow, input.schuldPotten[i].slot)
    }
    const belDep: BelDep = {
      grondslagSpaar: bezRow.beyondHorizon ? 0 : bezRow.totaalBox3Spaar,
      grondslagInvestering: bezRow.beyondHorizon ? 0 : bezRow.totaalBox3Investering,
      grondslagSchuld: numCell(sRow.totaalBox3),
      assetRendementen: assetRendementenBuf,
      schuldRentes: schuldRentesBuf,
    }
    const belRow = computeBel(input, belDep, m)

    // (11) Prognose(m).
    const bezTotalsM = bezCatTotals(bezRow) // in ASSET_ORDER-volgorde
    for (let i = 0; i < nBezCat; i++) {
      bezCatTotBuf[i] = bezTotalsM[ASSET_ORDER.indexOf(input.ts.bezitCategorien[i].categorie)] ?? 0
    }
    const prognoseDep: PrognoseDep = {
      totaalBezittingen: bezTotaalBezittingen(bezRow),
      totaalSchulden: numCell(sRow.totaalBox3) + numCell(sRow.totaalGeenBox3),
      box3Forfaitair: belForfait(belRow),
      cumulatiefBox3Vorige: prognoseCumBox3(prevProg),
      bezCategorieTotalen: bezCatTotBuf,
      schuldCategorieTotalen: schuldCatTotalsPerTs(input, sRow, schuldCatTotBuf),
    }
    const prognoseRow = computePrognose(input, prognoseDep, m)

    // Bewaar de rijen.
    cf.push(cfRow)
    bel.push(belRow)
    ont.push(ontRow)
    af.push(afRow)
    toenameAfname.push(taRow)
    verdeling.push(verdelingRow)
    bez.push(bezRow)
    s.push(sRow)
    prognose.push(prognoseRow)
    werkStrategie.push(werkRow)
    pt.push(ptRow)

    // Anker self-capture op fireMaand−1 (Prognose!J vóór FIRE).
    if (selfCaptureAnker && m === fireMonth - 1) {
      anker = prognoseJ(prognoseRow)
    }
    // Overwaarde bij opeet-start (basis auto-opname) op mStart−1.
    if (opeetStartMonth >= 1 && m === opeetStartMonth - 1) {
      overwaardeBijOpeetStart = Math.max(
        0,
        bezSlotWaarde(bezRow, houseSlot(input)) - sSlotSaldo(sRow, HYPOTHEEK_SLOT),
      )
    }

    // Voortschrijdende m−1-toestand.
    prevBez = bezRow
    prevS = sRow
    prevProg = prognoseRow
    prevBel = belRow
  }

  // ── Ont-uitvoer herrekenen met het definitieve anker ──────────────────────────
  // Het anker beïnvloedt vóór FIRE alléén Ont!H/I (Ont!D=0, geen model-terugkoppeling);
  // tijdens de loop was het anker daar nog provisioneel. Post-FIRE is dit identiek.
  // F7: bisectie-interne probes (projectie wordt weggegooid; gap/status lezen geen ont)
  // slaan deze 1200× computeOnt over — zie `skipOntPostRecompute`.
  if (selfCaptureAnker && !opts.skipOntPostRecompute) {
    for (let m = 0; m < HORIZON_MONTHS; m++) {
      ont[m] = computeOnt(
        input,
        {
          fireMaand: fireMonth,
          guardrailsAnker: anker,
          liquideNettoVorigeMaand: m === 0 ? 0 : prognoseJ(prognose[m - 1]),
          huurNaVerkoop: bezWoning(bez[m]).huurPerMaand,
          vervallenHypotheeklast: bezWoning(bez[m]).vervallenHypotheeklast,
          box3VorigeMaand: m === 0 ? 0 : belCanoniek(bel[m - 1]),
          partnerTotaal: pt[m].totaal,
        },
        m,
      )
    }
  }

  const summary = buildSummary(input, fireMonth, fireAge, anker, prognose, s)

  return {
    cf,
    bel,
    ont,
    af,
    toenameAfname,
    verdeling,
    bez,
    s,
    prognose,
    werkStrategie,
    pt,
    es,
    autoGebeurtenissen,
    gebAutoRows,
    partnerHead,
    summary,
  }
}

// ── Interne shims ─────────────────────────────────────────────────────────────

/** Slot van de eigen-woning-pot (rol 'eigenHuis'); afwezig → 2 (bens rij 6, contract). */
function houseSlot(input: KernelInput): number {
  return input.assetPotten.find((p) => p.rol === 'eigenHuis')?.slot ?? 2
}

/** Bezit-veld per categorie uit een Toename-rij, in ASSET_ORDER-volgorde (voorbij-horizon → 0-array). */
function taBezitField(
  row: ToenameAfnameRow,
  pick: (c: { toenameEur: number; aantal: number }) => number,
): number[] {
  if (row.beyondHorizon) return [0, 0, 0, 0, 0, 0]
  return row.bezit.map((c) => pick(c))
}

/**
 * S-categorietotalen uitgelijnd op `input.ts.schuldCategorien` (voor Prognose L/M).
 * De vijf categorie-totalen [Woning..Overig] komen uit S!AJ:AN; "Tekort-lening"
 * heeft géén categorie-kolom → 0. Vult de herbruikbare scratch-buffer `out` in-place
 * (F2) en geeft 'm terug — computePrognose leest 'm element-wise, bewaart geen ref.
 */
function schuldCatTotalsPerTs(input: KernelInput, sRow: SRow, out: number[]): number[] {
  const byLabel: Record<string, number> = {
    Woning: numCell(sRow.totaalWoning),
    Consumptief: numCell(sRow.totaalConsumptief),
    Studie: numCell(sRow.totaalStudie),
    Zakelijk: numCell(sRow.totaalZakelijk),
    Overig: numCell(sRow.totaalOverig),
  }
  const cats = input.ts.schuldCategorien
  for (let i = 0; i < cats.length; i++) out[i] = byLabel[cats[i].categorie] ?? 0
  return out
}

/** Bouw de compacte samenvatting uit de voltooide Prognose-/S-arrays. */
function buildSummary(
  input: KernelInput,
  fireMonth: MonthIndex,
  fireAge: number,
  anker: number,
  prognose: readonly PrognoseRow[],
  s: readonly SRow[],
): KernelRunSummary {
  // Laatste in-horizon-maand (leeftijd ≤ 100).
  let lastInHorizonMonth = 0
  for (let m = 0; m < prognose.length; m++) {
    if (!isBeyondHorizon(input, m)) lastInHorizonMonth = m
  }
  const eindRow = prognose[lastInHorizonMonth]
  const eindNettoVermogen = eindRow.beyondHorizon ? 0 : eindRow.nettoVermogen
  const eindNettoLiquide = eindRow.beyondHorizon ? 0 : eindRow.nettoLiquide

  const fireRow =
    fireMonth >= 0 && fireMonth < prognose.length ? prognose[fireMonth] : undefined
  const nettoVermogenBijFire =
    fireRow === undefined || fireRow.beyondHorizon ? null : fireRow.nettoVermogen
  const nettoLiquideBijFire =
    fireRow === undefined || fireRow.beyondHorizon ? null : fireRow.nettoLiquide

  // Tekort-lening-piek (S-slot 6, altijd numeriek — ook bevroren voorbij de horizon).
  const tekortSlot = input.schuldPotten.find((p) => p.rol === 'tekortLening')?.slot ?? TEKORT_SLOT
  let tekortLeningPiek = 0
  for (const row of s) {
    const saldo = numCell(row.slots[tekortSlot]?.saldo ?? 0)
    if (saldo > tekortLeningPiek) tekortLeningPiek = saldo
  }

  return {
    fireMonth,
    fireAge,
    guardrailsAnker: anker,
    lastInHorizonMonth,
    eindNettoVermogen,
    eindNettoLiquide,
    nettoVermogenBijFire,
    nettoLiquideBijFire,
    tekortLeningPiek,
  }
}
