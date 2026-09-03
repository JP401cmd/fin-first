/**
 * Bron-grendel op de klik van de "Na pensioen"-KPI in huishoudweergave
 * (UAT WF-REKEN-23-bug4, 2 sep 2026).
 *
 * WAT ER MISGING: in de weergave "Huishouden" opende een klik op de tegel
 * "NA PENSIOEN € 38.640 per jaar" niets. De handler vertakte op
 * `isHouseholdView` (= de GEKOZEN perspectief, uit usePerspective) naar
 * `setHouseholdRetireOpen(true)`, maar de HouseholdRetirementPane rendert alleen
 * `{householdRetireInfo && …}` — en dat blijft null zolang
 * buildHouseholdProjectionInput() geen echt huishouden (>= 2 leden) vindt. De
 * perspectief-switcher biedt 'Huishouden' al aan bij een profielveld of één lid
 * (app/api/perspective/route.ts), dus tussen "mag ik dit tonen" en "kan ik dit
 * vullen" zat een kloof waarin de klik in het niets viel.
 *
 * WAAROM EEN BRON-TEST: `horizon-client.tsx` is >10.000 regels en hangt aan de
 * volledige kernel-bundel; renderen in vitest is niet realistisch. Precedent in
 * deze map: `horizon-client.tips-close.test.ts`, `horizon-client.kpi-gegevensmelding.test.ts`.
 *
 * Wat we vastpinnen:
 *  1. er is precies één handler, en die toetst `householdRetireInfo` vóór hij
 *     naar de huishoud-tak vertakt, met het eigen uitgavenpaneel als terugval;
 *  2. beide KPI-varianten (desktop-strip + mobiele strip) consumeren die ene
 *     handler — geen tegel schrijft de vertakking zelf uit;
 *  3. de oude, onbewaakte vertakking komt nergens meer voor.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')
const source = readFileSync(SOURCE_PATH, 'utf8')

/** Desktop-strip + mobiele strip. */
const LAYOUTS = 2

describe('"Na pensioen"-KPI — klik in huishoudweergave (WF-REKEN-23-bug4)', () => {
  it('vertakt alleen naar de huishoud-pane als die ook echt kan renderen', () => {
    const match = source.match(
      /const openRetirementExpensePane = useCallback\(\(\) => \{([\s\S]*?)\n {2}\}, \[([^\]]*)\]\)/,
    )
    expect(match, 'openRetirementExpensePane niet gevonden in horizon-client.tsx').not.toBeNull()
    const [, body, deps] = match!
    // De guard: perspectief ÉN gevulde huishoud-info, anders het eigen paneel.
    expect(body).toMatch(/if \(isHouseholdView && householdRetireInfo\) setHouseholdRetireOpen\(true\)/)
    expect(body).toMatch(/else setUitgavenPaneOpen\(true\)/)
    // De handler moet meebewegen met de asynchroon geladen huishoud-info.
    expect(deps).toContain('householdRetireInfo')
    expect(deps).toContain('isHouseholdView')
  })

  it('wordt door beide KPI-varianten geconsumeerd', () => {
    const tiles = source.match(/data-testid="hero-stat-retirement-expense"/g) ?? []
    expect(tiles, 'de tegel bestaat in desktop- en mobiele strip').toHaveLength(LAYOUTS)
    const consumers = source.match(/onClick=\{openRetirementExpensePane\}/g) ?? []
    expect(consumers, 'elke tegel hoort dezelfde handler te gebruiken').toHaveLength(LAYOUTS)
  })

  it('kent de onbewaakte vertakking nergens meer', () => {
    // Precies de regel die de bevinding veroorzaakte: vertakken op alleen het
    // gekozen perspectief, zonder te toetsen of de pane gevuld is.
    expect(source).not.toMatch(/if \(isHouseholdView\) setHouseholdRetireOpen\(true\)/)
    // De huishoud-pane blijft voorwaardelijk op de info — dát is de reden dat
    // de handler 'm moet toetsen.
    expect(source).toMatch(/\{householdRetireInfo && \(\s*<HouseholdRetirementPane/)
  })

  it('rendert het terugval-paneel onvoorwaardelijk', () => {
    // UitgavenPane hangt niet aan huishoud-data; daarom is hij een veilige terugval.
    expect(source).toMatch(/<UitgavenPane open=\{uitgavenPaneOpen\}/)
  })
})
