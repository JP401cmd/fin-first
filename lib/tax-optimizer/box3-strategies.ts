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
// (`netEffect` / `netFreedomDays`). De rendementsaannames komen UITSLUITEND uit
// lib/constants.ts (DEFAULT_RETURN / EXPECTED_SAVINGS_RETURN) — hier staat geen
// eigen percentage.

import {
  calculateBox3,
  estimateBox3TaxDrag,
  type Box3Input,
  type Box3Result,
  type TaxYear,
} from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { formatCurrency } from '@/lib/format'
import { DEFAULT_RETURN, EXPECTED_SAVINGS_RETURN } from '@/lib/constants'
import type {
  Box3OptimizerInput,
  OptimizerCurrentStanding,
  OptimizerStrategy,
} from './types'

/** Stapgrootte voor de marginale "per €X verschoven"-uitleg. */
const MARGINAL_SHIFT_STEP = 10_000

/** Minimale beleggingen (€) voordat een shift-scenario zinvol is. */
const MIN_BELEGGINGEN_FOR_SHIFT = 1_000

/**
 * Verwacht rendementsverschil per jaar tussen beleggen en sparen — puur
 * afgeleid uit de twee canonieke aannames in lib/constants.ts (2026 ≈ 5,7
 * procentpunt). Géén eigen constante.
 */
const RETURN_GAP = DEFAULT_RETURN - EXPECTED_SAVINGS_RETURN

function freedomDays(savings: number, dailyExpenses: number): number {
  if (dailyExpenses <= 0 || savings <= 0) return 0
  return Math.round(savings / dailyExpenses)
}

/**
 * Verwacht misgelopen rendement (€/jaar, hele euro's) wanneer `amount` van
 * beleggen naar sparen verschuift. Nooit negatief.
 */
function returnCostForShift(amount: number): number {
  if (amount <= 0) return 0
  return Math.max(0, Math.round(amount * RETURN_GAP))
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

/**
 * De huidige situatie als referentie-strategie. Vertegenwoordigt de heffing
 * zoals die nu berekend wordt (savings = 0).
 */
export function baselineStrategy(current: Box3Result): OptimizerStrategy {
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
    detail: [
      `Belastingjaar ${current.year}`,
      `Forfaitair rendement, tarief ${(current.params.tarief * 100).toFixed(0)}%`,
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
} {
  const { current, dailyExpenses, optimalAllocation } = input
  const baseline = baselineStrategy(current)
  const strategies: OptimizerStrategy[] = []

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
      const returnCostEur = returnCostForShift(beleggingen)
      const netEffect = savings - returnCostEur

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
        hasReturnCost: true,
        returnCostEur,
        netEffect,
        netFreedomDays: freedomDays(netEffect, dailyExpenses),
        detail: [
          `Forfait sparen ${pct(current.params.forfaitSpaargeld)} vs. beleggen ${pct(current.params.forfaitBeleggingen)}`,
          `≈ ${formatCurrency(marginalSaving)} minder heffing per ${formatCurrency(step)} verschoven`,
          `Verwacht rendement ${pct1(DEFAULT_RETURN)} vs. spaarrente-aanname ${pct1(EXPECTED_SAVINGS_RETURN)}`,
          `≈ ${formatCurrency(returnCostEur)} minder verwacht rendement per jaar over ${formatCurrency(beleggingen)}`,
          `Netto effect ≈ ${formatCurrency(netEffect)} per jaar (besparing − misgelopen rendement)`,
          `Belastingjaar ${current.year}`,
        ],
        caveat:
          `Spaargeld levert doorgaans minder rendement dan beleggingen. Doorgerekend met een verwacht ` +
          `beleggingsrendement van ${pct1(DEFAULT_RETURN)} en een spaarrente-aanname van ${pct1(EXPECTED_SAVINGS_RETURN)}: ` +
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
      detail: [
        'Zelfde vermogen, alleen fiscaal anders verdeeld',
        'Benut beide heffingsvrije vermogens',
        'Geen rendementsverlies: je vermogen blijft belegd zoals het nu staat',
        `Belastingjaar ${current.year}`,
      ],
      caveat: null,
    })
  }

  return { baseline, strategies }
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
