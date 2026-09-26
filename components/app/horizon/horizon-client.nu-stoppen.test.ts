import { describe, it, expect } from 'vitest'
import { leesToekomst, leesToekomstAlles } from '@/lib/test-utils/toekomst-bronnen'

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

/**
 * Sinds ADR 0179 fase 1 stap 13 woont het anker in de sim-hook van de state-provider
 * (`use-toekomst-sim.ts`); de lab-afleidingen sinds stap 14 in de scenario-hook, de
 * Plan-tegels in de host.
 * "Mag nergens"-toetsen lezen alle /toekomst-bronnen samen.
 */
function bron(deel: 'sim' | 'scenario' | 'plan' = 'sim'): string {
  return leesToekomst(deel)
}

/** Niet-comment-regels van álle /toekomst-bronnen — een uitleg mág elke naam noemen. */
function codeRegels(): string[] {
  return leesToekomstAlles()
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
    expect(leesToekomstAlles()).not.toContain('Pensioen-modus actief')
    expect(leesToekomstAlles()).not.toContain('Nu-stoppen-modus actief')
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
    expect(leesToekomstAlles()).not.toContain('nuStoppenRunway: nuStoppenRunway,')
  })
})

describe('planningMode blijft tweewaardig en volgt het anker (D6/B11)', () => {
  it("'aow' → pensioen-weergave; de AOW-stop-toggle met eigen kernel-run is weg", () => {
    const src = bron()
    expect(src).toContain("const planningMode: 'fire' | 'pensioen' = isPensioenMode ? 'pensioen' : 'fire'")
    expect(leesToekomstAlles()).not.toContain("'fire' | 'pensioen' | 'nu-stoppen'")
    const code = codeRegels().join('\n')
    expect(code).not.toContain('aowStopSimResult')
    expect(code).not.toContain('isAowStopActive')
    expect(code).not.toContain('aowStopToggle')
    expect(code).not.toContain('evaluateFireAt(')
  })

})

describe('de stopkeuze (vrijheidsas)', () => {
  it('de stop-knop is alleen onder het nu-anker verborgen; onder aow/age is hij verkenning', () => {
    // ADR 0170 — de zichtbaarheid van een knop is dát hij in `labKnopBereik` staat; de host
    // laat de stop-knop weg onder het nu-anker (het plan rekent daar met vandaag).
    const src = bron('scenario')
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
    const src = bron('scenario')
    // ADR 0170 — de verwijzing staat in het stop-slot onder de stop-knop. Die knop
    // (setActiveModal('strategie') + 'Je plan-keuzes') staat sinds fase 1 stap 9 in
    // components/toekomst/doelen/doelen-lab.tsx (doelen-lab.test.ts).
    expect(src, 'de CTA schrijft via de plan-draft-helper, niet met een eigen body').toContain(
      'planDraftToFireSettingsBody(',
    )
    expect(src, 'de draft start bij het GELEZEN plan (alle vijf keuzes)').toContain('planDraftFromSettings(')
    expect(
      src,
      'geen hand-gebouwde half-plan-body (het B-038-defect) in dit bestand',
    ).not.toMatch(/fire_stop_anchor:\s*'age'/)
    expect(leesToekomstAlles()).not.toMatch(/fire_stop_anchor:\s*'age'/)
    expect(
      src,
      'de AOW-snelknop is met B-038 vervallen en komt niet terug',
    ).not.toContain("'Op AOW-leeftijd'")
  })

  it('de default van de slider is onder een vast anker het stopmoment van het plan', () => {
    expect(bron('scenario')).toContain('isFixedAnchorMode && planStopAgeDefault != null')
  })
})

describe('doelbedrag (D4) en opnamerate (bevinding 6)', () => {
  it('de doelbedrag-guard krijgt de ANKER-vlag mee; de smalle ADR 0127-vlag is weg', () => {
    expect(bron()).toContain('isAnchorPortfolio: simResult?.requiredFireIsAnchorPortfolio === true')
    expect(leesToekomstAlles()).not.toContain('requiredFireIsStartPortfolio')
  })

  it('de vrijheidsleeftijd-tegel valt niet om op de anker-guard (eigen uitzondering op isFixedAnchorMode)', () => {
    expect(bron('plan')).toMatch(/const showFireAgeNotice =[\s\S]{0,400}?!isFixedAnchorMode &&/)
  })

  it('de aftel-bon (dode code) is verwijderd', () => {
    expect(codeRegels().join('\n')).not.toContain('showCountdownReceipt')
  })
})
