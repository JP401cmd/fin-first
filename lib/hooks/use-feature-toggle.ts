'use client'

import { useState, useCallback } from 'react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'

/**
 * Hook for toggling individual feature preferences.
 * Performs optimistic update + API call.
 */
export function useFeatureToggle() {
  const { features, refreshFeaturePrefs } = useFeatureAccess()
  const [saving, setSaving] = useState(false)

  const toggle = useCallback(async (featureId: string, enabled: boolean) => {
    // Optimistic update via context
    refreshFeaturePrefs({ [featureId]: enabled })

    setSaving(true)
    try {
      // Get current prefs first
      const getRes = await fetch('/api/feature-preferences')
      const { preferences: current } = await getRes.json()

      // Merge the toggle
      const updated = { ...current, [featureId]: enabled }

      // If setting back to default, remove the override
      // (handled server-side, but we can clean up client-side too)
      const res = await fetch('/api/feature-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: updated }),
      })

      if (!res.ok) {
        // Revert optimistic update on failure
        refreshFeaturePrefs({ [featureId]: !enabled })
      }
    } catch {
      // Revert on network error
      refreshFeaturePrefs({ [featureId]: !enabled })
    } finally {
      setSaving(false)
    }
  }, [refreshFeaturePrefs])

  const resetToDefaults = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/feature-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: {} }),
      })

      if (res.ok) {
        // Clear all overrides — features revert to sovereignty defaults
        refreshFeaturePrefs({})
        // Force page reload to recompute from server
        window.location.reload()
      }
    } catch {
      // silent fail
    } finally {
      setSaving(false)
    }
  }, [refreshFeaturePrefs])

  return { toggle, resetToDefaults, saving, features }
}
