'use client'

import { useState } from 'react'

/**
 * Test page for verifying briefing toggle mobile-friendliness.
 * Mirrors the exact markup from identity/instellingen/page.tsx briefing section.
 */
export default function TestBriefingToggles() {
  const [prefs, setPrefs] = useState({ showNextSteps: true, showDiscover: false })

  const toggle = (key: 'showNextSteps' | 'showDiscover') => {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] p-4">
      <h1 className="text-lg font-bold mb-2">Briefing Toggles — Mobile Test</h1>
      <p className="text-xs text-zinc-500 mb-4">
        Test at 375px — both toggles must be fully visible, no horizontal scroll.
      </p>

      {/* Exact replica of the briefing-inhoud section from instellingen */}
      <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3 sm:p-4 space-y-1">
        <p className="text-xs font-medium text-[var(--ink-2)]">Briefing-inhoud</p>

        <label className="flex items-center justify-between gap-4 min-h-[44px] py-2 cursor-pointer">
          <div className="min-w-0">
            <span className="text-sm font-medium text-[var(--ink)]">Volgende stappen tonen</span>
            <p className="text-xs text-zinc-500">Will toont relevante volgende stappen in je DAIshboard</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.showNextSteps}
            aria-label="Volgende stappen tonen"
            onClick={() => toggle('showNextSteps')}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors touch-manipulation ${
              prefs.showNextSteps ? 'bg-[var(--ink)]' : 'bg-[var(--border-md)]'
            }`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              prefs.showNextSteps ? 'translate-x-[22px]' : 'translate-x-[3px]'
            }`} />
          </button>
        </label>

        <label className="flex items-center justify-between gap-4 min-h-[44px] py-2 cursor-pointer">
          <div className="min-w-0">
            <span className="text-sm font-medium text-[var(--ink)]">Ontdek-suggesties tonen</span>
            <p className="text-xs text-zinc-500">Will toont tips over features die je nog niet hebt ontdekt</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.showDiscover}
            aria-label="Ontdek-suggesties tonen"
            onClick={() => toggle('showDiscover')}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors touch-manipulation ${
              prefs.showDiscover ? 'bg-[var(--ink)]' : 'bg-[var(--border-md)]'
            }`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              prefs.showDiscover ? 'translate-x-[22px]' : 'translate-x-[3px]'
            }`} />
          </button>
        </label>
      </div>

      {/* State debug */}
      <div className="mt-4 rounded-lg border border-[var(--border-ed)] p-3 text-xs font-mono">
        <p>showNextSteps: <span id="state-next" className={prefs.showNextSteps ? 'text-green-600' : 'text-red-600'}>{String(prefs.showNextSteps)}</span></p>
        <p>showDiscover: <span id="state-disc" className={prefs.showDiscover ? 'text-green-600' : 'text-red-600'}>{String(prefs.showDiscover)}</span></p>
      </div>

      {/* Measurement markers */}
      <div className="mt-4 space-y-2 text-xs text-zinc-500">
        <p>Touch target checks:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Toggle button: h-7 (28px) × w-12 (48px) — within min-h-[44px] row</li>
          <li>Label row: min-h-[44px] + py-2 = comfortably &ge;44px touch area</li>
          <li>Labels: text-sm font-medium (readable on mobile)</li>
          <li>Descriptions: text-xs text-zinc-500 (readable secondary text)</li>
          <li>Container: p-3 on mobile, p-4 on sm+ (no overflow)</li>
        </ul>
      </div>
    </div>
  )
}
