'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
import { useState } from 'react'

/**
 * Visual test page for the news error UI on /berichten.
 * Shows the exact same error state component that appears on the berichten page.
 */
export default function TestNewsErrorPage() {
  const [retried, setRetried] = useState(false)

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8">
      <h1 className="mb-4 text-lg font-bold text-[var(--ink)]">News Error State Preview</h1>
      <p className="mb-6 text-sm text-[var(--ink-3)]">
        Dit is de foutmelding die gebruikers zien als /api/news faalt.
      </p>

      {/* Exact same error component from berichten/page.tsx */}
      <div className="flex flex-col items-center gap-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-12 text-center shadow-[var(--s0)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--subtle)]">
          <AlertCircle className="h-6 w-6 text-[var(--ink-3)]" />
        </div>
        <div className="space-y-1">
          <p className="font-inter text-sm font-medium text-[var(--ink-2)]">
            Nieuws kon niet worden geladen
          </p>
          <p className="font-source-serif text-[13px] italic text-[var(--ink-4)]">
            De AI-assistent is tijdelijk niet beschikbaar vanwege een beveiligingscontrole. Probeer het later opnieuw.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRetried(true)}
          className="flex min-h-[44px] items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:bg-[var(--subtle)] hover:shadow-[var(--s1)] active:scale-[0.98] sm:min-h-0"
        >
          <RefreshCw className="h-4 w-4" />
          Opnieuw proberen
        </button>
      </div>

      {retried && (
        <p className="mt-4 text-center text-sm text-green-600 font-medium">
          Retry button clicked! In productie zou dit een nieuwe API-call triggeren.
        </p>
      )}
    </div>
  )
}
