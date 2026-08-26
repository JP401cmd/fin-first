/**
 * overlay-history — de back-knop sluit de bovenste overlay, niet de pagina.
 *
 * Zonder deze integratie navigeert een druk op "terug" met een open modal de
 * ONDERLIGGENDE pagina weg: de modal blijft staan of verdwijnt samen met de
 * hele route. Op mobiel is terug het natuurlijke sluitgebaar, dus dat maakt
 * elke modal moeilijk te verlaten.
 *
 * Model: LIFO-stack van history-entries.
 *  - Openen duwt één entry op de browser-history (`pushState`, zelfde URL) én
 *    op onze eigen stack. Twee gestapelde overlays leveren twee entries; terug
 *    sluit ze in omgekeerde volgorde — modal→modal valt daarmee gratis goed uit.
 *  - `popstate` (echte terug-druk) popt de bovenste entry en roept diens
 *    `close()` aan.
 *  - Sluiten via X / Escape / swipe roept de release-functie aan. Die consumeert
 *    de eigen entry met `history.back()`, zodat er geen WEESENTRY achterblijft
 *    (anders moet je twee keer terug drukken voor er iets gebeurt).
 *
 * De `selfBackPending`-teller onderscheidt onze eigen `history.back()` van een
 * echte terug-druk: beide leveren een identieke `popstate`. Zonder die teller
 * zou onze eigen back de ONDERLIGGENDE overlay sluiten. De teller loopt na
 * 1,5s vanzelf leeg voor het geval een `back()` geen popstate oplevert (bv.
 * omdat de gebruiker intussen wegnavigeerde), zodat hij nooit een echte
 * terug-druk kan opeten.
 *
 * In DEV laat React StrictMode het open-effect twee keer lopen (push → release →
 * push). De release consumeert daar netjes zijn eigen entry, maar de browser
 * verwerkt `back()` asynchroon, dus er blijft in dev één extra (forward-)entry
 * staan. Het zichtbare gedrag klopt — terug sluit nog steeds de bovenste
 * overlay — en in productie treedt het niet op.
 *
 * NIET voor overlays waarvan de open-staat uit de URL komt (`?holding=<id>`,
 * `?planEditor=true`): die schrijven bij sluiten zelf de URL met
 * `router.replace`, waardoor onze entry en de hunne elkaar in de weg zitten.
 * Zie de `manageHistory`-prop op `BottomSheet` en de `kind="pane"`-tak van
 * `ShellOverlay`.
 */

const STATE_KEY = '__trifinityOverlay'

type OverlayHistoryEntry = {
  id: number
  close: () => void
  /** Gezet zodra de browser deze entry heeft gepopt — dan geen eigen back(). */
  poppedByBrowser: boolean
}

const stack: OverlayHistoryEntry[] = []
let nextId = 1
let listening = false
let selfBackPending = 0

function noteSelfBack() {
  selfBackPending += 1
  // Vangnet: levert onze back() onverhoopt geen popstate op, dan mag de teller
  // niet blijven staan en de volgende ECHTE terug-druk opeten.
  setTimeout(() => {
    if (selfBackPending > 0) selfBackPending -= 1
  }, 1500)
}

function consumeSelfBack(): boolean {
  if (selfBackPending === 0) return false
  selfBackPending -= 1
  return true
}

function onPopState() {
  if (consumeSelfBack()) return
  const entry = stack.pop()
  if (!entry) return
  entry.poppedByBrowser = true
  entry.close()
}

function ensureListening() {
  if (listening || typeof window === 'undefined') return
  window.addEventListener('popstate', onPopState)
  listening = true
}

/**
 * Meld een open overlay aan bij de browser-history. Geeft een idempotente
 * release-functie terug: roep 'm aan (effect-cleanup) zodra de overlay sluit.
 *
 * De release doet alléén `history.back()` wanneer onze entry ook echt nog de
 * huidige is. Navigeerde de app intussen door (Next duwt dan zijn eigen state
 * bovenop), dan laten we de history met rust — een blinde `back()` zou die
 * navigatie ongedaan maken.
 */
export function pushOverlayHistory(close: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  ensureListening()
  const id = nextId++
  const entry: OverlayHistoryEntry = { id, close, poppedByBrowser: false }
  stack.push(entry)
  window.history.pushState(
    { ...(window.history.state as Record<string, unknown> | null), [STATE_KEY]: id },
    '',
  )

  let released = false
  return () => {
    if (released) return
    released = true
    const index = stack.indexOf(entry)
    if (index >= 0) stack.splice(index, 1)
    if (entry.poppedByBrowser) return
    const state = window.history.state as Record<string, unknown> | null
    if (!state || state[STATE_KEY] !== id) return
    noteSelfBack()
    window.history.back()
  }
}

/** Aantal aangemelde overlay-entries. Bedoeld voor tests / debugging. */
export function getOverlayHistoryDepth(): number {
  return stack.length
}

/**
 * Reset de stack en de self-back-teller. ALLEEN voor tests — zorgt dat een
 * niet-vrijgegeven entry uit een vorige test niet naar de volgende lekt.
 */
export function __resetOverlayHistory(): void {
  stack.length = 0
  selfBackPending = 0
}
