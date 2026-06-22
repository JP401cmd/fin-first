import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Borgt de keuze (kaart "Wil je de standaard van de huis-strategie: niet
 * meerekenen maken na onboarding", Optie A): nieuwe accounts krijgen ná
 * onboarding expliciet `housing_strategy_config = { mode: 'exclude_from_fire' }`
 * weggeschreven — op ALLE DRIE de write-paden in de onboarding-route:
 *   1. de RPC-payload (`buildRpcPayload`),
 *   2. de post-RPC update,
 *   3. het non-RPC fallback-pad.
 *
 * Deze test scant de bronregels (commentaar gestript) i.p.v. de hele
 * Next.js-handler te importeren — die trekt de AI-extractielaag mee. Zo is de
 * assertie op de write-VALUES robuust en zonder zware afhankelijkheden.
 *
 * Bewust NIET geborgd hier: `DEFAULT_HOUSING_STRATEGY` (resolver-fallback) en de
 * DB-kolom-default blijven `include_full` — die worden door hun eigen tests
 * bewaakt (`test/housing-strategy.test.ts`). Bestaande accounts blijven dus
 * ongemoeid; alleen verse onboardings schrijven `exclude_from_fire`.
 */
describe('onboarding save-own-data — housing strategy default', () => {
  const routePath = path.resolve(__dirname, 'route.ts')
  const source = readFileSync(routePath, 'utf8')

  // Strip line- en block-commentaar zodat we alleen écht uitgevoerde code zien.
  // (De comments noemen bewust óók `include_full` voor de fallback-uitleg.)
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  it('schrijft op alle drie de write-paden housing_strategy_config = exclude_from_fire', () => {
    const writes = codeOnly.match(/housing_strategy_config[^=:]*[=:]\s*\{\s*mode:\s*'([a-z_]+)'/g) ?? []

    // Precies drie expliciete writes: RPC-payload, post-RPC update, non-RPC fallback.
    expect(writes).toHaveLength(3)
    for (const write of writes) {
      expect(write).toContain("mode: 'exclude_from_fire'")
    }
  })

  it('schrijft nergens (in uitgevoerde code) nog include_full als onboarding-default', () => {
    expect(codeOnly).not.toContain("housing_strategy_config: { mode: 'include_full' }")
    expect(codeOnly).not.toContain("housing_strategy_config = { mode: 'include_full' }")
  })
})
