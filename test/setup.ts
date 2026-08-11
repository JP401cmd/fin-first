import '@testing-library/jest-dom'
import { vi, afterEach } from 'vitest'
import { configure } from '@testing-library/react'
import { __resetPrivacyModeCache } from '@/components/app/use-privacy-mode'

// Globale `asyncUtilTimeout`-verhoging (testing-library default: 1000ms).
// Notion-kaart "Testisolatie: cash-account-view.test.tsx faalt intermitterend
// in de volle suite" (11 aug 2026): onder volle-suite-parallelliteit (~921
// bestanden) lopen React/DOM-tests met `waitFor`/`findBy*` op de 1000ms-default
// vast op CPU-contentie — niet alleen in het ene bestand dat destijds al een
// eigen (lokale) verhoging kreeg (components/app/cash-account-view.test.tsx),
// maar ook in andere bestanden (bv. app/(app)/core/cash/connect/page.test.tsx),
// steeds bij de EERSTE test in het bestand (module-cold-start bovenop de
// fetch-keten). Klasse-probleem, geen dader-bestand — vandaar hier globaal in
// plaats van bestand-voor-bestand. Bescheiden gehouden (5000ms, niet hoger)
// zodat een echte component-traagheid niet gemaskeerd wordt; de per-test
// `testTimeout` (30000ms, vitest.config.ts) blijft de harde bovengrens voor
// echte hangs.
configure({ asyncUtilTimeout: 5000 })

// De privacy-mode-hook (usePrivacyMode) deelt een module-singleton-cache zodat
// meerdere indicatoren op één pagina niet elk apart /api/privacy-mode fetchen.
// Zonder reset tussen tests kan die gecachete promise over test-volgordes heen
// lekken (load-flakiness). Globale teardown houdt elke test vers.
afterEach(() => {
  __resetPrivacyModeCache()
})

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
