/**
 * Engine-niveau toets voor de UAT-Start-acceptatiecriteria (`start.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `start-checks.ts` (`START_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-start.ts`). Deze test loopt
 * er alleen overheen en toetst `expect(actual).toBe(expected)` — één bron van
 * waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * De niet-exacte criteria (22 ui-only workflows + 3 consistency-workflows)
 * hebben geen vast cijfer en worden hier als bespoke kind-controle geborgd,
 * samen met de dekkingscontrole op `start.ts` zelf (elk START-scenario uit de
 * catalogus heeft precies één criterium — 01..40, aaneengesloten, geen
 * verwijsregel-gaten).
 */

import { describe, it, expect } from 'vitest'
import { START_ACCEPTANCE } from './start'
import { START_ENGINE_CHECKS } from './start-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De START-scenario's zoals de catalogus ze kent (bron van waarheid voor
 *  WELKE workflows bestaan). START is aaneengesloten 01..30, geen gaten. */
const catalogStartWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'START').map((s) => s.wf).sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = START_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — start.ts is niet in sync met de test.`)
  return found
}

describe('UAT Start — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per catalogus-START-scenario (01..40 met een gat op 21, geen andere gaten)', () => {
    const workflows = START_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogStartWorkflows)
    expect(new Set(workflows).size).toBe(catalogStartWorkflows.length)
    // 37 → 40 (17-09-2026): WF-START-38 (stapscherm-volgorde: vraag eerst,
    // sticky voortgangsrij eronder, accent per stapgroep; 'ui-only'),
    // WF-START-39 (vier getrokken accentkleuren bij binnenkomst;
    // 'consistency') en WF-START-40 (de eerste ophaal op het homescherm,
    // ADR 0158; 'consistency').
    // 19-09-2026 (ADR 0162, B-056): WF-START-21/UAT-START-21 (spaardoel
    // kiezen/overslaan) verwijderd — de onboarding-stap "Spaardoel" bestaat
    // niet meer. 40 → 39 criteria, met een bewust gat op nummer 21.
    expect(workflows.length).toBe(39)
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of START_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of START_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een START_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = START_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = START_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
    expect(exactWorkflows.length).toBe(11)
  })

  it('markeert de niet-exacte scenario\'s met de juiste kind (ui-only)', () => {
    const uiOnly = [
      'WF-START-01', 'WF-START-02', 'WF-START-03', 'WF-START-05',
      'WF-START-07', 'WF-START-09', 'WF-START-11', 'WF-START-12',
      'WF-START-13', 'WF-START-14', 'WF-START-15', 'WF-START-16',
      'WF-START-17', 'WF-START-22', 'WF-START-23', 'WF-START-24',
      'WF-START-25', 'WF-START-26', 'WF-START-33', 'WF-START-35',
      'WF-START-36', 'WF-START-38',
    ]
    for (const wf of uiOnly) {
      expect(criterion(wf).assertion.kind, `${wf} moet ui-only zijn`).toBe('ui-only')
    }
    expect(uiOnly.length).toBe(22)
  })

  it('markeert de consistency-criteria (WF-START-32, -39, -40)', () => {
    // 32: dezelfde diff-functie als de in-app planeditor.
    // 39: de vier getrokken accenten komen uit ACCENT_RING op vaste
    //     tetrad-afstanden — A=B, geen eigen cijfer.
    // 40: de gesynchroniseerde set == de ids uit de afrondingsmarkering.
    for (const wf of ['WF-START-32', 'WF-START-39', 'WF-START-40']) {
      expect(criterion(wf).assertion.kind, `${wf} moet consistency zijn`).toBe('consistency')
    }
  })
})

describe('START_ENGINE_CHECKS — echte rekenfuncties/constanten op de UAT-plan-testpersonen', () => {
  for (const check of START_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
