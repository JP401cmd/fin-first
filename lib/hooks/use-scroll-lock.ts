import { useEffect } from 'react'

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
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
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
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
  }
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (active) {
      lock()
      return () => unlock()
    }
  }, [active])
}
