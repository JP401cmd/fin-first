'use client'

import Link from 'next/link'
import { Compass } from 'lucide-react'
import { ProgressMilestones } from '@/components/editorial/progress-milestones'

/**
 * Vrijheid-strip: % op weg naar financiële vrijheid → klik naar /toekomst.
 *
 * Drie varianten:
 *  - Lege staat (freedomPct === null): dashed CTA naar /mijn/profiel met
 *    Compass-icoon. Triggert wanneer DOB / inkomen / bestedingen ontbreken.
 *  - Data-staat zonder aftelling: gradient violet bg + percentage +
 *    progress-bar (legacy gedrag wanneer geen currentAge/fireAge gegeven).
 *  - Data-staat met aftelling: + "Nog X jaar Y maanden" badge rechts —
 *    "Geld is opgeslagen tijd"-filosofie zichtbaar maken.
 */
function formatCountdown(years: number, months: number): string {
  const yPart = years > 0 ? `${years} jaar` : ''
  const mPart = months > 0 ? `${months} maand${months === 1 ? '' : 'en'}` : ''
  if (!yPart && !mPart) return '<1 maand'
  if (yPart && mPart) return `${yPart} ${mPart}`
  return yPart || mPart
}

export function VrijheidStrip({
  freedomPct,
  currentAge,
  fireAge,
}: {
  freedomPct: number | null
  /** Huidige leeftijd (gerond). Voor aftelling — optioneel. */
  currentAge?: number | null
  /** Vrijheidsleeftijd (gerond). Voor aftelling — optioneel. */
  fireAge?: number | null
}) {
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

  // Aftelling-data: alleen tonen wanneer beide leeftijden bekend zijn en
  // fireAge > currentAge (anders is user al "vrij").
  const hasCountdown =
    currentAge != null &&
    fireAge != null &&
    fireAge > currentAge
  const yearsToFire = hasCountdown ? fireAge! - currentAge! : 0
  // Maanden-afronding: voor MVP gebruiken we hele jaren omdat we geen
  // exacte DOB-fractie hebben. Toekomstige iteratie: gebruik DOB voor
  // maand-precisie.
  const countdownText = hasCountdown
    ? formatCountdown(yearsToFire, 0)
    : null

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
        <div className="shrink-0 flex items-center gap-3">
          {countdownText && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-violet-700">
                Nog
              </div>
              <div className="font-serif text-sm sm:text-base font-semibold text-violet-700 tabular-nums whitespace-nowrap">
                {countdownText}
              </div>
            </div>
          )}
          <span className="text-xs font-semibold text-violet-700 group-hover:underline">
            Bekijk →
          </span>
        </div>
      </div>
      <div
        className="relative h-1.5 rounded-full bg-violet-100 overflow-hidden"
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
        <ProgressMilestones />
      </div>
    </Link>
  )
}
