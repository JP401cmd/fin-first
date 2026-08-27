/**
 * Bron-grendel op het "Wat hoort daarbij?"-blok in `horizon-client.tsx` (bevinding M2).
 *
 * WAAROM EEN BRON-TEST: `horizon-client.tsx` is >9000 regels en het blok hangt aan een
 * derde kernel-run (het stop-pad) die alleen bestaat zodra er een stopleeftijd gezet is.
 * Een render-test zou een volledige horizon-bundel + drie kernel-runs moeten opstellen om
 * één zin te bewijzen. Wat we hier moeten uitsluiten is bovendien niet "staat de zin er",
 * maar twee dingen die een render-test juist NIET vangt:
 *  1. dat het getal uit de stop-run komt (`stopPad.maandHint`) en niet uit een tweede,
 *     lokaal opgetuigde som — precies de drift die de bevinding zou terugbrengen;
 *  2. dat de copy binnen de Wft-grens blijft: inzicht mag, aanbevelen niet.
 * (Precedent: `horizon-client.euro-view.test.ts`, `horizon-client.hero-fire-age.test.ts`
 * en `horizon-client.prognose-precisie.test.ts` lezen de bron óók letterlijk.)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')

function source(): string {
  return readFileSync(SOURCE_PATH, 'utf8')
}

describe('horizon-client — "Wat hoort daarbij?" consumeert de stop-run', () => {
  it('leest het bedrag uit `stopPad.maandHint` (één bron, geen eigen som)', () => {
    const src = source()
    expect(src).toContain('const perMaand = stopPad.maandHint')
  })

  it('gate is het teken van de hint zelf — geen tweede dekkingspercentage in dit blok', () => {
    const src = source()
    expect(src).toContain('if (!Number.isFinite(perMaand) || perMaand <= 0) return null')
    // Zou er hier alsnog een eigen dekkingsgraad worden uitgerekend, dan bestaan er twee
    // lezingen van dezelfde vraag naast elkaar (blok vs. Dekkingsradar).
    const memo = src.slice(src.indexOf('const stopPadTekortHint'), src.indexOf('const radarAssen'))
    expect(memo).not.toMatch(/coveragePctForRow|requiredFirePortfolio|\/\s*doelbedrag/)
  })

  it('zet de vrijheidstijd om via de canonieke helper op de bundel-dagbasis', () => {
    const src = source()
    const memo = src.slice(src.indexOf('const stopPadTekortHint'), src.indexOf('const radarAssen'))
    expect(memo).toContain('calculateFreedomTime(perMaand, canonicalDailyRate)')
    // Geen handgerolde deling door een dagtarief.
    expect(memo).not.toMatch(/perMaand\s*\/\s*/)
  })

  it('toont het prognose-bedrag in de ca.-conventie (formatMaskedApproxCurrency)', () => {
    const src = source()
    expect(src).toContain('formatMaskedApproxCurrency(stopPadTekortHint.perMaand, masked)')
  })
})

describe('horizon-client — "Wat hoort daarbij?" blijft binnen de Wft-grens', () => {
  /** De copy van het blok: van de kicker tot het einde van de sluitregel. */
  function blokCopy(): string {
    const src = source()
    const start = src.indexOf('<p className="mb-1 label-editorial text-[var(--ink-3)]">Wat hoort daarbij?</p>')
    expect(start, 'het "Wat hoort daarbij?"-blok moet bestaan').toBeGreaterThan(-1)
    const eind = src.indexOf('uitgesmeerd over de maanden tot je eindleeftijd', start)
    expect(eind, 'de sluitregel moet ná de kicker staan').toBeGreaterThan(start)
    return src.slice(start, eind)
  }

  it('formuleert als rekenuitkomst ("hoort daar … bij"), niet als opdracht', () => {
    expect(blokCopy()).toContain('hoort daar')
  })

  it('draagt de app-brede disclaimer-conventie', () => {
    expect(source()).toContain('Indicatie, geen advies —')
  })

  it('bevat geen aanbevelende of belovende formuleringen', () => {
    const copy = blokCopy()
    for (const verboden of [
      'je moet',
      'wij raden',
      'we raden',
      'ons advies',
      'verhoog je',
      'verlaag je',
      'zorg dat je',
      'maakt het wél haalbaar',
      'gegarandeerd',
    ]) {
      expect(copy.toLowerCase(), `advies-formulering in de copy: "${verboden}"`).not.toContain(verboden)
    }
  })
})
