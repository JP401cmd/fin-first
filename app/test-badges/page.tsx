'use client'

import { useState, useCallback } from 'react'
import { BADGE_DEFINITIONS, type BadgeWithStatus } from '@/lib/badges'
import { BadgeGrid } from '@/components/app/badge-grid'
import { ToastProvider, useToast } from '@/components/app/toast-provider'

// ── Badge Evaluation Test Component ──────────────────────────────────

function BadgeTestContent() {
  const { showBadgeEarned, addToast } = useToast()
  const [evaluationResult, setEvaluationResult] = useState<string>('')
  const [apiSource, setApiSource] = useState<string>('')
  const [earnedBadges, setEarnedBadges] = useState<BadgeWithStatus[]>([])
  const [allBadges, setAllBadges] = useState<BadgeWithStatus[]>([])

  // Test 1: Call badge evaluation API
  const testEvaluateApi = useCallback(async () => {
    setEvaluationResult('Evaluating...')
    try {
      const res = await fetch('/api/badges/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      setEvaluationResult(JSON.stringify(data, null, 2))
      setApiSource(data.source || 'unknown')

      // Show toasts for newly earned badges
      if (data.newly_earned && data.newly_earned.length > 0) {
        data.newly_earned.forEach((badge: { name: string; icon: string; description: string }, i: number) => {
          setTimeout(() => {
            showBadgeEarned(badge)
          }, i * 800)
        })
      } else {
        addToast({
          type: 'info',
          title: 'Geen nieuwe badges',
          message: `${data.total_earned || 0} badges al verdiend van ${data.total_badges || 30}`,
        })
      }
    } catch (err) {
      setEvaluationResult(`Error: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }, [showBadgeEarned, addToast])

  // Test 2: Fetch all badges with status
  const testFetchBadges = useCallback(async () => {
    try {
      const res = await fetch('/api/badges')
      const data = await res.json()
      setAllBadges(data.badges || [])
      setEarnedBadges((data.badges || []).filter((b: BadgeWithStatus) => b.earned))
      setApiSource(data.source || 'unknown')
    } catch (err) {
      console.error('Fetch badges failed:', err)
    }
  }, [])

  // Test 3: Simulate badge earned toast
  const testBadgeToast = useCallback(() => {
    const sampleBadge = BADGE_DEFINITIONS[0] // first_login badge
    showBadgeEarned({
      name: sampleBadge.name,
      icon: sampleBadge.icon,
      description: sampleBadge.description,
    })
  }, [showBadgeEarned])

  // Test 4: Show multiple badge toasts
  const testMultipleToasts = useCallback(() => {
    const badgesToShow = BADGE_DEFINITIONS.slice(0, 3)
    badgesToShow.forEach((badge, i) => {
      setTimeout(() => {
        showBadgeEarned({
          name: badge.name,
          icon: badge.icon,
          description: badge.description,
        })
      }, i * 800)
    })
  }, [showBadgeEarned])

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Badge System Test</h1>
      <p className="text-sm text-zinc-500 mb-8">
        End-to-end test for badge evaluation, toast notifications, and badge display.
      </p>

      {/* Test controls */}
      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <button
          onClick={testEvaluateApi}
          className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-white hover:bg-amber-600 transition-colors"
          data-testid="btn-evaluate"
        >
          1. Evaluate Badges (API)
        </button>
        <button
          onClick={testFetchBadges}
          className="rounded-xl bg-teal-500 px-6 py-3 text-sm font-bold text-white hover:bg-teal-600 transition-colors"
          data-testid="btn-fetch"
        >
          2. Fetch All Badges
        </button>
        <button
          onClick={testBadgeToast}
          className="rounded-xl bg-purple-500 px-6 py-3 text-sm font-bold text-white hover:bg-purple-600 transition-colors"
          data-testid="btn-toast"
        >
          3. Test Badge Toast
        </button>
        <button
          onClick={testMultipleToasts}
          className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-600 transition-colors"
          data-testid="btn-multi-toast"
        >
          4. Test Multiple Toasts
        </button>
      </div>

      {/* API Source */}
      {apiSource && (
        <div className="mb-4 rounded-lg bg-zinc-100 p-3">
          <p className="text-xs text-zinc-500">
            Data source: <span className="font-bold text-zinc-700" data-testid="api-source">{apiSource}</span>
          </p>
        </div>
      )}

      {/* Evaluation result */}
      {evaluationResult && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-zinc-700 mb-2">Evaluation Result:</h2>
          <pre className="rounded-lg bg-zinc-900 p-4 text-xs text-emerald-400 overflow-auto max-h-64" data-testid="eval-result">
            {evaluationResult}
          </pre>
        </div>
      )}

      {/* Earned badges summary */}
      {earnedBadges.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-zinc-700 mb-2">
            Earned Badges ({earnedBadges.length}):
          </h2>
          <div className="flex flex-wrap gap-2" data-testid="earned-badges-list">
            {earnedBadges.map((badge) => (
              <div
                key={badge.slug}
                className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5"
                data-testid={`earned-badge-${badge.slug}`}
              >
                <span>{badge.icon}</span>
                <span className="text-xs font-semibold text-amber-800">{badge.name}</span>
                {badge.earned_at && (
                  <span className="text-[10px] text-amber-500">
                    {new Date(badge.earned_at).toLocaleDateString('nl-NL')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full badge grid */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-zinc-700 mb-4">Badge Grid (from /api/badges):</h2>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <BadgeGrid />
        </div>
      </div>

      {/* Badge definitions reference */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-zinc-700 mb-2">
          All Badge Definitions ({BADGE_DEFINITIONS.length}):
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {BADGE_DEFINITIONS.map((badge) => (
            <div
              key={badge.slug}
              className="flex items-center gap-2 rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2"
            >
              <span>{badge.icon}</span>
              <div>
                <p className="text-xs font-semibold text-zinc-800">{badge.name}</p>
                <p className="text-[10px] text-zinc-400">{badge.category}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page with ToastProvider wrapper ─────────────────────────────────

export default function TestBadgesPage() {
  return (
    <ToastProvider>
      <BadgeTestContent />
    </ToastProvider>
  )
}
