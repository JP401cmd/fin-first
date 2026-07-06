/**
 * Engine-niveau toets voor de UAT-KRUIS-acceptatiecriteria (`kruis.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `kruis-checks.ts` (`KRUIS_ENGINE_CHECKS`), gedeeld met de in-app regressiesuite
 * (`lib/regression-tests/suites/uat-kruis.ts`). Deze test loopt er alleen overheen
 * en toetst `expect(actual).toBe(expected)` — één bron van waarheid, twee
 * draaimomenten (CI + /beheer/regressietest).
 *
 * De niet-exacte criteria (consistency/oracle/direction/ui-only) zijn kernel-/
 * loader-zwaar of pure UI en hebben geen vast, met-de-hand-narekenbaar cijfer; ze
 * worden hier alleen op dekking + welgevormdheid gecontroleerd.
 */

import { describe, it, expect } from 'vitest'
import { KRUIS_ACCEPTANCE, KRUIS_EXPECTED_WORKFLOW_NUMBERS } from './kruis'
import { KRUIS_ENGINE_CHECKS } from './kruis-checks'

describe('UAT KRUIS — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per verwacht UAT-KRUIS-scenario (01..26)', () => {
    const numbers = KRUIS_ACCEPTANCE.criteria.map((c) => {
      const m = /^WF-KRUIS-(\d+)$/.exec(c.workflow)
      if (!m) throw new Error(`Onverwacht workflow-id: ${c.workflow}`)
      return Number(m[1])
    })
    expect(numbers.slice().sort((a, b) => a - b)).toEqual(
      KRUIS_EXPECTED_WORKFLOW_NUMBERS.slice().sort((a, b) => a - b),
    )
    // Geen duplicaten
    expect(new Set(numbers).size).toBe(KRUIS_EXPECTED_WORKFLOW_NUMBERS.length)
  })

  it('elk criterium verwijst naar het bijbehorende UAT-KRUIS-scenario-id', () => {
    for (const c of KRUIS_ACCEPTANCE.criteria) {
      const wfNum = /^WF-KRUIS-(\d+)$/.exec(c.workflow)?.[1]
      expect(c.scenarioId, `${c.workflow} moet UAT-KRUIS-${wfNum} als scenarioId hebben`).toBe(
        `UAT-KRUIS-${wfNum}`,
      )
    }
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of KRUIS_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of KRUIS_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een KRUIS_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = KRUIS_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = KRUIS_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
  })
})

describe('KRUIS_ENGINE_CHECKS — echte canonieke rekenfuncties (delta/identiteit)', () => {
  for (const check of KRUIS_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
