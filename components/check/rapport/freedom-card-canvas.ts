/**
 * Het deelbare beeld van de Vrijheidscheck — canvas-render (ADR 0067).
 *
 * Tekent een 1200×630-kaart (de standaard link-preview-verhouding) in de
 * krant/editorial-taal van het rapport. De tekenfunctie krijgt uitsluitend een
 * `FreedomCardCopy` mee — de tekst die `lib/check/share-freedom.ts` uit twee
 * gehele getallen heeft gebouwd. Er is geen pad van hier naar het rapport, de
 * intake of een bedrag: die staan niet in de signatuur.
 *
 * Kleuren en fonts komen uit de al opgeloste CSS-tokens van `.rapport-root`
 * (rapport.css) in plaats van uit losse hexen — `useModuleHex()` is hier geen
 * optie, want /check valt buiten de (app)-groep en heeft dus geen
 * `ModuleColorProvider`. De hex-fallbacks hieronder zijn dezelfde als die
 * rapport.css al voor print-engines meedraagt.
 */

import type { FreedomCardCopy } from '@/lib/check/share-freedom'

export const FREEDOM_CARD_WIDTH = 1200
export const FREEDOM_CARD_HEIGHT = 630

/** Opgeloste stijl-tokens voor de kaart. */
export interface FreedomCardStyle {
  paper: string
  ink: string
  inkSoft: string
  /** Het "al van jou"-goud uit rapport.css (`--vrijgekocht`). */
  gold: string
  rule: string
  display: string
  serif: string
  mono: string
}

const FALLBACK: FreedomCardStyle = {
  paper: '#faf6ee',
  ink: '#1d1b16',
  inkSoft: '#4a4840',
  gold: '#b08432',
  rule: '#e3dac8',
  display: 'Georgia, serif',
  serif: 'Georgia, serif',
  mono: 'ui-monospace, monospace',
}

function readVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = style.getPropertyValue(name).trim()
  return value.length > 0 ? value : fallback
}

/**
 * Leest de opgeloste tokens van de rapport-root. Faalt nooit hard: elke
 * ontbrekende variabele valt terug op de print-fallback.
 */
export function readFreedomCardStyle(root: Element | null): FreedomCardStyle {
  if (!root || typeof window === 'undefined') return FALLBACK
  const cs = window.getComputedStyle(root)
  return {
    paper: readVar(cs, '--paper', FALLBACK.paper),
    ink: readVar(cs, '--ink', FALLBACK.ink),
    inkSoft: readVar(cs, '--ink-soft', FALLBACK.inkSoft),
    gold: readVar(cs, '--vrijgekocht', FALLBACK.gold),
    rule: readVar(cs, '--rule', FALLBACK.rule),
    display: readVar(cs, '--display', FALLBACK.display),
    serif: readVar(cs, '--serif', FALLBACK.serif),
    mono: readVar(cs, '--mono', FALLBACK.mono),
  }
}

/** Zet `letterSpacing` waar de browser het kent; negeert het stil waar niet. */
function setTracking(ctx: CanvasRenderingContext2D, value: string): void {
  try {
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = value
  } catch {
    /* niet ondersteund — de kaart blijft leesbaar zonder tracking */
  }
}

/** Zoekt de grootste fontgrootte waarbij `text` binnen `maxWidth` past. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  maxWidth: number,
  startPx: number,
  minPx: number,
): number {
  let size = startPx
  while (size > minPx) {
    ctx.font = `600 ${size}px ${family}`
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 2
  }
  return size
}

function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y: number,
  x2: number,
  color: string,
  width: number,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y + 0.5)
  ctx.lineTo(x2, y + 0.5)
  ctx.stroke()
}

/**
 * Tekent de deelkaart. Idempotent: wist eerst het volledige canvas, zodat een
 * hertekening (bijvoorbeeld nadat de webfonts geladen zijn) schoon is.
 */
export function drawFreedomCard(
  ctx: CanvasRenderingContext2D,
  copy: FreedomCardCopy,
  style: FreedomCardStyle,
): void {
  const W = FREEDOM_CARD_WIDTH
  const H = FREEDOM_CARD_HEIGHT
  const PAD = 76
  const RIGHT = W - PAD

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = style.paper
  ctx.fillRect(0, 0, W, H)

  ctx.textBaseline = 'alphabetic'

  // ── Kop: kicker + rule ────────────────────────────────────────────────────
  setTracking(ctx, '5px')
  ctx.font = `500 21px ${style.mono}`
  ctx.fillStyle = style.inkSoft
  ctx.textAlign = 'left'
  ctx.fillText(copy.kicker.toUpperCase(), PAD, 104)
  setTracking(ctx, '0px')

  line(ctx, PAD, 136, RIGHT, style.rule, 2)

  // ── De uitkomst, groot en in het "al van jou"-goud ────────────────────────
  const headlineSize = fitFontSize(ctx, copy.headline, style.display, RIGHT - PAD, 96, 46)
  ctx.font = `600 ${headlineSize}px ${style.display}`
  ctx.fillStyle = style.gold
  ctx.fillText(copy.headline, PAD, 300)

  ctx.font = `italic 400 36px ${style.serif}`
  ctx.fillStyle = style.ink
  ctx.fillText(copy.subline, PAD, 360)

  // ── Het principe ──────────────────────────────────────────────────────────
  ctx.font = `italic 500 30px ${style.display}`
  ctx.fillStyle = style.inkSoft
  ctx.fillText(copy.principle, PAD, 452)

  // ── Voet: wordmark links, uitnodiging rechts ──────────────────────────────
  line(ctx, PAD, 512, RIGHT, style.rule, 2)

  ctx.font = `600 32px ${style.display}`
  ctx.fillStyle = style.ink
  ctx.fillText(copy.wordmark, PAD, 566)

  setTracking(ctx, '1.5px')
  ctx.font = `400 19px ${style.mono}`
  ctx.fillStyle = style.inkSoft
  ctx.textAlign = 'right'
  ctx.fillText(copy.footer, RIGHT, 566)
  setTracking(ctx, '0px')
  ctx.textAlign = 'left'
}
