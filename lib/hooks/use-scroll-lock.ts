import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react'

/**
 * useLayoutEffect on client (fires before paint), useEffect on server (avoids SSR warning).
 */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

let lockCount = 0
let savedScrollTop = 0

// ── Reactive "een overlay is open"-signaal ──────────────────────────────────
//
// `lockCount` is al de enige bron van waarheid voor "er staat een modal/overlay
// open" — élke BottomSheet, command-palette, share-dialog, notification-panel
// en sleepmodus-overlay roept `useScrollLock(open)` aan. We maken die teller
// observeerbaar (zonder een tweede bron te introduceren) zodat zwevende
// bottom-FAB's (de AI-chat-bubbel, de activatie-FAB) zich kunnen verbergen
// zolang een overlay open is — net zoals de nav-pill door een z-[70]-overlay
// wordt afgedekt. useSyncExternalStore i.p.v. een module-state houdt SSR-veilig
// en voldoet aan de React 19-lintregels.
const overlayListeners = new Set<() => void>()

function notifyOverlayListeners() {
  for (const listener of overlayListeners) listener()
}

function subscribeOverlay(listener: () => void): () => void {
  overlayListeners.add(listener)
  return () => {
    overlayListeners.delete(listener)
  }
}

function getOverlaySnapshot(): boolean {
  return lockCount > 0
}

function getOverlayServerSnapshot(): boolean {
  return false
}

/**
 * Reactieve lezer voor "staat er een scroll-lockende overlay open?". Voedt o.a.
 * de zwevende bottom-FAB's die zich verbergen zolang een modal/overlay open is.
 * Bron = dezelfde `lockCount` die `useScrollLock` bijhoudt — één bron van
 * waarheid, geen aparte overlay-teller.
 */
export function useOverlayOpen(): boolean {
  return useSyncExternalStore(
    subscribeOverlay,
    getOverlaySnapshot,
    getOverlayServerSnapshot,
  )
}

function getScrollContainer(): HTMLElement | null {
  return document.querySelector('[data-scroll-container]')
}

/**
 * Native pull-to-refresh uitzetten zolang er een overlay open is.
 *
 * De app heeft geen eigen pull-to-refresh; wat je op mobiel zag was de browser
 * die het veeggebaar in een modal als "ververs de pagina" opvatte. Het gebaar
 * begint op de sheet — die via `createPortal` in `document.body` hangt — dus de
 * overscroll-ketting loopt langs `document.documentElement` naar de viewport;
 * de `[data-scroll-container]` van ChatLayoutWrapper zit daar niet eens in.
 * Daarom zetten we `overscroll-behavior-y: contain` op ALLEBEI: de root (het
 * pad van een geportaleerde overlay) én de scroll-container (het pad van de
 * onderliggende pagina en van niet-geportaleerde overlays).
 *
 * Bewust `overscroll-behavior` en niet `overflow`: het is de scroll-lock zelf
 * die body/html-`overflow` met rust laat, omdat iOS Safari daarop zijn
 * `position: fixed`-nakomelingen herberekent (MobileBottomBar, FloatingNavButton
 * springen dan zichtbaar). `overscroll-behavior` raakt de layout niet.
 */
const PTR_PROPERTY = 'overscroll-behavior-y'
let savedRootOverscroll = ''
let savedContainerOverscroll = ''

function lock() {
  lockCount++
  if (lockCount === 1) {
    const container = getScrollContainer()
    if (container) {
      savedScrollTop = container.scrollTop
      container.style.overflow = 'hidden'
      container.scrollTop = savedScrollTop
      savedContainerOverscroll = container.style.getPropertyValue(PTR_PROPERTY)
      container.style.setProperty(PTR_PROPERTY, 'contain')
    }
    const root = document.documentElement
    savedRootOverscroll = root.style.getPropertyValue(PTR_PROPERTY)
    root.style.setProperty(PTR_PROPERTY, 'contain')
    // NOTE: body/html overflow is NOT locked — ChatLayoutWrapper (position:fixed,
    // inset:0) is the sole scroll container. Touching body/html overflow triggers
    // iOS Safari to re-evaluate position:fixed descendants (e.g. MobileBottomBar,
    // FloatingNavButton), causing them to visually jump.
  }
  notifyOverlayListeners()
}

function restoreOverscroll(el: HTMLElement, saved: string) {
  if (saved) el.style.setProperty(PTR_PROPERTY, saved)
  else el.style.removeProperty(PTR_PROPERTY)
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    const container = getScrollContainer()
    if (container) {
      container.style.overflow = ''
      container.scrollTop = savedScrollTop
      restoreOverscroll(container, savedContainerOverscroll)
    }
    restoreOverscroll(document.documentElement, savedRootOverscroll)
  }
  notifyOverlayListeners()
}

export function useScrollLock(active: boolean) {
  useIsomorphicLayoutEffect(() => {
    if (active) {
      lock()
      return () => unlock()
    }
  }, [active])
}
