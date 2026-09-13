/**
 * Tik-of-veeg-op-de-baan voor `<input type="range">` op iOS.
 *
 * iOS Safari verschuift een native range alléén wanneer de aanraking op het bolletje
 * begint; een tik of veeg op de baan doet niets. Met het 18px-bolletje van
 * `.slider-module` (app/globals.css, `pointer: coarse`) is dat mikken — bugmelding
 * 13 sep 2026 ("lastig te pakken"). Chrome/Android springen native al naar de
 * vingerpositie; deze helper doet op iOS hetzelfde en laat andere platforms ongemoeid,
 * zodat daar het native gedrag niet dubbel (en mogelijk schokkerig) wordt aangestuurd.
 *
 * De waarde gaat via de native value-setter + een `input`-event, zodat de bestaande
 * React-`onChange` van de slider onveranderd de wijziging ontvangt — geen tweede
 * schrijfpad naast die handler.
 *
 * Gebruik: `<input type="range" … {...rangeTouchSeekProps} />`.
 */
import type { TouchEvent } from 'react'

/** Bolletje-breedte van `.slider-module` op touch (`@media (pointer: coarse)` in globals.css). */
export const RANGE_THUMB_PX_COARSE = 18

interface NavigatorLike {
  userAgent: string
  platform?: string
  maxTouchPoints?: number
}

/** iPhone/iPod/iPad, inclusief iPadOS dat zich als `MacIntel` met touch meldt. */
export function isIosTouchDevice(nav: NavigatorLike): boolean {
  if (/iP(hone|od|ad)/.test(nav.userAgent)) return true
  const looksLikeMac = nav.platform === 'MacIntel' || /Macintosh/.test(nav.userAgent)
  return looksLikeMac && (nav.maxTouchPoints ?? 0) > 1
}

function decimalsOf(step: number): number {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

/**
 * Waarde bij een vinger op `clientX`. Het midden van het bolletje loopt van
 * `rectLeft + thumbPx/2` tot `rectLeft + rectWidth − thumbPx/2`; daarbuiten clampt het.
 * Snapt op `step` gerekend vanaf `min` (zoals de browser), zonder float-ruis.
 */
export function valueFromTouchX(args: {
  clientX: number
  rectLeft: number
  rectWidth: number
  min: number
  max: number
  step: number | 'any'
  thumbPx: number
}): number {
  const { clientX, rectLeft, rectWidth, min, max, step, thumbPx } = args
  if (!(max > min)) return min
  const travel = Math.max(1, rectWidth - thumbPx)
  const ratio = Math.min(1, Math.max(0, (clientX - rectLeft - thumbPx / 2) / travel))
  const raw = min + ratio * (max - min)
  if (step === 'any' || !(step > 0)) return raw
  const snapped = min + Math.round((raw - min) / step) * step
  const clamped = Math.min(max, Math.max(min, snapped))
  return Number(clamped.toFixed(Math.max(decimalsOf(step), decimalsOf(min))))
}

/**
 * Beweging (px) waarboven een aanraking een gebaar is: horizontaal ⇒ schuiven, verticaal
 * ⇒ scrollen. Zelfde drempel als MOVE_CANCEL_PX in floating-nav-button.tsx en
 * HORIZONTAL_DECISION_PX in lib/hooks/use-swipe-back.ts.
 */
export const RANGE_GESTURE_DECISION_PX = 8

type Gesture = { x: number; y: number; mode: 'pending' | 'seek' | 'scroll' }
const gestures = new WeakMap<HTMLInputElement, Gesture>()

function seekTo(input: HTMLInputElement, clientX: number): void {
  const min = input.min === '' ? 0 : Number(input.min)
  const max = input.max === '' ? 100 : Number(input.max)
  const step = input.step === 'any' ? 'any' : input.step === '' ? 1 : Number(input.step)
  const rect = input.getBoundingClientRect()
  const next = valueFromTouchX({
    clientX,
    rectLeft: rect.left,
    rectWidth: rect.width,
    min,
    max,
    step,
    thumbPx: RANGE_THUMB_PX_COARSE,
  })
  if (String(next) === input.value) return

  // Native setter: React volgt de laatst gezette value; via de prototype-setter ziet
  // React's tracker het verschil en vuurt onChange op het input-event.
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(input, String(next))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function isActive(input: HTMLInputElement): boolean {
  return typeof navigator !== 'undefined' && isIosTouchDevice(navigator) && !input.disabled
}

/**
 * Bewust NIET schuiven op touchstart: de sliders staan midden in scrollende pagina's
 * (`touch-action: pan-y`), en wie met de duim op een baan begint te scrollen mag geen
 * waarde verzetten. Pas een horizontale beweging boven de drempel is schuiven; een
 * verticale is scrollen en blijft dat tot het loslaten; een tik zonder beweging zet de
 * waarde bij het loslaten.
 */
function handleTouchStart(e: TouchEvent<HTMLInputElement>): void {
  const input = e.currentTarget
  const touch = e.touches[0]
  if (!isActive(input) || !touch || e.touches.length !== 1) {
    gestures.delete(input)
    return
  }
  gestures.set(input, { x: touch.clientX, y: touch.clientY, mode: 'pending' })
}

function handleTouchMove(e: TouchEvent<HTMLInputElement>): void {
  const input = e.currentTarget
  const gesture = gestures.get(input)
  const touch = e.touches[0]
  if (!gesture || !touch || gesture.mode === 'scroll') return
  if (gesture.mode === 'pending') {
    const dx = Math.abs(touch.clientX - gesture.x)
    const dy = Math.abs(touch.clientY - gesture.y)
    if (dy > RANGE_GESTURE_DECISION_PX && dy >= dx) gesture.mode = 'scroll'
    else if (dx > RANGE_GESTURE_DECISION_PX) gesture.mode = 'seek'
    else return
  }
  if (gesture.mode === 'seek') seekTo(input, touch.clientX)
}

function handleTouchEnd(e: TouchEvent<HTMLInputElement>): void {
  const input = e.currentTarget
  const gesture = gestures.get(input)
  gestures.delete(input)
  if (!gesture || gesture.mode !== 'pending' || e.type === 'touchcancel') return
  seekTo(input, gesture.x)
}

export const rangeTouchSeekProps = {
  onTouchStart: handleTouchStart,
  onTouchMove: handleTouchMove,
  onTouchEnd: handleTouchEnd,
  onTouchCancel: handleTouchEnd,
} as const
