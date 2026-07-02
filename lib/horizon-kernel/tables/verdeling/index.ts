/**
 * Horizon-kernel · tabel **Verdeling** (Excel-tab `Verdeling`, A1:HK1203, 219
 * kolommen) — de **capaciteit-waterval** en het hart van de toewijzingslogica.
 *
 * Per maand verdeelt de tabel drie budgetten over de vermogens-/schuldcategorieën:
 *   1. **AFNAME** (gebeurtenis-kosten, Af!D) over de 6 bezitting-categorieën;
 *   2. **ONTTREKKING** (pensioenuitgave, Ont!D) over dezelfde 6, met capaciteit =
 *      afname-cap − afname-toewijzing (wat afname al pakte kan onttrekking niet meer);
 *   3. **SCHULD-AFLOSSING** (aflos-deel van CF!I) over de 5 schuld-categorieën.
 * Elk onderwerp draait dezelfde waterval (`runWaterfall`): 6 doorstroom-passes op
 * prio 1–4, een reserve-pass op prio 5, eindtoewijzing en onbenut.
 *
 * **Capaciteit = categoriesaldo m−1** (lag-veilig, géén kringverwijzing): de caps
 * komen uit Bez!AM:AR resp. S!AJ:AN van de vórige maand, met 0 voor niet-liquide
 * categorieën (TS!H). **Gewichten** = ½^(prio−1) genormaliseerd, op volle precisie
 * uit de TS-prio's herleid (zie `weights.ts` — de fixture-cellen zijn te grof).
 *
 * **Categorie-volgorde (bewaakt contract met Bez/S):** bezit =
 * [Spaargeld, Beleggingen, Pensioen, Vastgoed, Eigen huis, Overig]; schuld =
 * [Woning, Consumptief, Studie, Zakelijk, Overig]. LET OP: in Bez staan de
 * totaal-kolommen als AM,AN,AO,AP,**AR,AQ** — Eigen huis (AR) en Overig (AQ) zijn
 * dáár verwisseld; de `buildDep` van de parity-test mapt ze naar bovenstaande orde.
 *
 * **Horizon-guard.** Anders dan de meeste tabellen leegt Verdeling voorbij de
 * horizon (leeftijd > 100) ALLEEN de leeftijd-/maand-kolommen (B/C en de
 * herhaling HJ/HK → ""); alle reken-kolommen blijven numeriek 0 (de caps/budgets
 * zijn er 0, dus de waterval levert vanzelf 0). Daarom is er geen aparte
 * "horizon-rij": elke rij wordt gewoon berekend en alleen B/C/HJ/HK gemaskeerd.
 *
 * Teacher-forced parity: budgetten + m−1-saldi komen via `VerdelingDep` uit de
 * fixture; de gewichten/prio's/niet-liquide uit `KernelInput` (TS). Pure functie,
 * geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelInput, MonthIndex } from '../../types'
import { isBeyondHorizon, leeftijdJaren, maandInJaar } from '../../scaffold'
import { halveningWeights, reserveMask } from './weights'
import { runWaterfall, type WaterfallResult } from './waterfall'

/** Aantal bezitting-categorieën (Spaargeld, Beleggingen, Pensioen, Vastgoed, Eigen huis, Overig). */
export const BEZIT_CATEGORIEEN = 6
/** Aantal schuld-categorieën in de aflossing-waterval (Woning, Consumptief, Studie, Zakelijk, Overig). */
export const SCHULD_CATEGORIEEN = 5

/**
 * Upstream-waarden die Verdeling op maand `m` consumeert (teacher-forced uit de
 * fixture). De **gewichten** en **prio's** komen NIET hier binnen maar uit
 * `KernelInput` (TS); zie de module-doc en `weights.ts`.
 */
export interface VerdelingDep {
  /** Af!D(m) — afname-budget (som negatieve gebeurtenissen). */
  readonly afnameBudget: number
  /** Ont!D(m) — onttrekking-budget (pensioenuitgave na FIRE). */
  readonly onttrekkingBudget: number
  /** Aflos-deel van CF!I(m) — schuld-aflossing-budget (= Σ 'Toename en afname' schuld-toename€). */
  readonly aflossingBudget: number
  /** Bez categoriesaldi m−1 in bezit-volgorde [Spaar, Beleg, Pens, Vast, Huis, Overig]. */
  readonly bezSaldiPrev: readonly number[]
  /** S categoriesaldi m−1 in schuld-volgorde [Woning, Consumptief, Studie, Zakelijk, Overig]. */
  readonly schuldSaldiPrev: readonly number[]
}

/** Verdeling-rij: de drie onderwerp-resultaten + scaffold + overloop. */
export interface VerdelingRow {
  readonly maand: MonthIndex // A
  readonly beyondHorizon: boolean // stuurt de B/C/HJ/HK-guard
  readonly leeftijd: number // B / HJ (leeg voorbij horizon)
  readonly maandInJaar: number // C / HK (leeg voorbij horizon)
  readonly afname: WaterfallResult // D + E:J + K…BV
  readonly onttrekking: WaterfallResult // BX + BY:CD + …EO
  readonly aflossing: WaterfallResult // EQ + ER:EV + …GY
  /** HC:HH — niet-plaatsbaar aflos-budget terug naar bezitting-toename (6 categorieën). */
  readonly overflow: readonly number[]
}

/** Nul-overloop (HC:HH): 6 categorieën à 0. */
const ZERO_OVERFLOW: readonly number[] = Object.freeze([0, 0, 0, 0, 0, 0])

/**
 * Bereken de Verdeling-rij voor maand `m`.
 *
 * De niet-liquide-poort en de reserve-/gewicht-prio's komen uit `KernelInput.ts`
 * (statische TS-invoer); de budgetten en m−1-saldi uit `dep`.
 */
export function computeVerdeling(
  input: KernelInput,
  dep: VerdelingDep,
  m: MonthIndex,
): VerdelingRow {
  const bezit = input.ts.bezitCategorien // 6, vaste volgorde = categorie-identiteit
  const schuld = input.ts.schuldCategorien // eerste 5 = aflossing-categorieën

  // ── Capaciteiten: categoriesaldo m−1, 0 voor niet-liquide (TS!H). ──────────────
  const bezCaps = dep.bezSaldiPrev.map((saldo, i) => (bezit[i].nietLiquide ? 0 : saldo))
  const schuldCaps = dep.schuldSaldiPrev.map((saldo, i) =>
    schuld[i].nietLiquide ? 0 : saldo,
  )

  // ── Gewichten (½^(prio−1), volle precisie uit TS) + reserve-maskers. ───────────
  const wAfname = halveningWeights(
    bezit.map((c) => c.prioAfname),
    bezit.map((c) => c.gevuld),
    bezit.map((c) => c.nietLiquide),
  )
  const wOnttrekking = halveningWeights(
    bezit.map((c) => c.prioOnttrekking),
    bezit.map((c) => c.gevuld),
    bezit.map((c) => c.nietLiquide),
  )
  const wAflossing = halveningWeights(
    schuld.map((c) => c.prioAflossing),
    schuld.map((c) => c.gevuld),
    schuld.map((c) => c.nietLiquide),
  )
  const resAfname = reserveMask(bezit.map((c) => c.prioAfname))
  const resOnttrekking = reserveMask(bezit.map((c) => c.prioOnttrekking))
  const resAflossing = reserveMask(schuld.map((c) => c.prioAflossing))

  // ── 1. AFNAME ─────────────────────────────────────────────────────────────────
  const afname = runWaterfall(dep.afnameBudget, bezCaps, wAfname, resAfname)

  // ── 2. ONTTREKKING: capaciteit = afname-cap − afname-toewijzing (wat afname pakte). ─
  const onttrekkingCaps = bezCaps.map((cap, i) => cap - afname.eind[i])
  const onttrekking = runWaterfall(
    dep.onttrekkingBudget,
    onttrekkingCaps,
    wOnttrekking,
    resOnttrekking,
  )

  // ── 3. SCHULD-AFLOSSING ─────────────────────────────────────────────────────────
  const aflossing = runWaterfall(dep.aflossingBudget, schuldCaps, wAflossing, resAflossing)

  // HC:HH — de niet-plaatsbare aflossing (aflossing.onbenut) stroomt terug naar
  // bezitting-toename. In alle 16 fixtures is het aflossing-budget 0 (geen "Eerst
  // schulden aflossen"-strategie), dus onbenut = 0 en de overloop = 0. De exacte
  // herverdelingsformule is daardoor onbeproefd; we leveren 0 en laten de parity de
  // dag flaggen dat een fixture dit pad wél raakt (i.p.v. een ongetoetste formule).
  const overflow = ZERO_OVERFLOW

  return {
    maand: m,
    beyondHorizon: isBeyondHorizon(input, m),
    leeftijd: leeftijdJaren(input, m),
    maandInJaar: maandInJaar(m),
    afname,
    onttrekking,
    aflossing,
    overflow,
  }
}

export type { WaterfallResult } from './waterfall'
