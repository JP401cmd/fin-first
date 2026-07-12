/**
 * Engine-niveau toets voor de UAT-Reken-acceptatiecriteria (`reken.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica
 * leeft in `reken-checks.ts` (`REKEN_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-reken.ts`). Deze test loopt
 * er alleen overheen en toetst `expect(actual).toBe(expected)` — één bron van
 * waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * REKEN is — net als SCHULD/TOEK/WILL/OVZ/NAV — NIET aaneengesloten op
 * WF-nummer: WF-REKEN-17 (bewaarde wat-als-scenario's) heeft geen eigen
 * UAT-REKEN-scenario (→ gedekt door UAT-TOEK-09) en ontbreekt dus terecht in
 * de catalogus voor zone REKEN. De 23 criteria hier zijn 1-op-1 met de 23
 * catalogus-scenario's (UAT-REKEN-01..16, 18..24).
 */

import { describe, it, expect } from 'vitest'
import { REKEN_ACCEPTANCE } from './reken'
import { REKEN_ENGINE_CHECKS } from './reken-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De REKEN-scenario's zoals de catalogus ze kent. Geen bekende annotaties
 *  in deze zone, maar we normaliseren defensief net als bij WILL/OVZ/NAV/RAPP
 *  mocht dat ooit toegevoegd worden. */
const catalogRekenWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'REKEN')
  .map((s) => s.wf?.match(/^WF-REKEN-\d+/)?.[0] ?? s.wf)
  .sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = REKEN_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — reken.ts is niet in sync met de test.`)
  return found
}

describe('UAT Reken — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per catalogus-REKEN-scenario (23 stuks, WF-REKEN-17 bestaat niet in de catalogus)', () => {
    const workflows = REKEN_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogRekenWorkflows)
    expect(new Set(workflows).size).toBe(catalogRekenWorkflows.length)
    expect(workflows.length).toBe(23)
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of REKEN_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of REKEN_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een REKEN_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = REKEN_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = REKEN_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
    expect(exactWorkflows.length).toBe(8)
  })

  it('markeert de kernel-afhankelijke richting-workflows en de proces-/ui-only-workflows met de juiste kind', () => {
    const direction = ['WF-REKEN-13', 'WF-REKEN-14', 'WF-REKEN-15', 'WF-REKEN-18']
    for (const wf of direction) {
      expect(criterion(wf).assertion.kind, `${wf} moet direction zijn`).toBe('direction')
    }
    expect(direction.length).toBe(4)

    const uiOnly = [
      'WF-REKEN-02', 'WF-REKEN-04', 'WF-REKEN-05', 'WF-REKEN-06', 'WF-REKEN-07',
      'WF-REKEN-08', 'WF-REKEN-09', 'WF-REKEN-10', 'WF-REKEN-11', 'WF-REKEN-12',
      'WF-REKEN-19',
    ]
    for (const wf of uiOnly) {
      expect(criterion(wf).assertion.kind, `${wf} moet ui-only zijn`).toBe('ui-only')
    }
    expect(uiOnly.length).toBe(11)
  })
})

describe('REKEN_ENGINE_CHECKS — echte rekenfuncties op deterministische invoer', () => {
  for (const check of REKEN_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
