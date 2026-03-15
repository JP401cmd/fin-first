import { useSyncExternalStore } from 'react'
import { downsizeForMobile, type WidgetSize } from '@/lib/widget-catalog'

// ── Mobile media query listener (singleton) ──────────────────
const query = '(max-width: 639px)'
let mediaQuery: MediaQueryList | null = null

function getMediaQuery(): MediaQueryList {
  if (!mediaQuery) mediaQuery = window.matchMedia(query)
  return mediaQuery
}

function subscribe(cb: () => void): () => void {
  const mq = getMediaQuery()
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

function getSnapshot(): boolean {
  return getMediaQuery().matches
}

function getServerSnapshot(): boolean {
  return false // SSR: assume desktop (no downsize)
}

/**
 * Returns the effective display size for a widget.
 * On mobile (<640px), downsizes one step: full→half, half→quarter, quarter→mini.
 * On desktop, returns the stored size unchanged.
 */
export function useDisplaySize(storedSize: WidgetSize): WidgetSize {
  const isMobile = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return isMobile ? downsizeForMobile(storedSize) : storedSize
}
