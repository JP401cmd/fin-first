/**
 * Engine-niveau toets voor de UAT-Beheer-acceptatiecriteria (`beheer.ts`).
 *
 * BEHEER is een admin-tooling-zone ZONDER rekenkern: er zijn geen 'exact'-
 * criteria, dus `BEHEER_ENGINE_CHECKS` (beheer-checks.ts) is bewust leeg. Deze
 * test borgt daarom vooral de DEKKING en de kind-verdeling: elk BEHEER-scenario
 * uit de catalogus (UAT-BEHEER-01..33, contiguous — géén verwijsregels) heeft
 * precies één criterium; de kinds zijn geldig (0 exact, 9 consistency, 2 oracle,
 * 22 ui-only); en er is precies één engine-check per exact-criterium (0 = 0).
 */

import { describe, it, expect } from 'vitest'
import { BEHEER_ACCEPTANCE } from './beheer'
import { BEHEER_ENGINE_CHECKS } from './beheer-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De BEHEER-scenario's zoals de catalogus ze kent (bron van waarheid). */
const catalogBeheerWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'BEHEER')
  .map((s) => s.wf)
  .filter((wf): wf is string => Boolean(wf))
  .sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = BEHEER_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — beheer.ts is niet in sync met de test.`)
  return found
}

describe('UAT Beheer — acceptatiecriteria dekking', () => {
  it('is de BEHEER-zone met precies 33 criteria', () => {
    expect(BEHEER_ACCEPTANCE.zone).toBe('BEHEER')
    expect(BEHEER_ACCEPTANCE.criteria.length).toBe(33)
  })

  it('heeft precies één criterium per catalogus-BEHEER-scenario', () => {
    const workflows = BEHEER_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogBeheerWorkflows)
    expect(new Set(workflows).size).toBe(catalogBeheerWorkflows.length)
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of BEHEER_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of BEHEER_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een BEHEER_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = BEHEER_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = BEHEER_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
  })

  it('heeft de verwachte kind-verdeling (0 exact, 9 consistency, 2 oracle, 22 ui-only)', () => {
    const counts = { exact: 0, consistency: 0, 'ui-only': 0, oracle: 0, direction: 0 }
    for (const c of BEHEER_ACCEPTANCE.criteria) counts[c.assertion.kind]++
    expect(counts.exact).toBe(0)
    expect(counts.consistency).toBe(9)
    expect(counts.oracle).toBe(2)
    expect(counts['ui-only']).toBe(22)
    expect(counts.direction).toBe(0)
  })

  it('de toegangscontrole-workflow WF-BEHEER-01 bestaat en is ui-only (superadmin-gate)', () => {
    expect(criterion('WF-BEHEER-01').assertion.kind).toBe('ui-only')
  })
})

describe('BEHEER_ENGINE_CHECKS — echte rekenfuncties/constanten', () => {
  it('is bewust leeg — BEHEER is admin-tooling zonder rekenkern (0 exact-criteria)', () => {
    expect(BEHEER_ENGINE_CHECKS).toHaveLength(0)
  })
  for (const check of BEHEER_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
