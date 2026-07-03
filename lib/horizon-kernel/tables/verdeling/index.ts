/**
 * Horizon-kernel · tabel **Verdeling** (Excel-tab `Verdeling`, A1:HK1203, 219
 * kolommen) — de **capaciteit-waterval** en het hart van de toewijzingslogica.
 *
 * Per maand verdeelt de tabel drie budgetten over de vermogens-/schuldcategorieën:
 *   1. **AFNAME** (gebeurtenis-kosten, Af!D) over de 6 bezitting-categorieën;
 *   2. **ONTTREKKING** (pensioenuitgave, Ont!D) over dezelfde 6, met capaciteit =
 *      afname-cap − afname-toewijzing (wat afname al pakte kan onttrekking niet meer);
 *   3. **SCHULD-AFLOSSING** (aflos-deel van CF!I = ruwBudget) over de 5 schuld-
 *      categorieën — nadat de **tekort-lening** haar prio-1-aflossing (S!AC) heeft
 *      afgeroomd: `EQ = ruwBudget − tekortAflossing` (zie de compute-body).
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
import {
  aflossingWeightsCombined,
  halveningWeights,
  halveningWeightsZonderGevuld,
  reserveMask,
} from './weights'
import { runWaterfall, type WaterfallResult } from './waterfall'

/** Numerieke drempel (euro-schaal) voor de degenerate-fallback-detectie (vgl. `CAP_EPS`). */
const DEGEN_EPS = 1e-9

/**
 * Bezit-waterval (afname of onttrekking) met **degenerate-CAPACITEITS-fallback**
 * (kernel-extensie, buiten het Excel-oracle — spiegel van de toename-fallback
 * `toenameGewichten`, maar CAPACITEITS-gedreven i.p.v. gewicht-gedreven).
 *
 * ## Waarom capaciteits-gedreven (anders dan de toename-fallback)
 * De toename-degeneratie was een GEWICHT-degeneratie (`somToename===0`: géén categorie
 * gewogen). De uitstroom-degeneratie is een CAPACITEITS-degeneratie: de gewogen
 * categorie (bv. Spaargeld, prio 1, STATISCH gevuld) heeft weight > 0 maar is LEEG
 * (cap 0), terwijl de volgelopen categorie (bv. Beleggingen, prio 2, STATISCH ongevuld
 * — de surplus-doelpot die tijdens accumulatie vulde) cap > 0 heeft maar door de
 * statische gevuld-vlag weight 0 krijgt. Hier is `som > 0` (Spaargeld weegt mee), dus
 * een gewicht-fallback (`som===0`) zou NOOIT vuren. Het budget lekt daardoor elke maand
 * als `onbenut` naar de tekort-lening (S!AB, 5% rente) terwijl er liquide saldo
 * klaarstaat — de bewezen eigenaar-bug.
 *
 * ## Fallback (inert-by-construction)
 * Draai eerst de reguliere waterval (gevuld-eis intact = oracle-getrouw). Vuurt ALLÉÉN
 * als het budget LEKT (`onbenut > 0`) ÉN er een LIQUIDE prio-1..4-categorie is die
 * louter door de statische gevuld-vlag is uitgesloten (`w=0`, `gevuld=false`) maar nog
 * restcapaciteit (cap > 0, niet reeds vol via `initialCapped`) heeft. Dan wordt de
 * gevuld-eis losgelaten (`halveningWeightsZonderGevuld`) en de waterval één keer
 * opnieuw gedraaid; de cap begrenst alsnog per categorie, zodat de uitgesloten liquide
 * pot het restant absorbeert i.p.v. de tekort-lening.
 *
 * ## Waarom oracle-inert (parity byte-groen = scheidsrechter)
 * Bij ECHTE depletie (het oracle-scenario waar budget legitiem naar de tekort-lening
 * lekt) zijn ALLE liquide categorieën leeg → géén uitgesloten restcapaciteit → de
 * fallback vuurt NIET en de oracle-lek blijft exact staan. De poort onderscheidt precies
 * "leeg door échte depletie" (cap 0 overal → inert) van "uitgesloten door de statische
 * gevuld-artefact" (cap > 0 op een ongevulde pot → fixen). Op de 19 fixtures valt een lek
 * altijd samen met échte depletie; deze tak is er dus byte-inert (bewezen door de
 * integrale Verdeling-parity over 19×1200×218 cellen). Wanneer de fallback niet vuurt
 * wordt de reguliere `WaterfallResult` ONgewijzigd teruggegeven (byte-identiek).
 */
function runBezitWaterfallMetDegeneratie(
  budget: number,
  caps: readonly number[],
  prio: readonly (number | null)[],
  gevuld: readonly boolean[],
  nietLiquide: readonly boolean[],
  resMask: readonly boolean[],
  initialCapped?: readonly boolean[],
): WaterfallResult {
  const wRegulier = halveningWeights(prio, gevuld, nietLiquide)
  const reguliere = runWaterfall(budget, caps, wRegulier, resMask, initialCapped)
  if (budget <= DEGEN_EPS || reguliere.onbenut <= DEGEN_EPS) return reguliere
  // Uitgesloten liquide restcapaciteit: prio 1..4 + liquide + NIET regulier gewogen
  // (dus gevuld=false) + niet reeds vol (initialCapped) + cap > 0.
  let uitgeslotenCap = 0
  for (let c = 0; c < caps.length; c++) {
    const p = prio[c]
    const actiefPrio = typeof p === 'number' && p >= 1 && p <= 4
    if (
      wRegulier[c] === 0 &&
      !nietLiquide[c] &&
      actiefPrio &&
      !(initialCapped?.[c] ?? false) &&
      caps[c] > DEGEN_EPS
    ) {
      uitgeslotenCap += caps[c]
    }
  }
  if (uitgeslotenCap <= DEGEN_EPS) return reguliere // échte depletie → oracle-lek intact
  const wFallback = halveningWeightsZonderGevuld(prio, nietLiquide)
  return runWaterfall(budget, caps, wFallback, resMask, initialCapped)
}

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
  /**
   * S!AB(m−1) — tekort-lening-saldo van de vorige maand. Zit NIET in
   * `schuldSaldiPrev` (= S!AJ:AN, de vijf reguliere categorie-totalen zonder het
   * tekort-slot). Voedt de prio-1-aflossing van het tekort (S!AC); 0 als er geen
   * tekort-slot is (18 van de 19 fixtures).
   */
  readonly tekortSaldoPrev: number
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
  /**
   * S!AC — tekort-lening-aflossing (prio-1-toewijzing die het ruwe schuld-aflos-
   * budget absorbeert vóór de vijf categorieën; `EQ = ruwBudget − tekortAflossing`).
   * Wordt door S geconsumeerd (`SDep.tekortAflossing`); 0 zonder tekort.
   */
  readonly tekortAflossing: number
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
  // Afname/onttrekking draaien via `runBezitWaterfallMetDegeneratie` (die de reguliere
  // `halveningWeights` intern berekent + de degenerate-capaciteits-fallback bewaakt).
  // Toename-gewicht bezit (voor de HC:HH-overloop): bezit-toename over bezit-noemer.
  const wBezitToename = halveningWeights(
    bezit.map((c) => c.prioToename),
    bezit.map((c) => c.gevuld),
    bezit.map((c) => c.nietLiquide),
  )
  // Schuld-aflossing: genormaliseerd over de GECOMBINEERDE toename-noemer
  // (bezit-toename + schuld-aflossing), zodat Σw de aflos-fractie is (bv. 0,3),
  // conform Excel. Scale-invariant in de waterval → eind-toewijzing onveranderd.
  const wAflossing = aflossingWeightsCombined(
    bezit.map((c) => c.prioToename),
    bezit.map((c) => c.gevuld),
    bezit.map((c) => c.nietLiquide),
    schuld.map((c) => c.prioAflossing),
    schuld.map((c) => c.gevuld),
    schuld.map((c) => c.nietLiquide),
  )
  const resAfname = reserveMask(bezit.map((c) => c.prioAfname))
  const resOnttrekking = reserveMask(bezit.map((c) => c.prioOnttrekking))
  const resAflossing = reserveMask(schuld.map((c) => c.prioAflossing))

  // ── 1. AFNAME (met degenerate-capaciteits-fallback; zie de helper-doc) ──────────
  const afname = runBezitWaterfallMetDegeneratie(
    dep.afnameBudget,
    bezCaps,
    bezit.map((c) => c.prioAfname),
    bezit.map((c) => c.gevuld),
    bezit.map((c) => c.nietLiquide),
    resAfname,
  )

  // ── 2. ONTTREKKING: gaat verder waar afname stopte (één gedeelde bezit-pot). ─────
  // Capaciteit = afname-cap − afname-toewijzing; en de categorieën die afname vól
  // trok (`afname.capped`) erven die status, zodat een door afname geleegde
  // categorie uit de onttrekking-Σw valt (Excel: `gezin` maand 24), terwijl een
  // door afname onaangeraakte cap-0-categorie blijft meetellen (`partner-aan`).
  // Zelfde degenerate-capaciteits-fallback als afname (de eigenaar-bug zit hier).
  const onttrekkingCaps = bezCaps.map((cap, i) => cap - afname.eind[i])
  const onttrekking = runBezitWaterfallMetDegeneratie(
    dep.onttrekkingBudget,
    onttrekkingCaps,
    bezit.map((c) => c.prioOnttrekking),
    bezit.map((c) => c.gevuld),
    bezit.map((c) => c.nietLiquide),
    resOnttrekking,
    afname.capped,
  )

  // ── 3. SCHULD-AFLOSSING ─────────────────────────────────────────────────────────
  // De tekort-lening heeft **prio 1 bij aflossen**: ze absorbeert het ruwe schuld-
  // aflos-budget (`ruwBudget = Σ Toename-schuld-toename€`) VÓÓR de vijf categorieën.
  // De aflossing (S!AC) is gecapt op het **pre-existente** tekort — het saldo van m−1
  // plus de rente-bijschrijving van deze maand (`AE = saldo(m−1)·P!B25/12`). De
  // same-month voeding (BV+EO) telt hier NIET mee: je kunt alleen een schuld aflossen
  // die al bestond (één-maand-lag, precies zoals de overige waterval-caps = saldo m−1).
  // Empirisch (schuld-prio): AC=0 zolang saldo(m−1)=0 (m≤698), daarna MIN(ruwBudget, …)
  // (m≥699). Het restant `EQ = ruwBudget − AC` voedt de 5-categorie-waterval hieronder;
  // is EQ 0 dan is ook de overloop naar bezit 0.
  const tekortRente = (dep.tekortSaldoPrev * input.tekortLeningRente) / 12
  const tekortAflossing = Math.min(dep.aflossingBudget, dep.tekortSaldoPrev + tekortRente)
  const schuldAflossingBudget = dep.aflossingBudget - tekortAflossing
  const aflossing = runWaterfall(schuldAflossingBudget, schuldCaps, wAflossing, resAflossing)

  // HC:HH — de niet-plaatsbare aflossing (aflossing.onbenut) stroomt terug naar
  // bezitting-toename, verdeeld naar rato van de **bezit-toename-gewichten**
  // (genormaliseerd over de bezit-noemer, dus Σ = 1). Empirisch (schuld-prio):
  // waar de schuld-categorieën vol zitten (caps 0, alle debt afgelost) én er nog
  // aflos-budget over is (EQ > 0, geen tekort), herverdeelt dat zich als toename
  // over de bezittingen. Zodra het tekort het budget absorbeert (EQ 0, m≥699) is de
  // overloop weer 0. In de 18 fixtures zonder prio-aflossing is het budget 0 → 0.
  const overflow =
    aflossing.onbenut !== 0
      ? wBezitToename.map((w) => aflossing.onbenut * w)
      : ZERO_OVERFLOW

  return {
    maand: m,
    beyondHorizon: isBeyondHorizon(input, m),
    leeftijd: leeftijdJaren(input, m),
    maandInJaar: maandInJaar(m),
    afname,
    onttrekking,
    aflossing,
    tekortAflossing,
    overflow,
  }
}

export type { WaterfallResult } from './waterfall'
