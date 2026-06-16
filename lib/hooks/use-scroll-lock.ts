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

function lock() {
  lockCount++
  if (lockCount === 1) {
    const container = getScrollContainer()
    if (container) {
      savedScrollTop = container.scrollTop
      container.style.overflow = 'hidden'
      container.scrollTop = savedScrollTop
    }
    // NOTE: body/html overflow is NOT locked — ChatLayoutWrapper (position:fixed,
    // inset:0) is the sole scroll container. Touching body/html overflow triggers
    // iOS Safari to re-evaluate position:fixed descendants (e.g. MobileBottomBar,
    // FloatingNavButton), causing them to visually jump.
  }
  notifyOverlayListeners()
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    const container = getScrollContainer()
    if (container) {
      container.style.overflow = ''
      container.scrollTop = savedScrollTop
    }
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
