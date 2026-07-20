'use client'

import { useRef, useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Wraps app content and creates a viewport-like container that shrinks
 * when Fin's chat panel is pinned as a sidebar.
 *
 * Uses position:fixed + contain:layout to create a CSS containing block
 * for all fixed-position descendants (modals, bottom nav, etc.).
 * This means position:fixed children are constrained to this wrapper
 * instead of the browser viewport — no per-overlay right adjustments needed.
 *
 * contain:layout (unlike transform) does NOT break position:sticky,
 * so sticky chrome (TopBar, ModuleNav) keeps working inside the wrapper.
 */
export function ChatLayoutWrapper({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Scroll to top on route change (replaces default window scroll)
  useEffect(() => {
    ref.current?.scrollTo(0, 0)
  }, [pathname])

  return (
    <div
      ref={ref}
      data-scroll-container
      className="fixed inset-0 overflow-y-auto bg-[var(--bg)] transition-[right] duration-300"
      style={{
        right: 'var(--chat-sidebar-width, 0px)',
        contain: 'layout',
      }}
    >
      {children}
    </div>
  )
}
