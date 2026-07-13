import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import fg from 'fast-glob'

/**
 * Regressie-guard: verbiedt een NIEUWE lokale herberekening van de jaarruimte-
 * belastingbesparing (`jaarruimte × marginaal tarief`) buiten de canonieke
 * helper `jaarruimteBesparing()` in `lib/jaarruimte.ts`.
 *
 * Achtergrond: de besparing is vijf keer eerder lokaal herberekend op vier
 * runtime-oppervlakken (JaarruimteCard, belasting-hub, aandachtspunten-
 * loader, AI-tax-context) + de belast-acceptance-oracle — steeds met de oude,
 * fiscaal onjuiste VLAKKE `ruimte × marginaal`-benadering i.p.v. de marginaal-
 * correcte `computeBox1Tax(gross) − computeBox1Tax(gross − inleg)` (ADR
 * 0040/0041). Deze test scant de bronmap op het duplicatiepatroon zodat de
 * volgende `× marg`-kopie meteen rood valt in plaats van pas bij een audit.
 *
 * Bewust simpel gehouden (string/regex-scan via fs, geen AST): snel, geen
 * extra dependency, en het patroon dat we willen vangen is lexicaal — een
 * `jaarruimte`-achtige identifier direct vermenigvuldigd met iets — niet iets
 * dat semantische analyse vereist.
 */
describe('jaarruimte-besparing — regressie-guard tegen lokale herberekening', () => {
  // Bestanden die het duplicatiepatroon LEGITIEM mogen bevatten: de canonieke
  // helper-definitie zelf, de bijbehorende unit-tests (die pinnen expres het
  // verschil met de oude vlakke benadering) en deze guard-test zelf (de regex
  // in commentaar/string-vorm zou anders zichzelf matchen).
  const ALLOWLIST = new Set<string>([
    'lib/jaarruimte.ts',
    'lib/jaarruimte.test.ts',
    'lib/jaarruimte-besparing-guard.test.ts',
  ])

  // Het verboden patroon: een `jaarruimte`-identifier (los, of als property-
  // access zoals `jr.jaarruimte` / `result.jaarruimte`) direct vermenigvuldigd
  // met iets — dat is per definitie een lokale "ruimte × tarief"-herberekening
  // i.p.v. een call naar `jaarruimteBesparing()`. Bewust [ \t]* i.p.v. \s*: een
  // kale \s* matcht ook over regeleinden heen (bv. "jaarruimte" op het eind
  // van een JSDoc-zin gevolgd door een `* volgende regel`-commentaarster),
  // wat valse positieven geeft. We willen alleen dezelfde-regel-vermenigvuldiging.
  const FORBIDDEN_PATTERN = /\bjaarruimte\b[ \t]*\*[ \t]*/i

  it('geen enkel bestand buiten de allowlist herberekent jaarruimte × iets', async () => {
    const root = join(__dirname, '..')
    const files = await fg(['lib/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'], {
      cwd: root,
      ignore: ['**/node_modules/**', '**/*.d.ts'],
      absolute: true,
    })

    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(root, file).replace(/\\/g, '/')
      if (ALLOWLIST.has(rel)) continue
      const content = readFileSync(file, 'utf-8')
      if (FORBIDDEN_PATTERN.test(content)) {
        offenders.push(rel)
      }
    }

    expect(
      offenders,
      `Lokale jaarruimte-herberekening gevonden buiten de allowlist. Gebruik de ` +
        `canonieke \`jaarruimteBesparing()\` uit lib/jaarruimte.ts i.p.v. een eigen ` +
        `\`jaarruimte × tarief\`-som (ADR 0040/0041). Bestanden: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('sanity: het patroon matcht daadwerkelijk de oude, verboden vorm', () => {
    expect(FORBIDDEN_PATTERN.test('const besparing = Math.round(jr.jaarruimte * tessaMarg)')).toBe(
      true,
    )
    expect(FORBIDDEN_PATTERN.test('const besparing = Math.round(jaarruimte * marg)')).toBe(true)
    expect(FORBIDDEN_PATTERN.test('const x = jaarruimte.jaarruimte * 0.495')).toBe(true)
  })

  it('sanity: de canonieke call-vorm matcht NIET (geen false positive)', () => {
    expect(FORBIDDEN_PATTERN.test('jaarruimteBesparing(gross, inleg, 2026)')).toBe(false)
    expect(FORBIDDEN_PATTERN.test('const jr = computeJaarruimte(gross, factorA, 2026)')).toBe(
      false,
    )
  })
})
