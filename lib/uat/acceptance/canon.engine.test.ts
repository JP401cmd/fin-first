/**
 * Engine-niveau toets voor de UAT-CANON-acceptatiecriteria (`canon.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `canon-checks.ts` (`CANON_ENGINE_CHECKS`), gedeeld met de in-app regressiesuite
 * (`lib/regression-tests/suites/uat-canon.ts`). Deze test loopt er alleen overheen
 * en toetst `expect(actual).toBe(expected)` — één bron van waarheid, twee
 * draaimomenten (CI + /beheer/regressietest).
 *
 * De niet-exacte criteria (consistency/oracle) zijn loader-/kernel-zwaar of
 * categorisch en hebben geen vast, met-de-hand-narekenbaar cijfer; ze worden hier
 * alleen op dekking + welgevormdheid gecontroleerd.
 */

import { describe, it, expect } from 'vitest'
import { CANON_ACCEPTANCE, CANON_EXPECTED_WORKFLOW_NUMBERS } from './canon'
import { CANON_ENGINE_CHECKS } from './canon-checks'

describe('UAT CANON — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per verwacht UAT-CANON-scenario (01..15)', () => {
    const numbers = CANON_ACCEPTANCE.criteria.map((c) => {
      const m = /^WF-CANON-(\d+)$/.exec(c.workflow)
      if (!m) throw new Error(`Onverwacht workflow-id: ${c.workflow}`)
      return Number(m[1])
    })
    expect(numbers.slice().sort((a, b) => a - b)).toEqual(
      CANON_EXPECTED_WORKFLOW_NUMBERS.slice().sort((a, b) => a - b),
    )
    // Geen duplicaten
    expect(new Set(numbers).size).toBe(CANON_EXPECTED_WORKFLOW_NUMBERS.length)
  })

  it('elk criterium verwijst naar het bijbehorende UAT-CANON-scenario-id', () => {
    for (const c of CANON_ACCEPTANCE.criteria) {
      const wfNum = /^WF-CANON-(\d+)$/.exec(c.workflow)?.[1]
      expect(c.scenarioId, `${c.workflow} moet UAT-CANON-${wfNum} als scenarioId hebben`).toBe(
        `UAT-CANON-${wfNum}`,
      )
    }
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of CANON_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of CANON_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een CANON_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = CANON_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = CANON_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
  })

  it('dekt minimaal de door de kaart vereiste canonieke functies', () => {
    // savingsRateFromAggregates, computeFreedomProgress, getFireEligibleNetWorth,
    // computeEffectiveSwr, dailyExpenseRate+calculateFreedomTime, jaarruimteBesparing, calculateBox3.
    const required = ['WF-CANON-02', 'WF-CANON-03', 'WF-CANON-04', 'WF-CANON-05', 'WF-CANON-06', 'WF-CANON-09', 'WF-CANON-10']
    const present = new Set(CANON_ENGINE_CHECKS.map((c) => c.workflow))
    for (const wf of required) {
      expect(present.has(wf), `${wf} moet een engine-check hebben`).toBe(true)
    }
  })
})

describe('CANON_ENGINE_CHECKS — echte canonieke rekenfuncties (identiteit/fixture)', () => {
  for (const check of CANON_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
