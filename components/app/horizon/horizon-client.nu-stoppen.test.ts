import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * BRON-GRENDEL op de 'nu-stoppen'-takken in horizon-client.tsx (ADR 0127).
 *
 * WAAROM EEN BRON-TEST (precedent: horizon-client.hero-fire-age.test.ts /
 * .euro-view.test.ts): dit bestand is >9000 regels en de fout die dit besluit
 * oploste is niet "één verkeerd getal" maar STILLE DISPATCH — `simResult.strategy
 * === 'pensioen'` op ~20 plekken, waar een vijfde strategie zwijgend in de
 * else-tak belandt. Een render-test bewijst één situatie; hij bewijst niet dat
 * de vlag er is waar hij hoort. Dus lezen we de bron.
 *
 * De regels hieronder zijn precies de plekken waar "half zichtbaar" ontstond.
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

describe('de modus-vlag bestaat en komt uit de kernel-uitvoer', () => {
  it("leidt `isNuStoppenMode` af uit simResult.strategy — spiegel van isPensioenMode", () => {
    expect(bron()).toContain("const isNuStoppenMode = simResult?.strategy === 'nu-stoppen'")
  })

  it('leidt het bereik af met de gedeelde helper, niet met een eigen maand→leeftijd-som', () => {
    expect(bron()).toContain('nuStoppenReachFromSim(')
    // Geen tweede conversie in dit bestand: die woont in nu-stoppen-copy.ts.
    const eigenSom = codeRegels().filter((l) => /kernelDepletionMonth\s*\/\s*12/.test(l))
    expect(eigenSom).toEqual([])
  })
})

describe('het kernantwoord loopt via resolveHeroFireAge', () => {
  it('geeft zowel de vlag als de runway door (anders toont de hero de startleeftijd)', () => {
    const src = bron()
    expect(src).toContain('isNuStoppenMode,')
    expect(src).toContain('nuStoppenRunway: nuStoppenRunway,')
  })

  it("'onbekend' wordt NOOIT als volledige dekking doorgegeven", () => {
    // depletionAgeFractional: null betekent in resolveHeroFireAge "reikt tot de
    // eindleeftijd". Een ontbrekend antwoord mag die vorm niet aannemen.
    expect(bron()).toMatch(/case 'onbekend':\s*\n\s*return null/)
  })
})

describe('planningMode blijft tweewaardig (D6)', () => {
  it('krijgt geen derde modus', () => {
    expect(bron()).toContain("const planningMode: 'fire' | 'pensioen' =")
    expect(bron()).not.toContain("'fire' | 'pensioen' | 'nu-stoppen'")
  })
})

describe('de stop-keuze is een instelling, geen tweede schuif', () => {
  it('de stop-slider/koppel-checkbox worden verborgen onder deze strategie', () => {
    expect(bron()).toContain('stopKeuzeVerborgen={isNuStoppenMode}')
  })

  it('de AOW-stop-toggle verschijnt niet: isShortfallScenario sluit de modus uit', () => {
    expect(bron()).toMatch(/const isShortfallScenario = !isPensioenMode\s*\n\s*&& !isNuStoppenMode/)
  })
})

describe('statusblokken', () => {
  it("`stop_now_shortfall` heeft een EIGEN blok (geen hergebruik van pension_shortfall)", () => {
    expect(bron()).toContain("kernelStatus === 'stop_now_shortfall'")
  })

  it('dat blok noemt de AOW niet — het tekort kan er ook ná vallen (D2)', () => {
    const src = bron()
    const start = src.indexOf("kernelStatus === 'stop_now_shortfall'")
    expect(start).toBeGreaterThan(-1)
    // Het blok is kort; kijk naar het JSX-fragment dat erop volgt.
    const blok = src.slice(start, start + 900)
    const jsx = blok.slice(0, blok.indexOf('</div>'))
    expect(jsx).not.toMatch(/AOW/)
  })

  it("`reached_now` zegt onder deze strategie niet 'je kunt nu al stoppen' (tautologie)", () => {
    const src = bron()
    const start = src.indexOf("kernelStatus === 'reached_now'")
    expect(start).toBeGreaterThan(-1)
    const blok = src.slice(start, start + 1400)
    expect(blok).toContain('isNuStoppenMode')
    expect(blok).toContain('nuStoppenZin(')
  })
})

describe('doelbedrag (D4)', () => {
  it('de doelbedrag-guard krijgt de start-portfolio-vlag mee', () => {
    expect(bron()).toContain(
      'isStartPortfolio: simResult?.requiredFireIsStartPortfolio === true',
    )
  })

  it('de vrijheidsleeftijd-tegel valt daar niet mee om (eigen uitzondering)', () => {
    expect(bron()).toMatch(/const showFireAgeNotice =[\s\S]{0,600}?!isNuStoppenMode &&/)
  })
})
