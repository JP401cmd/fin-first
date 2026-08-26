/**
 * Bron-grendel op het kernantwoord van /toekomst (bevinding C1).
 *
 * WAAROM EEN BRON-TEST EN GEEN RENDER-TEST: `horizon-client.tsx` is >9000
 * regels. Een render-test kan bewijzen dat de hero-KPI in één opgestelde
 * situatie het goede getal toont; hij kan niet bewijzen dat er nérgens anders in
 * het bestand nog een tweede motor mag antwoorden. En juist dát was de fout:
 * niet één verkeerd getal, maar drie bronnen die op dezelfde plek mochten
 * antwoorden — de kernel, een oude snapshot, en `computeFireProjection` uit
 * `lib/horizon/fire-scalar.ts`. Wie op het verkeerde moment keek, las een ander
 * antwoord. Dus lezen we de bron en eisen we dat er precies één beslisser is.
 * (Precedent: `horizon-client.euro-view.test.ts` leest de bron óók letterlijk.)
 *
 * DRIE REGELS:
 *  1. het bestand consumeert `resolveHeroFireAge` — precies één keer aangeroepen;
 *  2. geen enkele niet-comment-regel gebruikt nog `fire.fireAge` / `fire?.fireAge`
 *     / `fire!.fireAge!`, tenzij hij een `// tweede-motor: exempt`-markering draagt;
 *  3. hetzelfde voor `fire?.fireTarget` — het doelbedrag is de tweede helft van
 *     het kernantwoord en dreef om dezelfde reden weg.
 *
 * De exempt-markering is bewust géén ontsnapping maar een aantekening: hij mag
 * alleen op een plek staan die aantoonbaar níét het kernantwoord toont, en de
 * reden staat in de regel erbij.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')

/** De legacy-scalarmotor als tweede antwoord op de FIRE-leeftijd. */
const LEGACY_FIRE_AGE = /\bfire[?!]?\.fireAge\b/
/** Dezelfde motor als tweede antwoord op het doelbedrag. */
const LEGACY_FIRE_TARGET = /\bfire[?!]?\.fireTarget\b/

const EXEMPT_MARK = '// tweede-motor: exempt'

function readSourceLines(): string[] {
  return readFileSync(SOURCE_PATH, 'utf8').split(/\r?\n/)
}

/** Commentaarregels tellen niet mee — een uitleg mág de oude naam noemen. */
function isCommentLine(line: string): boolean {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

/**
 * Draagt deze regel — of een van de vier regels erboven — een
 * exempt-markering? Vier, omdat de motivering in dit bestand als blokje boven
 * de regel staat en niet op één regel past.
 */
function isExempt(lines: string[], index: number): boolean {
  for (let i = index; i >= Math.max(0, index - 4); i--) {
    if (lines[i].includes(EXEMPT_MARK)) return true
  }
  return false
}

function schendingen(pattern: RegExp): string[] {
  const lines = readSourceLines()
  const hits: string[] = []
  lines.forEach((line, index) => {
    if (isCommentLine(line)) return
    if (!pattern.test(line)) return
    if (isExempt(lines, index)) return
    hits.push(`regel ${index + 1}: ${line.trim()}`)
  })
  return hits
}

describe('horizon-client — één beslisser voor het kernantwoord', () => {
  it('consumeert de gedeelde resolver, precies één keer', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8')
    expect(source).toContain("from '@/lib/horizon/hero-fire-age'")
    const calls = source.match(/resolveHeroFireAge\s*\(/g) ?? []
    expect(calls, 'precies één plek mag het kernantwoord bepalen').toHaveLength(1)
  })

  it('gebruikt de hero-tekst uit de resolver op de KPI-oppervlakken', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8')
    // Desktop-KPI + mobiele KPI's + beide kassabons consumeren de afgeleide
    // teksten; staat er geen enkele, dan is de resolver wel aangeroepen maar
    // niet getoond.
    expect(source).toContain('heroFireAgeText')
    expect(source).toContain('heroFireAgeReceiptText')
    expect(source).toContain('heroFireAgeCaption(')
  })
})

describe('horizon-client — geen tweede motor op het kernantwoord', () => {
  it('gebruikt nergens nog fire.fireAge zonder expliciete uitzondering', () => {
    expect(schendingen(LEGACY_FIRE_AGE)).toEqual([])
  })

  it('gebruikt nergens nog fire.fireTarget zonder expliciete uitzondering', () => {
    expect(schendingen(LEGACY_FIRE_TARGET)).toEqual([])
  })

  it('de uitzonderingen zijn er weinig en staan er bewust', () => {
    // Krimpen mag altijd; groeien is een signaal dat de grendel uitholt.
    const lines = readSourceLines()
    const marks = lines.filter(l => l.includes(EXEMPT_MARK)).length
    expect(marks, 'aantal tweede-motor-uitzonderingen mag niet groeien').toBeLessThanOrEqual(2)
  })
})
