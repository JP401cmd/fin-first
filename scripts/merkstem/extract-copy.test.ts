import { describe, expect, it } from 'vitest'
import { extractCopy } from './extract-copy.mjs'

/**
 * De JSX-pas van de merkstem-extractie las een tekstknoop alleen als er geen
 * accolade tussen `>` en `<` stond. Prettier zet echter een `{' '}` neer zodra
 * een zin een inline element bevat — precies hoe claim-dragende zinnen
 * geschreven worden (nadruk plus link naar het beleid). Die zinnen vielen
 * daardoor in hun GEHEEL weg, niet gedeeltelijk.
 *
 * Gemeten op 7 sep 2026 tegen HEAD: 17 copyregels onzichtbaar in 9 van de 25
 * geattesteerde bestanden, systematisch de claim-dragende — het merkmotto, de
 * AVG-claim op veiligheid.tsx, de Wft-disclaimer op contact/page.tsx.
 * `merkstem:check` stond daardoor groen over een niet-geattesteerde
 * claimwijziging heen.
 */

const jsx = (source: string) => extractCopy(source, { jsx: true })

describe('extractCopy — JSX-tekstknopen naast een expressie-container', () => {
  it('ziet de tekst vóór een {\' \'}-container', () => {
    const bron = `export default function X() {
      return (
        <p>
          Geld is opgeslagen{' '}
          <em>tijd</em>
        </p>
      )
    }`
    expect(jsx(bron)).toContain('Geld is opgeslagen')
  })

  it('ziet de tekst aan beide zijden van een {\' \'}-container', () => {
    const bron = `export default function X() {
      return (
        <p>
          Je gegevens worden versleuteld opgeslagen in de EU{' '}
          <strong>en nooit verkocht aan derden.</strong>
        </p>
      )
    }`
    const regels = jsx(bron)
    expect(regels).toContain('Je gegevens worden versleuteld opgeslagen in de EU')
    expect(regels).toContain('en nooit verkocht aan derden.')
  })

  it('ziet een zin die door een inline link in tweeën wordt geknipt', () => {
    const bron = `export default function X() {
      return (
        <p>
          We bieden geen persoonlijk financieel advies.{' '}
          <Link href="/wft">Lees waarom</Link>{' '}
          in onze toelichting.
        </p>
      )
    }`
    const regels = jsx(bron)
    expect(regels).toContain('We bieden geen persoonlijk financieel advies.')
    expect(regels).toContain('Lees waarom')
    expect(regels).toContain('in onze toelichting.')
  })

  it('blijft een gewone tekstknoop zonder container gewoon zien', () => {
    const bron = `export default function X() {
      return <p>Gegevens verlaten je browser pas bij verzending</p>
    }`
    expect(jsx(bron)).toContain('Gegevens verlaten je browser pas bij verzending')
  })

  it('levert geen codefragmenten op uit een bestand zonder JSX', () => {
    // De JSX-pas is uit voor .ts; deze toets bewaakt dat de fix die grens niet
    // ondermijnt — `<` en `>` zijn daar vergelijkingsoperatoren.
    const bron = `export function f(a: number, b: number) {
      if (a > 0 && b < 10) return 'ok'
      return 'nee'
    }`
    expect(extractCopy(bron, { jsx: false })).toEqual([])
  })

  it('laat een leeg codeblok zijn rol als grens houden', () => {
    // `{}` mag NIET als witruimte-container gelden: hij scheidt JSX-copy van
    // omringende code. Blank je hem, dan smelten `<div>`-tekst en codefragment
    // aaneen tot één "copyregel" en lekt code de attestatie-hash in.
    const bron = `const cmp = <div>Hoi daar</div>
    function noop() {}
    const x = alpha < beta`
    const regels = jsx(bron)
    expect(regels).toContain('Hoi daar')
    expect(regels.join(' ')).not.toContain('function noop')
    expect(regels.join(' ')).not.toContain('alpha')
  })

  it('laat een leeg object-literal zijn rol als grens houden', () => {
    const bron = `const cmp = <p>Welkom terug</p>
    const defaults = {}
    const y = count < limit`
    const regels = jsx(bron)
    expect(regels).toContain('Welkom terug')
    expect(regels.join(' ')).not.toContain('defaults')
    expect(regels.join(' ')).not.toContain('count')
  })

  it('behandelt een string-container met echte tekst niet als witruimte', () => {
    // `{'Hallo wereld hier'}` is copy op een eigen positie, geen lijm. Zou hij
    // als witruimte geblankt worden, dan smelten de twee tekstknopen samen en
    // verschuift de leesvolgorde (die bewust in de hash meetelt).
    const bron = `export default function X() {
      return <p>Voor de link{'Hallo wereld hier'}na de link</p>
    }`
    const regels = jsx(bron)
    expect(regels.join(' ')).not.toContain('Voor de link na de link')
  })

  it('houdt de leesvolgorde aan', () => {
    const bron = `export default function X() {
      return (
        <p>
          Eerste zin hier.{' '}
          <em>Tweede stuk</em>{' '}
          derde stuk erachteraan.
        </p>
      )
    }`
    const regels = jsx(bron)
    expect(regels.indexOf('Eerste zin hier.')).toBeLessThan(regels.indexOf('Tweede stuk'))
    expect(regels.indexOf('Tweede stuk')).toBeLessThan(regels.indexOf('derde stuk erachteraan.'))
  })
})
