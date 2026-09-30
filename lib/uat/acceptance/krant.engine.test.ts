/**
 * Engine-niveau toets voor de UAT-Krant-acceptatiecriteria (`krant.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die logica leeft in
 * `krant-checks.ts` (`KRANT_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-krant.ts`). Deze test loopt
 * er alleen overheen en toetst `expect(actual).toBe(expected)`.
 *
 * KRANT is aaneengesloten 01..20: elk catalogus-scenario heeft precies één
 * criterium. Verdeling: 11 exact, 2 consistency, 7 ui-only (17..20 = Krant 2C).
 */

import { describe, it, expect } from 'vitest'
import { KRANT_ACCEPTANCE } from './krant'
import { KRANT_ENGINE_CHECKS } from './krant-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

const catalogKrantWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'KRANT')
  .map((s) => s.wf)
  .filter((wf): wf is string => Boolean(wf))
  .sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = KRANT_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — krant.ts is niet in sync met de test.`)
  return found
}

describe('UAT Krant — acceptatiecriteria dekking', () => {
  it('is de KRANT-zone met precies 20 criteria', () => {
    expect(KRANT_ACCEPTANCE.zone).toBe('KRANT')
    expect(KRANT_ACCEPTANCE.criteria.length).toBe(20)
  })

  it('heeft precies één criterium per catalogus-KRANT-scenario', () => {
    const workflows = KRANT_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogKrantWorkflows)
    expect(new Set(workflows).size).toBe(catalogKrantWorkflows.length)
  })

  it('workflow en scenarioId dragen hetzelfde nummer', () => {
    for (const c of KRANT_ACCEPTANCE.criteria) {
      expect(c.scenarioId, c.workflow).toBe(c.workflow.replace(/^WF-/, 'UAT-'))
    }
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of KRANT_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of KRANT_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een KRANT_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = KRANT_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = KRANT_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
  })

  it('heeft de verwachte kind-verdeling (11 exact, 2 consistency, 7 ui-only)', () => {
    const counts = { exact: 0, consistency: 0, 'ui-only': 0, oracle: 0, direction: 0 }
    for (const c of KRANT_ACCEPTANCE.criteria) counts[c.assertion.kind]++
    expect(counts).toEqual({ exact: 11, consistency: 2, 'ui-only': 7, oracle: 0, direction: 0 })
    expect(criterion('WF-KRANT-03').assertion.kind).toBe('ui-only')
    expect(criterion('WF-KRANT-08').assertion.kind).toBe('ui-only')
    expect(criterion('WF-KRANT-10').assertion.kind).toBe('consistency')
    expect(criterion('WF-KRANT-15').assertion.kind).toBe('consistency')
  })

  it('de regressietoets WF-KRANT-12 is KERN', () => {
    expect(criterion('WF-KRANT-12').kriticiteit).toBe('KERN')
  })
})

describe('KRANT_ENGINE_CHECKS — echte beslisfuncties op deterministische invoer', () => {
  for (const check of KRANT_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
