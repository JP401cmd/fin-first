import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * BRON-GRENDEL op de lab-uitkomst-wiring in horizon-client.tsx (ADR 0145).
 *
 * WAAROM EEN BRON-TEST (precedent: horizon-client.nu-stoppen.test.ts): dit bestand is
 * >10.000 regels en de fout die ADR 0145 oplost is geen verkeerd getal maar STILLE
 * DISPATCH — elk oppervlak (knoppen, banner, badges, sheet, radar) las zijn eigen
 * combinatie van `hasScenario`/`hasStopKeuze`/`fireAgeFractional`. Het gedrag van de
 * switch zelf is getest in lib/horizon/lab-uitkomst.test.ts; hier bewijzen we dat de
 * component die ene switch consumeert en geen eigen dekking-som opbouwt.
 */

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')

function bron(): string {
  return readFileSync(SOURCE_PATH, 'utf8')
}

/** Niet-comment-regels — een uitleg mág elke naam noemen. */
function codeRegels(): string[] {
  return bron()
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('{/*')
    })
}

describe('horizon-client consumeert ÉÉN lab-uitkomst (ADR 0145)', () => {
  it('roept resolveLabUitkomst aan op de hoofd-run als basis', () => {
    const src = bron()
    const start = src.indexOf('resolveLabUitkomst({')
    expect(start).toBeGreaterThan(-1)
    const call = src.slice(start, src.indexOf('})', start))
    expect(call).toContain('basis: simResult')
    expect(call).toContain('scenario: hasScenario && scenario != null ? scenario.result : null')
    expect(call).toContain('stopPad')
    expect(call).toContain('kernelMaandHint')
  })

  it('de twee promotie-gates bestaan als benoemde afleidingen', () => {
    const src = bron()
    expect(src).toContain('const doelVastleggenMogelijk =')
    expect(src).toContain('const doelBijwerkenMogelijk =')
  })

  it('"Maak dit mijn doel" hangt niet meer direct aan (hasScenario || hasStopKeuze)', () => {
    const code = codeRegels().join('\n')
    const knop = code.indexOf('Maak dit mijn doel')
    expect(knop).toBeGreaterThan(-1)
    const knopBlok = code.slice(knop - 700, knop)
    expect(knopBlok).not.toContain('(hasScenario || hasStopKeuze)')
    expect(knopBlok).toContain('doelVastleggenMogelijk')
  })

  it('"Doel bijwerken" en "Leg opnieuw vast" hangen aan doelBijwerkenMogelijk', () => {
    const code = codeRegels().join('\n')
    for (const label of ['Doel bijwerken', 'Leg opnieuw vast']) {
      const i = code.indexOf(label)
      expect(i, label).toBeGreaterThan(-1)
      expect(code.slice(i - 700, i), label).toContain('doelBijwerkenMogelijk')
    }
  })

  it('de concept-banner negeert de stopkeuze onder een vast anker', () => {
    expect(bron()).toContain('stopKeuzeTelt: !isFixedAnchorMode')
  })

  it('het lokale doel-blok strips de stopkeuze onder een vast anker', () => {
    expect(bron()).toContain('isFixedAnchorMode ? stripStopKeuze(stand) : stand')
  })

  it('de radar krijgt de bridge-vlag van de run die de rijen levert', () => {
    const src = bron()
    const start = src.indexOf('anchorPortfolio:')
    expect(start).toBeGreaterThan(-1)
    expect(src.slice(start, start + 300)).toContain('requiredFireIsAnchorPortfolio === true')
  })

  it('geen eigen dekking-som: geen eindMaand, en geen "/ 12" in het lab-uitkomst-blok', () => {
    const code = codeRegels()
    // De maand→eind-omzetting woont in lib/horizon/lab-uitkomst.ts (via eindMaandVan).
    expect(code.filter((l) => /eindMaand/.test(l))).toEqual([])
    // Het bestand draagt elders legitieme jaar→maand-omzettingen (woning, studie); de
    // grendel geldt voor het hele blok van de lab-uitkomst tot de radar-assen, én voor
    // elke code-regel die de dekking-uitkomst aanraakt.
    const src = bron()
    const blok = src.slice(src.indexOf('const labUitkomst: LabUitkomst'), src.indexOf('const radarAssen'))
    expect(blok.length).toBeGreaterThan(0)
    expect(blok).not.toMatch(/\/\s*12\b/)
    const dekkingRegels = code.filter((l) => /labDekking|labUitkomst|planTekortHint|dekking/i.test(l))
    expect(dekkingRegels.length).toBeGreaterThan(0)
    expect(dekkingRegels.filter((l) => /\/\s*12\b|computeRunwayCoveragePct/.test(l))).toEqual([])
  })

  it('de plan-tekort-hint zet de extra inleg alléén op klik, via de slider-helpers', () => {
    const src = bron()
    const start = src.indexOf('const handlePlanTekortHintSeed')
    expect(start).toBeGreaterThan(-1)
    const handler = src.slice(start, src.indexOf('}, [', start))
    expect(handler).toContain("buildSliderEvent('extra_inleg'")
    expect(handler).toContain('setScenarioSliderEvents(')
    // Geklemd op het zichtbare bereik van de extra-inleg-slider, geen eigen literal.
    expect(src).toContain("computeSliderUiRange('extra_inleg'")
    // Nooit auto-seeden: de handler hangt alleen aan een onClick.
    expect(src).toContain('onClick={handlePlanTekortHintSeed}')
    expect(src.match(/handlePlanTekortHintSeed\(/g) ?? []).toEqual([])
  })

  it('de plan-tekort-hint blijft zichtbaar in de privacy-weergave en geeft `masked` door aan zin én knop', () => {
    const code = codeRegels().join('\n')
    const start = code.indexOf('data-testid="lab-plan-tekort-hint"')
    expect(start).toBeGreaterThan(-1)
    // De render-gate direct vóór het blok: geen `!masked` en geen dagen-drempel meer
    // (de zin kent zelf "minder dan een dag").
    const gate = code.slice(code.lastIndexOf('{planTekortHint !== null', start), start)
    expect(gate).toContain('!isNuStoppenMode')
    expect(gate).not.toContain('!masked')
    expect(gate).not.toMatch(/dagen\s*>=\s*1/)
    const blok = code.slice(start, code.indexOf('Indicatie, geen advies', start))
    expect(blok).toMatch(/dekkingTekortHintZin\(\{[\s\S]*?\bmasked,[\s\S]*?\}\)/)
    expect(blok).toContain('dekkingTekortHintKnop(planTekortHint.seed, masked)')
  })
})
