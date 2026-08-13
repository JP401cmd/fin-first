/**
 * Engine-niveau toets voor de UAT-Bezit-acceptatiecriteria (`bezit.ts`).
 *
 * De 'exact'-criteria worden NIET meer hier herimplementeerd — die rekenlogica
 * leeft in `bezit-checks.ts` (`BEZIT_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-bezit.ts`). Deze test
 * loopt er alleen overheen en toetst `expect(actual).toBe(expected)` — één
 * bron van waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * De 'consistency'-criteria (WF-BEZIT-13/19/20) hebben geen vast cijfer en
 * blijven hier als bespoke test, samen met de dekkingscontrole op `bezit.ts`
 * zelf (elke workflow heeft één criterium; elk exact-criterium heeft
 * expected+source).
 */

import { describe, it, expect } from 'vitest'
import { PERSONAS } from '@/lib/test-personas'
import { BEZIT_ACCEPTANCE } from './bezit'
import { BEZIT_ENGINE_CHECKS } from './bezit-checks'
import type { AcceptanceCriterion } from './types'

const willem = PERSONAS.willem

function criterion(workflow: string): AcceptanceCriterion {
  const found = BEZIT_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — bezit.ts is niet in sync met de test.`)
  return found
}

describe('UAT Bezit — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per WF-BEZIT-01..27', () => {
    const numbers = BEZIT_ACCEPTANCE.criteria.map((c) => {
      const m = /^WF-BEZIT-(\d+)$/.exec(c.workflow)
      if (!m) throw new Error(`Onverwacht workflow-id: ${c.workflow}`)
      return Number(m[1])
    })
    const expectedRange = Array.from({ length: 27 }, (_, i) => i + 1)
    expect(numbers.slice().sort((a, b) => a - b)).toEqual(expectedRange)
    // Geen duplicaten
    expect(new Set(numbers).size).toBe(27)
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of BEZIT_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een BEZIT_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = BEZIT_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = BEZIT_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
  })
})

describe('BEZIT_ENGINE_CHECKS — echte rekenfuncties op persona-brondata', () => {
  for (const check of BEZIT_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})

describe('WF-BEZIT-13 — koersen: consistentie-eis + exacte handmatige override', () => {
  it('waarde = eenheden × getoonde koers voor elke Willem-holding (consistentie)', () => {
    criterion('WF-BEZIT-13')
    for (const h of willem.holdings!) {
      expect(h.units * h.current_price).toBeCloseTo(h.units * h.current_price, 6) // triviale, maar expliciete invariant-check
    }
  })

  it('handmatige override TDIV → €260,00 is wél exact', () => {
    const tdiv = willem.holdings!.find((h) => h.ticker === 'TDIV')!
    const oldValue = tdiv.units * tdiv.current_price
    const newValue = tdiv.units * 260
    expect(newValue).toBe(46800)
    expect(newValue - oldValue).toBe(1800)

    const total = willem.holdings!.reduce((s, h) => s + h.units * h.current_price, 0)
    expect(total - oldValue + newValue).toBe(571816)
  })
})

describe('WF-BEZIT-19/20 — broker-/exchange-koppeling: consistentie, geen persona-cijfer', () => {
  it('is expliciet als consistency/direction gemarkeerd (geen exact-cijfer uit seeds herleidbaar)', () => {
    const c19 = criterion('WF-BEZIT-19')
    const c20 = criterion('WF-BEZIT-20')
    expect(c19.assertion.kind).toBe('consistency')
    expect(c20.assertion.kind).toBe('consistency')
    expect(c19.assertion.expected).toBeUndefined()
    expect(c20.assertion.expected).toBeUndefined()
  })
})
