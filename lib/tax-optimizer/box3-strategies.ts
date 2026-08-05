// lib/tax-optimizer/box3-strategies.ts
//
// Genereert de Box 3-scenario's ("strategieën") voor de optimizer. Puur en
// deterministisch. CONSUME, DON'T RECOMPUTE: elke heffing komt uit de canonieke
// engine `calculateBox3` (lib/box3-data.ts) — we forken GEEN tax-logica en
// definiëren GEEN eigen forfait/tarief-constanten.
//
// Twee Box 3-hefbomen (analyse roadmap J, MVP):
//   1. Samenstelling-shift — beleggingen → spaargeld (lager forfait). Verlaagt
//      de heffing, maar kost doorgaans verwacht rendement (hasReturnCost).
//   2. Fiscale partnerverdeling — zelfde vermogen, fiscaal anders verdeeld;
//      geen rendementsverlies. Bron = optimizePartnerAllocation (via
//      loadPerspectiveBox3), we consumeren alleen de scalaire uitkomst.
//
// NETTO EFFECT (2026-08): elk scenario draagt naast de bruto belastingbesparing
// óók het verwachte misgelopen rendement (`returnCostEur`) en het saldo daarvan
// (`netEffect` / `netFreedomDays`).
//
// DE TWEE RENDEMENTSAANNAMES — hier staat geen eigen percentage:
//   · beleggen → PER GEBRUIKER via `input.expectedReturn` (canoniek
//     `resolveFireParams(...).grossReturn`, lib/fire-params.ts → profiel-
//     instelling `profiles.expected_return`), met DEFAULT_RETURN als terugval.
//     Weglaten reproduceert exact het gedrag van vóór die parameter.
//   · sparen  → de CONSTANTE EXPECTED_SAVINGS_RETURN (lib/constants.ts). Voor
//     de spaarrente bestaat geen gebruikersinstelling, dus daar is een constante
//     de juiste plek; zodra die er wél komt, verhuist ook die naar de invoer.

import {
  BOX3_PARAMS,
  calculateBox3,
  estimateBox3TaxDrag,
  type Box3Input,
  type Box3Params,
  type Box3Result,
  type TaxYear,
} from '@/lib/box3-data'
import { compareForfaitairVsWerkelijk } from '@/lib/box3-tegenbewijs'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { formatCurrency } from '@/lib/format'
import { DEFAULT_RETURN, EXPECTED_SAVINGS_RETURN } from '@/lib/constants'
import type {
  Box3OptimizerInput,
  OptimizerCurrentStanding,
  OptimizerStrategy,
  ShiftCurvePoint,
  TaxTrajectory,
} from './types'

/** Stapgrootte voor de marginale "per €X verschoven"-uitleg. */
const MARGINAL_SHIFT_STEP = 10_000

/** Minimale beleggingen (€) voordat een shift-scenario zinvol is. */
const MIN_BELEGGINGEN_FOR_SHIFT = 1_000

/**
 * Resolutie van de shift-curve: 20 stappen → 21 punten van 0% t/m 100% van de
 * beleggingen, in stappen van 5%.
 *
 * Bewust RELATIEF (percentage van de eigen beleggingen) en niet in vaste
 * euro-stappen: zo spant de curve altijd exact het bereik van deze gebruiker, is
 * het puntenaantal onafhankelijk van de vermogensomvang (deterministisch,
 * voorspelbare kosten: 21 engine-aanroepen) en valt de factor bij de laatste
 * stap exact op 1 — waardoor het eindpunt byte-identiek samenvalt met het
 * samenstelling-shift-scenario in `strategies`. Een vaste €-stap zou bij kleine
 * portefeuilles 1 punt en bij grote portefeuilles honderden punten geven, en het
 * eindpunt alleen bij toeval raken.
 */
export const SHIFT_CURVE_STEPS = 20

/**
 * De twee belastingjaren die het verloop naast elkaar zet. Beide staan in de
 * jaartabel BOX3_PARAMS (lib/box3-data.ts) — hier staat geen enkel eigen
 * forfait of tarief.
 *
 * Bewust LITERALS en niet CURRENT_TAX_YEAR: de veldnamen op `TaxTrajectory`
 * dragen het jaar (`tax2025`/`tax2026`). Zou het actieve jaar hier stil
 * doorschuiven, dan ging `tax2026` een ander jaar betekenen dan zijn naam belooft
 * (grondslag in de naam, ADR 0073). Komt er een belastingjaar bij, dan verhuizen
 * deze twee constanten én de veldnamen in hetzelfde change mee.
 */
const TRAJECTORY_YEAR_PRIOR: TaxYear = 2025
const TRAJECTORY_YEAR_ACTIVE: TaxYear = 2026

/**
 * Verwacht rendementsverschil per jaar tussen beleggen en sparen, PER RUN
 * afgeleid: het verwachte beleggingsrendement van deze gebruiker minus de
 * spaarrente-aanname. Géén module-constante meer — dat was precies de plek waar
 * de hardcoded 7% de profiel-instelling overschreef.
 *
 * GEKLEMD OP 0. Zet een gebruiker zijn verwachte rendement op of onder de
 * spaarrente-aanname (bv. 1,0% terwijl sparen op 1,3% staat), dan is er geen
 * misgelopen rendement bij verschuiven — géén negatieve "winst" die de
 * belastingbesparing kunstmatig zou opblazen en het scenario onterecht
 * bovenaan de netto-ranking zou zetten.
 */
function returnGapFor(expectedReturn: number): number {
  return Math.max(0, expectedReturn - EXPECTED_SAVINGS_RETURN)
}

function freedomDays(savings: number, dailyExpenses: number): number {
  if (dailyExpenses <= 0 || savings <= 0) return 0
  return Math.round(savings / dailyExpenses)
}

/**
 * Verwacht misgelopen rendement (€/jaar, hele euro's) wanneer `amount` van
 * beleggen naar sparen verschuift. Nooit negatief — het gat is al geklemd.
 */
function returnCostForShift(amount: number, returnGap: number): number {
  if (amount <= 0) return 0
  return Math.max(0, Math.round(amount * returnGap))
}

function pct(value: number): string {
  return (value * 100).toFixed(2).replace('.', ',') + '%'
}

/** Eén decimaal — voor de rendementsAANNAMES (7,0% / 1,3%), niet voor forfaits. */
function pct1(value: number): string {
  return (value * 100).toFixed(1).replace('.', ',') + '%'
}

/**
 * Bouw een compositie-equivalente Box3Input uit categorie-totalen.
 *
 * `calculateBox3` rekent uitsluitend op de categorie-SOMMEN (spaargeld,
 * beleggingen, Box 3-schulden) + hasPartner + jaar. Door twee synthetische
 * assets (spaargeld/beleggingen) en één synthetische niet-hypotheek-schuld te
 * voeden reproduceren we EXACT de heffing van een gegeven samenstelling —
 * robuust over willekeurig veel echte assets, zónder de forfait-math te
 * herimplementeren. De uitgesloten posten (eigen woning, pensioen, Box 2) én de
 * eigenwoning-hypotheek zitten al niet in deze totalen, dus de synthetische
 * niet-hypotheek-schuld reproduceert dezelfde aftrekbare-schulden-stap.
 *
 * Guard: `synthBox3Input` met de baseline-totalen moet byte-identiek dezelfde
 * heffing geven als het echte resultaat — vergrendeld in de unit-test.
 */
export function synthBox3Input(
  spaargeld: number,
  beleggingen: number,
  box3Schulden: number,
  hasPartner: boolean,
  dailyExpenses: number,
  year: TaxYear,
): Box3Input {
  const assets: Asset[] = [
    {
      id: 'synth-spaargeld',
      asset_type: 'savings',
      current_value: Math.max(0, spaargeld),
      is_active: true,
    } as unknown as Asset,
    {
      id: 'synth-beleggingen',
      asset_type: 'investment',
      current_value: Math.max(0, beleggingen),
      is_active: true,
    } as unknown as Asset,
  ]
  const debts: Debt[] =
    box3Schulden > 0
      ? [
          {
            id: 'synth-schuld',
            debt_type: 'personal_loan',
            current_balance: box3Schulden,
            is_active: true,
            linked_asset_id: null,
            is_tax_deductible: false,
          } as unknown as Debt,
        ]
      : []
  return { assets, debts, hasPartner, dailyExpenses, year }
}

/** Heffing voor een gegeven samenstelling, via de canonieke engine. */
function taxForComposition(
  spaargeld: number,
  beleggingen: number,
  box3Schulden: number,
  hasPartner: boolean,
  dailyExpenses: number,
  year: TaxYear,
): Box3Result {
  return calculateBox3(
    synthBox3Input(spaargeld, beleggingen, box3Schulden, hasPartner, dailyExpenses, year),
  )
}

// ── Verloop over de belastingjaren (2025 · 2026 · indicatie 2028) ─

/** Categorie-totalen van één samenstelling — de invoer van elke verloop-som. */
interface Composition {
  spaargeld: number
  beleggingen: number
  box3Schulden: number
  hasPartner: boolean
}

/**
 * Heffingsresultaat van een samenstelling in een specifiek belastingjaar.
 *
 * `dailyExpenses` staat hier op 0: die parameter raakt uitsluitend
 * `Box3Result.freedomDays`, dat het verloop niet consumeert. De €→vrijheidstijd-
 * vertaling van de optimizer loopt via het canonieke dagtarief uit de invoer.
 */
function taxResultForYear(comp: Composition, year: TaxYear): Box3Result {
  return taxForComposition(
    comp.spaargeld,
    comp.beleggingen,
    comp.box3Schulden,
    comp.hasPartner,
    0,
    year,
  )
}

/**
 * Gewogen verwacht rendement van een samenstelling: het naar rato gewogen
 * gemiddelde van de twee aannames —
 * (spaargeld × EXPECTED_SAVINGS_RETURN + beleggingen × expectedReturn) /
 * bezittingen. Géén eigen percentage, en géén fiscaal forfait: dit is een
 * ECONOMISCHE verwachting. null bij lege bezittingen (geen deling door nul).
 *
 * Bewust het ONGEKLEMDE `expectedReturn` (niet het gat): een gebruiker die 1,0%
 * verwacht, verwacht die 1,0% ook echt op zijn beleggingen — de 2028-indicatie
 * moet dat lagere werkelijke rendement tonen. Klemmen hoort alleen bij het
 * VERSCHIL dat een shift kost.
 */
function weightedReturnAssumption(
  spaargeld: number,
  beleggingen: number,
  expectedReturn: number,
): number | null {
  const bezittingen = spaargeld + beleggingen
  if (bezittingen <= 0) return null
  return (spaargeld * EXPECTED_SAVINGS_RETURN + beleggingen * expectedReturn) / bezittingen
}

/**
 * Indicatieve heffing onder het beoogde stelsel-2028 (heffing over WERKELIJK
 * rendement) voor een al-doorgerekende samenstelling.
 *
 * Consume, don't recompute: dit gaat door de bestaande tegenbewijs-tak
 * (`compareForfaitairVsWerkelijk`, lib/box3-tegenbewijs.ts), die de grondslag
 * (bezittingen, géén heffingsvrij vermogen) en het tarief uit
 * `box3Result.params` haalt. De optimizer voegt alleen de rendementsAANNAME toe.
 *
 * Twee expliciete aannames, beide in de detail-bullets en in de catalogus:
 *   1. rendement = het gewogen gemiddelde van de spaar- en beleggingsaanname;
 *   2. werkelijke schuldrente = 0 (we kennen die rente niet en verzinnen er geen
 *      aanname bij), waardoor de indicatie eerder te hoog dan te laag uitvalt.
 */
function tax2028Indicatie(result: Box3Result, expectedReturn: number): number | null {
  const weighted = weightedReturnAssumption(
    result.totaalSpaargeld,
    result.totaalBeleggingen,
    expectedReturn,
  )
  if (weighted === null) return null
  return compareForfaitairVsWerkelijk({
    box3Result: result,
    werkelijkRendementPct: weighted * 100,
  }).werkelijkeHeffing
}

/**
 * Het verloop van dezelfde samenstelling over de jaren. 2025/2026 via de engine
 * per jaar (BOX3_PARAMS kent beide jaartabellen), 2028 als indicatie via de
 * tegenbewijs-tak.
 */
function buildTrajectory(comp: Composition, expectedReturn: number): TaxTrajectory {
  // Bewust via een Partial-view op de jaartabel: valt een jaar ooit uit
  // BOX3_PARAMS, dan wordt `tax2025` null i.p.v. NaN.
  const knownYears: Partial<Record<TaxYear, Box3Params>> = BOX3_PARAMS
  const active = taxResultForYear(comp, TRAJECTORY_YEAR_ACTIVE)
  const prior = knownYears[TRAJECTORY_YEAR_PRIOR]
    ? taxResultForYear(comp, TRAJECTORY_YEAR_PRIOR).tax
    : null

  return {
    tax2025: prior,
    tax2026: active.tax,
    tax2028Indicatie: tax2028Indicatie(active, expectedReturn),
  }
}

/**
 * De uitleg-regels bij een verloop: één regel voor de jaarvergelijking en twee
 * voor de 2028-indicatie (uitkomst + aanname). Wft: indicatie, geen advies.
 */
function trajectoryDetail(
  trajectory: TaxTrajectory,
  comp: Composition,
  expectedReturn: number,
): string[] {
  const lines: string[] = []
  if (trajectory.tax2025 !== null) {
    lines.push(
      `Zelfde samenstelling: ${formatCurrency(trajectory.tax2025)} in ${TRAJECTORY_YEAR_PRIOR} → ` +
        `${formatCurrency(trajectory.tax2026)} in ${TRAJECTORY_YEAR_ACTIVE}`,
    )
  }
  const weighted = weightedReturnAssumption(comp.spaargeld, comp.beleggingen, expectedReturn)
  if (trajectory.tax2028Indicatie !== null && weighted !== null) {
    lines.push(
      `Indicatie 2028 (wetsvoorstel: heffing over werkelijk rendement): ` +
        `${formatCurrency(trajectory.tax2028Indicatie)} per jaar`,
    )
    // Het GETOONDE percentage is het GEBRUIKTE percentage: `expectedReturn` is
    // de profiel-instelling waarmee deze regel ook werkelijk is doorgerekend.
    lines.push(
      `Aanname 2028: gewogen rendement ${pct1(weighted)} (spaargeld ${pct1(EXPECTED_SAVINGS_RETURN)}, ` +
        `beleggingen ${pct1(expectedReturn)}), zonder aftrek van werkelijke schuldrente en zonder ` +
        `heffingsvrij vermogen — de indicatie valt daardoor eerder te hoog dan te laag uit`,
    )
  }
  return lines
}

// ── Shift-curve ──────────────────────────────────────────────────

/**
 * De doorgerekende reeks "0 t/m alle beleggingen verschoven naar spaargeld",
 * in `SHIFT_CURVE_STEPS` gelijke stappen (5%) via dezelfde engine als het
 * shift-scenario.
 *
 * Het eindpunt is rekenkundig IDENTIEK aan dat scenario: bij de laatste stap is
 * de factor exact 1, dus krijgt `taxForComposition` letterlijk dezelfde
 * argumenten (spaargeld + beleggingen, 0 beleggingen) en `returnCostForShift`
 * letterlijk hetzelfde bedrag. Vergrendeld in de unit-test.
 */
function buildShiftCurve(current: Box3Result, returnGap: number): ShiftCurvePoint[] {
  const beleggingen = current.totaalBeleggingen
  const points: ShiftCurvePoint[] = []

  for (let i = 0; i <= SHIFT_CURVE_STEPS; i++) {
    const shifted = beleggingen * (i / SHIFT_CURVE_STEPS)
    const tax = taxForComposition(
      current.totaalSpaargeld + shifted,
      beleggingen - shifted,
      current.totaalBox3Schulden,
      current.hasPartner,
      0,
      current.year,
    ).tax
    const savings = current.tax - tax
    const returnCostEur = returnCostForShift(shifted, returnGap)
    points.push({ shifted, tax, savings, returnCostEur, netEffect: savings - returnCostEur })
  }

  return points
}

/**
 * De huidige situatie als referentie-strategie. Vertegenwoordigt de heffing
 * zoals die nu berekend wordt (savings = 0).
 *
 * `expectedReturn` raakt hier alleen de 2028-indicatie in het verloop (de
 * gewogen rendementsaanname); de heffing 2025/2026 is puur fiscaal en staat er
 * volledig los van. Weglaten → DEFAULT_RETURN (regressie-terugval).
 */
export function baselineStrategy(
  current: Box3Result,
  expectedReturn: number = DEFAULT_RETURN,
): OptimizerStrategy {
  const comp: Composition = {
    spaargeld: current.totaalSpaargeld,
    beleggingen: current.totaalBeleggingen,
    box3Schulden: current.totaalBox3Schulden,
    hasPartner: current.hasPartner,
  }
  const trajectory = buildTrajectory(comp, expectedReturn)

  return {
    id: 'baseline',
    kind: 'baseline',
    title: 'Huidige situatie',
    description: 'Je Box 3-heffing zoals die nu voor je berekend wordt.',
    currentTax: current.tax,
    currentLabel: 'Nu',
    optimizedTax: current.tax,
    optimizedLabel: 'Nu',
    savings: 0,
    freedomDays: 0,
    isBaseline: true,
    hasReturnCost: false,
    // De huidige situatie verschuift niets, dus er gaat ook geen verwacht
    // rendement verloren: netto effect is per definitie 0.
    returnCostEur: 0,
    netEffect: 0,
    netFreedomDays: 0,
    trajectory,
    detail: [
      `Belastingjaar ${current.year}`,
      `Forfaitair rendement, tarief ${(current.params.tarief * 100).toFixed(0)}%`,
      ...trajectoryDetail(trajectory, comp, expectedReturn),
    ],
    caveat: null,
  }
}

/**
 * Genereer alle niet-baseline Box 3-scenario's + de baseline.
 * Deterministisch: gelijke invoer → gelijke uitvoer en volgorde.
 */
export function generateBox3Strategies(input: Box3OptimizerInput): {
  baseline: OptimizerStrategy
  strategies: OptimizerStrategy[]
  shiftCurve: ShiftCurvePoint[] | null
} {
  const { current, dailyExpenses, optimalAllocation } = input
  // Eén afleiding per run, hier bovenaan: het verwachte beleggingsrendement van
  // deze gebruiker (profiel-instelling via resolveFireParams) met de constante
  // als terugval, en het daaruit volgende — op 0 geklemde — rendementsgat.
  const expectedReturn = input.expectedReturn ?? DEFAULT_RETURN
  const returnGap = returnGapFor(expectedReturn)
  const baseline = baselineStrategy(current, expectedReturn)
  const strategies: OptimizerStrategy[] = []
  // Alleen gevuld wanneer het shift-scenario zelf bestaat — de curve is de
  // uitvergroting van dát scenario, geen losstaande grafiek.
  let shiftCurve: ShiftCurvePoint[] | null = null

  // ── 1. Samenstelling-shift: beleggingen → spaargeld ──────────────
  const beleggingen = current.totaalBeleggingen
  if (beleggingen >= MIN_BELEGGINGEN_FOR_SHIFT && current.tax > 0) {
    const shifted = taxForComposition(
      current.totaalSpaargeld + beleggingen,
      0,
      current.totaalBox3Schulden,
      current.hasPartner,
      dailyExpenses,
      current.year,
    )
    const savings = current.tax - shifted.tax
    if (savings > 0) {
      // Marginale besparing per stap (voor uitlegbaar schalen naar een
      // realistischer bedrag dan "alles").
      const step = Math.min(MARGINAL_SHIFT_STEP, beleggingen)
      const stepResult = taxForComposition(
        current.totaalSpaargeld + step,
        beleggingen - step,
        current.totaalBox3Schulden,
        current.hasPartner,
        dailyExpenses,
        current.year,
      )
      const marginalSaving = Math.max(0, current.tax - stepResult.tax)

      // Verwacht misgelopen rendement over het VERSCHOVEN bedrag (= de huidige
      // beleggingen, want dit scenario schuift alles naar spaargeld).
      const returnCostEur = returnCostForShift(beleggingen, returnGap)
      const netEffect = savings - returnCostEur

      // De volledige reeks achter dit scenario (0 … alles verschoven). Het
      // eindpunt is per constructie dit scenario zelf.
      shiftCurve = buildShiftCurve(current, returnGap)

      // Verloop van de UITKOMST-samenstelling: alles op spaargeld.
      const shiftedComp: Composition = {
        spaargeld: current.totaalSpaargeld + beleggingen,
        beleggingen: 0,
        box3Schulden: current.totaalBox3Schulden,
        hasPartner: current.hasPartner,
      }
      const shiftTrajectory = buildTrajectory(shiftedComp, expectedReturn)

      strategies.push({
        id: 'samenstelling-shift',
        kind: 'samenstelling-shift',
        title: 'Meer sparen, minder beleggen (fiscaal)',
        description:
          `Spaargeld heeft een lager forfaitair rendement (${pct(current.params.forfaitSpaargeld)}) ` +
          `dan beleggingen (${pct(current.params.forfaitBeleggingen)}). Als je je beleggingen ` +
          `(${formatCurrency(beleggingen)}) naar spaargeld zou verschuiven, daalt de forfaitaire grondslag.`,
        currentTax: current.tax,
        currentLabel: 'Nu',
        optimizedTax: shifted.tax,
        optimizedLabel: 'Alles op spaargeld',
        savings,
        freedomDays: freedomDays(savings, dailyExpenses),
        isBaseline: false,
        // AFGELEID, niet hardgecodeerd: de kwalitatieve vlag blijft het
        // ja/nee-spiegelbeeld van het bedrag. Zet een gebruiker zijn verwachte
        // rendement op of onder de spaarrente-aanname, dan kost verschuiven hem
        // in verwachting niets — en is deze shift dus terecht ook voor het doel
        // "geen rendementsverlies" een kosteloze hefboom.
        hasReturnCost: returnCostEur > 0,
        returnCostEur,
        netEffect,
        netFreedomDays: freedomDays(netEffect, dailyExpenses),
        trajectory: shiftTrajectory,
        detail: [
          `Forfait sparen ${pct(current.params.forfaitSpaargeld)} vs. beleggen ${pct(current.params.forfaitBeleggingen)}`,
          `≈ ${formatCurrency(marginalSaving)} minder heffing per ${formatCurrency(step)} verschoven`,
          `Verwacht rendement ${pct1(expectedReturn)} vs. spaarrente-aanname ${pct1(EXPECTED_SAVINGS_RETURN)}`,
          `≈ ${formatCurrency(returnCostEur)} minder verwacht rendement per jaar over ${formatCurrency(beleggingen)}`,
          `Netto effect ≈ ${formatCurrency(netEffect)} per jaar (besparing − misgelopen rendement)`,
          `Belastingjaar ${current.year}`,
          ...trajectoryDetail(shiftTrajectory, shiftedComp, expectedReturn),
        ],
        caveat:
          `Spaargeld levert doorgaans minder rendement dan beleggingen. Doorgerekend met een verwacht ` +
          `beleggingsrendement van ${pct1(expectedReturn)} en een spaarrente-aanname van ${pct1(EXPECTED_SAVINGS_RETURN)}: ` +
          `tegenover ${formatCurrency(savings)} minder heffing staat ongeveer ${formatCurrency(returnCostEur)} minder ` +
          `verwacht rendement per jaar — netto ${formatCurrency(netEffect)} per jaar.`,
      })
    }
  }

  // ── 2. Fiscale partnerverdeling ──────────────────────────────────
  if (optimalAllocation && optimalAllocation.savingsVsEqual > 0) {
    const equalTax = optimalAllocation.totalTax + optimalAllocation.savingsVsEqual
    strategies.push({
      id: 'partnerverdeling',
      kind: 'partnerverdeling',
      title: 'Slim verdelen met je fiscaal partner',
      description:
        'Als fiscaal partners mag je het Box 3-vermogen onderling verdelen. Door beide heffingsvrije vermogens optimaal te benutten valt de gezamenlijke heffing lager uit — hetzelfde vermogen, alleen fiscaal anders verdeeld.',
      currentTax: equalTax,
      currentLabel: 'Ieder apart',
      optimizedTax: optimalAllocation.totalTax,
      optimizedLabel: 'Optimaal verdeeld',
      savings: optimalAllocation.savingsVsEqual,
      freedomDays: freedomDays(optimalAllocation.savingsVsEqual, dailyExpenses),
      isBaseline: false,
      hasReturnCost: false,
      // Hetzelfde vermogen blijft in dezelfde beleggingen zitten — alleen de
      // fiscale toerekening verschuift. Dus geen rendementsimpact: het netto
      // effect is gelijk aan de bruto besparing.
      returnCostEur: 0,
      netEffect: optimalAllocation.savingsVsEqual,
      netFreedomDays: freedomDays(optimalAllocation.savingsVsEqual, dailyExpenses),
      // BEWUST null. De optimale verdeling komt uit optimizePartnerAllocation en
      // is uitsluitend voor het ACTIEVE belastingjaar doorgerekend (één
      // jaartabel, één zoekruimte). Een verloop tonen zou suggereren dat
      // dezelfde verdeling ook voor 2025 en onder het 2028-stelsel is
      // doorgerekend — dat is niet zo. De UI toont hier een cel-notitie in
      // plaats van bedragen.
      trajectory: null,
      detail: [
        'Zelfde vermogen, alleen fiscaal anders verdeeld',
        'Benut beide heffingsvrije vermogens',
        'Geen rendementsverlies: je vermogen blijft belegd zoals het nu staat',
        `Belastingjaar ${current.year}`,
        `Doorgerekend voor ${current.year}; het verloop over andere jaren is voor deze verdeling niet bepaald`,
      ],
      caveat: null,
    })
  }

  return { baseline, strategies, shiftCurve }
}

/**
 * De huidige stand als referentiepaneel voor de vergelijking.
 *
 * PUUR AFGELEID uit het al-berekende `Box3Result` — consume, don't recompute:
 * geen forfait-/tariefmath hier, en de effectieve druk komt uit de canonieke
 * helper `estimateBox3TaxDrag` (lib/box3-data.ts), niet uit een eigen ratio.
 *
 * `dailyExpenses` komt apart mee (canoniek dagtarief van de optimizer-invoer)
 * zodat de €→vrijheidstijd-vertaling op exact dezelfde grondslag staat als de
 * scenario's — `Box3Result.freedomDays` draagt het dagtarief dat toevallig aan
 * `calculateBox3` gevoed werd en is dus geen betrouwbaar anker hier.
 *
 * ADR 0036: uitsluitend geaggregeerde/combined cijfers, nooit per-partner.
 */
export function buildCurrentStanding(
  current: Box3Result,
  dailyExpenses: number,
): OptimizerCurrentStanding {
  const heffingsvrij = current.heffingsvrijVermogen
  // Benutting = welk deel van de vrijstelling daadwerkelijk tegen de
  // rendementsgrondslag wegvalt. Boven de vrijstelling is dat per definitie
  // 100%; een lege of negatieve grondslag benut niets.
  const vrijstellingBenutPct =
    heffingsvrij > 0
      ? Math.min(100, Math.max(0, (current.rendementsgrondslag / heffingsvrij) * 100))
      : 0

  return {
    tax: current.tax,
    taxFreedomDays: freedomDays(current.tax, dailyExpenses),
    totaalSpaargeld: current.totaalSpaargeld,
    totaalBeleggingen: current.totaalBeleggingen,
    totaalBox3Schulden: current.totaalBox3Schulden,
    heffingsvrijVermogen: heffingsvrij,
    vrijstellingBenutPct,
    effectieveDrukPct: estimateBox3TaxDrag(current) * 100,
    hasPartner: current.hasPartner,
  }
}
