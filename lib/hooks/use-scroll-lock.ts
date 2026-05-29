import { useEffect, useLayoutEffect } from 'react'

/**
 * useLayoutEffect on client (fires before paint), useEffect on server (avoids SSR warning).
 */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

let lockCount = 0
let savedScrollTop = 0

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
}

export function useScrollLock(active: boolean) {
  useIsomorphicLayoutEffect(() => {
    if (active) {
      lock()
      return () => unlock()
    }
  }, [active])
}
