/**
 * overlay-signal — ref-counted signaal dat aangeeft of er MINSTENS ÉÉN
 * pill-verbergende overlay open is.
 *
 * Waarom een module-teller i.p.v. React-context: overlays renderen via
 * `createPortal` naar `document.body` — buiten de app-boom. Een context zou
 * over die portal-grens heen moeten reiken en zou elke overlay-consument aan
 * één provider koppelen. Een simpele module-scoped teller + CustomEvent werkt
 * portal-agnostisch: elke overlay `acquireOverlay()`-t bij open en roept de
 * teruggegeven release-functie aan bij close; `useOverlayOpen()` subscribet via
 * `useSyncExternalStore` op het event en levert een boolean.
 *
 * Gebruik:
 *  - `BottomSheet` / `SlideInPane` roepen `acquireOverlay()` aan zolang ze open
 *    zijn (effect met cleanup). NavMenuSheet (`belowFloatingNav`) doet dit
 *    bewust NIET — daar IS de pill de toggle.
 *  - `FloatingNavButton` leest `useOverlayOpen()` en verbergt zich zodra er een
 *    overlay open is, zodat de pill niet dóór modale content heen prikt.
 *
 * Timing-keuze: overlays geven het signaal DIRECT bij close-start vrij (release
 * hangt aan de `open`-prop, niet aan de exit-animatie/unmount). Zo komt de pill
 * soepel terug tijdens de exit-animatie i.p.v. pas als het element weg is.
 */

import { useSyncExternalStore } from 'react'

const EVENT_NAME = 'trifinity:overlay-count-change'

let overlayCount = 0

function emit() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

/**
 * Meld een open, pill-verbergende overlay aan. Verhoogt de teller en dispatcht
 * het change-event. Geeft een idempotente release-functie terug: roep 'm aan
 * (bv. in de effect-cleanup) zodra de overlay sluit. Dubbel aanroepen is veilig
 * — de teller wordt hooguit één keer per acquire afgeteld.
 */
export function acquireOverlay(): () => void {
  overlayCount += 1
  emit()
  let released = false
  return () => {
    if (released) return
    released = true
    overlayCount = Math.max(0, overlayCount - 1)
    emit()
  }
}

/** Huidige aantal open overlays. Bedoeld voor tests / debugging. */
export function getOverlayCount(): number {
  return overlayCount
}

/**
 * Reset de teller naar 0. ALLEEN voor tests — zorgt dat een niet-vrijgegeven
 * acquire uit een vorige test niet naar de volgende lekt.
 */
export function __resetOverlayCount(): void {
  overlayCount = 0
  emit()
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT_NAME, onChange)
  return () => window.removeEventListener(EVENT_NAME, onChange)
}

function getSnapshot(): boolean {
  return overlayCount > 0
}

function getServerSnapshot(): boolean {
  return false
}

/**
 * `true` zodra er minstens één pill-verbergende overlay open is. SSR-veilig
 * (server-snapshot = `false`), subscribet client-side op het change-event.
 */
export function useOverlayOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
