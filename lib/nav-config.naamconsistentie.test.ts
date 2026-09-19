import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LABEL_UITZONDERINGEN, MERKTAAL_VERANTWOORDING, resolveRouteTitle } from './nav-config'
import { getAllPageItems } from './command-palette/navigation-index'

/**
 * NAAMCONSISTENTIE — dezelfde route mag niet twee namen dragen (UR3-30).
 *
 * Aanleiding: bevinding M14. De zijbalk hield een eigen literal "Nieuws" aan
 * terwijl nav-config, het commandopalet en de pagina zelf al "Krant" zeiden —
 * drie weken lang, zonder dat iets roodliep. Een label zit in deze app op vier
 * tot zes plekken; dit is de gate die dat bij elkaar houdt.
 *
 * Canoniek = `resolveRouteTitle(href)` uit lib/nav-config.ts. Elke andere bron
 * moet datzelfde woord zeggen, tenzij de href in `LABEL_UITZONDERINGEN` staat —
 * mét de reden erbij. Die kaart ís de vastlegging die acceptatiecriterium 2
 * vraagt ("is vastgelegd waarom dat label die uitzondering verdient").
 *
 * Twee bronnen worden op de BRONTEKST gescand (zijbalk-literals en het
 * avatar-menu in de TopBar) omdat het losse literals in een client-component
 * zijn; beide scans eisen een minimumaantal treffers, zodat een herschrijving
 * die de scan breekt hier rood wordt in plaats van stil groen.
 *
 * Bijt-proef: zet de zijbalk-rij terug op `label: 'Nieuws'` → rood.
 */

const SIDEBAR = 'components/app/shell/sidebar.tsx'
const TOP_BAR = 'components/app/shell/top-bar.tsx'

function bron(pad: string): string {
  const volledig = resolve(process.cwd(), pad)
  if (!existsSync(volledig)) throw new Error(`naamconsistentie: ${pad} bestaat niet meer`)
  return readFileSync(volledig, 'utf8')
}

type Paar = { href: string; label: string; bron: string }

/**
 * Zijbalk: `OVERIGE_BASE` en `FOOTER_LINKS` zijn objectliteralen waarin het
 * label vóór de href staat. De rest van de zijbalk leest `menuNav` uit
 * nav-config en kan per constructie niet driften.
 */
function zijbalkParen(src: string): Paar[] {
  return [...src.matchAll(/label:\s*'([^']+)'[\s\S]{0,400}?href:\s*'(\/[^']*)'/g)].map((m) => ({
    label: m[1]!,
    href: m[2]!,
    bron: 'zijbalk-literal',
  }))
}

/**
 * Avatar-dropdown in de TopBar: `<Link href="…" role="menuitem" …>Label</Link>`.
 * Alleen menu-items — het krant-icoon ernaast draagt geen zichtbaar label (dat
 * heeft een aria-label, hieronder apart getoetst).
 */
function topBarParen(src: string): Paar[] {
  return [
    ...src.matchAll(
      /href="(\/[^"]*)"[^>]*?role="menuitem"[\s\S]*?\n\s*([^<>{}\n]+?)\n\s*<\/Link>/g,
    ),
  ].map((m) => ({ href: m[1]!, label: m[2]!.trim(), bron: 'avatar-dropdown' }))
}

/**
 * Commandopalet. Overgeslagen: deeplinks met een querystring (die wijzen naar
 * een tab/pane, niet naar de route als zodanig) en de `App · `/`Beheer · `-
 * prefixen, die bewust een categorie vóór de naam zetten.
 */
function paletParen(): Paar[] {
  return getAllPageItems()
    .filter((p) => p.href && !p.href.includes('?'))
    .filter((p) => !/^(App|Beheer) · /.test(p.label))
    .map((p) => ({ href: p.href!, label: p.label, bron: 'commandopalet' }))
}

describe('naamconsistentie — één naam per route over alle nav-bronnen', () => {
  const zijbalk = zijbalkParen(bron(SIDEBAR))
  const topBar = topBarParen(bron(TOP_BAR))

  it('de bron-scans vinden de literals nog (anders is de gate stil kapot)', () => {
    expect(zijbalk.length, 'zijbalk-literals gevonden').toBeGreaterThanOrEqual(5)
    expect(topBar.length, 'avatar-menu-items gevonden').toBeGreaterThanOrEqual(2)
  })

  const alle = [...paletParen(), ...zijbalk, ...topBar]

  it('elke bron zegt hetzelfde als nav-config, of staat in LABEL_UITZONDERINGEN', () => {
    const afwijkingen = alle
      .filter((p) => !(p.href in LABEL_UITZONDERINGEN))
      .map((p) => ({ ...p, canoniek: resolveRouteTitle(p.href) }))
      .filter((p) => p.canoniek !== null && p.canoniek !== p.label)
      .map((p) => `${p.href}: ${p.bron} zegt "${p.label}", nav-config zegt "${p.canoniek}"`)

    expect(afwijkingen, afwijkingen.join('\n')).toEqual([])
  })

  it('het krant-icoon in de TopBar draagt de canonieke naam als aria-label', () => {
    // Geen zichtbaar label, dus dit aria-label is de énige naam die een
    // screenreader hier hoort — en dus net zo goed een nav-bron.
    const src = bron(TOP_BAR)
    const match = /href="\/nieuws"\s*\n\s*aria-label="([^"]+)"/.exec(src)
    expect(match?.[1]).toBe(resolveRouteTitle('/nieuws'))
  })
})

describe('naamconsistentie — de uitzonderingskaart zelf', () => {
  const zijbalk = zijbalkParen(bron(SIDEBAR))
  const topBar = topBarParen(bron(TOP_BAR))
  const alle = [...paletParen(), ...zijbalk, ...topBar]

  it('elke uitzondering draagt een echte reden', () => {
    for (const [href, reden] of Object.entries(LABEL_UITZONDERINGEN)) {
      expect(reden.length, `${href} heeft een te dunne motivering`).toBeGreaterThan(40)
    }
  })

  it('elke uitzondering wijst naar een route die de nav kent', () => {
    // Een uitzondering voor een verdwenen route is dode configuratie die de
    // gate stilletjes verruimt — precies wat deze test hoort te voorkomen.
    for (const href of Object.keys(LABEL_UITZONDERINGEN)) {
      expect(resolveRouteTitle(href), `${href} staat niet (meer) in de nav`).not.toBeNull()
    }
  })

  it('geen dode uitzondering: elke href draagt echt twee namen', () => {
    // Zonder deze regel verruimt de allowlist stilletjes. Erger: een route
    // waarvan ALLE bronnen hetzelfde zeggen hoort hier niet — dan dekt de
    // uitzondering geen conflict maar zet hij de gate voor die route uit.
    for (const href of Object.keys(LABEL_UITZONDERINGEN)) {
      const canoniek = resolveRouteTitle(href)
      const botst = alle.some((p) => p.href === href && p.label !== canoniek)
      expect(botst, `${href} botst nergens meer — haal de uitzondering weg`).toBe(true)
    }
  })
})

describe('merktaal — wat blijft staan en waarom', () => {
  it('elke metafoor die blijft, draagt een vastgelegde motivering', () => {
    // Acceptatiecriterium 2 van UR3-30: merktaal die blijft, is verantwoord.
    for (const [href, reden] of Object.entries(MERKTAAL_VERANTWOORDING)) {
      expect(reden.length, `${href} heeft een te dunne motivering`).toBeGreaterThan(80)
      expect(resolveRouteTitle(href), `${href} staat niet (meer) in de nav`).not.toBeNull()
    }
  })

  it('merktaal is geen vrijstelling: die routes staan NIET in de allowlist', () => {
    for (const href of Object.keys(MERKTAAL_VERANTWOORDING)) {
      expect(href in LABEL_UITZONDERINGEN, `${href} mag geen uitzondering zijn`).toBe(false)
    }
  })

  it('"Krant" blijft de canonieke naam van /nieuws', () => {
    // De metafoor is bewust behouden (besluit 6 sep 2026, K2). Deze regel
    // spiegelt de vangrail in sidebar.naamgeving.test.tsx aan de config-kant.
    expect(resolveRouteTitle('/nieuws')).toBe('Krant')
  })
})
