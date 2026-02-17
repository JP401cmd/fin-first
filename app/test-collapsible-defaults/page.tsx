'use client'

import { useState, useEffect } from 'react'
import { CollapsibleSection } from '@/components/app/collapsible-section'
import { TrendingUp, Camera, Flame } from 'lucide-react'

/**
 * Test page for Feature #176: Collapsible sections default to collapsed state
 *
 * Tests:
 * 1. Sections start collapsed by default (no defaultOpen prop)
 * 2. 1-line preview text (summary) is visible when collapsed
 * 3. Clicking expands to full content
 * 4. Chevron rotates on expand
 */
export default function TestCollapsibleDefaults() {
  const [testResults, setTestResults] = useState<Array<{name: string; status: string; detail: string}>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Clear any previous localStorage state for clean test
    localStorage.removeItem('collapsible_test_default_a')
    localStorage.removeItem('collapsible_test_default_b')
    localStorage.removeItem('collapsible_test_default_c')

    fetch('/api/verify-collapsible-defaults')
      .then(r => r.json())
      .then(data => {
        setTestResults(data.results)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">
            Feature #176: Collapsible sections default to collapsed
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Verifies that advanced sections start collapsed showing preview only
          </p>
        </div>

        {/* API Test Results */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">
            API Verification Results
          </h2>
          {loading ? (
            <p className="text-sm text-zinc-400">Loading...</p>
          ) : (
            <div className="space-y-2">
              {testResults.map((test, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${
                    test.status === 'pass'
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{test.status === 'pass' ? '✅' : '❌'}</span>
                    <span className="text-sm font-medium text-zinc-900">{test.name}</span>
                  </div>
                  <p className="mt-1 pl-6 text-xs text-zinc-500">{test.detail}</p>
                </div>
              ))}
              <p className="mt-3 text-sm font-semibold text-zinc-700">
                {testResults.filter(t => t.status === 'pass').length}/{testResults.length} tests passing
              </p>
            </div>
          )}
        </div>

        {/* Live Demo: Collapsible Sections */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            Live Demo — All should start COLLAPSED with preview text
          </h2>

          {/* Section A: Mimics kern vermogensverloop */}
          <div data-testid="section-a">
            <CollapsibleSection
              storageKey="test_default_a"
              title="Vermogensverloop"
              summary="5 snapshots — netto vermogen over tijd"
              icon={<TrendingUp className="h-5 w-5 text-amber-600" />}
            >
              <div className="space-y-2">
                <p className="text-sm text-zinc-700">
                  Dit is de volledige inhoud van de Vermogensverloop sectie.
                  Deze tekst is alleen zichtbaar als de sectie is uitgeklapt.
                </p>
                <div className="h-32 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 text-sm">
                  [Chart placeholder — Net worth over time]
                </div>
              </div>
            </CollapsibleSection>
          </div>

          {/* Section B: Mimics kern snapshot vergelijking */}
          <div data-testid="section-b">
            <CollapsibleSection
              storageKey="test_default_b"
              title="Vergelijking snapshots"
              summary="15 jan vs 15 feb — vergelijking van twee snapshots"
              icon={<Camera className="h-5 w-5 text-amber-600" />}
            >
              <div className="space-y-2">
                <p className="text-sm text-zinc-700">
                  Snapshot vergelijking inhoud. Alleen zichtbaar na klik.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="h-20 rounded-lg bg-zinc-100 flex items-center justify-center text-xs text-zinc-500">Col 1</div>
                  <div className="h-20 rounded-lg bg-zinc-100 flex items-center justify-center text-xs text-zinc-500">Col 2</div>
                  <div className="h-20 rounded-lg bg-zinc-100 flex items-center justify-center text-xs text-zinc-500">Col 3</div>
                </div>
              </div>
            </CollapsibleSection>
          </div>

          {/* Section C: Mimics wil beslissingspatronen */}
          <div data-testid="section-c">
            <CollapsibleSection
              storageKey="test_default_c"
              title="Beslissingspatronen"
              summary="4 categorieën — vrijheidsdagen per type actie"
              icon={<Flame className="h-5 w-5 text-teal-600" />}
            >
              <div className="space-y-2">
                <p className="text-sm text-zinc-700">
                  Impact chart met horizontale balken per categorie.
                  Alleen zichtbaar na uitklappen.
                </p>
                <div className="h-32 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600 text-sm">
                  [Impact chart placeholder]
                </div>
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </div>
    </div>
  )
}
