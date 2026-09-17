/**
 * Het vaste reekspalet voor beheer-grafieken. Pint de CSS-waarden in
 * app/globals.css aan palet.ts, en borgt dat geen enkele tint met de
 * stoplicht-semantiek botst. De CVD-/contrastvalidatie zelf is met het
 * dataviz-script gedaan (uitkomst in de comment in globals.css).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { accentClashesWithStatus } from '@/lib/color-palette'
import { BEHEER_REEKS_DONKER, BEHEER_REEKS_LICHT, NEUTRALE_REEKS, reeksKleur } from './palet'

const css = readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')

function blok(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `selector ${selector} ontbreekt in globals.css`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

function waarden(b: string): string[] {
  return [...b.matchAll(/--beheer-reeks-(\d): (#[0-9a-f]{6});/g)].map((m) => m[2])
}

describe('beheer-reekspalet', () => {
  it('heeft zes tinten, licht én donker', () => {
    expect(BEHEER_REEKS_LICHT).toHaveLength(6)
    expect(BEHEER_REEKS_DONKER).toHaveLength(6)
  })

  it('CSS in globals.css is gelijk aan palet.ts', () => {
    expect(waarden(blok('.beheer-viz'))).toEqual([...BEHEER_REEKS_LICHT])
    expect(waarden(blok(':root[data-theme="dark"] .beheer-viz'))).toEqual([...BEHEER_REEKS_DONKER])
  })

  it('botst met geen enkele stoplichtkleur', () => {
    for (const hex of [...BEHEER_REEKS_LICHT, ...BEHEER_REEKS_DONKER]) {
      expect(accentClashesWithStatus(hex), hex).toBe('ok')
    }
  })

  it('reeksKleur volgt de positie; buiten bereik neutraal', () => {
    expect(reeksKleur(0)).toBe('var(--beheer-reeks-1)')
    expect(reeksKleur(5)).toBe('var(--beheer-reeks-6)')
    expect(reeksKleur(6)).toBe(NEUTRALE_REEKS)
    expect(reeksKleur(-1)).toBe(NEUTRALE_REEKS)
  })
})
