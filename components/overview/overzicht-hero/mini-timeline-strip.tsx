'use client'

import Link from 'next/link'

/**
 * Mini-tijdslijn-strip: horizontale balk van vandaag → vrijheidsleeftijd.
 * Eindlabel toont "Pensioen" of "Vrijheid" afhankelijk van fireStrategy.
 * Klikbaar naar /toekomst voor volledige tijdas-projectie.
 *
 * Bij currentAge ≥ endAge: emerald accent + "Bereikt"-counter.
 */
export function MiniTimelineStrip({
  currentAge,
  endAge,
  freedomPct,
  isPensioenMode,
}: {
  currentAge: number
  endAge: number
  freedomPct: number
  isPensioenMode: boolean
}) {
  const isReached = currentAge >= endAge
  const yearsToGo = Math.max(0, endAge - currentAge)
  const pct = isReached ? 100 : Math.max(0, Math.min(100, freedomPct))
  const endLabel = isPensioenMode ? 'Pensioen' : 'Vrijheid'

  const accentClass = isReached ? 'text-emerald-700' : 'text-violet-700'
  const fillClass = isReached
    ? 'from-emerald-500 to-emerald-700'
    : 'from-violet-500 to-violet-700'
  const counterText = isReached
    ? 'Bereikt — je bent vrij'
    : `${yearsToGo} jaar te gaan`

  return (
    <Link
      href="/toekomst"
      className="mt-3 flex flex-col gap-2 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 hover:border-violet-300 hover:shadow-sm transition-all group"
      aria-label={`Tijdslijn van ${currentAge} jaar nu naar ${endAge} jaar ${endLabel.toLowerCase()}`}
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Vandaag
          </span>
          <span className="font-mono text-sm font-semibold text-[var(--ink)]">
            {currentAge} jaar
          </span>
        </div>
        <div className="text-center">
          <span
            className={`text-[10px] uppercase tracking-[0.12em] font-semibold ${accentClass}`}
          >
            {counterText}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            {endLabel}
          </span>
          <span className="font-mono text-sm font-semibold text-[var(--ink)]">
            {endAge} jaar
          </span>
        </div>
      </div>
      <div
        className="relative h-1.5 rounded-full bg-stone-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Voortgang naar ${endLabel.toLowerCase()}`}
      >
        <div
          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${fillClass} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
        {/* Mijlpaal-markers — consistent met VrijheidStrip en DoelenView. */}
        {[25, 50, 75].map((mark) => (
          <span
            key={mark}
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-[var(--paper)]/80"
            style={{ left: `${mark}%` }}
          />
        ))}
      </div>
    </Link>
  )
}
