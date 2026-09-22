import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contrastRatio, DEFAULT_TOPBAR_COLOR, topbarColorVars } from './color-palette'

/**
 * De kleur van de mobiele TopBar (ADR 0174). `topbarColorVars` levert de vier
 * `--topbar-*`-tokens voor één balkkleur. F1 gebruikt alleen de standaard;
 * F2 voedt dezelfde functie met de keuze van de gebruiker.
 */

/** Een `rgba(r, g, b, a)`-voorgrond over een effen `#rrggbb`-grond, als hex. */
function blend(rgba: string, bgHex: string): string {
  const m = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)
  if (!m) throw new Error(`geen rgba: ${rgba}`)
  const [r, g, b, a] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
  const bg = [1, 3, 5].map(i => parseInt(bgHex.slice(i, i + 2), 16))
  return (
    '#' +
    [r, g, b]
      .map((c, i) => Math.round(c * a + bg[i] * (1 - a)).toString(16).padStart(2, '0'))
      .join('')
  )
}

describe('topbarColorVars — de standaardbalk', () => {
  const vars = topbarColorVars()

  it('levert precies de vier --topbar-*-tokens', () => {
    expect(Object.keys(vars).sort()).toEqual([
      '--topbar-bg',
      '--topbar-fg',
      '--topbar-fg-muted',
      '--topbar-hover',
    ])
  })

  it('is leisteenblauw met een witte voorgrond', () => {
    expect(DEFAULT_TOPBAR_COLOR).toBe('#3f4a5e')
    expect(vars['--topbar-bg']).toBe('#3f4a5e')
    expect(vars['--topbar-fg']).toBe('#ffffff')
  })

  it('de naam haalt WCAG AA (≥ 4,5:1) op de balk', () => {
    expect(contrastRatio(vars['--topbar-fg'], vars['--topbar-bg'])).toBeGreaterThanOrEqual(4.5)
  })

  it('de iconen (muted) halen óók 4,5:1, ruim boven de 3:1 voor niet-tekst', () => {
    const muted = blend(vars['--topbar-fg-muted'], vars['--topbar-bg'])
    expect(contrastRatio(muted, vars['--topbar-bg'])).toBeGreaterThanOrEqual(4.5)
  })

  it('het hover-vlak is zichtbaar anders dan de balk, maar houdt de naam leesbaar', () => {
    const hover = blend(vars['--topbar-hover'], vars['--topbar-bg'])
    expect(hover).not.toBe(vars['--topbar-bg'])
    expect(contrastRatio(vars['--topbar-fg'], hover)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('topbarColorVars — de voorgrond volgt het contrast', () => {
  // Beide uiteinden van de keuze wit/inkt, plus de randen van de hex-ruimte.
  const gevallen: Array<[string, '#ffffff' | '#1a1916']> = [
    ['#000000', '#ffffff'],
    ['#3f4a5e', '#ffffff'],
    ['#0077bb', '#ffffff'],
    ['#b85600', '#ffffff'],
    ['#fbf7ec', '#1a1916'],
    ['#ffffff', '#1a1916'],
    ['#c4a06b', '#1a1916'],
    ['#9ec5e8', '#1a1916'],
  ]

  for (const [balk, verwacht] of gevallen) {
    it(`${balk} → ${verwacht === '#ffffff' ? 'wit' : 'inkt'}`, () => {
      const vars = topbarColorVars(balk)
      expect(vars['--topbar-fg']).toBe(verwacht)
      // De gekozen voorgrond is nooit de slechtste van de twee.
      const gekozen = contrastRatio(vars['--topbar-fg'], balk)
      const ander = contrastRatio(verwacht === '#ffffff' ? '#1a1916' : '#ffffff', balk)
      expect(gekozen).toBeGreaterThanOrEqual(ander)
    })
  }

  it('muted en hover zijn alfa-varianten van dezelfde voorgrond', () => {
    const licht = topbarColorVars('#fbf7ec')
    expect(licht['--topbar-fg-muted']).toMatch(/^rgba\(26, 25, 22, /)
    expect(licht['--topbar-hover']).toMatch(/^rgba\(26, 25, 22, /)
    const donker = topbarColorVars('#3f4a5e')
    expect(donker['--topbar-fg-muted']).toMatch(/^rgba\(255, 255, 255, /)
    expect(donker['--topbar-hover']).toMatch(/^rgba\(255, 255, 255, /)
  })

  it('hoofdletters worden genormaliseerd', () => {
    expect(topbarColorVars('#3F4A5E')['--topbar-bg']).toBe('#3f4a5e')
  })
})

describe('topbarColorVars — ongeldige invoer valt terug op de standaard', () => {
  // Vanaf F2 komt de waarde uit de profielrij en gaat hij een style-attribuut
  // in. Alles wat geen #rrggbb is, mag daar niet doorheen.
  // De twee laatste vangen een latere `m`-vlag of `trim()` in de poort.
  for (const invoer of ['', 'red', '#fff', '#3f4a5', '#3f4a5eff', '3f4a5e', '#gggggg', 'url(x)', '#3f4a5e; color: red', '#3f4a5e\n', ' #3f4a5e']) {
    it(`${JSON.stringify(invoer)} → ${DEFAULT_TOPBAR_COLOR}`, () => {
      expect(topbarColorVars(invoer)).toEqual(topbarColorVars(DEFAULT_TOPBAR_COLOR))
    })
  }
})

describe('globals.css :root draagt topbarColorVars(DEFAULT_TOPBAR_COLOR)', () => {
  // Zelfde afspraak als de accentpaletten: de CSS-waarden zijn gegenereerd,
  // nooit met de hand bijgesteld. Deze test vangt drift tussen beide.
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))

  for (const [naam, waarde] of Object.entries(topbarColorVars(DEFAULT_TOPBAR_COLOR))) {
    it(`${naam}: ${waarde}`, () => {
      const m = root.match(new RegExp(`^\\s*${naam}\\s*:\\s*([^;]+);`, 'm'))
      expect(m, `${naam} ontbreekt in :root van app/globals.css`).not.toBeNull()
      expect(m![1].trim()).toBe(waarde)
    })
  }
})
