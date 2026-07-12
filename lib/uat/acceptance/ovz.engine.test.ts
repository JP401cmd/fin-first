/**
 * Engine-niveau toets voor de UAT-Ovz-acceptatiecriteria (`ovz.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `ovz-checks.ts` (`OVZ_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-ovz.ts`). Deze test loopt
 * er alleen overheen en toetst `expect(actual).toBe(expected)` — één bron van
 * waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * OVZ is — net als SCHULD/TOEK/WILL — NIET aaneengesloten op WF-nummer:
 * WF-OVZ-17/18 hebben geen eigen UAT-OVZ-scenario (→ gedekt door UAT-NAV-19
 * resp. UAT-NAV-10) en ontbreken dus terecht in de catalogus voor zone OVZ.
 * De 19 criteria hier zijn wél 1-op-1 met de 19 catalogus-scenario's
 * (UAT-OVZ-01..16, 19..21).
 */

import { describe, it, expect } from 'vitest'
import { OVZ_ACCEPTANCE } from './ovz'
import { OVZ_ENGINE_CHECKS } from './ovz-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De OVZ-scenario's zoals de catalogus ze kent. WF-OVZ-12/19/20/21 dragen een
 *  annotatie in hun `wf`-veld ("... genormaliseerd" / "..., leidend") —
 *  genormaliseerd naar het kale WF-nummer (spiegelt WILL-13). */
const catalogOvzWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'OVZ')
  .map((s) => s.wf?.match(/^WF-OVZ-\d+/)?.[0] ?? s.wf)
  .sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = OVZ_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — ovz.ts is niet in sync met de test.`)
  return found
}

describe('UAT Ovz — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per catalogus-OVZ-scenario (19 stuks, WF-OVZ-17/18 bestaan niet in de catalogus)', () => {
    const workflows = OVZ_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogOvzWorkflows)
    expect(new Set(workflows).size).toBe(catalogOvzWorkflows.length)
    expect(workflows.length).toBe(19)
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of OVZ_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of OVZ_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een OVZ_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = OVZ_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = OVZ_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
    expect(exactWorkflows.length).toBe(10)
  })

  it('markeert de kernel-/directionele/config-workflows met de juiste kind', () => {
    for (const wf of ['WF-OVZ-05', 'WF-OVZ-07']) {
      expect(criterion(wf).assertion.kind, `${wf} moet oracle zijn`).toBe('oracle')
    }
    expect(criterion('WF-OVZ-04').assertion.kind).toBe('direction')
    for (const wf of ['WF-OVZ-08', 'WF-OVZ-11', 'WF-OVZ-12', 'WF-OVZ-13', 'WF-OVZ-14', 'WF-OVZ-16']) {
      expect(criterion(wf).assertion.kind, `${wf} moet ui-only zijn`).toBe('ui-only')
    }
  })
})

describe('OVZ_ENGINE_CHECKS — echte/gemirrorde rekenfuncties op deterministische invoer', () => {
  for (const check of OVZ_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
