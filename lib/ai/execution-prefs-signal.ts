'use client'

// ── Signaal: "de uitvoerkeuze is zojuist gewijzigd" ──────────────────────────
//
// De keuze lokaal/cloud wordt op meerdere plekken geschreven — de popover in de
// chat, de groepenlijst en de hoofdschakelaar op /mijn/privacy — en op nóg meer
// plekken gelezen: elke `useExecutionMode`, de privacy-indicator, en sinds kort
// het waarschuwingsicoon op de Fin-knop.
//
// Zonder signaal weet een lezer niets van een schrijver elders in de boom. Dat
// gaf precies de gemelde bug: wie in de chat naar cloud wisselde, hield het
// oranje driehoekje op de knop tot hij de pagina verving. Ook `usePrivacyMode`
// speelde mee — dat is een module-singleton wiens commentaar er nog van uitging
// dat je alleen via een paginanavigatie kon wisselen. De chat-popover heeft die
// aanname ongeldig gemaakt.
//
// Vorm bewust gespiegeld op `lib/overlay-signal.ts`: een module-scoped teller
// plus een CustomEvent, gelezen met `useSyncExternalStore`. Geen context, want
// de lezers zitten verspreid door de hele boom (en deels in portals), en een
// provider zou ze allemaal aan één plek moeten koppelen.
//
// EÉN SCHRIJFREGEL: wie een uitvoerkeuze wegschrijft (`/api/ai-execution-prefs`
// of `/api/privacy-mode`), roept ná een geslaagde schrijfactie
// `notifyExecutionPrefsChanged()` aan. Meer hoeft een schrijver niet te weten.

import { useSyncExternalStore } from 'react'

const EVENT_NAME = 'trifinity:ai-execution-prefs-change'

/**
 * Monotone teller. De wáárde zegt niets; elke verhoging betekent "opnieuw
 * bepalen". Een teller en geen boolean, zodat twee wijzigingen vlak na elkaar
 * niet in één re-render samenvallen.
 */
let version = 0

/** Meld dat de uitvoerkeuze is gewijzigd. Aanroepen ná een geslaagde schrijfactie. */
export function notifyExecutionPrefsChanged(): void {
  version += 1
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME))
  }
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT_NAME, onChange)
  return () => window.removeEventListener(EVENT_NAME, onChange)
}

function getSnapshot(): number {
  return version
}

/** Server-snapshot: vast, want er valt tijdens SSR niets te wijzigen. */
function getServerSnapshot(): number {
  return 0
}

/**
 * De huidige versie. Zet 'm in de afhankelijkheden van een lezing, dan bepaalt
 * die zichzelf opnieuw zodra iemand — waar dan ook — de keuze wijzigt.
 */
export function useExecutionPrefsVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Test-only: zet de teller terug zodat elke test vers begint. */
export function __resetExecutionPrefsVersion(): void {
  version = 0
}
