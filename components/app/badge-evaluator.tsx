'use client'

import { useEffect, useRef } from 'react'
import { useBadgeEvaluation } from '@/lib/hooks/use-badge-evaluation'

/**
 * Invisible component that auto-evaluates badges on mount.
 * Place this in the dashboard or app layout to trigger badge evaluation
 * when the user navigates to the page.
 *
 * Uses sessionStorage to avoid re-evaluating on every page load.
 * Evaluates at most once per session (or when force=true).
 */
export function BadgeEvaluator({ force = false }: { force?: boolean }) {
  const { evaluateBadges } = useBadgeEvaluation()
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const sessionKey = 'badge_evaluation_done'

    // Check if already evaluated this session (unless forced)
    if (!force && typeof window !== 'undefined') {
      const lastEval = sessionStorage.getItem(sessionKey)
      if (lastEval) {
        // Already evaluated this session, check if it was within last 5 minutes
        const lastTime = parseInt(lastEval, 10)
        if (Date.now() - lastTime < 5 * 60 * 1000) {
          return
        }
      }
    }

    // Delay evaluation slightly to not block page rendering
    const timer = setTimeout(async () => {
      await evaluateBadges()
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(sessionKey, Date.now().toString())
      }
    }, 1500)

    return () => clearTimeout(timer)
  }, [evaluateBadges, force])

  return null // Invisible component
}
