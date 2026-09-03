import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Bron-grendel: in `StrategieModal` staat élke hook-aanroep BOVEN de eerste
 * early return.
 *
 * Waarom dit een grendel verdient en geen gewone test is: het component doet
 * zijn data-load in een effect en start op `loading = true`, dus iedere opening
 * loopt door de laadrender heen. Een hook die ná `if (loading) return (…)`
 * staat, wordt op die eerste render niet aangeroepen en op de render daarna
 * wél — dan wijkt de hook-volgorde af en gooit React "Rendered more hooks than
 * during the previous render". De modal is daarmee bij élke opening stuk.
 *
 * Dat is hier één keer echt gebeurd (ADR 0127, de `reachVoor`-callback stond
 * onder de returns). De volledige vitest-suite bleef groen: er is geen
 * render-test voor deze modal, en die zou de fout ook alleen zien als hij de
 * overgang loading → geladen doorloopt. `react-hooks/rules-of-hooks` ving hem
 * wel, maar lint draait niet in elke ronde. Vandaar deze grendel, die op de
 * bron werkt en dus geen render nodig heeft.
 *
 * Bewust gescopet op de eerste component-functie: alles vanaf `SummaryRow`
 * (r. ~1235) zijn losse componenten met hun eigen hook-volgorde.
 */
const BRON = readFileSync(
  path.join(process.cwd(), 'components/app/horizon/strategie-modal.tsx'),
  'utf8',
)

/** De regels van uitsluitend de `StrategieModal`-functie zelf. */
function regelsVanHetComponent(): string[] {
  const alle = BRON.split('\n')
  const start = alle.findIndex((r) => r.startsWith('export function StrategieModal('))
  expect(start, 'StrategieModal-declaratie niet gevonden — is het component hernoemd?').toBeGreaterThan(-1)
  // De eerstvolgende top-level declaratie sluit het component af.
  const restStart = alle.findIndex((r, i) => i > start && /^(export )?function \w/.test(r))
  return alle.slice(start, restStart > start ? restStart : alle.length)
}

describe('StrategieModal — hooks staan boven de early returns', () => {
  it('roept geen enkele hook aan ná de eerste early return', () => {
    const regels = regelsVanHetComponent()

    // Een early return op componentniveau: `  if (…) {` met daarachter een
    // `return (` op het volgende niveau. Twee spaties inspringing = de body van
    // het component zelf, niet die van een geneste callback.
    const eersteEarlyReturn = regels.findIndex(
      (r, i) => /^ {2}if \(/.test(r) && /^ {4}return \(/.test(regels[i + 1] ?? ''),
    )
    expect(
      eersteEarlyReturn,
      'geen early return gevonden — als die weg is, mag deze grendel weg',
    ).toBeGreaterThan(-1)

    const naDeReturn = regels.slice(eersteEarlyReturn)
    const hooksErna = naDeReturn
      .map((regel, i) => ({ regel, nr: eersteEarlyReturn + i }))
      .filter(({ regel }) => /(?:^|[^.\w])use[A-Z]\w*\s*\(/.test(regel))
      .filter(({ regel }) => !regel.trimStart().startsWith('*') && !regel.trimStart().startsWith('//'))

    expect(
      hooksErna.map(({ nr, regel }) => `regel +${nr}: ${regel.trim()}`),
      'hook-aanroep ná de early return: verplaats hem naar boven de `if (loading)`-tak, ' +
        'anders verandert de hook-volgorde tussen de laadrender en de render erna',
    ).toEqual([])
  })
})
