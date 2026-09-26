'use client'

import type { ReactNode } from 'react'
import { useToekomstSimContext } from '@/components/toekomst/state/toekomst-state-provider'

/**
 * De foutstaat van /toekomst (kaart GW8, ADR 0179 fase 1 stap 15).
 *
 * Kan de pagina geen projectie rekenen (`!fire || !range || !healthScore`), dan
 * vervangt één foutkaart het canvas, de katern-koppen, het katern en de overlays —
 * zoals de early return van de vroegere compositie de hele pagina verving. Staat in
 * de `(katern)`-layout, zodat de toets op elk katern dezelfde is.
 */
export function ToekomstRekenGrens({ children }: { children: ReactNode }) {
  const { fire, range, healthScore } = useToekomstSimContext()

  if (!fire || !range || !healthScore) {
    return (
      <div className="mx-auto max-w-6xl py-5 sm:py-12 px-4 sm:px-6">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">Er ging iets mis bij het berekenen van je projecties.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
