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

import {
  calculateBox3,
  type Box3Input,
  type Box3Result,
  type TaxYear,
} from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { formatCurrency } from '@/lib/format'
import type { Box3OptimizerInput, OptimizerStrategy } from './types'

/** Stapgrootte voor de marginale "per €X verschoven"-uitleg. */
const MARGINAL_SHIFT_STEP = 10_000

/** Minimale beleggingen (€) voordat een shift-scenario zinvol is. */
const MIN_BELEGGINGEN_FOR_SHIFT = 1_000

function freedomDays(savings: number, dailyExpenses: number): number {
  if (dailyExpenses <= 0 || savings <= 0) return 0
  return Math.round(savings / dailyExpenses)
}

function pct(value: number): string {
  return (value * 100).toFixed(2).replace('.', ',') + '%'
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
        detail: [
          `Forfait sparen ${pct(current.params.forfaitSpaargeld)} vs. beleggen ${pct(current.params.forfaitBeleggingen)}`,
          `≈ ${formatCurrency(marginalSaving)} minder heffing per ${formatCurrency(step)} verschoven`,
          `Belastingjaar ${current.year}`,
        ],
        caveat:
          'Spaargeld levert doorgaans minder rendement dan beleggingen. Weeg het fiscale voordeel af tegen het rendement dat je mogelijk misloopt.',
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
      detail: [
        'Zelfde vermogen, alleen fiscaal anders verdeeld',
        'Benut beide heffingsvrije vermogens',
        `Belastingjaar ${current.year}`,
      ],
      caveat: null,
    })
  }

  return { baseline, strategies }
}
