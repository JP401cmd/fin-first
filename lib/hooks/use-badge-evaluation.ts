'use client'

import { useCallback, useRef } from 'react'
import { useToast } from '@/components/app/toast-provider'

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
  source: string
}

/**
 * Hook that evaluates badges and shows toast notifications for newly earned badges.
 * Call `evaluateBadges()` after any qualifying action (login, import, etc.)
 */
export function useBadgeEvaluation() {
  const { showBadgeEarned } = useToast()
  const evaluatingRef = useRef(false)

  const evaluateBadges = useCallback(async (): Promise<EvaluationResult | null> => {
    // Prevent concurrent evaluations
    if (evaluatingRef.current) return null
    evaluatingRef.current = true

    try {
      const res = await fetch('/api/badges/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!res.ok) return null

      const data: EvaluationResult = await res.json()

      // Show toast for each newly earned badge
      if (data.newly_earned && data.newly_earned.length > 0) {
        // Stagger notifications with a small delay
        for (let i = 0; i < data.newly_earned.length; i++) {
          const badge = data.newly_earned[i]
          setTimeout(() => {
            showBadgeEarned({
              name: badge.name,
              icon: badge.icon,
              description: badge.description,
            })
          }, i * 800) // 800ms stagger between notifications
        }
      }

      return data
    } catch (err) {
      console.error('Badge evaluation failed:', err)
      return null
    } finally {
      evaluatingRef.current = false
    }
  }, [showBadgeEarned])

  return { evaluateBadges }
}
