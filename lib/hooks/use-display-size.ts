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
 * Whether the viewport is mobile-sized (<640px). SSR assumes desktop.
 * Gedeeld door useDisplaySize en de size-selector (Double is niet
 * selecteerbaar op mobiel).
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Returns the effective display size for a widget.
 * On mobile (<640px), downsizes one step: xl→full, full→half, half→quarter, quarter→mini.
 * On desktop, returns the stored size unchanged.
 */
export function useDisplaySize(storedSize: WidgetSize): WidgetSize {
  const isMobile = useIsMobile()
  return isMobile ? downsizeForMobile(storedSize) : storedSize
}
