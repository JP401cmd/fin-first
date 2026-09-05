import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * BRON-GRENDEL op de STOP-ANKER-takken in horizon-client.tsx (ADR 0127 → ADR 0129 F3b).
 *
 * WAAROM EEN BRON-TEST (precedent: horizon-client.hero-fire-age.test.ts /
 * .euro-view.test.ts): dit bestand is >9000 regels en de fout die ADR 0127/0129
 * oplosten is niet "één verkeerd getal" maar STILLE DISPATCH — `simResult.strategy
 * === 'pensioen'` op ~20 plekken, waar een vijfde strategie zwijgend in de
 * else-tak belandt. Een render-test bewijst één situatie; hij bewijst niet dat
 * de sleutel er is waar hij hoort. Dus lezen we de bron.
 *
 * Sinds F3b is er ÉÉN sleutel (ontwerpprincipe 1 van het plan): het plan-anker
 * (`planAnchor`/`isFixedAnchorMode`), afgeleid uit de kernel-echo `simResult.stopAnker`
 * — nooit meer een string-vergelijking op de strategienaam.
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
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
}

describe('één sleutel: het plan-anker uit de kernel-echo (ADR 0129, ontwerpprincipe 1)', () => {
  it('leidt het anker af uit simResult.stopAnker (met het bundel-plan als voorloper), en toetst "vast" via isFixedAnchor', () => {
    const src = bron()
    expect(src).toContain('const planAnchor: StopAnchor = simResult')
    expect(src).toContain('stopAnchorFromKernel(simResult.stopAnker)')
    expect(src).toContain('const isFixedAnchorMode = isFixedAnchor({ anchor: planAnchor })')
  })

  it("de pensioen-/nu-weergavevlaggen zijn afgeleid van het ANKER, niet van de strategienaam", () => {
    const src = bron()
    expect(src).toContain("const isPensioenMode = planAnchor.kind === 'aow'")
    expect(src).toContain("const isNuStoppenMode = planAnchor.kind === 'now'")
    // Geen string-vergelijking op de legacy-labels meer in code-regels.
    const legacy = codeRegels().filter((l) => /strategy === '(pensioen|nu-stoppen)'/.test(l))
    expect(legacy).toEqual([])
  })

  it('leidt het bereik af met de gedeelde helper, niet met een eigen maand→leeftijd-som', () => {
    expect(bron()).toContain('ankerReachFromSim(')
    expect(bron()).toContain('ankerStopFromSim(')
    const eigenSom = codeRegels().filter((l) => /kernelDepletionMonth\s*\/\s*12/.test(l))
    expect(eigenSom).toEqual([])
  })

  it('de vraag draagt de modus (B10): de hero-kop en de vrijheidsas-kop komen uit ankerVraag', () => {
    const src = bron()
    expect(src).toContain('const heroVraag = ankerVraag(isFixedAnchorMode ? ankerStop : null)')
    // Geen systeemlabel meer als kop of context-hint.
    expect(src).not.toContain('Pensioen-modus actief')
    expect(src).not.toContain('Nu-stoppen-modus actief')
  })
})

describe('het kernantwoord loopt via resolveHeroFireAge', () => {
  it('geeft het ANKER van de run, het bereik, het stopmoment als LEEFTIJD en de tweede run door (geen modus-vlag)', () => {
    const src = bron()
    const start = src.indexOf('resolveHeroFireAge({')
    const call = src.slice(start, src.indexOf('})', start))
    expect(call).toContain('stopAnker: simResult?.stopAnker ?? null,')
    expect(call).toContain('ankerReach,')
    expect(call).toContain('vastStopLeeftijd: simResult?.vastStopLeeftijd ?? null,')
    expect(call).toContain('solvedFireAgeFractional: solvedRun?.fireAge ?? null,')
    expect(call).not.toContain('isPensioenMode')
    expect(call).not.toContain('isNuStoppenMode')
    expect(src).not.toContain('nuStoppenRunway: nuStoppenRunway,')
  })

  it('de drieslag (D7) rendert uit heroFireAge.anker — consume-only', () => {
    const src = bron()
    expect(src).toContain('<AnkerDrieslag')
    expect(src).toContain('anker={heroFireAge.anker}')
    expect(src).toContain('solvedFireEndAge={solvedRun?.endAge ?? null}')
  })
})

describe('planningMode blijft tweewaardig en volgt het anker (D6/B11)', () => {
  it("'aow' → pensioen-weergave; de AOW-stop-toggle met eigen kernel-run is weg", () => {
    const src = bron()
    expect(src).toContain("const planningMode: 'fire' | 'pensioen' = isPensioenMode ? 'pensioen' : 'fire'")
    expect(src).not.toContain("'fire' | 'pensioen' | 'nu-stoppen'")
    const code = codeRegels().join('\n')
    expect(code).not.toContain('aowStopSimResult')
    expect(code).not.toContain('isAowStopActive')
    expect(code).not.toContain('aowStopToggle')
    expect(code).not.toContain('evaluateFireAt(')
  })

  it('de grafiek krijgt het anker expliciet mee voor de STOP-marker', () => {
    expect(bron()).toContain('stopAnchorFixed={isFixedAnchorMode}')
  })
})

describe('de stopkeuze (vrijheidsas)', () => {
  it('de stop-slider is alleen onder het nu-anker verborgen; onder aow/age is hij verkenning met de CTA', () => {
    const src = bron()
    expect(src).toContain('stopKeuzeVerborgen={isNuStoppenMode}')
    expect(src).toContain('ankerVast={isFixedAnchorMode}')
    expect(src).toContain('onMaakPlan={handleMaakDitMijnPlan}')
  })

  it('"Maak dit mijn plan" schrijft het VOLLEDIGE plan met anker age via de gedeelde body-helper', () => {
    const src = bron()
    const start = src.indexOf('const handleMaakDitMijnPlan = useCallback(')
    const fn = src.slice(start, src.indexOf('const handleStopAgeChange = useCallback(', start))
    expect(fn).toContain('planDraftToFireSettingsBody({')
    expect(fn).toContain("anchor: 'age'")
    expect(fn).toContain('Je plan rekent nu met stoppen op ${formatStopAge(halved)}.')
  })

  it('de default van de slider is onder een vast anker het stopmoment van het plan', () => {
    expect(bron()).toContain('isFixedAnchorMode && planStopAgeDefault != null')
  })
})

describe('statusblokken', () => {
  it('ÉÉN tekort-blok voor anchor_shortfall, met pension_shortfall en stop_now_shortfall als aliassen', () => {
    const src = bron()
    expect(src).toContain("kernelStatus === 'anchor_shortfall'")
    expect(src).toContain("kernelStatus === 'pension_shortfall'")
    expect(src).toContain("kernelStatus === 'stop_now_shortfall'")
    // Alle drie in dezelfde conditie: geen apart pensioen-blok meer.
    const start = src.indexOf("kernelStatus === 'anchor_shortfall'")
    const regel = src.slice(start, src.indexOf('\n', start))
    expect(regel).toContain("'pension_shortfall'")
    expect(regel).toContain("'stop_now_shortfall'")
  })

  it('dat blok noemt de AOW niet — het tekort kan er ook ná vallen (ADR 0127 D2 / 0129 D3)', () => {
    const src = bron()
    const start = src.indexOf("kernelStatus === 'anchor_shortfall'")
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, start + 900)
    const jsx = blok.slice(0, blok.indexOf('</div>'))
    expect(jsx).not.toMatch(/AOW/)
    expect(jsx).toContain('ankerZin(ankerReach, ankerStop')
  })

  it("`reached_now` zegt onder een vast anker niet 'je kunt nu al stoppen' (tautologie) maar de bereik-zin", () => {
    const src = bron()
    const start = src.indexOf("kernelStatus === 'reached_now'")
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, start + 1400)
    expect(blok).toContain('isFixedAnchorMode')
    expect(blok).toContain('ankerZin(')
  })
})

describe('doelbedrag (D4) en opnamerate (bevinding 6)', () => {
  it('de doelbedrag-guard krijgt de ANKER-vlag mee; de smalle ADR 0127-vlag is weg', () => {
    expect(bron()).toContain('isAnchorPortfolio: simResult?.requiredFireIsAnchorPortfolio === true')
    expect(bron()).not.toContain('requiredFireIsStartPortfolio')
  })

  it('de vrijheidsleeftijd-tegel valt niet om op de anker-guard (eigen uitzondering op isFixedAnchorMode)', () => {
    expect(bron()).toMatch(/const showFireAgeNotice =[\s\S]{0,400}?!isFixedAnchorMode &&/)
  })

  it('KPI 2 heet onder een vast anker "Vermogen op je stopmoment" en KPI 3 (opnamerate) verdwijnt', () => {
    const src = bron()
    expect(src).toContain("isFixedAnchorMode ? 'Vermogen op je stopmoment' : 'Doelbedrag'")
    expect(src.match(/!\(isFixedAnchorMode && !hasPerspectiveHero\) && \(/g)?.length).toBe(2)
  })

  it('de doelbedrag-bon heeft onder een vast anker geen "Benodigd"-totaalregel', () => {
    expect(bron()).toContain("isFixedAnchorMode ? 'Vermogen op je stopmoment (geprojecteerd)' : 'Benodigd'")
  })

  it('de aftel-bon (dode code) is verwijderd', () => {
    expect(codeRegels().join('\n')).not.toContain('showCountdownReceipt')
  })
})
