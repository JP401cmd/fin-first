/**
 * Bron-grendel op de GRONDSLAG van het /toekomst-doelbedrag (UR3-07 defect 3).
 *
 * WAAROM EEN BRON-TEST EN GEEN RENDER-TEST: `horizon-client.tsx` is >9000 regels
 * en de fout is niet "één verkeerd getal in één situatie" maar een terugval-
 * KETEN die stil van grootheid wisselt. Vóór de fix stond er letterlijk
 *
 *     const balkVrijheidDoel = homeExcludedFromProgress
 *       ? (simResult?.requiredFirePortfolio ?? firstPaintRequiredPortfolio ?? 0)
 *       : (fireTargetInclHome ?? simResult?.requiredFirePortfolio ?? firstPaintRequiredPortfolio ?? 0)
 *
 * — in de incl.-huis-tak weken de twee laatste schakels uit naar Prognose!J
 * (liquide, zónder huis) omdat er simpelweg geen Prognose!I in de bundel zát.
 * Elke afzonderlijke schakel oogt redelijk; de KETEN wisselt van grootheid. Een
 * render-test bewijst één opgestelde situatie en ziet die keten niet. De
 * gedrag-kant staat in `lib/horizon/fire-doel-weergave.test.ts` (per woonmodus);
 * deze suite grendelt dat de component die ene beslisser ook echt consumeert en
 * er geen tweede keten naast ontstaat.
 * (Precedent: `horizon-client.hero-fire-age.test.ts` doet exact dit voor de
 * andere helft van hetzelfde kernantwoord — het MOMENT.)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')
const HOOK_PATH = join(process.cwd(), 'lib', 'hooks', 'use-horizon-fire-sim.ts')
const LOADER_PATH = join(process.cwd(), 'lib', 'horizon-data-loader.ts')

const source = readFileSync(SOURCE_PATH, 'utf8')

/** Commentaarregels tellen niet mee — een uitleg mág de oude keten citeren. */
function codeRegels(): string[] {
  return source.split(/\r?\n/).filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  })
}

describe('horizon-client — één beslisser voor de doelbedrag-grondslag', () => {
  it('consumeert de gedeelde resolver, precies één keer', () => {
    expect(source).toContain("from '@/lib/horizon/fire-doel-weergave'")
    const calls = source.match(/resolveFireDoelWeergave\s*\(/g) ?? []
    expect(calls, 'precies één plek mag de grondslag van het doelbedrag kiezen').toHaveLength(1)
  })

  it('voedt die resolver met ALLEBEI de server-waarden (anders is de eerste paint weer half)', () => {
    // Zonder Prognose!I uit de bundel kán de resolver bij de eerste paint niet
    // anders dan uitwijken naar Prognose!J — precies de bevinding.
    expect(source).toMatch(/serverRequiredNetWorthInclHome:\s*firstPaintRequiredNetWorth/)
    expect(source).toMatch(/serverRequiredPortfolioExclHome:\s*firstPaintRequiredPortfolio/)
    expect(source).toMatch(/kernelRequiredNetWorthInclHome:\s*simResult\?\.requiredFireNetWorth/)
    expect(source).toMatch(/kernelRequiredPortfolioExclHome:\s*simResult\?\.requiredFirePortfolio/)
  })

  it('leest bedrag, paar én onderschrift uit diezelfde uitkomst', () => {
    expect(source).toMatch(/const balkVrijheidDoel = fireDoel\.bedrag/)
    expect(source).toMatch(/const fireTargetInclHome = fireDoel\.inclHuis/)
    expect(source).toMatch(/const fireTargetExclHome = fireDoel\.exclHuis/)
    expect(source).toMatch(/FIRE_DOEL_ONDERSCHRIFT\[fireDoel\.grondslag\]/)
  })

  it('schrijft het onderschrift nergens meer zelf uit', () => {
    // De woorden horen náást de grondslagkeuze te staan (in fire-doel-weergave.ts).
    // Een tegel die ze zelf uitschrijft kan het bedrag laten verzetten zonder het
    // label mee te nemen — dat was het verzwarende deel van de bevinding.
    for (const literal of ['benodigd — met je huis', 'benodigd — zonder je huis']) {
      expect(
        codeRegels().filter((l) => l.includes(literal)),
        `"${literal}" hoort alleen in FIRE_DOEL_ONDERSCHRIFT te staan`,
      ).toEqual([])
    }
  })

  it('laat de oude grondslag-wisselende terugvalketen niet terugkeren', () => {
    // De kern van de bevinding: een incl.-huis-grootheid die naar een
    // excl.-huis-grootheid uitwijkt zonder dat het label meeverhuist.
    for (const regel of codeRegels()) {
      expect(
        /fireTargetInclHome\s*\?\?/.test(regel),
        `terugval vanaf het incl.-huis-doel hoort in resolveFireDoelWeergave: ${regel.trim()}`,
      ).toBe(false)
      expect(
        /requiredFireNetWorth\s*\?\?[^\n]*requiredFirePortfolio/.test(regel),
        `grondslag-wissel binnen één expressie: ${regel.trim()}`,
      ).toBe(false)
    }
  })

  it('geeft Prognose!I dezelfde first-paint-route als Prognose!J', () => {
    // De bundel draagt het veld…
    expect(readFileSync(LOADER_PATH, 'utf8')).toMatch(/^\s{2}requiredNetWorthInclHome: number \| null$/m)
    // …de hook geeft het puur door, náást zijn broer…
    const hook = readFileSync(HOOK_PATH, 'utf8')
    expect(hook).toMatch(/firstPaintRequiredNetWorth:\s*simResult \? null : initialRequiredNetWorth/)
    expect(hook).toMatch(/firstPaintRequiredPortfolio:\s*simResult \? null : initialRequiredPortfolio/)
    // …en de pagina vult 'm uit de bundel, niet uit een eigen som.
    expect(source).toMatch(/initialRequiredNetWorth:\s*initialData\.requiredNetWorthInclHome/)
  })

  it('gebruikt de canonieke server-Prognose!I ook als noemer van de balk-vulling', () => {
    // Balk-vulling en balk-label moeten op dezelfde grondslag staan; de vulling
    // bouwde Prognose!I bij de eerste paint lokaal na uit Prognose!J terwijl de
    // server hem al canoniek had.
    expect(source).toMatch(
      /const effectiveRequiredNetWorthInclHome =\s*\n\s*simResult\?\.requiredFireNetWorth \?\?\s*\n\s*firstPaintRequiredNetWorth \?\?/,
    )
  })
})
