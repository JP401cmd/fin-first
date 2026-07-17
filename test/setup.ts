import '@testing-library/jest-dom'
import { vi } from 'vitest'

/**
 * Globale test-setup. jsdom mist browser-API's die door componenten
 * worden gebruikt via hooks (useInViewAnimation + prefers-reduced-motion
 * checks). Centrale mocks zodat elke test-file ze niet hoeft te dupliceren.
 */

// matchMedia — voor prefers-reduced-motion checks
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// IntersectionObserver — voor useInViewAnimation hook. Standaard mock
// triggert direct "in view" zodat geanimeerde elementen meteen hun
// eindstate hebben (geen wachten op scroll-events in jsdom).
if (typeof globalThis !== 'undefined' && !globalThis.IntersectionObserver) {
  class MockIntersectionObserver {
    private callback: IntersectionObserverCallback
    constructor(cb: IntersectionObserverCallback) {
      this.callback = cb
    }
    observe(target: Element) {
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      )
    }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
    root: Element | Document | null = null
    rootMargin = ''
    thresholds: readonly number[] = []
  }
  ;(globalThis as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver
}

// ResizeObserver — gebruikt door o.a. widget-shell (overflow/scroll-detectie).
// jsdom levert 'm niet; een no-op mock volstaat (tests hoeven geen echte
// resize-callbacks). Zonder deze mock crasht elke test die een component met
// een ResizeObserver mount met "ResizeObserver is not defined".
if (typeof globalThis !== 'undefined' && !globalThis.ResizeObserver) {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver
}
