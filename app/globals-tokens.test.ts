import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vangrail voor een val die in aug 2026 stil toesloeg: de bouw snoeit custom
 * properties uit `:root` die nergens ÍN de CSS worden gerefereerd. Een token dat
 * alleen vanuit een JSX-inline-style of een conic-gradient wordt gelezen
 * (`style={{ background: 'var(--coverage-inkomen)' }}`) haalt de gecompileerde
 * stylesheet dus niet. Er komt geen fout: de waarde is simpelweg leeg, waardoor
 * de hele declaratie ongeldig wordt en het element transparant rendert — precies
 * hoe de dekkingsbollen van de levensinkomenstrook leeg op het scherm kwamen,
 * terwijl `tsc`, alle tests én de bronbestanden er correct uitzagen.
 *
 * Het huis-patroon dat dit voorkomt: definieer in `:root` en map het token in
 * `@theme inline` als `--color-<naam>: var(--<naam>)`. Die referentie houdt 'm
 * levend én levert meteen Tailwind-utilities op.
 */

/**
 * Comments eruit vóór elke controle. Zonder dit telt een token dat alleen in
 * een toelichting wordt genoemd als "gemapt" — en juist die comments noemen de
 * tokens hier bij naam, dus de vangrail zou zichzelf groen praten.
 */
function zonderComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ')
}

const CSS = zonderComments(readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8'))

/** De inhoud van het `@theme inline`-blok (waar de mapping hoort te staan). */
function themeInlineBlok(css: string): string {
  const start = css.indexOf('@theme inline')
  expect(start, 'app/globals.css hoort een `@theme inline`-blok te hebben').toBeGreaterThan(-1)
  const open = css.indexOf('{', start)
  let diepte = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') diepte++
    else if (css[i] === '}') {
      diepte--
      if (diepte === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error('`@theme inline`-blok is niet gesloten')
}

describe('globals.css — tokens die alleen vanuit JS worden gelezen', () => {
  it('elk --coverage-*-token is in @theme inline gerefereerd, anders snoeit de bouw het weg', () => {
    const gedefinieerd = [...CSS.matchAll(/^\s*(--coverage-[a-z-]+)\s*:/gm)].map(m => m[1])
    expect(gedefinieerd.length, 'verwacht --coverage-*-tokens in globals.css').toBeGreaterThan(0)

    const theme = themeInlineBlok(CSS)
    const ongemapt = gedefinieerd.filter(naam => !theme.includes(`var(${naam})`))
    expect(
      ongemapt,
      `deze tokens worden weggesnoeid omdat ze nergens in de CSS staan; voeg ` +
        `--color-<naam>: var(<naam>) toe aan @theme inline`,
    ).toEqual([])
  })

  it('elk --coverage-*-token dat een component gebruikt, bestaat ook echt', () => {
    const strook = zonderComments(
      readFileSync(join(process.cwd(), 'components/app/horizon/levensinkomen-strook.tsx'), 'utf8'),
    )
    const gebruikt = [...new Set([...strook.matchAll(/var\((--coverage-[a-z-]+)\)/g)].map(m => m[1]))]
    expect(gebruikt.length, 'de strook hoort de coverage-tokens te gebruiken').toBeGreaterThan(0)

    const ontbrekend = gebruikt.filter(naam => !new RegExp(`^\\s*${naam}\\s*:`, 'm').test(CSS))
    expect(ontbrekend, 'component verwijst naar een token dat niet in globals.css staat').toEqual([])
  })
})
