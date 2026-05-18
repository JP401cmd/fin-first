'use client'

import Link from 'next/link'
import { Compass } from 'lucide-react'

/**
 * Vrijheid-strip: % op weg naar financiële vrijheid → klik naar /toekomst.
 *
 * Twee varianten:
 *  - Lege staat (freedomPct === null): dashed CTA naar /mijn/profiel met
 *    Compass-icoon. Triggert wanneer DOB / inkomen / bestedingen ontbreken.
 *  - Data-staat: gradient violet bg + percentage + progress-bar.
 */
export function VrijheidStrip({ freedomPct }: { freedomPct: number | null }) {
  if (freedomPct == null) {
    return (
      <Link
        href="/mijn/profiel"
        className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-4 sm:p-6 hover:border-violet-300 hover:shadow-sm transition-all group"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
            <Compass className="w-5 h-5 text-violet-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
              Op weg naar vrijheid
            </div>
            <div className="mt-0.5 text-sm sm:text-base text-[var(--ink-2)]">
              Vul je geboortedatum, inkomen en gewenste vrijheidsbestedingen in om je vrijheidsmoment te zien.
            </div>
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-violet-700 group-hover:underline">
          Vul profiel aan →
        </span>
      </Link>
    )
  }

  return (
    <Link
      href="/toekomst"
      className="mt-3 flex flex-col gap-2 rounded-2xl border border-[var(--border-ed)] bg-gradient-to-r from-violet-50 to-stone-50 p-3 sm:p-4 hover:border-violet-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
            Op weg naar vrijheid
          </div>
          <div className="mt-0.5 text-sm sm:text-base text-[var(--ink)]">
            Je bent{' '}
            <strong className="font-serif text-lg sm:text-xl text-violet-700">
              {Math.round(freedomPct)}%
            </strong>{' '}
            op weg naar het moment dat je niet meer hoeft te werken voor geld.
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-violet-700 group-hover:underline">
          Bekijk projectie →
        </span>
      </div>
      <div
        className="h-1.5 rounded-full bg-violet-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(freedomPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Voortgang naar financiële vrijheid"
      >
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-violet-700 transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, freedomPct))}%` }}
        />
      </div>
    </Link>
  )
}
