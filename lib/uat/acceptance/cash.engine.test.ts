/**
 * Engine-niveau toets voor de UAT-Cash-acceptatiecriteria (`cash.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `cash-checks.ts` (`CASH_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-cash.ts`). Deze test loopt
 * er alleen overheen en toetst `expect(actual).toBe(expected)` — één bron van
 * waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * CASH is aaneengesloten 01..32 (32 catalogus-scenario's, geen verwijsregel-
 * gaten) — de grootste UAT-zone tot nu toe. WF-CASH-32 is een latere
 * dekkingscontrole-toevoeging (feature #881, "Vraag Will"-wizard), net als
 * WF-CASH-31.
 */

import { describe, it, expect } from 'vitest'
import { CASH_ACCEPTANCE } from './cash'
import { CASH_ENGINE_CHECKS } from './cash-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De CASH-scenario's zoals de catalogus ze kent (bron van waarheid voor
 *  WELKE workflows bestaan). Drie catalogus-rijen (UAT-CASH-25/26/28) hebben
 *  `wf: null` in de catalogus (de WF-code zit ingebed in `naam`, "(dekt
 *  WF-CASH-NN)") — genormaliseerd naar het kale WF-nummer. */
const catalogCashWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'CASH')
  .map((s) => s.wf ?? s.naam.match(/dekt (WF-CASH-\d+)/)?.[1] ?? s.wf)
  .sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = CASH_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — cash.ts is niet in sync met de test.`)
  return found
}

describe('UAT Cash — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per catalogus-CASH-scenario (01..32, geen gaten)', () => {
    const workflows = CASH_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogCashWorkflows)
    expect(new Set(workflows).size).toBe(catalogCashWorkflows.length)
    expect(workflows.length).toBe(32)
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of CASH_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of CASH_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een CASH_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = CASH_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = CASH_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
    expect(exactWorkflows.length).toBe(21)
  })

  it('markeert de jitter-gebonden/AI/gebonden randgevallen met de juiste kind', () => {
    // consistency (jitter-basis, delta of A=B exact)
    for (const wf of ['WF-CASH-03', 'WF-CASH-11', 'WF-CASH-14']) {
      expect(criterion(wf).assertion.kind, `${wf} moet consistency zijn`).toBe('consistency')
    }
    // ui-only (AI, verwijsregels, DB-bulk-workflows, TrueLayer-sandbox)
    for (const wf of ['WF-CASH-06', 'WF-CASH-07', 'WF-CASH-12', 'WF-CASH-17', 'WF-CASH-19', 'WF-CASH-29', 'WF-CASH-30', 'WF-CASH-32']) {
      expect(criterion(wf).assertion.kind, `${wf} moet ui-only zijn`).toBe('ui-only')
    }
  })
})

describe('CASH_ENGINE_CHECKS — echte/gemirrorde rekenfuncties op deterministische/synthetische invoer', () => {
  for (const check of CASH_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, async () => {
      const { expected, actual } = await check.run()
      expect(actual).toBe(expected)
    })
  }
})
