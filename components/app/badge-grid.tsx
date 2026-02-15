'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BADGE_DEFINITIONS, type BadgeWithStatus, type BadgeCategory } from '@/lib/badges'

// ── Color mapping for badge categories ──────────────────────────────

const colorMap: Record<string, {
  bg: string
  bgEarned: string
  border: string
  borderEarned: string
  text: string
  ring: string
}> = {
  amber: {
    bg: 'bg-amber-50',
    bgEarned: 'bg-amber-100',
    border: 'border-zinc-200',
    borderEarned: 'border-amber-300',
    text: 'text-amber-700',
    ring: 'ring-amber-200',
  },
  teal: {
    bg: 'bg-teal-50',
    bgEarned: 'bg-teal-100',
    border: 'border-zinc-200',
    borderEarned: 'border-teal-300',
    text: 'text-teal-700',
    ring: 'ring-teal-200',
  },
  purple: {
    bg: 'bg-purple-50',
    bgEarned: 'bg-purple-100',
    border: 'border-zinc-200',
    borderEarned: 'border-purple-300',
    text: 'text-purple-700',
    ring: 'ring-purple-200',
  },
  emerald: {
    bg: 'bg-emerald-50',
    bgEarned: 'bg-emerald-100',
    border: 'border-zinc-200',
    borderEarned: 'border-emerald-300',
    text: 'text-emerald-700',
    ring: 'ring-emerald-200',
  },
  rose: {
    bg: 'bg-rose-50',
    bgEarned: 'bg-rose-100',
    border: 'border-zinc-200',
    borderEarned: 'border-rose-300',
    text: 'text-rose-700',
    ring: 'ring-rose-200',
  },
  blue: {
    bg: 'bg-blue-50',
    bgEarned: 'bg-blue-100',
    border: 'border-zinc-200',
    borderEarned: 'border-blue-300',
    text: 'text-blue-700',
    ring: 'ring-blue-200',
  },
  zinc: {
    bg: 'bg-zinc-50',
    bgEarned: 'bg-zinc-100',
    border: 'border-zinc-200',
    borderEarned: 'border-zinc-400',
    text: 'text-zinc-700',
    ring: 'ring-zinc-200',
  },
}

const categoryLabels: Record<BadgeCategory, string> = {
  onboarding: 'Onboarding',
  consistency: 'Consistentie',
  financial_health: 'Financiële Gezondheid',
  fire_milestones: 'FIRE Mijlpalen',
  actions: 'Acties',
  budget: 'Budget',
  exploration: 'Verkenning',
  sovereignty: 'Soevereiniteit',
}

// ── Badge detail modal ──────────────────────────────────────────────

function BadgeDetail({
  badge,
  onClose,
}: {
  badge: BadgeWithStatus
  onClose: () => void
}) {
  const colors = colorMap[badge.color] ?? colorMap.zinc

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl text-3xl ${
              badge.earned ? colors.bgEarned : 'bg-zinc-100'
            } ${badge.earned ? colors.borderEarned : 'border-zinc-200'} border-2`}
          >
            {badge.earned ? badge.icon : '❓'}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-zinc-900">
              {badge.earned ? badge.name : '???'}
            </h3>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-zinc-400">
              {categoryLabels[badge.category]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            ✕
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-zinc-600">
          {badge.earned
            ? badge.description
            : 'Deze badge is nog vergrendeld. Blijf groeien om hem te verdienen!'}
        </p>

        {badge.earned && badge.earned_at && (
          <p className="mt-3 text-xs text-zinc-400">
            Verdiend op{' '}
            {new Date(badge.earned_at).toLocaleDateString('nl-NL', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        )}

        {!badge.earned && (
          <div className="mt-4 rounded-lg bg-zinc-50 p-3">
            <p className="text-xs font-medium text-zinc-500">
              💡 Tip: {badge.description}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Badge card ──────────────────────────────────────────────────────

function BadgeCard({
  badge,
  onClick,
}: {
  badge: BadgeWithStatus
  onClick: () => void
}) {
  const colors = colorMap[badge.color] ?? colorMap.zinc

  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all hover:shadow-md ${
        badge.earned
          ? `${colors.bgEarned} ${colors.borderEarned}`
          : 'border-dashed border-zinc-200 bg-zinc-50'
      }`}
    >
      {/* Icon */}
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl transition-transform group-hover:scale-110 ${
          badge.earned ? '' : 'grayscale opacity-30'
        }`}
      >
        {badge.earned ? badge.icon : '❓'}
      </div>

      {/* Name */}
      <span
        className={`text-center text-xs font-semibold leading-tight ${
          badge.earned ? 'text-zinc-800' : 'text-zinc-400'
        }`}
      >
        {badge.earned ? badge.name : '???'}
      </span>

      {/* Locked overlay */}
      {!badge.earned && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl">
          <div className="absolute inset-0 rounded-xl bg-zinc-100/40" />
        </div>
      )}
    </button>
  )
}

// ── Main BadgeGrid export ───────────────────────────────────────────

export function BadgeGrid() {
  const [badges, setBadges] = useState<BadgeWithStatus[]>([])
  const [earnedCount, setEarnedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedBadge, setSelectedBadge] = useState<BadgeWithStatus | null>(null)

  useEffect(() => {
    async function fetchBadges() {
      try {
        const res = await fetch('/api/badges')
        if (res.ok) {
          const data = await res.json()
          setBadges(data.badges)
          setEarnedCount(data.earned_count)
          setTotalCount(data.total_count)
        } else {
          // Use client-side definitions as fallback
          const fallback: BadgeWithStatus[] = BADGE_DEFINITIONS.map((b) => ({
            ...b,
            earned: false,
            earned_at: null,
          }))
          setBadges(fallback)
          setTotalCount(fallback.length)
        }
      } catch {
        // Fallback
        const fallback: BadgeWithStatus[] = BADGE_DEFINITIONS.map((b) => ({
          ...b,
          earned: false,
          earned_at: null,
        }))
        setBadges(fallback)
        setTotalCount(fallback.length)
      } finally {
        setLoading(false)
      }
    }
    fetchBadges()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    )
  }

  // Group badges by category
  const categories = Array.from(new Set(badges.map((b) => b.category)))

  return (
    <div>
      {/* Progress summary */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-zinc-900">{earnedCount}</span>
          <span className="text-sm text-zinc-500">van {totalCount} verdiend</span>
        </div>
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-amber-400 transition-all"
              style={{
                width: `${totalCount > 0 ? (earnedCount / totalCount) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Badge grid grouped by category */}
      <div className="space-y-6">
        {categories.map((category) => {
          const categoryBadges = badges.filter((b) => b.category === category)
          const categoryEarned = categoryBadges.filter((b) => b.earned).length

          return (
            <div key={category}>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {categoryLabels[category as BadgeCategory] ?? category}
                </h3>
                <span className="text-[10px] text-zinc-300">
                  {categoryEarned}/{categoryBadges.length}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {categoryBadges.map((badge) => (
                  <BadgeCard
                    key={badge.slug}
                    badge={badge}
                    onClick={() => setSelectedBadge(badge)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Badge detail modal */}
      {selectedBadge && (
        <BadgeDetail
          badge={selectedBadge}
          onClose={() => setSelectedBadge(null)}
        />
      )}
    </div>
  )
}
