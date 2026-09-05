import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * ADR 0129 B3 (F3a) — BRON-ANKERS op de drie loaders. `loadDashboardData` en
 * `loadCoreData` zijn functies met tientallen queries die in een unit-test niet te
 * draaien zijn (zelfde reden als core-data-loader.asset-growth-direction.test.ts); de
 * horizon-loader heeft wél een gedragstest (horizon-data-loader.anker.test.ts). Deze
 * suite eist dat álle drie het vrijheids-% via de ENE home kiezen
 * (`computeFreedomPctForPlan`) op de bridge-vlag `requiredFireIsAnchorPortfolio` +
 * `ankerMaand`, en dat geen loader nog op de smalle ADR 0127-vlag of een eigen
 * `computeRunwayCoveragePct`-aanroep zit. Ook de voortgangsmeter: buiten de bridge en
 * het typecontract leest niemand `requiredFireIsStartPortfolio` meer.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function code(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
}

const LOADERS = ['lib/dashboard-data-loader.ts', 'lib/horizon-data-loader.ts', 'lib/core-data-loader.ts']

describe('de drie loaders kiezen het vrijheids-% via één home', () => {
  it.each(LOADERS)('%s roept computeFreedomPctForPlan aan met de bridge-vlag en ankerMaand', (rel) => {
    const src = code(rel)
    expect(src.length).toBeGreaterThan(1000)
    expect(src).toContain('computeFreedomPctForPlan(')
    expect(src).toContain('requiredFireIsAnchorPortfolio === true')
    expect(src).toContain('ankerMaand')
    // Geen eigen dekkings-aanroep en geen smalle ADR 0127-vlag meer in de loaders.
    expect(src).not.toContain('computeRunwayCoveragePct(')
    expect(src).not.toContain('requiredFireIsStartPortfolio')
  })
})

describe('voortgangsmeter — requiredFireIsStartPortfolio leeft alleen nog in de bridge en het typecontract', () => {
  const toegestaan = ['lib/horizon-kernel/bridge.ts', 'lib/unified-projection.ts', 'lib/fire-simulation.ts']
  const lezers = [
    'lib/fire-target-shared.ts',
    'lib/horizon/outcome-guard.ts',
    'lib/goals/vrijheidsgetal-source.ts',
    'components/app/horizon/horizon-client.tsx',
    ...LOADERS,
  ]
  it.each(lezers)('%s leest de vlag niet meer', (rel) => {
    expect(code(rel)).not.toContain('requiredFireIsStartPortfolio')
  })
  it.each(toegestaan)('%s draagt de vlag nog (F4 verwijdert hem)', (rel) => {
    expect(code(rel)).toContain('requiredFireIsStartPortfolio')
  })
})
