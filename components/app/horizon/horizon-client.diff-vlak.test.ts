import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * BRON-GRENDEL op het verschilvlak tussen de basislijn en de wat-als-lijn (ADR 0170,
 * 20 sep 2026) en op de regel dat die lijn verschijnt zodra je aan een knop draait.
 *
 * WAAROM EEN BRON-TEST: het vlak is een SVG-`<path>` achter twee andere paden. Een
 * DOM-test op de grafiek zou vooral de geometrie-mock testen; wat hier stuk kan gaan is de
 * BEDRADING — dat de vlakken uit de pure functie komen (en niet uit een tweede afleiding in
 * de render-laag), dat ze op dezelfde grondslag rekenen als de hoofdlijn, en dat alleen de
 * LIVE wat-als een vlak krijgt. Het gedrag van de functie zelf staat in
 * `lib/horizon/scenario-diff-vlakken.test.ts`.
 */

const lees = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

describe('het verschilvlak komt uit de pure functie (ADR 0170)', () => {
  it('de geometrie roept buildDiffVlakken aan op de hoofdlijn en de wat-als-overlay', () => {
    const src = lees('lib', 'horizon', 'sim-chart-geometry.ts')
    expect(src).toContain("import { buildDiffVlakken } from './scenario-diff-vlakken'")
    const start = src.indexOf('const scenarioDiffVlakken')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, src.indexOf('// Household-partner-overlay-paden', start))
    // ÉÉN grondslag: `allPts` volgt `effectivePrimaryBasis`, en de overlay komt uit dezelfde
    // keuze. Een vlak tussen netto vermogen en liquide zou een verschil tonen dat er niet is.
    expect(blok).toContain('buildDiffVlakken(allPts, watAls.points')
    // Alleen de LIVE wat-als-lijn; opgeslagen ghost-scenario's krijgen geen vlak.
    expect(blok).toContain("o.variant === 'scenario'")
    // Geen eigen kruisingsberekening of pad-rekenkunde in de geometrie.
    expect(blok).not.toMatch(/Math\.abs|interpol|kruis/i)
  })

  it('de render-laag tekent de vlakken achter de lijnen, met de semantische tokens', () => {
    const src = lees('components', 'app', 'horizon', 'chart-static-layers.tsx')
    const start = src.indexOf('scenarioDiffVlakken.map')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, start + 800)
    // Groen = de wat-als levert meer op, rood = minder. Semantiek, dus de value-change-tokens
    // en nooit een module-accent (dat is instelbaar en zou de betekenis laten verschuiven).
    expect(blok).toContain("vlak.kant === 'boven' ? 'var(--positive)' : 'var(--negative)'")
    expect(blok).not.toMatch(/module-active|emerald-|red-|green-/)
    // Vóór de scenario-lijnen in de DOM ⇒ eronder in de tekening; de lijnen blijven scherp.
    expect(start).toBeLessThan(src.indexOf('{scenarioPaths.map'))
  })
})

describe('de wat-als-lijn verschijnt zodra je aan een knop draait', () => {
  it('één effect op de overgang naar een actieve verkenning, met een ref als geheugen', () => {
    const src = lees('components', 'app', 'horizon', 'horizon-client.tsx')
    const start = src.indexOf('const hadScenarioRef')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, start + 400)
    expect(blok).toContain('if (!had && hasScenario) setShowScenarioLine(true)')
    expect(blok).toContain('}, [hasScenario])')
    // Niet bij ELKE knopbeweging aanzetten: de enige aanroep in dit effect staat achter de
    // overgangs-guard, zodat een bewuste "uit" van de gebruiker blijft staan zolang de
    // verkenning loopt.
    expect(blok.match(/setShowScenarioLine\(true\)/g) ?? []).toHaveLength(1)
  })
})
