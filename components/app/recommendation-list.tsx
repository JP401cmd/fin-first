'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { FinnAvatar } from '@/components/app/avatars'
import { RecommendationCard } from '@/components/app/recommendation-card'
import type { Recommendation } from '@/lib/recommendation-data'

type RecommendationListProps = {
  initialRecommendations: Recommendation[]
}

export function RecommendationList({ initialRecommendations }: RecommendationListProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>(initialRecommendations)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generateRecommendations() {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/recommendations', { method: 'POST' })
      if (!res.ok) {
        let errorMsg = 'Generatie mislukt'
        try {
          const errData = await res.json()
          if (errData.error) errorMsg = errData.error
        } catch {
          const text = await res.text()
          if (text) errorMsg = text
        }
        throw new Error(errorMsg)
      }
      const data = await res.json()
      setRecommendations((prev) => [...data.recommendations, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleDecide(id: string, action: 'accept' | 'reject' | 'postpone', data?: Record<string, unknown>) {
    const res = await fetch(`/api/ai/recommendations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
    })

    if (!res.ok) return

    setRecommendations((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        if (action === 'accept') return { ...r, status: 'accepted' as const }
        if (action === 'reject') return { ...r, status: 'rejected' as const }
        if (action === 'postpone') {
          return {
            ...r,
            status: 'postponed' as const,
            postponed_until: (data?.postponed_until as string) || null,
          }
        }
        return r
      })
    )
  }

  const pending = recommendations.filter(
    (r) => r.status === 'pending' ||
      (r.status === 'postponed' && r.postponed_until && new Date(r.postponed_until) <= new Date())
  )

  const totalFreedomDays = pending.reduce(
    (sum, r) => sum + (r.freedom_days_per_year || 0),
    0
  )

  if (pending.length === 0 && !isGenerating) {
    return (
      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-8 text-center">
        <div className="mx-auto mb-4 flex justify-center">
          <FinnAvatar size={64} />
        </div>
        <h2 className="mb-2 text-xl font-bold text-zinc-900">
          Klaar voor optimalisatie?
        </h2>
        <p className="mb-6 text-zinc-500">
          Will analyseert je financieel profiel en ontdekt verborgen vrijheidsdagen.
          Laat de AI kansen vinden die je misschien over het hoofd ziet.
        </p>
        {error && (
          <p className="mb-4 text-sm text-red-600">{error}</p>
        )}
        <button
          type="button"
          onClick={generateRecommendations}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-6 py-3 font-medium text-white transition-colors hover:bg-teal-600 disabled:opacity-50"
        >
          <Sparkles className="h-5 w-5" />
          Genereer suggesties
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      {totalFreedomDays > 0 && (
        <div className="rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-teal-100">Potentieel te winnen</div>
              <div className="text-2xl font-bold">{Math.round(totalFreedomDays)} vrijheidsdagen/jaar</div>
            </div>
            <div className="text-right text-sm text-teal-100">
              {pending.length} {pending.length === 1 ? 'voorstel' : 'voorstellen'} open
            </div>
          </div>
        </div>
      )}

      {/* Generate button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Voorstellen</h2>
        <button
          type="button"
          onClick={generateRecommendations}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 rounded-lg border border-teal-200 px-4 py-2 text-sm font-medium text-teal-600 transition-colors hover:bg-teal-50 disabled:opacity-50"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {isGenerating ? 'Analyseren...' : 'Nieuwe suggesties'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Skeleton cards while generating */}
      {isGenerating && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-teal-100 bg-teal-50/30 p-5">
              <div className="mb-3 h-6 w-32 rounded-full bg-teal-100" />
              <div className="mb-2 h-5 w-3/4 rounded bg-zinc-200" />
              <div className="mb-4 h-4 w-full rounded bg-zinc-100" />
              <div className="mx-auto mb-4 h-16 w-48 rounded-lg bg-teal-100" />
              <div className="flex gap-2">
                <div className="h-9 flex-1 rounded-lg bg-teal-200" />
                <div className="h-9 w-20 rounded-lg bg-teal-100" />
                <div className="h-9 w-10 rounded-lg bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recommendation cards */}
      <div className="space-y-4">
        {pending.map((rec) => (
          <RecommendationCard
            key={rec.id}
            recommendation={rec}
            onDecide={handleDecide}
          />
        ))}
      </div>
    </div>
  )
}
