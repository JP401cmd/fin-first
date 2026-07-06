/**
 * Engine-niveau toets voor de UAT-Toekomst-acceptatiecriteria (`toek.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `toek-checks.ts` (`TOEK_ENGINE_CHECKS`), gedeeld met de in-app regressiesuite
 * (`lib/regression-tests/suites/uat-toek.ts`). Deze test loopt er alleen overheen
 * en toetst `expect(actual).toBe(expected)` — één bron van waarheid, twee
 * draaimomenten (CI + /beheer/regressietest).
 *
 * De niet-exacte criteria (consistency/oracle/direction/ui-only) zijn kernel-zwaar
 * of pure UI en hebben geen vast, met-de-hand-narekenbaar cijfer; ze worden hier
 * alleen op dekking + welgevormdheid gecontroleerd.
 */

import { describe, it, expect } from 'vitest'
import { TOEK_ACCEPTANCE, TOEK_EXPECTED_WORKFLOW_NUMBERS } from './toek'
import { TOEK_ENGINE_CHECKS } from './toek-checks'

describe('UAT Toekomst — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per verwacht WF-TOEK-scenario (01..26, 28, 29, 30, 32)', () => {
    const numbers = TOEK_ACCEPTANCE.criteria.map((c) => {
      const m = /^WF-TOEK-(\d+)$/.exec(c.workflow)
      if (!m) throw new Error(`Onverwacht workflow-id: ${c.workflow}`)
      return Number(m[1])
    })
    expect(numbers.slice().sort((a, b) => a - b)).toEqual(
      TOEK_EXPECTED_WORKFLOW_NUMBERS.slice().sort((a, b) => a - b),
    )
    // Geen duplicaten
    expect(new Set(numbers).size).toBe(TOEK_EXPECTED_WORKFLOW_NUMBERS.length)
  })

  it('bevat NIET de verwijs-scenario\'s WF-TOEK-27 en WF-TOEK-31', () => {
    const workflows = TOEK_ACCEPTANCE.criteria.map((c) => c.workflow)
    expect(workflows).not.toContain('WF-TOEK-27')
    expect(workflows).not.toContain('WF-TOEK-31')
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of TOEK_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of TOEK_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een TOEK_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = TOEK_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = TOEK_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
  })
})

describe('TOEK_ENGINE_CHECKS — echte rekenfuncties/constanten op persona-brondata', () => {
  for (const check of TOEK_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
