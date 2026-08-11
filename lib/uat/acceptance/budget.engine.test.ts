/**
 * Engine-niveau toets voor de UAT-Budget-acceptatiecriteria (`budget.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `budget-checks.ts` (`BUDGET_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-budget.ts`). Deze test loopt
 * er alleen overheen en toetst `expect(actual).toBe(expected)` — één bron van
 * waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * De niet-exacte criteria (02/16/21 consistency, 13 direction, 04/08/11/12/17/19/23/24
 * ui-only) hebben geen vast cijfer en worden hier als bespoke kind-controle
 * geborgd, samen met de dekkingscontrole op `budget.ts` zelf (elk BUDGET-scenario
 * uit de catalogus heeft precies één criterium — 01..25, aaneengesloten, geen
 * verwijsregel-gaten zoals bij SCHULD/TOEK).
 */

import { describe, it, expect } from 'vitest'
import { BUDGET_ACCEPTANCE } from './budget'
import { BUDGET_ENGINE_CHECKS } from './budget-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De BUDGET-scenario's zoals de catalogus ze kent (bron van waarheid voor
 *  WELKE workflows bestaan). BUDGET is aaneengesloten 01..25, geen gaten. */
const catalogBudgetWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'BUDGET').map((s) => s.wf).sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = BUDGET_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — budget.ts is niet in sync met de test.`)
  return found
}

describe('UAT Budget — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per catalogus-BUDGET-scenario (01..26, geen gaten)', () => {
    const workflows = BUDGET_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogBudgetWorkflows)
    expect(new Set(workflows).size).toBe(catalogBudgetWorkflows.length)
    // 25 → 26: WF-BUDGET-26 (de budgetgrondslag uit ADR 0103 — welke posten
    // meetellen, de expense-only-invariant en realisatie vóór plan; 'exact').
    expect(workflows.length).toBe(26)
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of BUDGET_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of BUDGET_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een BUDGET_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = BUDGET_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = BUDGET_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
    // 13 → 14: WF-BUDGET-26 is 'exact' en krijgt een BUDGET_ENGINE_CHECKS-rij.
    expect(exactWorkflows.length).toBe(14)
  })

  it('markeert de niet-narekenbare/niet-exacte scenario\'s met de juiste kind', () => {
    // consistency (A=B, realisatie/transacties niet hand-narekenbaar)
    expect(criterion('WF-BUDGET-02').assertion.kind).toBe('consistency')
    expect(criterion('WF-BUDGET-16').assertion.kind).toBe('consistency')
    expect(criterion('WF-BUDGET-21').assertion.kind).toBe('consistency')
    // direction (AI-categorisatie + transactiebedragen niet-deterministisch)
    expect(criterion('WF-BUDGET-13').assertion.kind).toBe('direction')
    // ui-only (pure interactie/weergave/navigatie)
    for (const wf of ['WF-BUDGET-04', 'WF-BUDGET-08', 'WF-BUDGET-11', 'WF-BUDGET-12', 'WF-BUDGET-17', 'WF-BUDGET-19', 'WF-BUDGET-23', 'WF-BUDGET-24']) {
      expect(criterion(wf).assertion.kind, `${wf} moet ui-only zijn`).toBe('ui-only')
    }
  })
})

describe('BUDGET_ENGINE_CHECKS — echte rekenfuncties/constanten op persona- of synthetische brondata', () => {
  for (const check of BUDGET_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
