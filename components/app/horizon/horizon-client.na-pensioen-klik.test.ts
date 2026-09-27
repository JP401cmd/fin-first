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
 *     naar de huishoud-tak vertakt, met de rij "Uitgave na pensioen" in Instellingen als
 *     terugval (ADR 0179 fase 3; tot dan het eigen uitgavenpaneel);
 *  2. de persoonlijke KPI 4 is sinds ADR 0179 fase 3 een link naar de rij Uitgave na
 *     pensioen (`instellingenRijHref('uitgave-na-pensioen')`); alleen de huishoudtak
 *     loopt via de handler — geen tegel schrijft de vertakking zelf uit;
 *  3. de oude, onbewaakte vertakking komt nergens meer voor.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** De opener woont sinds ADR 0179 fase 1 stap 13 in de overlay-state-hook van de provider. */
const SOURCE_PATH = join(process.cwd(), 'components', 'toekomst', 'state', 'use-toekomst-overlay-state.ts')
const source = readFileSync(SOURCE_PATH, 'utf8')

/** Desktop-strip + mobiele strip. */
const LAYOUTS = 2

describe('"Na pensioen"-KPI — klik in huishoudweergave (WF-REKEN-23-bug4)', () => {
  it('vertakt alleen naar de huishoud-pane als die ook echt kan renderen', () => {
    const match = source.match(
      /const openRetirementExpensePane = useCallback\(\(\) => \{([\s\S]*?)\n {2}\}, \[([^\]]*)\]\)/,
    )
    expect(match, 'openRetirementExpensePane niet gevonden in use-toekomst-overlay-state.ts').not.toBeNull()
    const [, body, deps] = match!
    // De guard: perspectief ÉN gevulde huishoud-info, anders het eigen paneel.
    expect(body).toMatch(/if \(isHouseholdView && householdRetireInfo\) setHouseholdRetireOpen\(true\)/)
    // Sinds ADR 0179 fase 3 is de terugval de rij in Instellingen, niet meer een pane op Plan.
    expect(body).toMatch(/else router\.push\(UITGAVE_RIJ_HREF\)/)
    // De handler moet meebewegen met de asynchroon geladen huishoud-info.
    expect(deps).toContain('householdRetireInfo')
    expect(deps).toContain('isHouseholdView')
    expect(source).toContain("instellingenRijHref('uitgave-na-pensioen')")
  })

  it('kent de onbewaakte vertakking nergens meer', () => {
    // Precies de regel die de bevinding veroorzaakte: vertakken op alleen het
    // gekozen perspectief, zonder te toetsen of de pane gevuld is.
    expect(source).not.toMatch(/if \(isHouseholdView\) setHouseholdRetireOpen\(true\)/)
    // De huishoud-pane blijft voorwaardelijk op de info — dát is de reden dat
    // de handler 'm moet toetsen. Die pane (en de UitgavenPane-terugval) staat sinds
    // fase 1 stap 11 in components/toekomst/overlays/toekomst-overlays.tsx
    // (toekomst-overlays.test.ts).
  })
})
