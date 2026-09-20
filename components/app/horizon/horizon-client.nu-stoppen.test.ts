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
  it('de stop-knop is alleen onder het nu-anker verborgen; onder aow/age is hij verkenning', () => {
    // ADR 0170 — de zichtbaarheid van een knop is dát hij in `labKnopBereik` staat; de host
    // laat de stop-knop weg onder het nu-anker (het plan rekent daar met vandaag).
    const src = bron()
    const start = src.indexOf('const labKnopBereik = useMemo')
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, src.indexOf('}, [', start))
    expect(blok).toContain("planAnchor.kind !== 'now'")
    expect(blok).toContain('out.stop = {')
  })

  /**
   * Melding B-038 → TPR-09 — de vrijheidsas schrijft nooit een HALF plan.
   *
   * B-038 haalde de CTA "Maak dit mijn plan" weg omdat die een eigen PUT deed met
   * alléén anker `age`: één van de vijf plan-keuzes, de andere vier onzichtbaar.
   * TPR-09 (eigenaarsbesluit 13 sep 2026) brengt de CTA terug, maar het bezwaar
   * blijft de grendel: de as verwijst nog steeds naar de modal met álle keuzes,
   * en het schrijfpad dat de CTA gebruikt bouwt zijn body UITSLUITEND via
   * `planDraftToFireSettingsBody` (het volledige plan, route-contract R3) op een
   * draft die uit de gelezen instellingen komt — geen hand-gebouwde
   * `fire_stop_anchor: 'age'`-body meer in dit bestand.
   */
  it('de as verwijst naar de strategie-modal én schrijft het plan alleen volledig (plan-draft)', () => {
    const src = bron()
    // ADR 0170 — de verwijzing staat in het stop-slot onder de stop-knop.
    expect(src).toContain("onClick={() => setActiveModal('strategie')}")
    expect(src).toContain('Je plan-keuzes')
    expect(src, 'de CTA schrijft via de plan-draft-helper, niet met een eigen body').toContain(
      'planDraftToFireSettingsBody(',
    )
    expect(src, 'de draft start bij het GELEZEN plan (alle vijf keuzes)').toContain('planDraftFromSettings(')
    expect(
      src,
      'geen hand-gebouwde half-plan-body (het B-038-defect) in dit bestand',
    ).not.toMatch(/fire_stop_anchor:\s*'age'/)
    expect(
      src,
      'de AOW-snelknop is met B-038 vervallen en komt niet terug',
    ).not.toContain("'Op AOW-leeftijd'")
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
