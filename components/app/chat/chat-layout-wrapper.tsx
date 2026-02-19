'use client'

import type { ReactNode } from 'react'

/**
 * Wraps app content (header + main) and applies margin-right
 * based on the --chat-sidebar-width CSS variable set by ChatProvider.
 * This ensures the header, main content, and bottom nav all shrink
 * when Will's chat panel is pinned as a sidebar.
 */
export function ChatLayoutWrapper({ children }: { children: ReactNode }) {
  return (
    <div
      className="transition-[margin-right] duration-300"
      style={{ marginRight: 'var(--chat-sidebar-width, 0px)' }}
    >
      {children}
    </div>
  )
}
