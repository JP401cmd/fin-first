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

  /**
   * BEWUST AANGEPAST op 20 sep 2026 (eigenaarsbesluit). Deze assertie pinde de kleur als
   * letterlijke ternary in de JSX: `kant === 'boven' ? --positive : --negative`. Sinds het
   * besluit "onder de basislijn is alleen rood als het plan niet reikt" is de kleur een
   * beslisregel met een tweede ingang (de zone van het plan), en die hoort puur en toetsbaar
   * te zijn — niet in de JSX. De grendel verhuist daarom van de ternary naar de aanroep van
   * `vlakKleurVoor`; de takken zélf staan in `lib/horizon/scenario-diff-vlakken.test.ts`.
   * Wat de grendel bleef bewaken, bewaakt hij nog: één bron voor de kleur, semantische
   * tokens, geen module-accent, en het vlak achter de lijnen.
   */
  it('de render-laag tekent de vlakken achter de lijnen, met de semantische tokens', () => {
    const src = lees('components', 'app', 'horizon', 'chart-static-layers.tsx')
    const start = src.indexOf('scenarioDiffVlakken.map')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, start + 800)
    // Eén bron voor de kleur: de pure beslisregel, met de plan-zone als tweede ingang.
    expect(blok).toContain('fill={vlakKleurVoor(vlak.kant, planZone)}')
    expect(blok).not.toMatch(/module-active|emerald-|red-|green-/)
    // Vóór de scenario-lijnen in de DOM ⇒ eronder in de tekening; de lijnen blijven scherp.
    expect(start).toBeLessThan(src.indexOf('{scenarioPaths.map'))
  })

  it('de kleurregel staat in de pure module, met alleen semantische tokens', () => {
    const src = lees('lib', 'horizon', 'scenario-diff-vlakken.ts')
    const start = src.indexOf('export function vlakKleurVoor')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, start + 300)
    expect(blok).toMatch(/var\(--positive\)/)
    expect(blok).toMatch(/var\(--negative\)/)
    // Neutraal = een bestaande inkt-token; nooit een module-accent (instelbaar) of losse hex.
    expect(blok).toMatch(/var\(--ink-3\)/)
    expect(blok).not.toMatch(/module-active|#[0-9a-f]{3,6}/i)
  })
})

describe('de nalatenschap-bol hangt aan de wat-als-lijn (eigenaarsbesluit 20 sep 2026)', () => {
  it('de geometrie verankert de bol op het laatste punt van de LIVE wat-als, met de zone als prop', () => {
    const src = lees('lib', 'horizon', 'sim-chart-geometry.ts')
    const start = src.indexOf('const nalatenschapDot')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, src.indexOf('// Household-partner-overlay-paden', start))
    // Alleen de live wat-als-lijn — een ghost-scenario krijgt geen bol.
    expect(blok).toContain("o.variant === 'scenario'")
    // Eén verankering, dezelfde als de FIRE-/AOW-stip: xScale/yScale op een punt ván de lijn.
    expect(blok).toContain('PAD.left + xScale(')
    expect(blok).toContain('PAD.top + yScale(')
    // Het oordeel komt binnen als prop; de geometrie velt er geen.
    expect(blok).toContain('zone: nalatenschapMarker.zone')
    // ... en de geometrie velt er zelf geen: geen zone-afleiding in deze laag.
    expect(blok).not.toMatch(/zoneVan/)
  })

  it('de host levert de zone uit dezelfde grenzen als de knop zelf', () => {
    const src = lees('components', 'app', 'horizon', 'horizon-client.tsx')
    const start = src.indexOf('const nalatenschapMarker')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, start + 400)
    expect(blok).toContain('labKnoppen.nalatenschap')
    expect(blok).toContain('zoneVanWaarde(knop.value, knop.grenzen, HEFBOOM_RICHTING.nalatenschap)')
    // Geen knop (eind-vorm perpetual) ⇒ geen marker.
    expect(blok).toContain('if (!knop) return undefined')
  })

  it('de render-laag kleurt de bol met de score-ladder en maskeert het bedrag', () => {
    const src = lees('components', 'app', 'horizon', 'chart-static-layers.tsx')
    const start = src.indexOf('{nalatenschapDot && (')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, start + 2000)
    expect(blok).toContain('ZONE_VULLING[nalatenschapDot.zone]')
    // Bedrag volgt de privacy-weergave, en valt op een smal scherm weg (de bol blijft).
    expect(blok).toContain('{!masked && isDesktop && (')
    // Ná de wat-als-lijn in de DOM ⇒ de bol ligt óp de lijn, niet erachter.
    expect(start).toBeGreaterThan(src.indexOf('{scenarioPaths.map'))
  })

  it('de score-ladder-tokens zijn semantisch, geen module-accent', () => {
    const src = lees('components', 'app', 'horizon', 'chart-static-layers.tsx')
    const start = src.indexOf('const ZONE_VULLING')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, start + 300)
    expect(blok).toContain('var(--score-bad)')
    expect(blok).toContain('var(--score-warn)')
    expect(blok).toContain('var(--score-good)')
    expect(blok).not.toMatch(/module-active|#[0-9a-f]{3,6}/i)
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
