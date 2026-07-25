/**
 * Engine-niveau toets voor de UAT-Fin-acceptatiecriteria (`will.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `will-checks.ts` (`WILL_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-will.ts`). Deze test loopt
 * er alleen overheen en toetst `expect(actual).toBe(expected)` — één bron van
 * waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * WILL is — net als SCHULD/TOEK — NIET aaneengesloten op WF-nummer: WF-WILL-21/22
 * hebben geen eigen UAT-WILL-scenario (→ gedekt door UAT-OVZ-19/20/21) en
 * ontbreken dus terecht in de catalogus voor zone WILL. De 21 criteria hier
 * zijn wél 1-op-1 met de catalogus-scenario's UAT-WILL-01..20 + UAT-WILL-23
 * (lokaal actievoorstel, backlog #886 C2c).
 */

import { describe, it, expect } from 'vitest'
import { WILL_ACCEPTANCE } from './will'
import { WILL_ENGINE_CHECKS } from './will-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De WILL-scenario's zoals de catalogus ze kent (bron van waarheid voor
 *  WELKE workflows bestaan). WILL loopt 01..20 — WF-WILL-21/22 bestaan niet
 *  als eigen catalogus-scenario (zie will.ts-header).
 *
 * `UAT-WILL-13`'s `wf`-veld in de catalogus draagt een annotatie
 * ("WF-WILL-13 — LEIDEND, volledige dekking; MIJN verwijst hierheen") —
 * genormaliseerd naar het kale WF-nummer, zodat will.ts/will-checks.ts het
 * schone 'WF-WILL-13' kunnen blijven gebruiken (spiegelt hoe UAT-OVZ-12/19/20/21
 * vergelijkbare annotaties dragen). */
const catalogWillWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'WILL')
  .map((s) => s.wf?.match(/^WF-WILL-\d+/)?.[0] ?? s.wf)
  .sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = WILL_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — will.ts is niet in sync met de test.`)
  return found
}

describe('UAT Fin — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per catalogus-WILL-scenario (21 stuks: 01..20 + 23, WF-WILL-21/22 bestaan niet in de catalogus)', () => {
    const workflows = WILL_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogWillWorkflows)
    expect(new Set(workflows).size).toBe(catalogWillWorkflows.length)
    expect(workflows.length).toBe(21)
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of WILL_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of WILL_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een WILL_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = WILL_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = WILL_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
    expect(exactWorkflows.length).toBe(12)
  })

  it('markeert de AI-gegenereerde/proces-workflows als ui-only (niet-deterministisch)', () => {
    const uiOnly = [
      'WF-WILL-01', 'WF-WILL-03', 'WF-WILL-04', 'WF-WILL-07',
      'WF-WILL-08', 'WF-WILL-09', 'WF-WILL-12', 'WF-WILL-18',
    ]
    for (const wf of uiOnly) {
      expect(criterion(wf).assertion.kind, `${wf} moet ui-only zijn`).toBe('ui-only')
    }
    expect(uiOnly.length).toBe(8)
  })
})

describe('WILL_ENGINE_CHECKS — echte/gemirrorde rekenfuncties op deterministische invoer', () => {
  for (const check of WILL_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
