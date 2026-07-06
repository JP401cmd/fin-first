/**
 * Engine-niveau toets voor de UAT-Schuld-acceptatiecriteria (`schuld.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `schuld-checks.ts` (`SCHULD_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-schuld.ts`). Deze test loopt
 * er alleen overheen en toetst `expect(actual).toBe(expected)` — één bron van
 * waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * De niet-exacte criteria (WF-SCHULD-02 ui-only, -10 direction, -12 ui-only,
 * -14 direction) hebben geen vast cijfer en worden hier als bespoke
 * kind-controle geborgd, samen met de dekkingscontrole op `schuld.ts` zelf
 * (elk SCHULD-scenario uit de catalogus heeft precies één criterium; WF-SCHULD-19
 * = verwijsregel ontbreekt bewust; elk exact-criterium heeft expected+source).
 */

import { describe, it, expect } from 'vitest'
import { SCHULD_ACCEPTANCE } from './schuld'
import { SCHULD_ENGINE_CHECKS } from './schuld-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De SCHULD-scenario's zoals de catalogus ze kent (bron van waarheid voor
 *  WELKE workflows bestaan). WF-SCHULD-19 staat er bewust NIET in. */
const catalogSchuldWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'SCHULD').map((s) => s.wf).sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = SCHULD_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — schuld.ts is niet in sync met de test.`)
  return found
}

describe('UAT Schuld — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per catalogus-SCHULD-scenario', () => {
    const workflows = SCHULD_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogSchuldWorkflows)
    expect(new Set(workflows).size).toBe(catalogSchuldWorkflows.length)
  })

  it('bevat NIET de verwijs-workflow WF-SCHULD-19 (dekt UAT-NAV-10)', () => {
    const workflows = SCHULD_ACCEPTANCE.criteria.map((c) => c.workflow)
    expect(workflows).not.toContain('WF-SCHULD-19')
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of SCHULD_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of SCHULD_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een SCHULD_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = SCHULD_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = SCHULD_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
  })

  it('markeert de niet-narekenbare scenario\'s met de juiste kind', () => {
    expect(criterion('WF-SCHULD-02').assertion.kind).toBe('ui-only')
    expect(criterion('WF-SCHULD-10').assertion.kind).toBe('direction') // multi-schuld aflosroute-simulatie
    expect(criterion('WF-SCHULD-12').assertion.kind).toBe('ui-only')
    expect(criterion('WF-SCHULD-14').assertion.kind).toBe('direction') // hypotheek-vs-beleggen compounding
  })
})

describe('SCHULD_ENGINE_CHECKS — echte rekenfuncties/constanten op persona-brondata', () => {
  for (const check of SCHULD_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
