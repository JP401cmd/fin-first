import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Borgt de demo-vlag-levenscyclus op het admin-seed-pad (bug 13 jul 2026):
 * elke persona-seed markeert het account als demo (`is_demo_user: true`),
 * zodat een latere onboarding met eigen gegevens weet dat er persona-
 * restanten te wissen zijn. Het onboarding-seed-pad en /api/activate zetten
 * de vlag al; het admin-pad (/beheer/testdata) was het gat — een superadmin
 * die zijn eigen account seedt, kreeg persona-data zónder demo-markering,
 * waardoor de restanten-wipe bij her-onboarding nooit vuurde.
 */
describe('admin seed — persona-seed markeert account als demo', () => {
  const routePath = path.resolve(__dirname, 'route.ts')
  const source = readFileSync(routePath, 'utf8')
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  it('zet is_demo_user: true in de profiel-update ná het seeden', () => {
    expect(codeOnly).toMatch(/is_demo_user:\s*true/)
    // Zelfde update als de last_known_phase-reset — één write, na de seed.
    const idx = codeOnly.indexOf('is_demo_user: true')
    const seedIdx = codeOnly.indexOf('seedPersonaData(')
    expect(seedIdx).toBeGreaterThan(-1)
    expect(idx).toBeGreaterThan(seedIdx)
  })
})
