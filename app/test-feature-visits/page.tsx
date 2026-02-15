'use client'

import { useState, useEffect } from 'react'

interface FeatureVisit {
  feature_slug: string
  visit_count: number
  first_visited_at: string
}

interface ApiResponse {
  visits?: FeatureVisit[]
  visit?: FeatureVisit | null
  action?: string
  source?: string
  message?: string
  error?: string
}

export default function TestFeatureVisitsPage() {
  const [visits, setVisits] = useState<FeatureVisit[]>([])
  const [source, setSource] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [testSlug, setTestSlug] = useState('test_feature_visit')
  const [lastAction, setLastAction] = useState<string>('')
  const [loading, setLoading] = useState(false)

  async function loadVisits() {
    setLoading(true)
    try {
      const res = await fetch('/api/feature-visits')
      const data: ApiResponse = await res.json()
      if (data.error) {
        setMessage('Error: ' + data.error)
        setVisits([])
      } else {
        setVisits(data.visits ?? [])
        setSource(data.source ?? 'unknown')
        setMessage(data.message ?? '')
      }
    } catch (err) {
      setMessage('Fetch error: ' + (err instanceof Error ? err.message : 'unknown'))
    } finally {
      setLoading(false)
    }
  }

  async function recordVisit() {
    setLoading(true)
    try {
      const res = await fetch('/api/feature-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature_slug: testSlug }),
      })
      const data: ApiResponse = await res.json()
      if (data.error) {
        setLastAction('Error: ' + data.error)
      } else {
        setLastAction(
          'Action: ' + (data.action ?? 'none') +
          ' | Visit count: ' + (data.visit?.visit_count ?? 'N/A') +
          ' | Source: ' + (data.source ?? 'unknown')
        )
      }
      // Reload visits after recording
      await loadVisits()
    } catch (err) {
      setLastAction('Error: ' + (err instanceof Error ? err.message : 'unknown'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVisits()
  }, [])

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">
          Feature Visit Tracking Test
        </h1>
        <p className="text-sm text-zinc-500 mb-6">
          Tests POST /api/feature-visits and GET /api/feature-visits endpoints.
        </p>

        {/* Record Visit */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 mb-6">
          <h2 className="font-semibold text-zinc-800 mb-3">Record a Visit</h2>
          <div className="flex gap-3 items-center mb-4">
            <input
              type="text"
              value={testSlug}
              onChange={(e) => setTestSlug(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Feature slug (e.g. vermogensverloop)"
              data-testid="feature-slug-input"
            />
            <button
              onClick={recordVisit}
              disabled={loading}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              data-testid="record-visit-btn"
            >
              {loading ? 'Bezig...' : 'Bezoek registreren'}
            </button>
          </div>
          {lastAction && (
            <p className="text-xs text-zinc-500 bg-zinc-50 p-2 rounded" data-testid="last-action">
              {lastAction}
            </p>
          )}
        </div>

        {/* Visit List */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-zinc-800">
              Recorded Visits ({visits.length})
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400">Source: {source}</span>
              <button
                onClick={loadVisits}
                disabled={loading}
                className="rounded-lg border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                data-testid="refresh-btn"
              >
                Vernieuwen
              </button>
            </div>
          </div>

          {message && (
            <p className="text-xs text-amber-600 mb-3" data-testid="status-message">
              {message}
            </p>
          )}

          {visits.length === 0 ? (
            <p className="text-sm text-zinc-400 italic" data-testid="no-visits">
              Nog geen bezoeken geregistreerd.
            </p>
          ) : (
            <div className="space-y-2" data-testid="visits-list">
              {visits.map((v) => (
                <div
                  key={v.feature_slug}
                  className="flex items-center justify-between rounded-lg bg-zinc-50 p-3"
                  data-testid={`visit-${v.feature_slug}`}
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{v.feature_slug}</p>
                    <p className="text-xs text-zinc-400">
                      Eerste bezoek: {new Date(v.first_visited_at).toLocaleString('nl-NL')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-amber-600" data-testid={`count-${v.feature_slug}`}>
                      {v.visit_count}x
                    </p>
                    <p className="text-[10px] text-zinc-400">bezoeken</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* API Info */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="font-semibold text-zinc-800 mb-3">API Endpoints</h2>
          <div className="space-y-2 text-xs text-zinc-500">
            <div className="bg-zinc-50 p-2 rounded font-mono">
              GET /api/feature-visits — Alle bezoeken ophalen
            </div>
            <div className="bg-zinc-50 p-2 rounded font-mono">
              POST /api/feature-visits — Bezoek registreren (body: {'{feature_slug: "..."}' })
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
