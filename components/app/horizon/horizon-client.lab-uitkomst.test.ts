import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * BRON-GRENDEL op de doelscenario-wiring in horizon-client.tsx (ADR 0145 + ADR 0170).
 *
 * WAAROM EEN BRON-TEST (precedent: horizon-client.nu-stoppen.test.ts): dit bestand is
 * >10.000 regels en de fout die ADR 0145 oploste is geen verkeerd getal maar STILLE
 * DISPATCH — elk oppervlak las zijn eigen combinatie van `hasScenario`/`hasStopKeuze`/
 * `fireAgeFractional`. Het gedrag van de switch zelf is getest in lib/horizon/
 * lab-uitkomst.test.ts; hier bewijzen we dat de component die ene switch consumeert.
 *
 * ADR 0170 voegde daar een tweede grendel aan toe: de twee grenzen per knop komen
 * UITSLUITEND uit `runLabGrenzenAsync` (de worker-batch). Zodra een oppervlak zelf gaat
 * bisecteren of een grens benadert, staan er twee waarheden op één as.
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

  it('de opslaan-balk hangt aan die gates, niet aan (hasScenario || hasStopKeuze)', () => {
    const src = bron()
    // ADR 0170 — de knoplabels wonen in LAB_COPY; de balk krijgt de toestand + de gates mee.
    expect(src).toContain('<LabOpslaanBalk')
    expect(src).toContain('toestand={labOpslaanToestand}')
    // PIN HET GEBRUIK, niet de declaratie: deze grendel stond eerder op
    // `const doelVastleggenMogelijk =` en bleef groen toen de gate uit de UI verdween — de
    // balk bood toen "Maak dit mijn doel" aan waar de sheet niets kon vastleggen (D4/M10).
    expect(src).toContain('vastleggenMogelijk={doelVastleggenMogelijk}')
    expect(src).toContain('bijwerkenMogelijk={doelBijwerkenMogelijk}')
    const start = src.indexOf('const labOpslaanToestand')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, src.indexOf('\n\n', start))
    // De stand komt uit doel + concept + promotie; nooit uit een kale scenario-vlag alleen.
    expect(blok).toContain('doelActief')
    expect(blok).toContain('conceptGewijzigd')
    expect(blok).toContain("labPromotie.kind === 'geen' && labPromotie.reden === 'nu-anker'")
  })

  it('de concept-detectie negeert de stopkeuze onder een vast anker', () => {
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

  it('geen eigen dekking-som: geen eindMaand, geen computeRunwayCoveragePct, geen "/ 12" in het lab-blok', () => {
    const code = codeRegels()
    // De maand→eind-omzetting woont in lib/horizon/lab-uitkomst.ts (via eindMaandVan).
    expect(code.filter((l) => /eindMaand/.test(l))).toEqual([])
    const src = bron()
    const blok = src.slice(src.indexOf('const labUitkomst: LabUitkomst'), src.indexOf('const radarAssen'))
    expect(blok.length).toBeGreaterThan(0)
    expect(blok).not.toMatch(/\/\s*12\b/)
    const dekkingRegels = code.filter((l) => /labDekking|labUitkomst|labGrenzen|dekking/i.test(l))
    expect(dekkingRegels.length).toBeGreaterThan(0)
    expect(dekkingRegels.filter((l) => /\/\s*12\b|computeRunwayCoveragePct/.test(l))).toEqual([])
  })
})

describe('de vijf knoppen consumeren ÉÉN grenzen-batch (ADR 0170)', () => {
  it('de grenzen komen uit runLabGrenzenAsync op de eigen worker-lane', () => {
    const src = bron()
    const start = src.indexOf('runLabGrenzenAsync(')
    expect(start).toBeGreaterThan(-1)
    const call = src.slice(start, src.indexOf('.then(', start))
    // ADR 0103 — dezelfde grondslag-injectie als elke andere kernel-run.
    expect(call).toContain('profile: withResolvedKernelBedragen(kernelRawProfile, {')
    expect(call).toContain('monthlyIncome: effectiveInput.monthlyIncome')
    // De marktbias-delta's via de canonieke context-assemblage, geen tweede afleiding.
    expect(src).toContain('resolveScenarioContext(')
    expect(call).toContain('assets: marktbiasAssets')
    // Eén lane, zodat de hoofdrun/scenario-run/presets niet achter deze batch wachten.
    expect(call).toContain("{ lane: 'grenzen' }")
    // De vijf standen reizen als `waarden`; de engine bouwt de slider-events zelf.
    expect(call).toContain('waarden: {')
    for (const veld of ['verdienen:', 'uitgeven:', 'uitgaveNaPensioen:', 'nalatenschap:', 'stop:']) {
      expect(call, veld).toContain(veld)
    }
    expect(call).toContain('bereik: labKnopBereik')
  })

  it('de batch is gedebounced en een verdrongen run laat de vorige grenzen staan', () => {
    const src = bron()
    const start = src.indexOf('runLabGrenzenAsync(')
    const na = src.slice(start, start + 2500)
    // Verdrongen ⇒ `null` ⇒ niets overschrijven (anders knippert de as leeg).
    expect(na).toContain('if (res != null)')
    expect(na).toContain('setLabGrenzen(res)')
    // De debounce staat op het effect zelf.
    const effect = src.slice(src.indexOf('const [labGrenzen, setLabGrenzen]'), start)
    expect(effect).toContain('setTimeout(')
    expect(effect).toContain('setLabGrenzenPending(true)')
  })

  it('de knoppen lezen de grenzen uit die batch en berekenen er zelf niets bij', () => {
    const src = bron()
    const start = src.indexOf('const labKnoppen = useMemo')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, src.indexOf('const labFormatters', start))
    expect(blok).toContain("const grens = (k: HefboomKey) => labGrenzen?.grenzen?.[k] ?? null")
    // Geen bisectie, geen solve, geen benadering in de host.
    expect(blok).not.toMatch(/solveFire|bisect|Math\.pow/)
    // De zone van de huidige stand komt uit de pure helper, niet uit een eigen vergelijking.
    expect(src).toContain('zoneVanHuidig(labGrenzen?.huidig ?? null)')
  })

  it('pending gaat naar de knoppen, zodat de oude grenzen gedempt blijven staan', () => {
    expect(bron()).toContain('pending={labGrenzenPending}')
  })

  it('de oude antwoorden-laag is helemaal weg (geen tweede waarheid naast de grenzen)', () => {
    // Alleen CODE-regels: een uitleg mag de oude naam noemen (de comment bij het
    // marge-criterium legt bijvoorbeeld uit dat `computeStopMarge` verviel).
    const src = codeRegels().join(String.fromCharCode(10))
    for (const naam of [
      'resolveLabAntwoorden',
      'labAntwoordenPerSlider',
      'labAntwoordGezetMelding',
      'stopPadTekortHint',
      'lab-antwoorden-sluitregel',
      'Wat maakt het haalbaar?',
      'Reken hiermee',
      'computeStopMarge',
      'Vrijheidsas',
      'Dekkingsbalk',
      'WhatIfSliders',
    ]) {
      expect(src, naam).not.toContain(naam)
    }
  })
})

describe('eindvermogen (ADR 0145 D12) blijft nominaal vastgelegd en gedeflateerd getoond', () => {
  it('weergave gedeflateerd IN het euro-weergave-blok, doelbedrag NOMINAAL uit labDekking', () => {
    const src = bron()
    const euroBlok = src.slice(src.indexOf('EURO-WEERGAVE: DE RENDER-GRENS'), src.indexOf('EINDE EURO-WEERGAVE'))
    // Eén factor op de eindleeftijd, via de canonieke helpers — nooit een eigen machtsverheffing.
    expect(euroBlok).toContain('factorAtAge(displayUnifiedRows, labDekking?.eind ?? chartEndAge)')
    expect(euroBlok).toMatch(
      /const viewBasisEindvermogen =[\s\S]*?basisEindvermogenUitkomst\?\.kind === 'bedrag'[\s\S]*?deflate\(basisEindvermogenUitkomst\.nominaal, eindvermogenFactor, euroView\)/,
    )
    expect(euroBlok).toMatch(
      /const viewScenarioEindvermogen =[\s\S]*?scenarioEindvermogenUitkomst\?\.kind === 'bedrag'[\s\S]*?deflate\(scenarioEindvermogenUitkomst\.nominaal, eindvermogenFactor, euroView\)/,
    )
    // De uitkomstregel consumeert die view-waarden (ADR 0170: de tegels werden één regel).
    expect(euroBlok).toContain('const labUitkomstRegel = useMemo')
    expect(euroBlok).toContain('viewBasisEindvermogen')
    expect(euroBlok).toContain('const viewDoelPreviews = useMemo')
    // I4 — de preview noemt het opgeslagen (nominale) bedrag alleen onder huidige euro's en bij ≥ 1 %.
    expect(euroBlok).toContain("euroView === 'real' && !masked && Math.abs(opgeslagen - viewScenarioEindvermogen) >= 0.01 * Math.abs(opgeslagen)")
    expect(euroBlok).toContain('eindvermogenOpgeslagenNoot(opgeslagen)')
    // Het doelbedrag is nominaal: rechtstreeks uit de lab-uitkomst, nooit een view*-waarde.
    const handler = src.slice(src.indexOf('const handleDoelVastleggen = useCallback'), src.indexOf('const handleDoelLoslaten'))
    expect(handler).toMatch(
      /eindvermogen:\s*gekozen\.eindvermogen && labDekking\?\.scenarioEindvermogen\?\.kind === 'bedrag'\s*\?\s*labDekking\.scenarioEindvermogen\.nominaal\s*:\s*undefined/,
    )
    expect(handler).not.toMatch(/eindvermogen:[^\n]*view/)
    expect(src).toContain('previews={viewDoelPreviews}')
    expect(src).toContain("labPromotie.kind === 'eindvermogen'")
  })

  it('M10 · "Maak dit mijn doel" bij eindvermogen wacht op een bekend scenario-bedrag', () => {
    const src = bron()
    expect(src).toMatch(/const eindvermogenDoelBekend =\s*labUitkomst\.kind === 'dekking' && labUitkomst\.scenarioEindvermogen\?\.kind === 'bedrag'/)
    expect(src).toMatch(/const doelVastleggenMogelijk =\s*labPromotie\.kind !== 'geen' && \(labPromotie\.kind !== 'eindvermogen' \|\| eindvermogenDoelBekend\)/)
  })
})

describe('de twee profielparameter-knoppen reizen mee in de doelstand (ADR 0170)', () => {
  it('buildLiveStand krijgt uitgave na pensioen én nalatenschap', () => {
    const src = bron()
    const start = src.indexOf('const buildLiveStandNow = useCallback')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, src.indexOf('const conceptGewijzigd', start))
    expect(blok).toContain('uitgaveNaPensioen: scenarioUitgaveNaPensioen')
    expect(blok).toContain('nalatenschap: scenarioNalatenschap')
  })

  it('"Herstel mijn doel" zet ze terug uit de stand, niet hard op null', () => {
    const src = bron()
    const start = src.indexOf('const handleDoelHerstellen = useCallback')
    const blok = src.slice(start, src.indexOf('}, [doelBlok', start))
    expect(blok).toContain('setScenarioUitgaveNaPensioen(stand.uitgaveNaPensioen ?? null)')
    expect(blok).toContain('setScenarioNalatenschap(stand.nalatenschap ?? null)')
  })

  it('de nalatenschap-override loopt via de scenario-overrides van de hook', () => {
    const src = bron()
    const start = src.indexOf('const scenarioOverrides = useMemo')
    const blok = src.slice(start, src.indexOf('}, [', start))
    expect(blok).toContain('nalatenschap: scenarioNalatenschap')
    // hasScenario telt hem mee — anders draait er geen scenario-run op de nieuwe stand.
    expect(src).toContain('scenarioNalatenschap != null')
  })

  it('de concept-detectie heeft geen losse noodgreep meer voor de vierde knop', () => {
    const src = bron()
    const start = src.indexOf('const conceptGewijzigd = useMemo')
    const blok = src.slice(start, src.indexOf('}, [doelActief', start))
    expect(blok).toContain('isDoelConceptGewijzigd(buildLiveStandNow(), doelBlok?.stand')
    expect(blok).not.toContain('scenarioUitgaveNaPensioen != null ||')
  })
})
