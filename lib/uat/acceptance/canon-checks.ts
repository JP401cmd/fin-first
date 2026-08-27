/**
 * Gedeelde engine-checks voor de UAT-CANON-acceptatiecriteria (`canon.ts`).
 *
 * PURE module — geen vitest/DOM-afhankelijkheden — zodat dezelfde lijst checks
 * kan draaien onder:
 *   1. `canon.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *   2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-canon.ts`):
 *      `assertEqual(actual, expected, label)` per check.
 *
 * CANON toetst PER KERNGETAL dat er precies één canonieke bron is. Alleen de
 * PURE canonieke functies die per constructie één getal leveren zijn exact
 * toetsbaar en hebben hier een check. Ten opzichte van KRUIS breidt CANON de
 * dekking uit met twee getallen die KRUIS niet exact toetst:
 *   - WF-CANON-09 Box 3       → `calculateBox3` (in KRUIS 'consistency'; hier exact op een fixture)
 *   - WF-CANON-10 jaarruimte  → `jaarruimteBesparing` (niet in KRUIS)
 * De overige vijf (02/03/04/05/06) delen de canonieke functies met KRUIS.
 *
 * Elke `run()` roept UITSLUITEND de échte canonieke rekenfunctie(s) aan op vaste
 * fixture-getallen. Alle imports zijn client-veilig (geen `server-only` in hun
 * import-graaf): savings-source, core-metrics, housing-strategy, fire-params,
 * format, box3-data, jaarruimte en box1-tax zijn pure reken-/constanten-modules.
 */

import { savingsRateFromAggregates } from '@/lib/savings-source'
import { computeFreedomProgress } from '@/lib/core-metrics'
import { getFireEligibleNetWorth, type HousingContext } from '@/lib/housing-strategy'
import { computeEffectiveSwr } from '@/lib/fire-params'
import { dailyExpenseRate, calculateFreedomTime } from '@/lib/format'
import { calculateBox3 } from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import { jaarruimteBesparing } from '@/lib/jaarruimte'
import { computeBox1Tax } from '@/lib/box1-tax'
import { CANON_ACCEPTANCE } from './canon'
import type { AcceptanceCriterion } from './types'

export interface CanonEngineCheck {
  /** 'WF-CANON-02' */
  workflow: string
  /** 'UAT-CANON-02' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte canonieke rekenfunctie(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in canon.ts — gooit als canon.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = CANON_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — canon.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in canon.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function fx(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

/** Minimale, volledig getypeerde HousingContext — alleen de velden die
 *  `getFireEligibleNetWorth` leest wijken af. */
function makeHousingContext(eigenHuisValue: number, mortgageBalance: number): HousingContext {
  return {
    eigenHuisValue,
    wozValue: eigenHuisValue,
    mortgageBalance,
    mortgageMonthlyPayment: 0,
    hasEigenHuis: eigenHuisValue > 0,
    eigenHuisMortgages: [],
    eigenHuisAssets: [],
  }
}

/** Minimaal Box 3-asset-fixture: `calculateBox3` leest hier alleen
 *  id/is_active/asset_type/current_value. Sinds M23 leest `classifyAsset`
 *  daarnaast `subtype`, `tax_benefit` en de overschrijving `box3_vrijgesteld`;
 *  die ontbreken bewust in deze fixture (→ `undefined`), zodat de indeling
 *  puur op het assettype valt — precies wat deze canon-check bedoelt te meten.
 *  Cast is bewust (pure fixture). */
function makeBox3Asset(asset_type: Asset['asset_type'], current_value: number): Asset {
  return { id: `${asset_type}-${current_value}`, is_active: true, asset_type, current_value } as unknown as Asset
}

// ── Checks — één per 'exact'-workflow in CANON_ACCEPTANCE ───────────────────

export const CANON_ENGINE_CHECKS: CanonEngineCheck[] = [
  {
    workflow: 'WF-CANON-02',
    scenarioId: 'UAT-CANON-02',
    label: 'Spaarquote-kernformule (savingsRateFromAggregates): 30% + income>0-guard',
    run: () => {
      criterion('WF-CANON-02')
      const spaarquote = savingsRateFromAggregates(36000, 27000, 1800) // (10800/36000)*100 = 30
      const nulInkomen = savingsRateFromAggregates(0, 27000, 1800) // income<=0 → 0
      return {
        expected: 'spaarquote=30; nulInkomen=0',
        actual: `spaarquote=${fx(spaarquote, 0)}; nulInkomen=${nulInkomen}`,
      }
    },
  },
  {
    workflow: 'WF-CANON-03',
    scenarioId: 'UAT-CANON-03',
    label: 'Vrijheids-% (computeFreedomProgress): 60 + cap 100 + negatief 0 + geen doel 0',
    run: () => {
      criterion('WF-CANON-03')
      const pct60 = computeFreedomProgress({ fireEligibleNetWorth: 300000, requiredPortfolio: 500000 })
      const cap100 = computeFreedomProgress({ fireEligibleNetWorth: 600000, requiredPortfolio: 500000 })
      const negatief = computeFreedomProgress({ fireEligibleNetWorth: -5000, requiredPortfolio: 500000 })
      const geenDoel = computeFreedomProgress({ fireEligibleNetWorth: 300000, requiredPortfolio: null })
      return {
        expected: 'pct60=60; cap100=100; negatief=0; geenDoel=0',
        actual: `pct60=${pct60}; cap100=${cap100}; negatief=${negatief}; geenDoel=${geenDoel}`,
      }
    },
  },
  {
    workflow: 'WF-CANON-04',
    scenarioId: 'UAT-CANON-04',
    label: 'Grondslag-verschil (getFireEligibleNetWorth): Δ0 volledig vs. Δ=overwaarde uitsluiten',
    run: () => {
      criterion('WF-CANON-04')
      const nettoVermogen = 800000
      const ctx = makeHousingContext(650000, 400000) // overwaarde 250000
      const equity = 650000 - 400000
      const volledig = getFireEligibleNetWorth(nettoVermogen, ctx, { mode: 'include_full' })
      const uitsluiten = getFireEligibleNetWorth(nettoVermogen, ctx, { mode: 'exclude_from_fire' })
      const deltaVolledig = nettoVermogen - volledig
      const deltaUitsluiten = nettoVermogen - uitsluiten
      return {
        expected: 'nettoVermogen=800000; volledig=800000; deltaVolledig=0; uitsluiten=550000; deltaUitsluiten=250000; equity=250000',
        actual: `nettoVermogen=${nettoVermogen}; volledig=${volledig}; deltaVolledig=${deltaVolledig}; uitsluiten=${uitsluiten}; deltaUitsluiten=${deltaUitsluiten}; equity=${equity}`,
      }
    },
  },
  {
    workflow: 'WF-CANON-05',
    scenarioId: 'UAT-CANON-05',
    label: 'Effectieve SWR (computeEffectiveSwr): 2,840% default + vloer 0,100%',
    run: () => {
      criterion('WF-CANON-05')
      const swrDefault = computeEffectiveSwr(0.07, 0.02) // 0.07 − BOX3_DRAG(0.0216) − 0.02 = 0.0284
      const swrVloer = computeEffectiveSwr(0.01, 0.05) // max(0.001, negatief) = 0.001
      return {
        expected: 'swrDefault=0.02840; swrVloer=0.00100',
        actual: `swrDefault=${fx(swrDefault, 5)}; swrVloer=${fx(swrVloer, 5)}`,
      }
    },
  },
  {
    workflow: 'WF-CANON-06',
    scenarioId: 'UAT-CANON-06',
    label: 'Eén dagtarief (dailyExpenseRate + calculateFreedomTime): €98,6301/dag → 365 dagen bij €36.000',
    run: () => {
      criterion('WF-CANON-06')
      const dagtarief = dailyExpenseRate(3000) // 3000×12/365 = 98.6301369863
      const vrijheidsdagenBij36000 = calculateFreedomTime(36000, dagtarief).totalDays // 36000/(36000/365) = 365
      return {
        expected: 'dagtarief=98.6301; vrijheidsdagenBij36000=365',
        actual: `dagtarief=${fx(dagtarief, 4)}; vrijheidsdagenBij36000=${vrijheidsdagenBij36000}`,
      }
    },
  },
  {
    workflow: 'WF-CANON-09',
    scenarioId: 'UAT-CANON-09',
    label: 'Box 3-heffing (calculateBox3): spaargeld+beleggingen 200k single 2026 → grondslag 140643, heffing €1843',
    run: () => {
      criterion('WF-CANON-09')
      const result = calculateBox3({
        assets: [makeBox3Asset('savings', 100000), makeBox3Asset('investment', 100000)],
        debts: [],
        hasPartner: false,
        dailyExpenses: 100,
        year: 2026,
      })
      const heffing = Math.round(result.tax)
      return {
        expected: 'rendementsgrondslag=200000; grondslagSparen=140643; heffing=1843',
        actual: `rendementsgrondslag=${result.rendementsgrondslag}; grondslagSparen=${result.grondslagSparen}; heffing=${heffing}`,
      }
    },
  },
  {
    workflow: 'WF-CANON-10',
    scenarioId: 'UAT-CANON-10',
    label: 'Jaarruimte-besparing (jaarruimteBesparing): marginaal-identiek aan computeBox1Tax-delta + guards',
    run: () => {
      criterion('WF-CANON-10')
      const gross = 60000
      const inleg = 10000
      const year = 2026 as const
      const viaHelper = jaarruimteBesparing(gross, inleg, year)
      const viaEngine = Math.round(
        Math.max(
          0,
          computeBox1Tax({ grossYearlyIncome: gross, year, aow: false }).tax -
            computeBox1Tax({ grossYearlyIncome: gross - inleg, year, aow: false }).tax,
        ),
      )
      const nulInleg = jaarruimteBesparing(gross, 0, year)
      const nulInkomen = jaarruimteBesparing(0, inleg, year)
      return {
        expected: 'marginaalIdentiek=true; nulInleg=0; nulInkomen=0',
        actual: `marginaalIdentiek=${viaHelper === viaEngine}; nulInleg=${nulInleg}; nulInkomen=${nulInkomen}`,
      }
    },
  },
]
