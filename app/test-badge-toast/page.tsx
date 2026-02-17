'use client'

import { useState, useCallback } from 'react'
import { ToastProvider, useToast } from '@/components/app/toast-provider'
import { BADGE_DEFINITIONS } from '@/lib/badges'

function BadgeToastTestContent() {
  const { showBadgeEarned, queueBadges, addToast } = useToast()
  const [verifyResult, setVerifyResult] = useState<string>('')
  const [notifyResult, setNotifyResult] = useState<string>('')

  // Test 1: Show a single badge toast
  const testSingleToast = useCallback(() => {
    const badge = BADGE_DEFINITIONS[0]
    showBadgeEarned({
      name: badge.name,
      icon: badge.icon,
      description: badge.description,
      slug: badge.slug,
    })
  }, [showBadgeEarned])

  // Test 2: Queue multiple badges (3 at once)
  const testMultipleToasts = useCallback(() => {
    const badges = BADGE_DEFINITIONS.slice(0, 3)
    queueBadges(
      badges.map((b) => ({
        name: b.name,
        icon: b.icon,
        description: b.description,
        slug: b.slug,
      }))
    )
  }, [queueBadges])

  // Test 3: Queue 5 badges simultaneously
  const testFiveToasts = useCallback(() => {
    const badges = BADGE_DEFINITIONS.slice(0, 5)
    queueBadges(
      badges.map((b) => ({
        name: b.name,
        icon: b.icon,
        description: b.description,
        slug: b.slug,
      }))
    )
  }, [queueBadges])

  // Test 4: Show non-badge toast (should not have trophy)
  const testNonBadgeToast = useCallback(() => {
    addToast({
      type: 'success',
      title: 'Reguliere melding',
      message: 'Dit is een gewone toast, geen badge toast.',
    })
  }, [addToast])

  // Test 5: Run verification endpoint
  const runVerification = useCallback(async () => {
    try {
      const res = await fetch('/api/verify-badge-toast')
      const data = await res.json()
      setVerifyResult(JSON.stringify(data, null, 2))
    } catch (err) {
      setVerifyResult(`Error: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }, [])

  // Test 6: Check unnotified badges
  const checkUnnotified = useCallback(async () => {
    try {
      const res = await fetch('/api/badges/notify')
      const data = await res.json()
      setNotifyResult(JSON.stringify(data, null, 2))
    } catch (err) {
      setNotifyResult(`Error: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2" data-testid="page-title">
        Badge Toast Notification Test
      </h1>
      <p className="text-sm text-zinc-500 mb-8">
        Feature #205 — BadgeToast notification component with trophy icon, fly animation,
        queue system, and notified marking.
      </p>

      {/* Test controls */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <button
          onClick={testSingleToast}
          className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-white hover:bg-amber-600 transition-colors"
          data-testid="btn-single-toast"
        >
          1. Single Badge Toast
        </button>
        <button
          onClick={testMultipleToasts}
          className="rounded-xl bg-teal-500 px-6 py-3 text-sm font-bold text-white hover:bg-teal-600 transition-colors"
          data-testid="btn-multi-toast"
        >
          2. Queue 3 Badges
        </button>
        <button
          onClick={testFiveToasts}
          className="rounded-xl bg-purple-500 px-6 py-3 text-sm font-bold text-white hover:bg-purple-600 transition-colors"
          data-testid="btn-five-toasts"
        >
          3. Queue 5 Badges
        </button>
        <button
          onClick={testNonBadgeToast}
          className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-600 transition-colors"
          data-testid="btn-non-badge"
        >
          4. Non-Badge Toast
        </button>
        <button
          onClick={runVerification}
          className="rounded-xl bg-zinc-700 px-6 py-3 text-sm font-bold text-white hover:bg-zinc-800 transition-colors"
          data-testid="btn-verify"
        >
          5. Run Verification
        </button>
        <button
          onClick={checkUnnotified}
          className="rounded-xl bg-rose-500 px-6 py-3 text-sm font-bold text-white hover:bg-rose-600 transition-colors"
          data-testid="btn-unnotified"
        >
          6. Check Unnotified
        </button>
      </div>

      {/* Feature checklist */}
      <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-zinc-800 mb-4">Feature #205 Checklist</h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <span className="text-emerald-600">✅</span>
            <span>BadgeToast component with 🏆 trophy icon</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-600">✅</span>
            <span>Toast title: &quot;🏆 Badge verdiend: [name]!&quot;</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-600">✅</span>
            <span>Badge icon displayed alongside trophy</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-600">✅</span>
            <span>Flying badge icon animation toward profile area</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-600">✅</span>
            <span>Queue system for simultaneous badges (badgeQueueRef)</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-600">✅</span>
            <span>Sequential display with 1.2s delay between toasts</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-600">✅</span>
            <span>Mark as notified via POST /api/badges/notify</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-600">✅</span>
            <span>No repeat notifications (GET only returns notified=false)</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-600">✅</span>
            <span>BadgeNotifier in app layout for page-load checks</span>
          </li>
        </ul>
      </div>

      {/* Verification result */}
      {verifyResult && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-zinc-700 mb-2">Verification Result:</h2>
          <pre
            className="rounded-lg bg-zinc-900 p-4 text-xs text-emerald-400 overflow-auto max-h-96"
            data-testid="verify-result"
          >
            {verifyResult}
          </pre>
        </div>
      )}

      {/* Unnotified badges result */}
      {notifyResult && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-zinc-700 mb-2">Unnotified Badges:</h2>
          <pre
            className="rounded-lg bg-zinc-900 p-4 text-xs text-blue-400 overflow-auto max-h-64"
            data-testid="notify-result"
          >
            {notifyResult}
          </pre>
        </div>
      )}

      {/* Badge definitions reference */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-zinc-700 mb-4">
          Badge Definitions ({BADGE_DEFINITIONS.length} badges):
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {BADGE_DEFINITIONS.slice(0, 12).map((badge) => (
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

export default function TestBadgeToastPage() {
  return (
    <ToastProvider>
      <BadgeToastTestContent />
    </ToastProvider>
  )
}
