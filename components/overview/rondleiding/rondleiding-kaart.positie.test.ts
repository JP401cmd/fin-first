/**
 * Tests voor `berekenPositie()` — de plaatsingsregel van Fins rondleidingkaart
 * (ADR 0130, fase 3b).
 *
 * Aanleiding: B-052. Op een lage viewport (gemeld en live gemeten op 384×410)
 * koos de mobiele tak de onderrand puur op de positie van het gat
 * (`rect.top > vh * 0,6`) en nooit op de eigen kaarthoogte. De kaart viel
 * daardoor over het element dat hij uitlicht — 82% bedekking op de
 * hefboomtegel, terwijl de stap letterlijk vraagt erop te tikken.
 *
 * Wat hier vastligt: de mobiele tak kiest de rand die het gat het mínst bedekt,
 * met de onderrand (duimbereik) als voorkeur bij gelijkspel.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { berekenPositie } from './rondleiding-kaart'
import type { SpotlightRect } from './use-spotlight-rect'

/** Moet gelijk blijven aan `VASTE_KAART_MARGE` in rondleiding-kaart.tsx. */
const VASTE_KAART_MARGE = 12

const oorspronkelijk = { w: window.innerWidth, h: window.innerHeight }

function zetViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true })
}

afterEach(() => zetViewport(oorspronkelijk.w, oorspronkelijk.h))

/** Hoeveel px van het gat de vaste kaart bedekt — los nagerekend in de test. */
function overlap(rect: SpotlightRect, hoogte: number, vh: number, onderin: boolean): number {
  const top = onderin ? vh - VASTE_KAART_MARGE - hoogte : VASTE_KAART_MARGE
  return Math.max(0, Math.min(top + hoogte, rect.top + rect.height) - Math.max(top, rect.top))
}

function vast(p: ReturnType<typeof berekenPositie>): { onderin: boolean; zij: number } {
  if (!('onderin' in p)) throw new Error('verwachtte een vaste (mobiele) positie')
  return p
}

describe('berekenPositie — mobiele tak', () => {
  /** De gemeten situatie uit B-052: stap 2/3, hefboomtegel op 384×410. */
  const tegel: SpotlightRect = { top: 140.9, left: 8, width: 188, height: 177.2 }
  const kaart = { w: 360, h: 225 }

  it('legt de kaart bij een lage viewport NIET over de uitgelichte tegel', () => {
    zetViewport(384, 410)
    const p = vast(berekenPositie(tegel, kaart, 'mobiel', false))

    // Regressie-anker: de oude regel koos hier onderin (140,9 < 410*0,6) en
    // bedekte daarmee 145 van de 177 px van de tegel.
    expect(p.onderin).toBe(false)
    expect(overlap(tegel, kaart.h, 410, true)).toBeGreaterThan(140)
    expect(overlap(tegel, kaart.h, 410, false)).toBeLessThan(
      overlap(tegel, kaart.h, 410, true),
    )
  })

  it('houdt de kaart onderin als het gat bovenin staat (normale hoogte)', () => {
    zetViewport(384, 800)
    const gat: SpotlightRect = { top: 100, left: 8, width: 188, height: 300 }
    const p = vast(berekenPositie(gat, kaart, 'mobiel', false))

    expect(p.onderin).toBe(true)
    expect(overlap(gat, kaart.h, 800, true)).toBe(0)
  })

  it('verhuist naar boven als het gat onderin staat (de nav-pill-stap)', () => {
    zetViewport(384, 800)
    const pill: SpotlightRect = { top: 700, left: 140, width: 104, height: 60 }
    const p = vast(berekenPositie(pill, kaart, 'mobiel', false))

    expect(p.onderin).toBe(false)
    expect(overlap(pill, kaart.h, 800, false)).toBe(0)
  })

  it('kiest bij gelijkspel de onderrand — duimbereik', () => {
    zetViewport(384, 800)
    // Een gat dat in geen van beide posities geraakt wordt: beide overlappen 0.
    const gat: SpotlightRect = { top: 300, left: 8, width: 188, height: 40 }
    expect(vast(berekenPositie(gat, kaart, 'mobiel', false)).onderin).toBe(true)
  })

  it('zet de welkomstkaart (geen gat) onderin', () => {
    zetViewport(384, 410)
    expect(vast(berekenPositie(null, kaart, 'mobiel', false)).onderin).toBe(true)
  })
})

describe('berekenPositie — desktoptak blijft ongemoeid', () => {
  it('plaatst de popover onder het gat als daar ruimte is', () => {
    zetViewport(1440, 900)
    const gat: SpotlightRect = { top: 200, left: 400, width: 300, height: 120 }
    const p = berekenPositie(gat, { w: 352, h: 220 }, 'desktop', false)

    expect('onderin' in p).toBe(false)
    if ('top' in p) expect(p.top).toBe(200 + 120 + 12)
  })
})
