/**
 * Gedeelde engine-checks voor de UAT-Toekomst-acceptatiecriteria (`toek.ts`).
 *
 * PURE module — geen vitest/DOM-afhankelijkheden — zodat dezelfde lijst checks
 * kan draaien onder:
 *   1. `toek.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *   2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-toek.ts`):
 *      `assertEqual(actual, expected, label)` per check.
 *
 * TOEK is KERNEL-ZWAAR: de meeste tijdas-cijfers komen uit de horizon-kernel en
 * zijn NIET met de hand na te rekenen (die zijn in `toek.ts` gemarkeerd als
 * 'oracle'/'consistency'/'direction'). Alleen de weinige écht 'exact'-criteria —
 * parameter-/persona-echo's via een pure functie of constante — hebben hier een
 * check. Elke `run()` roept UITSLUITEND de échte rekenfunctie(s)/constante(s) aan
 * op de échte persona-brondata (`lib/test-personas.ts`), met één uitzondering die
 * expliciet is gedocumenteerd (WF-TOEK-22: de doel-ETA-annuïteitsformule leeft
 * component-privé in `doel-toevoegen-sheet.tsx` en is niet importeerbaar — die
 * ene check spiegelt exact dezelfde pure formule; hij bewijst de math, niet de
 * component-wiring).
 *
 * Alle gebruikte imports zijn client-veilig (geen `server-only`/`next/headers`/
 * `@/lib/supabase/server` in hun import-graaf):
 *   - `lib/fire-strategy.ts`  — pure types + labels + parser (geen deps).
 *   - `lib/horizon-data.ts`   — importeert alleen core-metrics/msci-data/constants.
 *   - `lib/goal-data.ts`      — pure helpers.
 *   - `lib/horizon-kernel/adapter/defaults.ts` — alleen een `TaxYear`-type-import.
 *   - `lib/constants.ts`      — pure constanten.
 *   - `lib/test-personas.ts`  — al elders in de browser-runtime gebruikt.
 */

import { PERSONAS } from '@/lib/test-personas'
import { STRATEGY_LABELS, parseFireStrategy } from '@/lib/fire-strategy'
import { computeAowMonthly } from '@/lib/horizon-data'
import { computeGoalProgress, type Goal } from '@/lib/goal-data'
import { EXCEL_TEKORT_LENING_RENTE } from '@/lib/horizon-kernel/adapter/defaults'
import { TOEK_ACCEPTANCE } from './toek'
import type { AcceptanceCriterion } from './types'

const willem = PERSONAS.willem
const marijke = PERSONAS.marijke

export interface ToekEngineCheck {
  /** 'WF-TOEK-01' */
  workflow: string
  /** 'UAT-TOEK-01' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s)/constante(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in toek.ts — gooit als toek.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = TOEK_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — toek.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in toek.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function fx(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

/** Minimale, volledig getypeerde Goal-fixture — alleen de velden die
 *  computeGoalProgress leest wijken af van de default. */
function makeGoal(overrides: Partial<Goal>): Goal {
  return {
    id: 'test-goal', user_id: 'test-user', name: 'Noodfonds', description: null,
    goal_type: 'savings', target_value: 5000, current_value: 0, target_date: null,
    linked_asset_id: null, linked_debt_id: null, budget_id: null, custom_unit: null,
    icon: 'PiggyBank', color: 'emerald', is_completed: false, completed_at: null,
    sort_order: 0, ownership: 'personal', household_id: null,
    created_at: '2026-01-01', updated_at: '2026-01-01',
    ...overrides,
  }
}

/**
 * Spiegel van de component-privé `monthlyContributionForTarget` uit
 * `components/future/doel-toevoegen-sheet.tsx` (niet geëxporteerd, in een
 * client-.tsx met React/supabase-imports → niet importeerbaar in een pure
 * module). Zelfde annuïteitsformule; bewijst de gedocumenteerde math.
 *   FV = PMT × ((1+r)^n − 1) / r  →  PMT = FV × r / ((1+r)^n − 1)
 */
function monthlyContributionForTarget(target: number, years: number, annualReturn: number): number {
  if (years <= 0) return target
  const months = years * 12
  if (annualReturn <= 0) return target / months
  const r = annualReturn / 12
  const growthFactor = Math.pow(1 + r, months)
  return (target * r) / (growthFactor - 1)
}

/** Spiegel van de no-date "~N jaar"-solve uit dezelfde component (EtaPreview,
 *  case 2): los `n` op uit target = 100 × ((1+r)^n − 1) / r. */
function yearsAtReferenceMonthly(target: number, annualReturn: number, referenceMonthly = 100): number {
  if (annualReturn <= 0) return target / (referenceMonthly * 12)
  const r = annualReturn / 12
  const n = Math.log(1 + (target * r) / referenceMonthly) / Math.log(1 + r)
  return n / 12
}

const RETURN_SAVINGS = 0.015 // RETURN_BY_TYPE.savings (doel-toevoegen-sheet.tsx)

// ── Checks — één per 'exact'-workflow in TOEK_ACCEPTANCE ───────────────────

export const TOEK_ENGINE_CHECKS: ToekEngineCheck[] = [
  {
    workflow: 'WF-TOEK-01',
    scenarioId: 'UAT-TOEK-01',
    label: 'Strategie-labels + eindleeftijd-echo + weergave-eindleeftijd (Willem deplete)',
    run: () => {
      criterion('WF-TOEK-01')
      const cfg = parseFireStrategy(willem.profile)
      const eindleeftijd = cfg.endAge // 95 (deplete → fire_end_age)
      const weergaveTot = eindleeftijd - 1 // 94 (displayEndAge − 1)
      return {
        expected: 'strategieLabelDeplete=Vermogen opeten; eindleeftijd=95; weergaveTot=94; strategieLabelPensioen=Pensioenleeftijd',
        actual: `strategieLabelDeplete=${STRATEGY_LABELS.deplete.name}; eindleeftijd=${eindleeftijd}; weergaveTot=${weergaveTot}; strategieLabelPensioen=${STRATEGY_LABELS.pensioen.name}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-02',
    scenarioId: 'UAT-TOEK-02',
    label: 'Jaarlijkse pensioenuitgave €3.000×12 en rendement-echo (Willem)',
    run: () => {
      criterion('WF-TOEK-02')
      const pensioenMaand = willem.profile.retirement_expense_custom_amount ?? 0
      const jaaruitgaven = pensioenMaand * 12
      const rendementPct = (willem.profile.expected_return ?? 0) * 100
      return {
        expected: 'pensioenMaand=3000; jaaruitgaven=36000; rendementPct=6',
        actual: `pensioenMaand=${pensioenMaand}; jaaruitgaven=${jaaruitgaven}; rendementPct=${fx(rendementPct, 0)}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-17',
    scenarioId: 'UAT-TOEK-17',
    label: 'Tekort-lening default-rente 5,0% (EXCEL_TEKORT_LENING_RENTE, Willem geen override)',
    run: () => {
      criterion('WF-TOEK-17')
      const rentePct = EXCEL_TEKORT_LENING_RENTE * 100
      return {
        expected: 'tekortLeningRentePct=5.0',
        actual: `tekortLeningRentePct=${fx(rentePct, 1)}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-18',
    scenarioId: 'UAT-TOEK-18',
    label: 'AOW-bedragen via computeAowMonthly + Willems verouderde seed (€940 ≠ €1.084)',
    run: () => {
      criterion('WF-TOEK-18')
      const samenwonend0 = computeAowMonthly('samenwonend', 0) // round(1084.13) = 1084
      const samenwonend5 = computeAowMonthly('samenwonend', 5) // round(1084.13 × 45/50) = 976
      const alleenstaand0 = computeAowMonthly('alleenstaand', 0) // round(1581.55) = 1582
      const aowEvent = willem.life_events.find((e) => e.event_type === 'aow')
      const willemSeed = aowEvent?.monthly_income_change ?? 0
      const seedWijktAf = willemSeed !== samenwonend0
      return {
        expected: 'samenwonend0=1084; samenwonend5=976; alleenstaand0=1582; willemSeed=940; seedWijktAf=true',
        actual: `samenwonend0=${samenwonend0}; samenwonend5=${samenwonend5}; alleenstaand0=${alleenstaand0}; willemSeed=${willemSeed}; seedWijktAf=${seedWijktAf}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-22',
    scenarioId: 'UAT-TOEK-22',
    label: 'Doel-ETA: no-date "~4 jaar" + PMT bij streefdatum 24 mnd (annuïteitsformule)',
    run: () => {
      criterion('WF-TOEK-22')
      const etaJaren = Math.round(yearsAtReferenceMonthly(5000, RETURN_SAVINGS)) // 4
      const maandinlegMetDatum = monthlyContributionForTarget(5000, 2, RETURN_SAVINGS) // ~205.35
      return {
        expected: 'etaJaren=4; maandinlegMetDatum=205.35',
        actual: `etaJaren=${etaJaren}; maandinlegMetDatum=${fx(maandinlegMetDatum, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-23',
    scenarioId: 'UAT-TOEK-23',
    label: 'Doel-voortgang via computeGoalProgress (€3.000/€5.000 = 60%, +60pp)',
    run: () => {
      criterion('WF-TOEK-23')
      const pctBij3000 = computeGoalProgress(makeGoal({ current_value: 3000 })).pct
      const pctBij0 = computeGoalProgress(makeGoal({ current_value: 0 })).pct
      const deltaPp = pctBij3000 - pctBij0
      return {
        expected: 'pctBij3000=60; pctBij0=0; deltaPp=60',
        actual: `pctBij3000=${pctBij3000}; pctBij0=${pctBij0}; deltaPp=${deltaPp}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-24',
    scenarioId: 'UAT-TOEK-24',
    label: 'Guardrail-echo (80/120/10) + eindstrategie pensioen/€200.000 (Marijke)',
    run: () => {
      criterion('WF-TOEK-24')
      const p = marijke.profile
      const floorPct = (p.guardrail_floor ?? 0) * 100
      const ceilingPct = (p.guardrail_ceiling ?? 0) * 100
      const cutStepPct = (p.guardrail_cut_step ?? 0) * 100
      const cfg = parseFireStrategy(p)
      return {
        expected: 'floorPct=80; ceilingPct=120; cutStepPct=10; strategie=pensioen; nalatenschap=200000',
        actual: `floorPct=${fx(floorPct, 0)}; ceilingPct=${fx(ceilingPct, 0)}; cutStepPct=${fx(cutStepPct, 0)}; strategie=${cfg.strategy}; nalatenschap=${cfg.legacyAmount}`,
      }
    },
  },
]
