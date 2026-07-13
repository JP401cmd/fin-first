/**
 * Gedeelde engine-checks voor de UAT-Rapp-acceptatiecriteria (`rapp.ts`).
 *
 * PURE module — geen vitest/DOM-afhankelijkheden — zodat dezelfde lijst checks
 * kan draaien onder:
 *  1. `rapp.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-rapp.ts`):
 *     `assertEqual(actual, expected, label)` per check.
 *
 * Twee checks (WF-RAPP-09/10) roepen ÉCHTE productiefuncties aan
 * (`lookupAowAge`, `resolveFireParams`, `deriveCohort` — alle drie nemen hun
 * tijdreferentie/brondata als expliciete parameter, dus injecteerbaar/puur).
 * De overige vier zijn mirrors van server-only route-berekeningen (`app/api/
 * report/**`, Supabase-afhankelijk) met bronregel-verwijzing — spiegelt de
 * mirrors in eerdere zones (bv. cash-checks.ts#validateSplit).
 */

import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { resolveFireParams } from '@/lib/fire-params'
import { deriveCohort } from '@/lib/benchmark/cohort'
import { RAPP_ACCEPTANCE } from './rapp'
import type { AcceptanceCriterion } from './types'

export interface RappEngineCheck {
  /** 'WF-RAPP-02' */
  workflow: string
  /** 'UAT-RAPP-02' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in rapp.ts — gooit als rapp.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = RAPP_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — rapp.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in rapp.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function fx(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

/** Mirror van de vermogensgroei-formule (app/api/report/route.ts r212-216):
 *  laatste − eerste snapshot binnen de gekozen periode. */
function vermogensgroei(eersteSnapshot: number, laatsteSnapshot: number): { groei: number; pct: number } {
  const groei = laatsteSnapshot - eersteSnapshot
  const pct = eersteSnapshot !== 0 ? (groei / eersteSnapshot) * 100 : 0
  return { groei, pct }
}

/** Mirror van de balansformules (app/api/report/balans/route.ts r258-312). */
function balans(totalActiva: number, totalSchulden: number, vlottendeActiva: number, liquideMiddelen: number, kortVreemdVermogen: number) {
  const eigenVermogen = totalActiva - totalSchulden
  const solvabiliteit = totalActiva > 0 ? (eigenVermogen / totalActiva) * 100 : 0
  const schuldgraad = eigenVermogen !== 0 ? totalSchulden / eigenVermogen : 0
  const liquiditeit = kortVreemdVermogen > 0 ? (vlottendeActiva + liquideMiddelen) / kortVreemdVermogen : null
  return { eigenVermogen, solvabiliteit, schuldgraad, liquiditeit }
}

/** Mirror van de budgetrapport-Begroot-som (app/api/report/budget/route.ts,
 *  100% deterministisch op persona-budgetlimieten, geen jitter). */
function budgetBegroot(input: {
  vasteLasten: number
  dagelijks: number
  vervoer: number
  leukeDingen: number
  sparen: number
  schulden: number
  inkomen: number
}) {
  const uitgavenBegroot = input.vasteLasten + input.dagelijks + input.vervoer + input.leukeDingen
  const begroot = uitgavenBegroot + input.sparen + input.schulden
  const teVerdelen = input.inkomen - begroot
  const dekkingsgraad = input.inkomen > 0 ? (begroot / input.inkomen) * 100 : 0
  const essentieelBegroot = input.vasteLasten + input.dagelijks + input.vervoer
  const discretionairBegroot = input.leukeDingen
  return { begroot, teVerdelen, dekkingsgraad, essentieelBegroot, discretionairBegroot }
}

/** Mirror van de vermogensoverzicht-eigenVermogen-som (app/api/report/vermogen/route.ts r686-693). */
function vermogenOverzicht(totalActiva: number, totalSchulden: number, aantalActivaRegels: number, aantalSchuldenRegels: number) {
  return {
    eigenVermogen: totalActiva - totalSchulden,
    aantalRegels: aantalActivaRegels + aantalSchuldenRegels,
  }
}

// ── Checks — één per 'exact'-workflow in RAPP_ACCEPTANCE ───────────────────

export const RAPP_ENGINE_CHECKS: RappEngineCheck[] = [
  {
    workflow: 'WF-RAPP-02',
    scenarioId: 'UAT-RAPP-02',
    label: 'Vermogensgroei-mirror (Lisa, Q2 2026): €117.280 → €127.080',
    run: () => {
      criterion('WF-RAPP-02')
      const r = vermogensgroei(117280, 127080)
      return {
        expected: 'vermogensgroei=9800; groeiPct=8.36',
        actual: `vermogensgroei=${r.groei}; groeiPct=${fx(r.pct, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-RAPP-06',
    scenarioId: 'UAT-RAPP-06',
    label: 'Balansformules-mirror: Lisa (in evenwicht) + Willem (liquiditeit=null bij kort vreemd vermogen 0)',
    run: () => {
      criterion('WF-RAPP-06')
      const lisa = balans(498550, 368270, 72000, 19050, 8970)
      const willem = balans(1619700, 0, 0, 0, 0)
      return {
        expected: 'lisaEigenVermogen=130280; lisaSolvabiliteit=26.13; lisaSchuldgraad=2.83; lisaLiquiditeit=10.15; willemSolvabiliteit=100; willemLiquiditeit=null',
        actual: `lisaEigenVermogen=${lisa.eigenVermogen}; lisaSolvabiliteit=${fx(lisa.solvabiliteit, 2)}; lisaSchuldgraad=${fx(lisa.schuldgraad, 2)}; lisaLiquiditeit=${fx(lisa.liquiditeit!, 2)}; willemSolvabiliteit=${fx(willem.solvabiliteit, 0)}; willemLiquiditeit=${willem.liquiditeit}`,
      }
    },
  },
  {
    workflow: 'WF-RAPP-07',
    scenarioId: 'UAT-RAPP-07',
    label: 'Budgetrapport-Begroot-mirror (Lisa, juni 2026, deterministische limieten)',
    run: () => {
      criterion('WF-RAPP-07')
      const r = budgetBegroot({
        vasteLasten: 1555,
        dagelijks: 925,
        vervoer: 265,
        leukeDingen: 300,
        sparen: 600,
        schulden: 50,
        inkomen: 5200,
      })
      return {
        expected: 'begroot=3695; teVerdelen=1505; dekkingsgraad=71.06; essentieelBegroot=2745; discretionairBegroot=300',
        actual: `begroot=${r.begroot}; teVerdelen=${r.teVerdelen}; dekkingsgraad=${fx(r.dekkingsgraad, 2)}; essentieelBegroot=${r.essentieelBegroot}; discretionairBegroot=${r.discretionairBegroot}`,
      }
    },
  },
  {
    workflow: 'WF-RAPP-08',
    scenarioId: 'UAT-RAPP-08',
    label: 'Vermogensoverzicht-mirror (Tessa/compleet): eigen vermogen + aantal regels',
    run: () => {
      criterion('WF-RAPP-08')
      const r = vermogenOverzicht(1551000, 454020, 13, 12)
      return {
        expected: 'eigenVermogen=1096980; aantalRegels=25',
        actual: `eigenVermogen=${r.eigenVermogen}; aantalRegels=${r.aantalRegels}`,
      }
    },
  },
  {
    workflow: 'WF-RAPP-09',
    scenarioId: 'UAT-RAPP-09',
    label: 'AOW-leeftijd (lookupAowAge) + effectieve SWR/marginaal tarief (resolveFireParams): Willem + Marijke',
    run: () => {
      criterion('WF-RAPP-09')
      const rows: AowLeeftijdRow[] = [
        { id: 'r1', birth_date_from: '1966-10-01', birth_date_through: '1970-06-30', aow_years: 67, aow_months: 6, is_definitive: false, source: 'test' },
      ]
      const willemAow = lookupAowAge(rows, '1968-11-30')
      const willemFire = resolveFireParams({ expected_return: 0.06, inflation_rate: 0.02, marginaal_tarief: null, net_monthly_income: null })
      const marijkeFire = resolveFireParams({ expected_return: 0.06, inflation_rate: 0.02, marginaal_tarief: 0.495, net_monthly_income: 3400 })
      return {
        expected: 'willemAowJaren=67; willemAowMaanden=6; willemAowDefinitief=false; effectieveSwr=1.84; willemMarginaalTarief=35.75; marijkeMarginaalTarief=49.5',
        actual: `willemAowJaren=${willemAow.years}; willemAowMaanden=${willemAow.months}; willemAowDefinitief=${willemAow.isDefinitive}; effectieveSwr=${fx(willemFire.effectiveSwr * 100, 2)}; willemMarginaalTarief=${fx(willemFire.marginaalTarief * 100, 2)}; marijkeMarginaalTarief=${fx(marijkeFire.marginaalTarief * 100, 1)}`,
      }
    },
  },
  {
    workflow: 'WF-RAPP-10',
    scenarioId: 'UAT-RAPP-10',
    label: 'Benchmark-cohort (deriveCohort): Lisa (35–45, gezin_jong) + Willem (55–65, paar)',
    run: () => {
      criterion('WF-RAPP-10')
      const now = new Date(2026, 6, 5) // 5 juli 2026
      const lisa = deriveCohort({ date_of_birth: '1981-07-08', household_type: 'gezin' }, now)
      const willem = deriveCohort({ date_of_birth: '1968-11-30', household_type: 'samen', number_of_children: 0 }, now)
      return {
        expected: 'lisaAgeBand=35–45 jaar; lisaComplete=true; willemAgeBand=55–65 jaar',
        actual: `lisaAgeBand=${lisa.ageBandLabel}; lisaComplete=${lisa.complete}; willemAgeBand=${willem.ageBandLabel}`,
      }
    },
  },
]
