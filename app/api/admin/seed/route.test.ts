import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'

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
  // CRLF-veilig: op een verse Windows-checkout gaat de regelgebaseerde strip
  // hieronder stil kapot zonder normalisatie (zie lib/test-utils/read-source.ts).
  const source = readSourceLF(routePath)
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

/**
 * Borgt de schema-drift fail-safe (infra-S1 uit de UAT-run 17 jul): de seed wiste
 * eerst álle accountdata en faalde daarna op een ontbrekende kolom (schema-drift),
 * waardoor het account leeg-maar-niet-hersteld achterbleef. De route MOET het schema
 * valideren VÓÓR de destructieve wipe en bij `SeedSchemaError` stoppen zónder te
 * wissen. `assertSeedSchema` zelf is los getest (lib/seed-persona.schema-preflight.test.ts);
 * deze test bewaakt de orkestratie-garantie op routeniveau: preflight vóór wipe,
 * en op drift een `return` die `deleteAllUserData` overslaat.
 */
describe('admin seed — schema-drift preflight slaat de wipe over', () => {
  const routePath = path.resolve(__dirname, 'route.ts')
  const source = readSourceLF(routePath)
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  it('roept assertSeedSchema aan VÓÓR deleteAllUserData', () => {
    const preflightIdx = codeOnly.indexOf('assertSeedSchema(')
    const wipeIdx = codeOnly.indexOf('deleteAllUserData(')
    expect(preflightIdx).toBeGreaterThan(-1)
    expect(wipeIdx).toBeGreaterThan(-1)
    expect(preflightIdx).toBeLessThan(wipeIdx)
  })

  it('stopt met een return in de SeedSchemaError-tak vóór de wipe (niets gewist)', () => {
    // De catch rond de preflight herkent SeedSchemaError en verlaat de handler.
    const branchIdx = codeOnly.indexOf('preErr instanceof SeedSchemaError')
    expect(branchIdx).toBeGreaterThan(-1)
    const wipeIdx = codeOnly.indexOf('deleteAllUserData(')
    // Tussen de drift-detectie en de wipe staat een return: de wipe wordt overgeslagen.
    const returnIdx = codeOnly.indexOf('return', branchIdx)
    expect(returnIdx).toBeGreaterThan(-1)
    expect(returnIdx).toBeLessThan(wipeIdx)
  })
})
