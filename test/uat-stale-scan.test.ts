import { describe, it, expect } from 'vitest'
// Zero-dependency Node-scanner; de test importeert de pure kern (main() draait
// niet bij import — alleen bij directe CLI-aanroep).
import {
  extractSourceFiles,
  extractCriteria,
  computeImpact,
  isZoneAcceptanceFile,
} from '../scripts/uat/stale-scan.mjs'

describe('uat-stale-scan — extractSourceFiles', () => {
  it('pult repo-relatieve bronbestanden uit een source-string en strip #functie', () => {
    const s =
      'components/check/intake/steps/step-inkomen.tsx (jaarpreview) + lib/format.ts#dailyExpenseRate — zie start-checks.ts'
    const files = extractSourceFiles(s)
    expect(files).toContain('components/check/intake/steps/step-inkomen.tsx')
    expect(files).toContain('lib/format.ts')
    // het #functie-suffix hoort NIET in het pad te zitten
    expect(files).not.toContain('lib/format.ts#dailyExpenseRate')
  })

  it('herkent route-group-paden met haakjes', () => {
    const s = 'app/(onboarding)/onboarding/page.tsx#netWorthForKlaar'
    expect(extractSourceFiles(s)).toEqual(['app/(onboarding)/onboarding/page.tsx'])
  })

  it('negeert prozabronnen zonder bestandspad (ui-only-criteria)', () => {
    expect(extractSourceFiles('zuivere navigatie/redirect-mapping, geen cijfermatige uitkomst')).toEqual([])
  })
})

describe('uat-stale-scan — extractCriteria', () => {
  it('leest workflow/scenarioId/source per criterium (single én double quotes)', () => {
    const text = `
      import type { AcceptanceCriterion } from './types'
      const criteria: AcceptanceCriterion[] = [
        { workflow: 'WF-START-04', scenarioId: 'UAT-START-04',
          assertion: { kind: 'exact', source: "lib/subscription-catalog.ts#ADDON_PLANS" } },
        { workflow: 'WF-START-06', scenarioId: 'UAT-START-06',
          assertion: { kind: 'exact', source: 'components/check/intake/steps/step-buffer.tsx + lib/format.ts#x' } },
      ]`
    const c = extractCriteria(text, 'START')
    expect(c).toHaveLength(2)
    expect(c[0]).toMatchObject({
      zone: 'START',
      workflow: 'WF-START-04',
      scenarioId: 'UAT-START-04',
      sourceFiles: ['lib/subscription-catalog.ts'],
    })
    expect(c[1].sourceFiles).toEqual(
      expect.arrayContaining(['components/check/intake/steps/step-buffer.tsx', 'lib/format.ts']),
    )
  })

  it('splitst niet op het woord "workflow" in proza/commentaar zonder aanhalingsteken', () => {
    const text = `
      /** De workflow uit Deel 1 beschrijft de flow; zie WF-BEZIT-01. */
      const criteria = [
        { workflow: 'WF-BEZIT-01', scenarioId: 'UAT-BEZIT-01',
          assertion: { kind: 'ui-only', source: 'lib/effective-financials.ts#netWorth' } },
      ]`
    const c = extractCriteria(text, 'BEZIT')
    expect(c).toHaveLength(1)
    expect(c[0].workflow).toBe('WF-BEZIT-01')
  })
})

describe('uat-stale-scan — computeImpact', () => {
  const criteria = [
    { zone: 'START', workflow: 'WF-START-04', scenarioId: 'UAT-START-04', sourceFiles: ['lib/subscription-catalog.ts'] },
    { zone: 'START', workflow: 'WF-START-06', scenarioId: 'UAT-START-06', sourceFiles: ['lib/format.ts'] },
  ]

  it('matcht een gewijzigd bronbestand tegen het juiste criterium', () => {
    const r = computeImpact(criteria, ['lib/format.ts', 'README.md'], [])
    expect(r.anyImpact).toBe(true)
    expect(r.affectedCriteria).toEqual([
      { zone: 'START', workflow: 'WF-START-06', scenarioId: 'UAT-START-06', matchedFiles: ['lib/format.ts'] },
    ])
  })

  it('geen match op een ongerelateerde wijziging = geen impact', () => {
    const r = computeImpact(criteria, ['docs/README.md'], [])
    expect(r.anyImpact).toBe(false)
    expect(r.affectedCriteria).toEqual([])
  })

  it('nieuw app-oppervlak zonder criterium-referentie = newSurface', () => {
    const withSurface = [
      { zone: 'BEZIT', workflow: 'WF-BEZIT-01', scenarioId: 'UAT-BEZIT-01', sourceFiles: ['app/(app)/bezit/page.tsx'] },
    ]
    const r = computeImpact(withSurface, ['app/(app)/nieuw/page.tsx'], ['app/(app)/nieuw/page.tsx'])
    expect(r.newSurfaces).toEqual([{ path: 'app/(app)/nieuw/page.tsx' }])
    expect(r.anyImpact).toBe(true)
  })

  it('een gewijzigd bestaand oppervlak dat wél gedekt is telt niet als newSurface', () => {
    const withSurface = [
      { zone: 'BEZIT', workflow: 'WF-BEZIT-01', scenarioId: 'UAT-BEZIT-01', sourceFiles: ['app/(app)/bezit/page.tsx'] },
    ]
    const r = computeImpact(withSurface, ['app/(app)/bezit/page.tsx'], ['app/(app)/bezit/page.tsx'])
    expect(r.newSurfaces).toEqual([])
    expect(r.affectedCriteria).toHaveLength(1)
  })
})

describe('uat-stale-scan — isZoneAcceptanceFile', () => {
  it('accepteert <zone>.ts en weert types/-checks/.engine.test', () => {
    expect(isZoneAcceptanceFile('start.ts')).toBe(true)
    expect(isZoneAcceptanceFile('bezit.ts')).toBe(true)
    expect(isZoneAcceptanceFile('types.ts')).toBe(false)
    expect(isZoneAcceptanceFile('start-checks.ts')).toBe(false)
    expect(isZoneAcceptanceFile('start.engine.test.ts')).toBe(false)
  })
})
