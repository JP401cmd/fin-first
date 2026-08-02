import { describe, it, expect } from 'vitest'
// Zero-dependency Node-scanner; de test importeert de pure kern (main() draait
// niet bij import — alleen bij directe CLI-aanroep).
import {
  extractSourceFiles,
  extractSourceRefs,
  symbolFromFuncContext,
  changedSymbolsByFile,
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

describe('uat-stale-scan — extractSourceRefs (symboolniveau)', () => {
  it('houdt het #symbool vast naast het bestandspad', () => {
    expect(extractSourceRefs('lib/sale-config.ts#parseSaleConfig — parse-met-fallback')).toEqual([
      { file: 'lib/sale-config.ts', symbols: ['parseSaleConfig'] },
    ])
  })

  it('leest een plus-keten als meerdere symbolen in hetzelfde bestand', () => {
    expect(
      extractSourceRefs('lib/budget-rollover.ts#computeRollover + getEffectiveLimit + getPreviousPeriod op invoer'),
    ).toEqual([
      { file: 'lib/budget-rollover.ts', symbols: ['computeRollover', 'getEffectiveLimit', 'getPreviousPeriod'] },
    ])
  })

  it('slurpt het pad van een VOLGEND bestand niet op als symbool', () => {
    // Zonder de `(?![\w$/])`-lookahead werd `lib` hier een symbool van a.ts —
    // een naam die nooit bestaat, dus het criterium zou als 'unlikely' worden
    // weggesorteerd terwijl het gewoon geraakt is. Dat is de fout-negatief die
    // deze scanner niet mag maken.
    expect(extractSourceRefs('lib/a.ts#foo + lib/b.ts#bar')).toEqual([
      { file: 'lib/a.ts', symbols: ['foo'] },
      { file: 'lib/b.ts', symbols: ['bar'] },
    ])
  })

  it('een bestand zonder #suffix krijgt een lege symbolenlijst (= bestandsniveau)', () => {
    expect(extractSourceRefs('app/(app)/core/assets/revalue/page.tsx — som van per-rij delta’s')).toEqual([
      { file: 'app/(app)/core/assets/revalue/page.tsx', symbols: [] },
    ])
  })

  it('bestandsniveau wint als hetzelfde bestand ook zonder symbool genoemd wordt', () => {
    expect(extractSourceRefs('lib/format.ts#dailyExpenseRate en verderop weer lib/format.ts zelf')).toEqual([
      { file: 'lib/format.ts', symbols: [] },
    ])
  })
})

describe('uat-stale-scan — symbolFromFuncContext', () => {
  it('leest de naam uit de gangbare TypeScript-declaraties', () => {
    expect(symbolFromFuncContext('export function dailyExpenseRate(x: number) {')).toBe('dailyExpenseRate')
    expect(symbolFromFuncContext('export async function loadThing() {')).toBe('loadThing')
    expect(symbolFromFuncContext('const ADDON_PLANS = [')).toBe('ADDON_PLANS')
    expect(symbolFromFuncContext('export type BankLinkHealth = {')).toBe('BankLinkHealth')
    expect(symbolFromFuncContext('export interface Asset {')).toBe('Asset')
  })

  it('geeft null bij niets herkenbaars — de aanroeper valt dan terug op bestandsniveau', () => {
    expect(symbolFromFuncContext('')).toBeNull()
    expect(symbolFromFuncContext('  }')).toBeNull()
    expect(symbolFromFuncContext(undefined)).toBeNull()
  })
})

describe('uat-stale-scan — changedSymbolsByFile', () => {
  const diff = [
    'diff --git a/lib/format.ts b/lib/format.ts',
    '--- a/lib/format.ts',
    '+++ b/lib/format.ts',
    '@@ -10,0 +11,2 @@ export function formatCurrency(v: number) {',
    '+  // iets',
    '@@ -40,1 +42,1 @@ export function dailyExpenseRate(v: number) {',
    '+  return v / 30',
  ].join('\n')

  it('bundelt de gewijzigde symbolen per bestand uit de hunk-context', () => {
    const map = changedSymbolsByFile((args: string[]) => (args.includes('--cached') ? '' : diff), 'master')
    expect(map).not.toBeNull()
    expect([...(map as Map<string, Set<string>>).get('lib/format.ts')!].sort()).toEqual([
      'dailyExpenseRate',
      'formatCurrency',
    ])
  })

  it('geeft null als git niets oplevert, zodat de aanroeper ruim terugvalt', () => {
    expect(changedSymbolsByFile(() => '', 'master')).toBeNull()
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
    // `confidence: 'file'` hoort er sinds de symboolniveau-verfijning bij:
    // zonder symboolinfo blijft de match op bestandsniveau, en dat is bewust de
    // ruime uitkomst.
    expect(r.affectedCriteria).toEqual([
      {
        zone: 'START',
        workflow: 'WF-START-06',
        scenarioId: 'UAT-START-06',
        matchedFiles: ['lib/format.ts'],
        confidence: 'file',
      },
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

describe('uat-stale-scan — computeImpact op symboolniveau', () => {
  const refCriteria = [
    {
      zone: 'START',
      workflow: 'WF-START-06',
      scenarioId: 'UAT-START-06',
      sourceRefs: [{ file: 'lib/format.ts', symbols: ['dailyExpenseRate'] }],
    },
    {
      zone: 'START',
      workflow: 'WF-START-07',
      scenarioId: 'UAT-START-07',
      sourceRefs: [{ file: 'lib/format.ts', symbols: ['formatCurrency'] }],
    },
  ]

  it('markeert alleen het criterium waarvan de functie echt in de diff zit', () => {
    const r = computeImpact(refCriteria, ['lib/format.ts'], [], { 'lib/format.ts': ['dailyExpenseRate'] })
    const byWorkflow = Object.fromEntries(r.affectedCriteria.map((a: any) => [a.workflow, a.confidence]))
    expect(byWorkflow).toEqual({ 'WF-START-06': 'symbol', 'WF-START-07': 'unlikely' })
  })

  it('onderdrukt niets — ook een "unlikely" criterium blijft gerapporteerd en telt mee', () => {
    // Dit is de kern van het ontwerp: de verfijning SORTEERT, hij filtert niet.
    // Een gemist verouderd criterium is duurder dan een overbodige melding.
    const r = computeImpact(refCriteria, ['lib/format.ts'], [], { 'lib/format.ts': ['dailyExpenseRate'] })
    expect(r.affectedCriteria).toHaveLength(2)
    expect(r.anyImpact).toBe(true)
  })

  it('valt terug op bestandsniveau als git geen symboolinfo gaf', () => {
    const r = computeImpact(refCriteria, ['lib/format.ts'], [], null)
    expect(r.affectedCriteria.map((a: any) => a.confidence)).toEqual(['file', 'file'])
  })

  it('valt terug op bestandsniveau als het criterium geen #symbool noemt', () => {
    const noSymbol = [
      { zone: 'BEZIT', workflow: 'WF-BEZIT-09', scenarioId: null, sourceRefs: [{ file: 'lib/format.ts', symbols: [] }] },
    ]
    const r = computeImpact(noSymbol, ['lib/format.ts'], [], { 'lib/format.ts': ['dailyExpenseRate'] })
    expect(r.affectedCriteria[0].confidence).toBe('file')
  })

  it('accepteert een Map net zo goed als een gewoon object', () => {
    const r = computeImpact(refCriteria, ['lib/format.ts'], [], new Map([['lib/format.ts', new Set(['formatCurrency'])]]))
    const byWorkflow = Object.fromEntries(r.affectedCriteria.map((a: any) => [a.workflow, a.confidence]))
    expect(byWorkflow).toEqual({ 'WF-START-06': 'unlikely', 'WF-START-07': 'symbol' })
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
