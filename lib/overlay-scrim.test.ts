import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scrimColor, SCRIM_OPACITY } from './overlay-scrim'

/**
 * De scrim bestaat noodgedwongen in twee talen: als CSS-token (`--scrim`, wat
 * elke overlay-className gebruikt) en als JS-functie (`scrimColor`, omdat het
 * swipe-gebaar de dekking met de vinger mee laat lopen en een `var()` niet te
 * interpoleren is). Deze test is de enige reden dat die twee niet stil uit
 * elkaar kunnen lopen — precies de drift die eerder zeven verschillende scrims
 * opleverde.
 */
describe('overlay-scrim — één waarde, twee talen', () => {
  const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8')

  it('het CSS-token --scrim is exact scrimColor()', () => {
    const match = css.match(/^\s*--scrim:\s*([^;]+);/m)
    expect(match, '--scrim ontbreekt in app/globals.css').not.toBeNull()
    expect(match![1].trim()).toBe(scrimColor())
  })

  it('definieert een blur-token naast de kleur', () => {
    expect(/^\s*--scrim-blur:\s*[^;]+;/m.test(css)).toBe(true)
  })

  it('rekent tussenwaarden voor de drag-animatie', () => {
    expect(scrimColor(0)).toBe('rgba(0, 0, 0, 0)')
    expect(scrimColor(SCRIM_OPACITY / 2)).toBe('rgba(0, 0, 0, 0.25)')
  })
})
