import { describe, it, expect } from 'vitest'
import {
  LOCAL_PENSION_DNA,
  MAX_PENSION_BLOCK_CHARS,
  MIN_PENSION_BLOCK_CHARS,
  buildLocalPensionUserPrompt,
  splitPensionBlocks,
} from './local-pension-prompt'

/** Grove tokenschatting, dezelfde 4-tekens-per-token-vuistregel als scripts/ai-parity/scan.mjs. */
function estTokens(s: string): number {
  return Math.ceil(s.length / 4)
}

describe('LOCAL_PENSION_DNA — gecondenseerd voor een 2B-model', () => {
  it('bevat de expliciete uitvoer-discipline (anders komt er proza omheen)', () => {
    expect(LOCAL_PENSION_DNA).toContain('Antwoord UITSLUITEND met een geldig JSON-object')
    expect(LOCAL_PENSION_DNA).toContain('zonder markdown-fences')
    expect(LOCAL_PENSION_DNA).toContain('Begin je antwoord direct met { en eindig met }')
  })

  it('verbiedt het model expliciet om te rekenen — dat doet TS', () => {
    expect(LOCAL_PENSION_DNA).toMatch(/Reken niets uit/i)
    expect(LOCAL_PENSION_DNA).toMatch(/deel geen bedragen door twaalf/i)
  })

  it('gebruikt geen markdown-koppen (proza-armoede is hier het doel)', () => {
    expect(LOCAL_PENSION_DNA).not.toMatch(/^#{1,6}\s/m)
    expect(LOCAL_PENSION_DNA).not.toContain('**')
  })

  it('past ruim binnen het promptbudget van één blok-aanroep', () => {
    // DNA + omkadering + een maximaal blok moeten samen onder ~1.200 tokens
    // blijven; dat is de hele reden dat we per REGELING chunken.
    const perCall = estTokens(LOCAL_PENSION_DNA) + estTokens(buildLocalPensionUserPrompt('x'.repeat(MAX_PENSION_BLOCK_CHARS)))
    expect(perCall).toBeLessThan(1200)
  })
})

describe('splitPensionBlocks — per regeling, niet per document', () => {
  it('geeft een lege lijst bij lege of nietszeggende invoer', () => {
    expect(splitPensionBlocks([])).toEqual([])
    expect(splitPensionBlocks(['', '   '])).toEqual([])
    // Te kort om een regeling te kunnen zijn → geen blok, dus geen modelcall.
    expect(splitPensionBlocks(['pagina 1'])).toEqual([])
  })

  it('snijdt een pagina op de regeling-ankers', () => {
    const page =
      'Uw pensioenoverzicht met alle opgebouwde rechten en aanspraken per peildatum. ' +
      'Pensioenuitvoerder ABP bruto 1.200,00 per maand vanaf 68 jaar waardevast opgebouwd tot nu toe. ' +
      'Pensioenfonds Zorg en Welzijn bruto 450,00 per maand vanaf 67 jaar niet geindexeerd opgebouwd.'
    const blocks = splitPensionBlocks([page])
    expect(blocks.length).toBeGreaterThanOrEqual(2)
    expect(blocks.some((b) => b.includes('ABP'))).toBe(true)
    expect(blocks.some((b) => b.includes('Zorg en Welzijn'))).toBe(true)
    // Het anker blijft bij het VOLGENDE blok plakken, zodat de fondsnaam niet
    // aan het vorige blok hangt.
    expect(blocks.find((b) => b.includes('ABP'))?.startsWith('Pensioenuitvoerder')).toBe(true)
  })

  it('behandelt een paginagrens sowieso als blokgrens', () => {
    const a = 'A'.repeat(MIN_PENSION_BLOCK_CHARS + 10)
    const b = 'B'.repeat(MIN_PENSION_BLOCK_CHARS + 10)
    expect(splitPensionBlocks([a, b])).toEqual([a, b])
  })

  it('kapt een te lang blok af op de blokgrens', () => {
    const lang = `${'woord '.repeat(2000)}`
    const blocks = splitPensionBlocks([lang])
    expect(blocks.length).toBeGreaterThan(1)
    for (const block of blocks) {
      expect(block.length).toBeLessThanOrEqual(MAX_PENSION_BLOCK_CHARS)
    }
  })

  it('normaliseert de dubbele spaties die pdfjs oplevert', () => {
    const rommelig = `Pensioenfonds    ABP     bruto    1.200,00${' netto'.repeat(20)}`
    const [block] = splitPensionBlocks([rommelig])
    expect(block).not.toMatch(/ {2}/)
  })
})

describe('buildLocalPensionUserPrompt', () => {
  it('houdt de beurt kort — de instructie zit al in de preface', () => {
    const prompt = buildLocalPensionUserPrompt('BLOKTEKST')
    expect(prompt).toContain('BLOKTEKST')
    expect(estTokens(prompt)).toBeLessThan(40)
  })
})
