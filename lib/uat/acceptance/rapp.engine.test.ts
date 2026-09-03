/**
 * Engine-niveau toets voor de UAT-Rapp-acceptatiecriteria (`rapp.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `rapp-checks.ts` (`RAPP_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-rapp.ts`). Deze test loopt
 * er alleen overheen en toetst `expect(actual).toBe(expected)` — één bron van
 * waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * RAPP is — anders dan SCHULD/TOEK/WILL/OVZ/NAV — WEL aaneengesloten op
 * WF-nummer (01..13, geen verwijsregel-gaten). WF-RAPP-07 en WF-RAPP-13 dragen
 * wel een annotatie in hun catalogus-`wf`-veld ("...LEIDEND voor BUDGET" /
 * "...; app-brede maskinggedrag zelf = UAT-NAV-11"), genormaliseerd naar het
 * kale WF-nummer (spiegelt WILL-13/OVZ-12/19/20/21/NAV-normalisatie).
 */

import { describe, it, expect } from 'vitest'
import { RAPP_ACCEPTANCE } from './rapp'
import { RAPP_ENGINE_CHECKS } from './rapp-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De RAPP-scenario's zoals de catalogus ze kent, met de annotaties op
 *  WF-RAPP-07/13 genormaliseerd naar het kale WF-nummer. */
const catalogRappWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'RAPP')
  .map((s) => s.wf?.match(/^WF-RAPP-\d+/)?.[0] ?? s.wf)
  .sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = RAPP_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — rapp.ts is niet in sync met de test.`)
  return found
}

describe('UAT Rapp — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per catalogus-RAPP-scenario (15 stuks, aaneengesloten 01..15)', () => {
    const workflows = RAPP_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogRappWorkflows)
    expect(new Set(workflows).size).toBe(catalogRappWorkflows.length)
    expect(workflows.length).toBe(15)
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of RAPP_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of RAPP_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een RAPP_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = RAPP_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = RAPP_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
    expect(exactWorkflows.length).toBe(6)
  })

  it('markeert het cache-consistentiecriterium en de ui-only-workflows met de juiste kind', () => {
    expect(criterion('WF-RAPP-04').assertion.kind).toBe('consistency')
    const uiOnly = ['WF-RAPP-01', 'WF-RAPP-03', 'WF-RAPP-05', 'WF-RAPP-11', 'WF-RAPP-12', 'WF-RAPP-13']
    for (const wf of uiOnly) {
      expect(criterion(wf).assertion.kind, `${wf} moet ui-only zijn`).toBe('ui-only')
    }
    expect(uiOnly.length).toBe(6)
  })
})

describe('RAPP_ENGINE_CHECKS — echte/gemirrorde rapportberekeningen op deterministische invoer', () => {
  for (const check of RAPP_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
