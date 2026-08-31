/**
 * Regressie bij UR2-07 — het romeinse cijfer in de onboarding-kop stond voor
 * twee verschillende categorienamen.
 *
 * ## Wat het cijfer betekent
 *
 * De romeinse num in de `OnboardingShell`-kop is geen decoratie en geen
 * schermteller: het is de GROEP-index uit `STEP_GROUP`
 * (`app/(onboarding)/onboarding/page.tsx`), dezelfde index die de
 * voortgangsbalk aandrijft. Meerdere schermen delen bewust één groep — de
 * inkomen-groep draagt drie vragen (verdienen, uitgeven, uitgaven later) en
 * blijft daarmee één stap van de zeven.
 *
 * Daaruit volgt de invariant: het cijfer noemt de groep, dus binnen één cijfer
 * hoort exact één kicker te staan. Stond er iii. boven zowel "Bezit" als
 * "Schuld", dan zou de gebruiker denken dat hij een nieuwe categorie in gaat
 * terwijl de teller stilstaat. Precies dat gebeurde bij ii.: "Inkomen" op twee
 * schermen, "Later" op het derde.
 *
 * ## Waarom een BRON-test
 *
 * De invariant loopt OVER componenten heen — geen enkel scherm kan hem in
 * z'n eentje breken of bewijzen. Elk scherm apart renderen zou drie
 * prop-sets vergen en nog steeds niet zien dat twee bestanden hetzelfde cijfer
 * anders labelen. De koppen staan als letterlijke stringparen in de bron; dat
 * is de plek waar de taxonomie te controleren valt.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// vitest draait vanuit de repo-root (vitest.config.ts staat daar).
const ROOT = path.resolve(process.cwd(), 'components/onboarding')

/** Eén gevonden kop: het romeinse cijfer met de categorienaam ernaast. */
export interface KickerPair {
  file: string
  line: number
  kicker: string
  romanNum: string
}

const KICKER = /\bkicker(?:=|:\s*)["']([^"']+)["']/
const ROMAN = /\bromanNum(?:=|:\s*)["']([^"']+)["']/

/**
 * Verzamelt de kop-paren uit een bronbestand. Een kop is een `kicker` met een
 * letterlijke string, direct gevolgd door een `romanNum` met een letterlijke
 * string — de vorm die alle stap-componenten gebruiken, zowel als
 * JSX-attributen als als object-properties in een config-literal.
 *
 * Koppen die hun kicker/num dóórgeven als variabele (`section-review.tsx`)
 * dragen hier geen eigen taxonomie en blijven buiten beschouwing: de waarde
 * komt daar van de aanroeper, die zelf wél gescand wordt.
 */
export function findKickerPairs(source: string, file: string): KickerPair[] {
  const lines = source.split('\n')
  const found: KickerPair[] = []

  for (let i = 0; i < lines.length - 1; i++) {
    const k = KICKER.exec(lines[i])
    if (!k) continue
    const r = ROMAN.exec(lines[i + 1])
    if (!r) continue
    found.push({ file, line: i + 1, kicker: k[1], romanNum: r[1] })
  }

  return found
}

function collectSources(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.tsx') && !e.name.includes('.test.'))
    .map((e) => path.join(dir, e.name))
}

/** Groepeert de gevonden koppen per romeins cijfer. */
function byRomanNum(pairs: KickerPair[]): Map<string, KickerPair[]> {
  const map = new Map<string, KickerPair[]>()
  for (const p of pairs) {
    const bucket = map.get(p.romanNum)
    if (bucket) bucket.push(p)
    else map.set(p.romanNum, [p])
  }
  return map
}

describe('Onboarding-kop — één categorienaam per romeins cijfer', () => {
  /*
    Positieve controle. Zonder deze zou een groene suite óók groen zijn als de
    detector niets meer vindt — de val bij elke bron-scannende test. Dit
    fragment is de bronvorm zoals hij vóór de fix stond: twee bestanden, één
    cijfer, twee namen.
  */
  it('detecteert de bronvorm die het defect veroorzaakte', () => {
    const inkomen = ['<OnboardingShell', '  kicker="Inkomen"', '  romanNum="ii."'].join('\n')
    const later = ['<OnboardingShell', '  kicker="Later"', '  romanNum="ii."'].join('\n')

    const pairs = [
      ...findKickerPairs(inkomen, 'inkomen.tsx'),
      ...findKickerPairs(later, 'later.tsx'),
    ]

    expect(pairs).toHaveLength(2)
    expect(byRomanNum(pairs).get('ii.')?.map((p) => p.kicker)).toEqual(['Inkomen', 'Later'])
  })

  it('leest ook de object-literal-vorm van de ja/nee-loops', () => {
    const loop = ["  const kop = {", "    kicker: 'Bezit',", "    romanNum: 'iii.',", '  }'].join(
      '\n',
    )

    expect(findKickerPairs(loop, 'bezittingen.tsx')).toEqual([
      { file: 'bezittingen.tsx', line: 2, kicker: 'Bezit', romanNum: 'iii.' },
    ])
  })

  it('elk romeins cijfer draagt precies één categorienaam', () => {
    const pairs = collectSources(ROOT).flatMap((file) =>
      findKickerPairs(fs.readFileSync(file, 'utf8'), path.relative(ROOT, file)),
    )

    // Vangnet tegen een stilgevallen detector: de flow telt acht genummerde
    // koppen, meerdere daarvan op meer dan één plek in de bron.
    expect(pairs.length, 'geen enkele genummerde kop gevonden — detector kapot?').toBeGreaterThan(
      10,
    )

    const conflicts = [...byRomanNum(pairs).entries()]
      .filter(([, group]) => new Set(group.map((p) => p.kicker)).size > 1)
      .map(([num, group]) => {
        const namen = group.map((p) => `"${p.kicker}" (${p.file}:${p.line})`).join(', ')
        return `${num} → ${namen}`
      })

    expect(
      conflicts,
      'het romeinse cijfer is de groep-index uit STEP_GROUP: schermen die ' +
        'dezelfde groep delen horen dezelfde categorienaam te dragen',
    ).toEqual([])
  })

  it('elke categorienaam hoort bij precies één romeins cijfer', () => {
    const pairs = collectSources(ROOT).flatMap((file) =>
      findKickerPairs(fs.readFileSync(file, 'utf8'), path.relative(ROOT, file)),
    )

    const perKicker = new Map<string, Set<string>>()
    for (const p of pairs) {
      const bucket = perKicker.get(p.kicker) ?? new Set<string>()
      bucket.add(p.romanNum)
      perKicker.set(p.kicker, bucket)
    }

    const conflicts = [...perKicker.entries()]
      .filter(([, nums]) => nums.size > 1)
      .map(([kicker, nums]) => `"${kicker}" → ${[...nums].join(', ')}`)

    expect(conflicts, 'een categorienaam die onder twee cijfers staat').toEqual([])
  })
})
