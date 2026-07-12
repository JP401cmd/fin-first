/**
 * Engine-niveau toets voor de UAT-Belasting-acceptatiecriteria (`belast.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `belast-checks.ts` (`BELAST_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-belast.ts`). Deze test loopt
 * er alleen overheen en toetst `expect(actual).toBe(expected)` — één bron van
 * waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * De niet-exacte criteria (WF-BELAST-01 consistency, -02/-04/-05/-06/-12/-21
 * ui-only, -03 direction) hebben geen vast cijfer en worden hier als bespoke
 * kind-controle geborgd, samen met de dekkingscontrole op `belast.ts` zelf
 * (elk BELAST-scenario uit de catalogus heeft precies één criterium;
 * WF-BELAST-20 en -22 = verwijsregels naar NAV, ontbreken bewust; elk
 * exact-criterium heeft expected+source).
 */

import { describe, it, expect } from 'vitest'
import { BELAST_ACCEPTANCE } from './belast'
import { BELAST_ENGINE_CHECKS } from './belast-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De BELAST-scenario's zoals de catalogus ze kent (bron van waarheid voor
 *  WELKE workflows bestaan). WF-BELAST-20 en -22 staan er bewust NIET in. */
const catalogBelastWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'BELAST').map((s) => s.wf).sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = BELAST_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — belast.ts is niet in sync met de test.`)
  return found
}

describe('UAT Belasting — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per catalogus-BELAST-scenario', () => {
    const workflows = BELAST_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogBelastWorkflows)
    expect(new Set(workflows).size).toBe(catalogBelastWorkflows.length)
  })

  it('bevat NIET de verwijs-workflows WF-BELAST-20 en -22 (dekken UAT-NAV)', () => {
    const workflows = BELAST_ACCEPTANCE.criteria.map((c) => c.workflow)
    expect(workflows).not.toContain('WF-BELAST-20')
    expect(workflows).not.toContain('WF-BELAST-22')
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of BELAST_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of BELAST_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een BELAST_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = BELAST_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = BELAST_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
  })

  it('markeert de niet-narekenbare scenario\'s met de juiste kind', () => {
    expect(criterion('WF-BELAST-01').assertion.kind).toBe('consistency') // hub-totaal leunt op loader-bron
    expect(criterion('WF-BELAST-02').assertion.kind).toBe('ui-only') // box-kaart-navigatie
    expect(criterion('WF-BELAST-03').assertion.kind).toBe('direction') // kansen-sortering
    expect(criterion('WF-BELAST-04').assertion.kind).toBe('ui-only') // kans → actie
    expect(criterion('WF-BELAST-05').assertion.kind).toBe('ui-only') // fiscale kalender (klok-afhankelijk)
    expect(criterion('WF-BELAST-06').assertion.kind).toBe('ui-only') // stelsel-vooruitblik (statisch)
    expect(criterion('WF-BELAST-12').assertion.kind).toBe('ui-only') // box2-leegstaat / relevantie-detectie
    expect(criterion('WF-BELAST-21').assertion.kind).toBe('ui-only') // peildatum lezen (statisch)
  })
})

describe('BELAST_ENGINE_CHECKS — echte rekenfuncties/constanten op brondata', () => {
  for (const check of BELAST_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
