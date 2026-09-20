import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * BRON-GRENDEL op de TERUGWEG na "Doel loslaten" (melding B-031).
 *
 * WAAROM EEN BRON-TEST (precedent: horizon-client.nu-stoppen.test.ts /
 * .hero-fire-age.test.ts / .euro-view.test.ts): dit bestand is >9000 regels en
 * het defect is geen verkeerd getal maar een RENDERCONDITIE die zichzelf
 * afsluit. In Eenvoudig rendert KATERN II alleen bij een vastgelegd doel; de
 * knop "Doel loslaten" zet `doelBlok` op null, waarmee diezelfde sectie — en
 * dus de enige weg terug ("Maak dit mijn doel") — uit beeld verdwijnt. Een
 * render-test op dit component is niet haalbaar; de conditie zelf is het
 * bewijs.
 *
 * Given  een gebruiker in Eenvoudige weergave met een vastgelegd doel
 * When   hij onder de grafiek op "Doel loslaten" klikt
 * Then   blijft de doelsectie bereikbaar, zodat hij een doel opnieuw kan
 *        vastleggen zonder van weergave te wisselen.
 */

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')

function bron(): string {
  return readFileSync(SOURCE_PATH, 'utf8')
}

/** Niet-comment-regels — een uitleg mág elke naam noemen. */
function codeRegels(): string[] {
  return bron()
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
}

describe('KATERN II blijft bereikbaar na "Doel loslaten" (B-031)', () => {
  it('de zichtbaarheid van de doelsectie staat op ÉÉN plek, als benoemde afleiding', () => {
    expect(bron()).toContain('const verkenSectieZichtbaar =')
  })

  it('de conditie staat nergens meer los ingetypt — twee kopieën lopen uiteen', () => {
    const losseKopieen = codeRegels().filter((l) =>
      /displayMode === 'full' \|\| doelActief \|\| whatIfInlineOpen/.test(l),
    )
    // Alleen de ene afleiding mag deze reeks nog bevatten.
    expect(losseKopieen.length).toBeLessThanOrEqual(1)
  })

  it('loslaten houdt de sectie deze sessie open, zodat de weg terug niet mee verdwijnt', () => {
    const src = bron()
    // De vlag bestaat, zit in de zichtbaarheidsafleiding én wordt door de
    // loslaat-actie gezet.
    expect(src).toContain('doelLosgelatenDezeSessie')
    const afleiding = src.slice(
      src.indexOf('const verkenSectieZichtbaar ='),
      src.indexOf('const verkenSectieZichtbaar =') + 400,
    )
    expect(afleiding).toContain('doelLosgelatenDezeSessie')

    const loslaten = src.slice(
      src.indexOf('const handleDoelLoslaten'),
      src.indexOf('const handleDoelHerstellen'),
    )
    expect(loslaten).toContain('setDoelLosgelatenDezeSessie(true)')
  })

  it('opnieuw vastleggen zet de vlag terug — de sectie hangt dan weer aan het doel zelf', () => {
    const src = bron()
    const vastleggen = src.slice(
      src.indexOf('const handleDoelVastleggen'),
      src.indexOf('const handleDoelVastleggen') + 3000,
    )
    expect(vastleggen).toContain('setDoelLosgelatenDezeSessie(false)')
  })

  it('"Maak dit mijn doel" verschijnt óók bij een kale stopkeuze, niet alleen bij sliders', async () => {
    // ADR 0145 — de promotie-gate woont sinds de lab-uitkomst in ÉÉN pure helper. De
    // B-031-eis (sliders ÓF een kale stopkeuze) staat daar in de `solved`-tak; de
    // component leest de gate uitsluitend via `doelVastleggenMogelijk`.
    // ADR 0170 — het knoplabel woont in `LAB_COPY`; de host geeft de gate aan de balk mee.
    const src = bron()
    expect(src).toContain('vastleggenMogelijk={doelVastleggenMogelijk}')
    expect(src).toContain('bijwerkenMogelijk={doelBijwerkenMogelijk}')
    const gateStart = src.indexOf('const labOpslaanToestand')
    expect(gateStart).toBeGreaterThan(-1)
    expect(src.slice(gateStart, gateStart + 600)).toContain('hasScenario || hasStopKeuze')

    const { resolveLabUitkomst } = await import('@/lib/horizon/lab-uitkomst')
    const basis = { fireAgeFractional: 58 } as unknown as Parameters<typeof resolveLabUitkomst>[0]['basis']
    const solved = (hasScenario: boolean, hasStopKeuze: boolean) =>
      resolveLabUitkomst({
        planAnchor: { kind: 'solved' },
        currentAge: 40,
        basis,
        scenario: null,
        stopPad: null,
        kernelMaandHint: null,
        hasScenario,
        hasStopKeuze,
      }).promotie.kind
    // Een kale stopkeuze volstaat onder solved — het doel dat puur een stopmoment was
    // blijft zo na loslaten herstelbaar.
    expect(solved(false, true)).toBe('vrijheidsleeftijd')
    expect(solved(true, false)).toBe('vrijheidsleeftijd')
    expect(solved(false, false)).toBe('geen')
  })
})
