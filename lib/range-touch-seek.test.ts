import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isIosTouchDevice, rangeTouchSeekProps, valueFromTouchX } from './range-touch-seek'

/**
 * iOS-schuifbalken (bugmelding 13 sep 2026, "lastig te pakken"): iOS Safari laat een
 * native `<input type="range">` alléén verslepen vanaf het bolletje zelf — een tik of
 * veeg op de baan doet niets. Met het 18px-bolletje van `.slider-module` betekent dat
 * mikken. `valueFromTouchX` rekent een vingerpositie om naar de waarde die Chrome/Android
 * native al zet; `isIosTouchDevice` bepaalt dat we dat alléén op iOS bijspringen.
 */
describe('valueFromTouchX', () => {
  // Baan van 218px breed vanaf x=0, bolletje 18px ⇒ het bruikbare traject is 200px
  // (het midden van het bolletje loopt van x=9 tot x=209).
  const base = { rectLeft: 0, rectWidth: 218, thumbPx: 18 }

  it('Given midden van het traject, When min 0 / max 100 / step 1, Then 50', () => {
    expect(valueFromTouchX({ ...base, clientX: 109, min: 0, max: 100, step: 1 })).toBe(50)
  })

  it('clampt vóór de linkerrand op min en voorbij de rechterrand op max', () => {
    expect(valueFromTouchX({ ...base, clientX: -40, min: 10, max: 60, step: 1 })).toBe(10)
    expect(valueFromTouchX({ ...base, clientX: 400, min: 10, max: 60, step: 1 })).toBe(60)
  })

  it('snapt op de step, gerekend vanaf min (min 6000 / step 100)', () => {
    // 37% van het traject ⇒ 6000 + 0,37 × 3200 = 7184 ⇒ 7200
    expect(valueFromTouchX({ ...base, clientX: 9 + 74, min: 6000, max: 9200, step: 100 })).toBe(7200)
  })

  it('geeft een decimale step zonder float-ruis terug (step 0.1)', () => {
    // 30% van [0, 1] ⇒ 0.30000000000000004 zonder afronding
    expect(valueFromTouchX({ ...base, clientX: 9 + 60, min: 0, max: 1, step: 0.1 })).toBe(0.3)
  })

  it('snapt niet bij step "any"', () => {
    expect(valueFromTouchX({ ...base, clientX: 9 + 25, min: 0, max: 1, step: 'any' })).toBe(0.125)
  })

  it('degenereert niet bij max ≤ min', () => {
    expect(valueFromTouchX({ ...base, clientX: 150, min: 5, max: 5, step: 1 })).toBe(5)
  })
})

/**
 * Gebaar-beslissing: de sliders staan midden in scrollende pagina's. Given een iPhone,
 * When de duim op een baan landt en verticaal scrolt, Then verandert er niets; horizontaal
 * vegen schuift mee; een tik zonder beweging zet de waarde bij het loslaten.
 */
describe('rangeTouchSeekProps — tik, veeg of scroll (iOS)', () => {
  let input: HTMLInputElement
  let changes: string[]

  beforeEach(() => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    input = document.createElement('input')
    input.type = 'range'
    input.min = '0'
    input.max = '100'
    input.step = '1'
    input.value = '0'
    input.getBoundingClientRect = () => ({ left: 0, width: 218 }) as DOMRect
    changes = []
    input.addEventListener('input', () => changes.push(input.value))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const at = (type: string, x: number, y: number) =>
    ({ type, currentTarget: input, touches: [{ clientX: x, clientY: y }] }) as never
  const end = (type = 'touchend') => ({ type, currentTarget: input, touches: [] }) as never

  it('tik zonder beweging ⇒ waarde bij het loslaten, niet al bij het neerzetten', () => {
    rangeTouchSeekProps.onTouchStart(at('touchstart', 109, 10))
    expect(changes).toEqual([])
    rangeTouchSeekProps.onTouchEnd(end())
    expect(changes).toEqual(['50'])
  })

  it('horizontaal vegen ⇒ volgt de vinger', () => {
    rangeTouchSeekProps.onTouchStart(at('touchstart', 9, 10))
    rangeTouchSeekProps.onTouchMove(at('touchmove', 59, 12))
    rangeTouchSeekProps.onTouchMove(at('touchmove', 209, 14))
    rangeTouchSeekProps.onTouchEnd(end())
    expect(changes).toEqual(['25', '100'])
  })

  it('verticaal scrollen ⇒ geen wijziging, ook niet als de vinger daarna zijwaarts gaat', () => {
    rangeTouchSeekProps.onTouchStart(at('touchstart', 109, 10))
    rangeTouchSeekProps.onTouchMove(at('touchmove', 112, 40))
    rangeTouchSeekProps.onTouchMove(at('touchmove', 200, 45))
    rangeTouchSeekProps.onTouchEnd(end())
    expect(changes).toEqual([])
  })

  it('touchcancel (systeemgebaar) ⇒ geen wijziging', () => {
    rangeTouchSeekProps.onTouchStart(at('touchstart', 109, 10))
    rangeTouchSeekProps.onTouchCancel(end('touchcancel'))
    expect(changes).toEqual([])
  })
})

describe('isIosTouchDevice', () => {
  it('herkent iPhone en iPad (ook iPadOS dat zich als Mac meldt)', () => {
    expect(
      isIosTouchDevice({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5,
      }),
    ).toBe(true)
    expect(
      isIosTouchDevice({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe(true)
  })

  it('laat Android, desktop-Mac en Windows ongemoeid (native gedrag is daar al goed)', () => {
    expect(
      isIosTouchDevice({
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0',
        platform: 'Linux armv8l',
        maxTouchPoints: 5,
      }),
    ).toBe(false)
    expect(
      isIosTouchDevice({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      }),
    ).toBe(false)
    expect(
      isIosTouchDevice({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0',
        platform: 'Win32',
        maxTouchPoints: 0,
      }),
    ).toBe(false)
  })
})
