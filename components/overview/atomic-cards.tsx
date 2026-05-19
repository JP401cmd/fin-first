'use client'

import Link from 'next/link'
import { TrendingUp, Lightbulb, Calendar } from 'lucide-react'

/**
 * AtomicCards — drie compacte categoriseerde cards onder /overzicht hero,
 * conform mockup. Toont per card een dot + UPPERCASE label + body-tekst.
 *
 * Categorieën:
 *  - Observation (WAT VALT OP) — feit over je vermogen/uitgaven/etc.
 *  - Tip (EEN TIP) — concrete suggestie voor optimalisatie
 *  - Upcoming (KOMENDE MAAND) — wat staat eraan te komen (afschrijvingen, etc.)
 *
 * Data komt waar mogelijk uit Will-briefing (recommendations + temporal
 * context). Wanneer niets beschikbaar: card valt weg (geen lege ruimte).
 *
 * Stijl matcht mockup-dutchet: kleine ronde dot per categorie + label-kicker
 * + zin-met-vetgedrukte-CTA. Optioneel href maakt de hele card klikbaar.
 */
export type AtomicCardEntry = {
  text: string
  href?: string
}

export function AtomicCards({
  observation,
  tip,
  upcoming,
}: {
  observation?: AtomicCardEntry | null
  tip?: AtomicCardEntry | null
  upcoming?: AtomicCardEntry | null
}) {
  // Render niets wanneer alle drie ontbreken — geen lege rij.
  const hasAny = !!observation || !!tip || !!upcoming
  if (!hasAny) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-6">
      {observation && (
        <AtomicCard
          entry={observation}
          label="Wat valt op"
          dotColor="bg-emerald-500"
          Icon={TrendingUp}
        />
      )}
      {tip && (
        <AtomicCard
          entry={tip}
          label="Een tip"
          dotColor="bg-violet-500"
          Icon={Lightbulb}
        />
      )}
      {upcoming && (
        <AtomicCard
          entry={upcoming}
          label="Komende maand"
          dotColor="bg-sky-500"
          Icon={Calendar}
        />
      )}
    </div>
  )
}

function AtomicCard({
  entry,
  label,
  dotColor,
  Icon,
}: {
  entry: AtomicCardEntry
  label: string
  dotColor: string
  Icon: typeof TrendingUp
}) {
  const inner = (
    <>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          {label}
        </span>
        <Icon className="w-3.5 h-3.5 text-[var(--ink-4)] ml-auto" aria-hidden="true" />
      </div>
      <p className="text-sm text-[var(--ink-2)] leading-snug">{entry.text}</p>
    </>
  )

  if (entry.href) {
    return (
      <Link
        href={entry.href}
        className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 hover:border-[var(--ink-3)] hover:shadow-sm transition-all block"
      >
        {inner}
      </Link>
    )
  }
  return (
    <article className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4">
      {inner}
    </article>
  )
}
