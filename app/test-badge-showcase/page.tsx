'use client'

import { useState, useEffect } from 'react'
import { BADGE_DEFINITIONS, BADGE_CRITERIA, type BadgeWithStatus } from '@/lib/badges'

/**
 * Test page for Feature #206 — Badge showcase on Identity page.
 * Shows the BadgeGrid component with mock data (earned + locked badges with progress).
 * Accessible at /test-badge-showcase (public route).
 */

// Color map (mirrored from badge-grid.tsx for standalone test)
const colorMap: Record<string, { bgEarned: string; borderEarned: string }> = {
  amber: { bgEarned: 'bg-amber-100', borderEarned: 'border-amber-300' },
  teal: { bgEarned: 'bg-teal-100', borderEarned: 'border-teal-300' },
  purple: { bgEarned: 'bg-purple-100', borderEarned: 'border-purple-300' },
  emerald: { bgEarned: 'bg-emerald-100', borderEarned: 'border-emerald-300' },
  rose: { bgEarned: 'bg-rose-100', borderEarned: 'border-rose-300' },
  blue: { bgEarned: 'bg-blue-100', borderEarned: 'border-blue-300' },
  zinc: { bgEarned: 'bg-zinc-100', borderEarned: 'border-zinc-400' },
}

const categoryLabels: Record<string, string> = {
  onboarding: 'Onboarding',
  consistency: 'Consistentie',
  financial_health: 'Financiele Gezondheid',
  fire_milestones: 'FIRE Mijlpalen',
  actions: 'Acties',
  budget: 'Budget',
  exploration: 'Verkenning',
  sovereignty: 'Soevereiniteit',
}

export default function TestBadgeShowcasePage() {
  const [verifyResults, setVerifyResults] = useState<{ test: string; passed: boolean; details: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Simulate some earned badges and progress data
  const simulatedBadges: BadgeWithStatus[] = BADGE_DEFINITIONS.map((badge, idx) => {
    // Mark first 5 as earned
    const earned = idx < 5
    const criteria = BADGE_CRITERIA[badge.slug]
    let progress: number | null = null
    let progress_label: string | null = null
    if (!earned && criteria) {
      // Simulate partial progress
      const simProgress = Math.random() * 0.9
      progress = simProgress
      progress_label = criteria.label(criteria.target * simProgress, criteria.target)
    }
    return {
      ...badge,
      earned,
      earned_at: earned ? new Date(Date.now() - Math.random() * 30 * 86400000).toISOString() : null,
      progress,
      progress_label,
    }
  })

  const earnedCount = simulatedBadges.filter(b => b.earned).length
  const totalCount = simulatedBadges.length
  const categories = Array.from(new Set(simulatedBadges.map(b => b.category)))

  const [selectedBadge, setSelectedBadge] = useState<BadgeWithStatus | null>(null)

  useEffect(() => {
    fetch('/api/verify-badge-grid')
      .then(r => r.json())
      .then(data => {
        setVerifyResults(data.results)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <h1 className="text-2xl font-bold text-zinc-900">Feature #206 — Badge Showcase Test</h1>
        <p className="text-sm text-zinc-600">This page demonstrates the BadgeGrid component with simulated data.</p>

        {/* Verification Results */}
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Verification Results</h2>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading...</p>
          ) : (
            <div className="space-y-2">
              {verifyResults.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg p-3 text-sm ${
                    r.passed ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                  }`}
                >
                  <span>{r.passed ? '✅' : '❌'} {r.test}</span>
                  <span className="text-xs opacity-70">{r.details}</span>
                </div>
              ))}
              <p className="mt-3 text-sm font-semibold">
                {verifyResults.filter(r => r.passed).length}/{verifyResults.length} tests passing
              </p>
            </div>
          )}
        </section>

        {/* Simulated BadgeGrid */}
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Prestaties & Badges (Simulated)
          </h2>
          <p className="mt-1 mb-6 text-sm text-zinc-500">
            Verdien badges naarmate je groeit op je reis naar financiele vrijheid.
          </p>

          {/* Progress summary */}
          <div className="mb-6 flex items-center gap-4" data-testid="badge-progress-summary">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-zinc-900">{earnedCount}</span>
              <span className="text-sm text-zinc-500">van {totalCount} verdiend</span>
            </div>
            <div className="flex-1">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${(earnedCount / totalCount) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Badge grid */}
          <div className="space-y-6">
            {categories.map(category => {
              const catBadges = simulatedBadges.filter(b => b.category === category)
              const catEarned = catBadges.filter(b => b.earned).length
              return (
                <div key={category}>
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      {categoryLabels[category] ?? category}
                    </h3>
                    <span className="text-[10px] text-zinc-300">{catEarned}/{catBadges.length}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                    {catBadges.map(badge => {
                      const colors = colorMap[badge.color] ?? colorMap.zinc
                      const hasProgress = !badge.earned && badge.progress != null && badge.progress > 0
                      return (
                        <button
                          key={badge.slug}
                          onClick={() => setSelectedBadge(badge)}
                          className={`group relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all hover:shadow-md ${
                            badge.earned
                              ? `${colors.bgEarned} ${colors.borderEarned}`
                              : 'border-dashed border-zinc-200 bg-zinc-50'
                          }`}
                        >
                          <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl transition-transform group-hover:scale-110 ${
                            badge.earned ? '' : 'grayscale opacity-30'
                          }`}>
                            {badge.earned ? badge.icon : '❓'}
                          </div>
                          <span className={`text-center text-xs font-semibold leading-tight ${
                            badge.earned ? 'text-zinc-800' : 'text-zinc-400'
                          }`}>
                            {badge.earned ? badge.name : '???'}
                          </span>
                          {hasProgress && (
                            <div className="w-full px-1">
                              <div className="h-1 overflow-hidden rounded-full bg-zinc-200">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    badge.progress! >= 0.75 ? 'bg-emerald-400' :
                                    badge.progress! >= 0.5 ? 'bg-amber-400' : 'bg-zinc-400'
                                  }`}
                                  style={{ width: `${Math.round(badge.progress! * 100)}%` }}
                                />
                              </div>
                              <span className="mt-0.5 block text-center text-[9px] text-zinc-400">
                                {Math.round(badge.progress! * 100)}%
                              </span>
                            </div>
                          )}
                          {!badge.earned && !hasProgress && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-xl">
                              <div className="absolute inset-0 rounded-xl bg-zinc-100/40" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Badge detail modal */}
          {selectedBadge && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
              onClick={() => setSelectedBadge(null)}
            >
              <div
                className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-2xl text-3xl ${
                    selectedBadge.earned
                      ? (colorMap[selectedBadge.color]?.bgEarned ?? 'bg-zinc-100')
                      : 'bg-zinc-100'
                  } border-2 ${
                    selectedBadge.earned
                      ? (colorMap[selectedBadge.color]?.borderEarned ?? 'border-zinc-200')
                      : 'border-zinc-200'
                  }`}>
                    {selectedBadge.earned ? selectedBadge.icon : '❓'}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-zinc-900">
                      {selectedBadge.earned ? selectedBadge.name : '???'}
                    </h3>
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
                      {categoryLabels[selectedBadge.category]}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedBadge(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    ✕
                  </button>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-zinc-600">
                  {selectedBadge.earned
                    ? selectedBadge.description
                    : 'Deze badge is nog vergrendeld. Blijf groeien om hem te verdienen!'}
                </p>
                {selectedBadge.earned && selectedBadge.earned_at && (
                  <p className="mt-3 text-xs text-zinc-400">
                    Verdiend op{' '}
                    {new Date(selectedBadge.earned_at).toLocaleDateString('nl-NL', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  </p>
                )}
                {!selectedBadge.earned && selectedBadge.progress != null && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>Voortgang</span>
                      <span className="font-semibold">{Math.round(selectedBadge.progress * 100)}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          selectedBadge.progress >= 0.75 ? 'bg-emerald-400' :
                          selectedBadge.progress >= 0.5 ? 'bg-amber-400' :
                          selectedBadge.progress > 0 ? 'bg-zinc-400' : 'bg-zinc-200'
                        }`}
                        style={{ width: `${Math.round(selectedBadge.progress * 100)}%` }}
                      />
                    </div>
                    {selectedBadge.progress_label && (
                      <p className="mt-1 text-[11px] text-zinc-400">{selectedBadge.progress_label}</p>
                    )}
                  </div>
                )}
                {!selectedBadge.earned && (
                  <div className="mt-4 rounded-lg bg-zinc-50 p-3">
                    <p className="text-xs font-medium text-zinc-500">
                      💡 Tip: {selectedBadge.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
