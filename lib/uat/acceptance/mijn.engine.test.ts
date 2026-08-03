/**
 * Engine-niveau toets voor de UAT-Mijn-acceptatiecriteria (`mijn.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `mijn-checks.ts` (`MIJN_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-mijn.ts`). Deze test loopt er
 * alleen overheen en toetst `expect(actual).toBe(expected)` — één bron van
 * waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * De niet-exacte criteria (WF-MIJN-09 consistency + de vele ui-only) hebben geen
 * vast cijfer en worden hier als bespoke kind-controle geborgd, samen met de
 * dekkingscontrole op `mijn.ts` zelf (elk MIJN-scenario uit de catalogus heeft
 * precies één criterium; de verwijsregels WF-MIJN-10/17/23 ontbreken bewust; elk
 * exact-criterium heeft expected+source).
 *
 * NB: de catalogus-`wf` van UAT-MIJN-26/29 draagt een toelichtende suffix
 * (bv. "WF-MIJN-26 — LEIDEND; …"); de dekking wordt daarom op de schone
 * `scenarioId` (UAT-MIJN-NN) vergeleken, met een aparte genormaliseerde
 * WF-token-consistentiecheck.
 */

import { describe, it, expect } from 'vitest'
import { MIJN_ACCEPTANCE } from './mijn'
import { MIJN_ENGINE_CHECKS } from './mijn-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De MIJN-scenario's zoals de catalogus ze kent (bron van waarheid voor WELKE
 *  workflows bestaan). De verwijsregels UAT-MIJN-10/17/23 staan er bewust NIET
 *  in (die wijzen door naar UAT-NAV-19/11/10). */
const catalogMijnIds = UAT_SCENARIOS.filter((s) => s.zone === 'MIJN').map((s) => s.id).sort()

/** Canonieke WF-token uit een (mogelijk gesuffixte) catalogus-`wf`-string. */
function wfToken(wf: string | null): string {
  return wf?.match(/^WF-MIJN-\d+/)?.[0] ?? wf ?? ''
}

function criterion(workflow: string): AcceptanceCriterion {
  const found = MIJN_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — mijn.ts is niet in sync met de test.`)
  return found
}

describe('UAT Mijn — acceptatiecriteria dekking', () => {
  it('is de MIJN-zone met precies 27 criteria', () => {
    expect(MIJN_ACCEPTANCE.zone).toBe('MIJN')
    expect(MIJN_ACCEPTANCE.criteria.length).toBe(27)
  })

  it('heeft precies één criterium per catalogus-MIJN-scenario (op scenarioId)', () => {
    const scenarioIds = MIJN_ACCEPTANCE.criteria.map((c) => c.scenarioId).sort()
    expect(scenarioIds).toEqual(catalogMijnIds)
    expect(new Set(scenarioIds).size).toBe(catalogMijnIds.length)
  })

  it('elk criterium.workflow matcht de canonieke WF-token van zijn catalogus-scenario', () => {
    const scenarioById = new Map(UAT_SCENARIOS.map((s) => [s.id, s]))
    for (const c of MIJN_ACCEPTANCE.criteria) {
      const scenario = scenarioById.get(c.scenarioId)
      expect(scenario, `scenario ${c.scenarioId} moet bestaan`).toBeDefined()
      expect(c.workflow).toBe(wfToken(scenario!.wf))
    }
  })

  it('bevat NIET de verwijs-workflows WF-MIJN-10/17/23 (dekken UAT-NAV-19/11/10)', () => {
    const workflows = MIJN_ACCEPTANCE.criteria.map((c) => c.workflow)
    expect(workflows).not.toContain('WF-MIJN-10')
    expect(workflows).not.toContain('WF-MIJN-17')
    expect(workflows).not.toContain('WF-MIJN-23')
    const scenarioIds = MIJN_ACCEPTANCE.criteria.map((c) => c.scenarioId)
    expect(scenarioIds).not.toContain('UAT-MIJN-10')
    expect(scenarioIds).not.toContain('UAT-MIJN-17')
    expect(scenarioIds).not.toContain('UAT-MIJN-23')
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of MIJN_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of MIJN_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een MIJN_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = MIJN_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = MIJN_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
    // MIJN is een UI-zware zone: bewust weinig exact.
    expect(exactWorkflows).toEqual(['WF-MIJN-03', 'WF-MIJN-08', 'WF-MIJN-11', 'WF-MIJN-30'])
  })

  it('markeert de kinds correct (4 exact, 1 consistency, rest ui-only)', () => {
    // Exact (hand-narekenbaar op canonieke functies/constanten).
    expect(criterion('WF-MIJN-03').assertion.kind).toBe('exact') // jaarruimte per persoon
    expect(criterion('WF-MIJN-08').assertion.kind).toBe('exact') // computeSharePct-split
    expect(criterion('WF-MIJN-11').assertion.kind).toBe('exact') // ADDON_PLANS-prijzen
    expect(criterion('WF-MIJN-30').assertion.kind).toBe('exact') // resolveExecutionMode
    // Consistency (A=B tussen voorstel- en review-telling, geen los cijfer).
    expect(criterion('WF-MIJN-09').assertion.kind).toBe('consistency')
    // Steekproef ui-only (huishouden-LIVE + pure interactie).
    expect(criterion('WF-MIJN-01').assertion.kind).toBe('ui-only')
    expect(criterion('WF-MIJN-04').assertion.kind).toBe('ui-only')
    expect(criterion('WF-MIJN-22').assertion.kind).toBe('ui-only')

    const counts = { exact: 0, consistency: 0, 'ui-only': 0, oracle: 0, direction: 0 }
    for (const c of MIJN_ACCEPTANCE.criteria) counts[c.assertion.kind]++
    expect(counts.exact).toBe(4)
    expect(counts.consistency).toBe(1)
    expect(counts['ui-only']).toBe(22)
  })
})

describe('MIJN_ENGINE_CHECKS — echte rekenfuncties/constanten op persona-brondata', () => {
  for (const check of MIJN_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, () => {
      const { expected, actual } = check.run()
      expect(actual).toBe(expected)
    })
  }
})
