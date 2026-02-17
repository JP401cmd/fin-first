'use client'

import { useState, useEffect } from 'react'
import { CollapsibleSection } from '@/components/app/collapsible-section'
import { TrendingUp, Camera, Flame, CheckCircle2, XCircle } from 'lucide-react'

export default function TestCollapsibleSections() {
  const [results, setResults] = useState<{ name: string; pass: boolean; detail: string }[] | null>(null)
  const [summary, setSummary] = useState('')

  useEffect(() => {
    fetch('/api/verify-collapsible-sections')
      .then(r => r.json())
      .then(data => {
        setResults(data.results)
        setSummary(data.summary)
      })
      .catch(err => console.error('Failed to load verification results:', err))
  }, [])

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <h1 className="text-2xl font-bold text-zinc-900">Feature #200: Collapsible Deep-Dive Sections</h1>
        <p className="text-sm text-zinc-500">Interactive demo + verification results for CollapsibleSection component</p>

        {/* Verification Results */}
        {results && (
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">
              Verification: {summary}
            </h2>
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  {r.pass ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{r.name}</p>
                    <p className="text-xs text-zinc-400">{r.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Demos */}
        <h2 className="text-lg font-semibold text-zinc-900">Live Demos (try expand/collapse)</h2>

        {/* Demo 1: Vermogensverloop style */}
        <CollapsibleSection
          storageKey="test_vermogensverloop"
          title="Vermogensverloop"
          summary="3 snapshots — netto vermogen over tijd"
          icon={<TrendingUp className="h-5 w-5 text-amber-600" />}
        >
          <div className="space-y-2">
            <p className="text-sm text-zinc-600">This represents the net worth trend chart.</p>
            <div className="h-32 rounded-lg bg-amber-50 flex items-center justify-center text-amber-400 text-sm">
              [Net Worth Chart Placeholder]
            </div>
          </div>
        </CollapsibleSection>

        {/* Demo 2: Snapshot Vergelijking style */}
        <CollapsibleSection
          storageKey="test_snapshot_vergelijking"
          title="Vergelijking snapshots"
          summary="15 jan vs 20 feb"
          icon={<Camera className="h-5 w-5 text-amber-600" />}
        >
          <div className="space-y-2">
            <p className="text-sm text-zinc-600">This shows snapshot comparison data.</p>
            <div className="h-24 rounded-lg bg-blue-50 flex items-center justify-center text-blue-400 text-sm">
              [Snapshot Comparison Placeholder]
            </div>
          </div>
        </CollapsibleSection>

        {/* Demo 3: Beslissingspatronen style */}
        <CollapsibleSection
          storageKey="test_beslissingspatronen"
          title="Beslissingspatronen"
          summary="4 categorieën — vrijheidsdagen per type actie"
          icon={<Flame className="h-5 w-5 text-teal-600" />}
        >
          <div className="space-y-2">
            <p className="text-sm text-zinc-600">This shows decision pattern impact charts.</p>
            <div className="h-24 rounded-lg bg-teal-50 flex items-center justify-center text-teal-400 text-sm">
              [Impact Chart Placeholder]
            </div>
          </div>
        </CollapsibleSection>

        {/* Instructions */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">
          <h3 className="font-medium text-zinc-700 mb-2">Manual Verification Steps:</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>All 3 sections above should start collapsed (showing summary text)</li>
            <li>Click a section header to expand it (chevron should rotate)</li>
            <li>Summary text disappears when expanded</li>
            <li>Click header again to collapse (smooth animation)</li>
            <li>Refresh the page — collapsed/expanded state should persist</li>
            <li>Each section has a unique icon (TrendingUp, Camera, Flame)</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
