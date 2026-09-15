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
    const dekkingRegels = code.filter((l) => /labDekking|labUitkomst|labAntwoorden|dekking/i.test(l))
    expect(dekkingRegels.length).toBeGreaterThan(0)
    expect(dekkingRegels.filter((l) => /\/\s*12\b|computeRunwayCoveragePct/.test(l))).toEqual([])
  })

  it('het antwoordenblok consumeert resolveLabAntwoorden op labDekking + solvedRun; acties alleen op klik', () => {
    const src = bron()
    const start = src.indexOf('resolveLabAntwoorden({')
    expect(start).toBeGreaterThan(-1)
    const call = src.slice(start, src.indexOf('})', start))
    expect(call).toContain('dekking: labDekking')
    expect(call).toContain('solvedFireAge: solvedRun?.fireAge ?? null')
    // De bedragen horen bij het PLAN-stopmoment: de hint van de hoofd-run, nooit
    // labDekking.maandHint (die laat het verkende stop-pad voorgaan — eindreview I1).
    expect(call).toContain('planMaandHint: kernelMaandHint')
    expect(call).not.toMatch(/maandHint:\s*labDekking/)
    expect(call).toContain('masked')
    const code = codeRegels().join('\n')
    expect(code).toContain('onClick={() => handleLabAntwoord(a.actie)}')
    // nooit auto-seeden: geen useEffect dat handleLabAntwoord aanroept, en de enige
    // aanroep is die ene onClick (ADR 0145 D7).
    expect(code).not.toMatch(/useEffect\([^)]*handleLabAntwoord/)
    expect(code.match(/handleLabAntwoord\(/g) ?? []).toHaveLength(1)
    // in privacymodus geen knop
    const blokStart = code.indexOf('data-testid="lab-antwoorden"')
    expect(blokStart).toBeGreaterThan(-1)
    const blok = code.slice(blokStart, code.indexOf('Indicatie, geen advies', blokStart))
    expect(blok).toContain('{!masked && (')
    expect(blok).toContain('ANTWOORD_KNOP')
    // de oude plan-hint is weg
    expect(src).not.toContain('lab-plan-tekort-hint')
    expect(src).not.toMatch(/dekkingTekortHint(Zin|Knop)/)
  })

  it('"Reken hiermee" zet de hefboom via de bestaande lab-handlers, niet via het plan', () => {
    const src = bron()
    const start = src.indexOf('const handleLabAntwoord = useCallback')
    expect(start).toBeGreaterThan(-1)
    // Ná handleStopAgeChange gedeclareerd (geen TDZ in de deps-array).
    expect(start).toBeGreaterThan(src.indexOf('const handleStopAgeChange = useCallback'))
    const eind = src.indexOf('[whatIfBaseline, currentAge, handleStopAgeChange]', start)
    expect(eind).toBeGreaterThan(start)
    const handler = src.slice(start, eind)
    expect(handler).toContain('handleStopAgeChange(actie.stopAge)')
    expect(handler).toContain('buildSliderEvent(actie.key, actie.value, whatIfBaseline, currentAge)')
    expect(handler).toContain('setScenarioSliderEvents(')
    expect(handler).not.toMatch(/fetch\(|\/api\/fire-settings/)
  })

  it('het stop-pad-blok "Wat hoort daarbij?" blijft alleen onder solved', () => {
    const code = codeRegels().join('\n')
    expect(code).toContain('stopPadTekortHint !== null && !isNuStoppenMode && !isFixedAnchorMode')
  })

  it('de dekkingsas krijgt zijn data uit labDekking (geen eigen som)', () => {
    const src = bron()
    const start = src.indexOf('const dekkingsasData = useMemo')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, src.indexOf('}, [labDekking', start))
    expect(blok).toContain('basisReach: labDekking.basisReach')
    expect(blok).toContain('basisPct: labDekking.basisPct')
    expect(blok).not.toMatch(/\/ 12|eindMaand|computeRunwayCoveragePct/)
    // ADR 0145 D12 — de as krijgt de GEDEFLATEERDE euro-kolom erbij in het euro-weergave-blok.
    expect(src).toContain('dekking={viewDekkingsasData}')
    expect(src).not.toContain('dekking={dekkingsasData}')
  })

  it('eindvermogen (D12): weergave gedeflateerd IN het euro-weergave-blok, doelbedrag NOMINAAL uit labDekking', () => {
    const src = bron()
    const blokStart = src.indexOf('EURO-WEERGAVE: DE RENDER-GRENS')
    const blokEind = src.indexOf('EINDE EURO-WEERGAVE')
    const euroBlok = src.slice(blokStart, blokEind)
    // Eén factor op de eindleeftijd, via de canonieke helpers — nooit een eigen machtsverheffing.
    expect(euroBlok).toContain('factorAtAge(displayUnifiedRows, labDekking?.eind ?? chartEndAge)')
    expect(euroBlok).toMatch(/const viewBasisEindvermogen =[\s\S]*?deflate\(labDekking\.basisEindvermogen, eindvermogenFactor, euroView\)/)
    expect(euroBlok).toMatch(/const viewScenarioEindvermogen =[\s\S]*?deflate\(labDekking\.scenarioEindvermogen, eindvermogenFactor, euroView\)/)
    expect(euroBlok).toContain('const viewDekkingsasData = useMemo')
    expect(euroBlok).toContain('basisEindvermogen: masked ? null : viewBasisEindvermogen')
    expect(euroBlok).toContain('const viewDoelPreviews = useMemo')
    // Het doelbedrag is nominaal: rechtstreeks uit de lab-uitkomst, nooit een view*-waarde.
    const handler = src.slice(src.indexOf('const handleDoelVastleggen = useCallback'), src.indexOf('const handleDoelLoslaten'))
    expect(handler).toContain('eindvermogen: gekozen.eindvermogen ? labDekking?.scenarioEindvermogen ?? undefined : undefined')
    expect(handler).not.toMatch(/eindvermogen:[^\n]*view/)
    // De badge en de sheet consumeren de view-waarden.
    expect(src).toContain('data-testid="lab-eindvermogen-badge"')
    expect(src).toContain('eindvermogenDeltaBadge(viewLabEindvermogenDelta)')
    expect(src).toContain('previews={viewDoelPreviews}')
    expect(src).toContain("labPromotie.kind === 'eindvermogen'")
  })
})
