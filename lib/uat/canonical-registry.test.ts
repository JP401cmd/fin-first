/**
 * Bewaakt het canonieke register (`canonical-registry.ts`) — de single source
 * voor de CANON-zone. Toetst dat het register uitputtend, intern coherent en in
 * sync met de KRUIS-zone en de engine-checks blijft.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { CANONICAL_REGISTRY, CANON_EXACT_WORKFLOWS } from './canonical-registry'
import { KRUIS_ACCEPTANCE } from './acceptance/kruis'
import { CANON_ENGINE_CHECKS } from './acceptance/canon-checks'

const ROOT = process.cwd()

describe('CANONICAL_REGISTRY — uitputtend & coherent', () => {
  it('bevat minstens 13 kerngetallen', () => {
    expect(CANONICAL_REGISTRY.length).toBeGreaterThanOrEqual(13)
  })

  it('heeft unieke id, nr en canonWorkflow', () => {
    const ids = CANONICAL_REGISTRY.map((e) => e.id)
    const nrs = CANONICAL_REGISTRY.map((e) => e.nr)
    const wfs = CANONICAL_REGISTRY.map((e) => e.canonWorkflow)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(nrs).size).toBe(nrs.length)
    expect(new Set(wfs).size).toBe(wfs.length)
  })

  it('nummert canonWorkflow (WF-CANON-NN) consistent met nr', () => {
    for (const e of CANONICAL_REGISTRY) {
      expect(e.canonWorkflow, `entry ${e.id}`).toBe(`WF-CANON-${String(e.nr).padStart(2, '0')}`)
    }
  })

  it('elke entry heeft minstens één consumer', () => {
    for (const e of CANONICAL_REGISTRY) {
      expect(e.consumers.length, `entry ${e.id} mist consumenten`).toBeGreaterThan(0)
    }
  })

  it('elke sourceFiles-verwijzing bestaat in de repo', () => {
    for (const e of CANONICAL_REGISTRY) {
      expect(e.sourceFiles.length, `entry ${e.id} mist sourceFiles`).toBeGreaterThan(0)
      for (const f of e.sourceFiles) {
        expect(existsSync(join(ROOT, f)), `bronbestand ${f} (entry ${e.id}) moet bestaan`).toBe(true)
      }
    }
  })

  it('elke exact-entry heeft een exactFixture én een engine-check', () => {
    const checkWorkflows = new Set(CANON_ENGINE_CHECKS.map((c) => c.workflow))
    for (const e of CANONICAL_REGISTRY) {
      if (e.toetsbaar !== 'exact') continue
      expect(e.exactFixture, `exact-entry ${e.id} mist exactFixture`).toBeTruthy()
      expect(checkWorkflows.has(e.canonWorkflow), `exact-entry ${e.id} mist engine-check ${e.canonWorkflow}`).toBe(true)
    }
  })

  it('CANON_EXACT_WORKFLOWS == de workflows van de engine-checks', () => {
    expect(CANON_EXACT_WORKFLOWS.slice().sort()).toEqual(CANON_ENGINE_CHECKS.map((c) => c.workflow).sort())
  })

  it('elke kruisWorkflow verwijst naar een bestaand KRUIS-criterium (of is null)', () => {
    const kruisWorkflows = new Set(KRUIS_ACCEPTANCE.criteria.map((c) => c.workflow))
    for (const e of CANONICAL_REGISTRY) {
      if (e.kruisWorkflow === null) continue
      expect(kruisWorkflows.has(e.kruisWorkflow), `kruisWorkflow ${e.kruisWorkflow} (entry ${e.id}) moet bestaan`).toBe(
        true,
      )
    }
  })

  it('markeert minstens de bewuste grondslag-verschillen (netto ≠ FIRE-eligible; 3× Box 3)', () => {
    const withDiff = CANONICAL_REGISTRY.filter((e) => e.expectedDifferences && e.expectedDifferences.length > 0)
    const ids = new Set(withDiff.map((e) => e.id))
    expect(ids.has('netto-vermogen'), 'netto-vermogen moet een expectedDifference dragen').toBe(true)
    expect(ids.has('fire-eligible-grondslag'), 'fire-eligible moet een expectedDifference dragen').toBe(true)
    expect(ids.has('box3-heffing'), 'box3 moet een expectedDifference dragen').toBe(true)
  })
})
