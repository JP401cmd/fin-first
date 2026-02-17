'use client'

import { useUnnotifiedBadges } from '@/lib/hooks/use-unnotified-badges'

/**
 * BadgeNotifier — Checks for un-notified badges on mount and shows toasts.
 *
 * Renders nothing visible. Just triggers the unnotified badges check
 * when the app layout mounts (user is authenticated).
 */
export function BadgeNotifier() {
  useUnnotifiedBadges()
  return null
}
