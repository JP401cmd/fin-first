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

  it('de antwoorden consumeren resolveLabAntwoorden op labDekking + solvedRun; acties alleen op klik', () => {
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
    // Spec antwoorden-naast-sliders: de antwoorden gaan via de pure verdeler naar hun knop.
    // `handleLabAntwoord` zit alleen in de onClick die `labAntwoordenPerSlider` op het
    // item zet (geteld in lib/horizon/lab-antwoorden.test.ts: nooit bij het mappen aangeroepen).
    const perKnop = code.indexOf('labAntwoordenPerSlider(')
    expect(perKnop).toBeGreaterThan(-1)
    const perKnopCall = code.slice(perKnop, code.indexOf('\n', perKnop))
    expect(perKnopCall).toContain('labAntwoorden')
    expect(perKnopCall).toContain('(actie) => handleLabAntwoord(actie)')
    // privacymodus → geen knop (de verdeler zet dan `knop: null`)
    expect(perKnopCall).toContain('{ masked }')
    // nooit auto-seeden: geen useEffect dat handleLabAntwoord aanroept, en de enige
    // aanroep is die ene callback naar de knop (ADR 0145 D7).
    expect(code).not.toMatch(/useEffect\([^)]*handleLabAntwoord/)
    expect(code).not.toMatch(/useEffect\([^)]*labAntwoordenPerKnop\.\w+\.knop/)
    expect(code.match(/handleLabAntwoord\(/g) ?? []).toHaveLength(1)
    expect(code).not.toMatch(/\.knop\??\.onClick\(\)/)
    // elk antwoord bij zijn knop; het losse blok met kop is weg, één sluitregel blijft
    // `whatIfSliderAntwoorden` is de samenvoeging van `labAntwoordenPerKnop.sliders` +
    // de vierde-knop-sleutel (spec 2026-09-18, fix-ronde 2): de render-prop wijst niet
    // meer rechtstreeks naar `labAntwoordenPerKnop`, maar de memo zelf nog altijd wel —
    // dus beide kanten van de seam blijven gepind.
    expect(src).toContain('antwoorden={whatIfSliderAntwoorden}')
    expect(src).toMatch(/const whatIfSliderAntwoorden = useMemo\(\s*\(\) => \(\{\s*\.\.\.labAntwoordenPerKnop\.sliders,/)
    expect(src).toContain('stopAntwoord={labAntwoordenPerKnop.stop}')
    expect(src).not.toContain('data-testid="lab-antwoorden"')
    expect(src).not.toContain('Wat maakt het haalbaar?')
    const sluit = code.indexOf('data-testid="lab-antwoorden-sluitregel"')
    expect(sluit).toBeGreaterThan(-1)
    // Eindreview M4 — alleen bij een €-antwoord: "doorwerken tot" alleen smeert niets uit.
    expect(code.slice(sluit - 200, sluit)).toContain("labAntwoorden.some((a) => a.kind !== 'doorwerken') && !isNuStoppenMode")
    expect(code.slice(sluit, sluit + 400)).toContain('Indicatie, geen advies')
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
    // Eindreview I1 — alleen een `bedrag` wordt gedeflateerd; `op` heeft geen bedrag.
    expect(euroBlok).toMatch(
      /const viewBasisEindvermogen =[\s\S]*?basisEindvermogenUitkomst\?\.kind === 'bedrag'[\s\S]*?deflate\(basisEindvermogenUitkomst\.nominaal, eindvermogenFactor, euroView\)/,
    )
    expect(euroBlok).toMatch(
      /const viewScenarioEindvermogen =[\s\S]*?scenarioEindvermogenUitkomst\?\.kind === 'bedrag'[\s\S]*?deflate\(scenarioEindvermogenUitkomst\.nominaal, eindvermogenFactor, euroView\)/,
    )
    expect(euroBlok).toContain('const viewDekkingsasData = useMemo')
    // Gemaskeerd ⇒ geen bedrag in de tegel; `op` blijft `op`; de weergave reist mee als label (I3).
    expect(euroBlok).toContain("uitkomst.kind === 'op' ? { kind: 'op' } : masked || view == null ? null : { kind: 'bedrag', euro: view }")
    expect(euroBlok).toMatch(/const viewDekkingsasData = useMemo[\s\S]*?euroView,\r?\n/)
    expect(euroBlok).toContain('const viewDoelPreviews = useMemo')
    // I4 — de preview noemt het opgeslagen (nominale) bedrag alleen onder huidige euro's en bij ≥ 1 % verschil.
    expect(euroBlok).toContain("euroView === 'real' && !masked && Math.abs(opgeslagen - viewScenarioEindvermogen) >= 0.01 * Math.abs(opgeslagen)")
    expect(euroBlok).toContain('eindvermogenOpgeslagenNoot(opgeslagen)')
    // M5 — de badge-delta valt onder de drempel weg; I1 — alleen bij twee bedragen.
    expect(euroBlok).toContain('!masked && viewBasisEindvermogen != null && viewScenarioEindvermogen != null')
    expect(euroBlok).toContain('Math.abs(viewLabEindvermogenVerschil) >= EINDVERMOGEN_DELTA_DREMPEL ? viewLabEindvermogenVerschil : 0')
    // Het doelbedrag is nominaal: rechtstreeks uit de lab-uitkomst, nooit een view*-waarde.
    const handler = src.slice(src.indexOf('const handleDoelVastleggen = useCallback'), src.indexOf('const handleDoelLoslaten'))
    expect(handler).toMatch(
      /eindvermogen:\s*gekozen\.eindvermogen && labDekking\?\.scenarioEindvermogen\?\.kind === 'bedrag'\s*\?\s*labDekking\.scenarioEindvermogen\.nominaal\s*:\s*undefined/,
    )
    expect(handler).not.toMatch(/eindvermogen:[^\n]*view/)
    // De badge en de sheet consumeren de view-waarden.
    expect(src).toContain('data-testid="lab-eindvermogen-badge"')
    expect(src).toContain('eindvermogenDeltaBadge(viewLabEindvermogenDelta)')
    expect(src).toContain('previews={viewDoelPreviews}')
    expect(src).toContain("labPromotie.kind === 'eindvermogen'")
  })

  it('M10 · "Maak dit mijn doel" bij eindvermogen wacht op een bekend scenario-bedrag', () => {
    const src = bron()
    expect(src).toMatch(/const eindvermogenDoelBekend =\s*labUitkomst\.kind === 'dekking' && labUitkomst\.scenarioEindvermogen\?\.kind === 'bedrag'/)
    expect(src).toMatch(/const doelVastleggenMogelijk =\s*labPromotie\.kind !== 'geen' && \(labPromotie\.kind !== 'eindvermogen' \|\| eindvermogenDoelBekend\)/)
  })

  it('M11 · de live-regio mount de meldingstekst opnieuw per klik (teller als key)', () => {
    const src = bron()
    expect(src).toContain('<span key={labAntwoordMelding.n}>{labAntwoordMelding.tekst}</span>')
    expect(src).toContain('n: prev.n + 1')
  })
})
