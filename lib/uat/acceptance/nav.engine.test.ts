/**
 * Engine-niveau toets voor de UAT-Nav-acceptatiecriteria (`nav.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `nav-checks.ts` (`NAV_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-nav.ts`). Deze test loopt
 * er alleen overheen en toetst `expect(actual).toBe(expected)` — één bron van
 * waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * NAV is — net als SCHULD/TOEK/WILL/OVZ — NIET aaneengesloten op WF-nummer:
 * WF-NAV-13 (uitloggen) heeft geen eigen UAT-NAV-scenario (→ gedekt door
 * UAT-START-15) en ontbreekt dus terecht in de catalogus voor zone NAV. De 25
 * criteria hier zijn wél 1-op-1 met de 25 catalogus-scenario's
 * (UAT-NAV-01..12, 14..26).
 */

import { describe, it, expect } from 'vitest'
import { NAV_ACCEPTANCE } from './nav'
import { NAV_ENGINE_CHECKS } from './nav-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De NAV-scenario's zoals de catalogus ze kent. WF-NAV-12 heeft geen
 *  annotatie in deze catalogus, maar we normaliseren defensief net als bij
 *  WILL/OVZ mocht dat ooit toegevoegd worden. */
const catalogNavWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'NAV')
  .map((s) => s.wf?.match(/^WF-NAV-\d+/)?.[0] ?? s.wf)
  .sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = NAV_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — nav.ts is niet in sync met de test.`)
  return found
}

describe('UAT Nav — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per catalogus-NAV-scenario (25 stuks, WF-NAV-13 bestaat niet in de catalogus)', () => {
    const workflows = NAV_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogNavWorkflows)
    expect(new Set(workflows).size).toBe(catalogNavWorkflows.length)
    expect(workflows.length).toBe(25)
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of NAV_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of NAV_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een NAV_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = NAV_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = NAV_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
    expect(exactWorkflows.length).toBe(9)
  })

  it('markeert het status-dot-consistentiecriterium en de gebonden/procesworkflows met de juiste kind', () => {
    expect(criterion('WF-NAV-03').assertion.kind).toBe('consistency')
    const uiOnly = [
      'WF-NAV-02', 'WF-NAV-04', 'WF-NAV-06', 'WF-NAV-08', 'WF-NAV-11',
      'WF-NAV-12', 'WF-NAV-17', 'WF-NAV-19', 'WF-NAV-20', 'WF-NAV-21',
      'WF-NAV-22', 'WF-NAV-23', 'WF-NAV-24', 'WF-NAV-25', 'WF-NAV-26',
    ]
    for (const wf of uiOnly) {
      expect(criterion(wf).assertion.kind, `${wf} moet ui-only zijn`).toBe('ui-only')
    }
    expect(uiOnly.length).toBe(15)
  })
})

describe('NAV_ENGINE_CHECKS — echte/gemirrorde routing-/configuratiefuncties op deterministische invoer', () => {
  for (const check of NAV_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, async () => {
      const { expected, actual } = await check.run()
      expect(actual).toBe(expected)
    })
  }
})
