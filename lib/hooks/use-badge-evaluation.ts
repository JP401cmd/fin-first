'use client'

import { useCallback, useRef } from 'react'
import { useToast } from '@/components/app/toast-provider'

/**
 * Valid trigger sources for badge evaluation.
 * Must match the VALID_TRIGGERS in app/api/badges/evaluate/route.ts
 */
export type BadgeEvaluationTrigger = 'login' | 'action_complete' | 'import' | 'month_close' | 'page_load' | 'manual'

type EvaluationResult = {
  newly_earned: Array<{
    slug: string
    name: string
    description: string
    icon: string
    color: string
    category: string
    earned_at: string
  }>
  total_earned: number
  total_badges: number
  message?: string
  source: string
  trigger?: string
  error?: string
}

/**
 * Hook that evaluates badges and shows toast notifications for newly earned badges.
 * Call `evaluateBadges(trigger)` after any qualifying action:
 *   - 'login': after successful authentication
 *   - 'action_complete': after completing an action
 *   - 'import': after bank file import
 *   - 'month_close': after monthly snapshot
 *   - 'page_load': on dashboard/identity page mount
 *   - 'manual': explicit user-triggered evaluation
 *
 * Uses the queue system in ToastProvider so multiple badges are shown sequentially
 * with a slight delay. Marks badges as notified via /api/badges/notify to prevent
 * repeat notifications.
 */
export function useBadgeEvaluation() {
  const { queueBadges } = useToast()
  const evaluatingRef = useRef(false)

  const evaluateBadges = useCallback(async (trigger: BadgeEvaluationTrigger = 'manual'): Promise<EvaluationResult | null> => {
    // Prevent concurrent evaluations
    if (evaluatingRef.current) return null
    evaluatingRef.current = true

    try {
      const res = await fetch('/api/badges/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger }),
      })

      if (!res.ok) return null

      const data: EvaluationResult = await res.json()

      // Queue all newly earned badges for sequential toast display
      // The queue system handles staggering and marking as notified
      if (data.newly_earned && data.newly_earned.length > 0) {
        queueBadges(
          data.newly_earned.map((badge) => ({
            name: badge.name,
            icon: badge.icon,
            description: badge.description,
            slug: badge.slug,
          }))
        )
      }

      return data
    } catch (err) {
      console.error('Badge evaluation failed:', err)
      return null
    } finally {
      evaluatingRef.current = false
    }
  }, [queueBadges])

  return { evaluateBadges }
}
