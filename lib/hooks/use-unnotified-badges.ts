'use client'

import { useEffect, useRef } from 'react'
import { useToast } from '@/components/app/toast-provider'

/**
 * Hook that checks for un-notified badges on mount and shows toast notifications.
 *
 * Fetches badges from /api/badges/notify (GET) that have been earned but not yet
 * shown to the user. Uses the queue system to display them sequentially.
 *
 * Should be mounted once in the app layout (e.g., via a BadgeNotifier component).
 */
export function useUnnotifiedBadges() {
  const { queueBadges } = useToast()
  const checkedRef = useRef(false)

  useEffect(() => {
    // Only check once per mount
    if (checkedRef.current) return
    checkedRef.current = true

    const checkUnnotified = async () => {
      try {
        const res = await fetch('/api/badges/notify')
        if (!res.ok) return

        const data = await res.json()
        if (data.unnotified && data.unnotified.length > 0) {
          // Small delay to let page render first
          setTimeout(() => {
            queueBadges(
              data.unnotified.map((badge: { slug: string; name: string; icon: string; description: string }) => ({
                name: badge.name,
                icon: badge.icon,
                description: badge.description,
                slug: badge.slug,
              }))
            )
          }, 1500) // 1.5s delay after page load
        }
      } catch {
        // Silent fail — badge notifications are non-critical
      }
    }

    checkUnnotified()
  }, [queueBadges])
}
