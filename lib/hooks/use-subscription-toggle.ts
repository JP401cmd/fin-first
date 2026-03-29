'use client'

import { useState, useCallback } from 'react'

type SubscriptionId = 'connected' | 'ai'

/**
 * Hook for toggling user subscription add-ons (Connected, AI).
 * Persists via /api/tiers and reloads the page so feature gating recomputes.
 */
export function useSubscriptionToggle(initialSubscriptions: string[]) {
  const [subscriptions, setSubscriptions] = useState<string[]>(initialSubscriptions)
  const [saving, setSaving] = useState(false)

  const toggle = useCallback(
    async (
      subId: SubscriptionId,
      enabled: boolean,
    ): Promise<{ success: boolean; error?: string }> => {
      const updated = enabled
        ? [...subscriptions, subId]
        : subscriptions.filter((s) => s !== subId)

      // Optimistic update
      setSaving(true)
      setSubscriptions(updated)

      try {
        const res = await fetch('/api/tiers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptions: updated }),
        })

        if (!res.ok) {
          setSubscriptions(subscriptions) // Revert on API error
          return { success: false, error: 'Opslaan mislukt' }
        }

        // Force full re-render: feature gating depends on subscriptions
        window.location.reload()
        return { success: true }
      } catch {
        setSubscriptions(subscriptions) // Revert on network error
        return { success: false, error: 'Netwerkfout' }
      } finally {
        setSaving(false)
      }
    },
    [subscriptions],
  )

  return { subscriptions, toggle, saving }
}
